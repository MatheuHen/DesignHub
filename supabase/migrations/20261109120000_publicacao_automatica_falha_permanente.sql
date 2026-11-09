-- DesignHub — RF014/RN32-RN35/Gate G: encerra o LOOP INFINITO de tentativas
-- de publicação automática observado em produção.
--
-- Caso real (logs de produção, 19/08/2026 → 09/11/2026): o agendamento 45
-- falhou 240 vezes com o mesmo erro permanente da Meta ("Object with ID '...'
-- does not exist, cannot be loaded due to missing permissions, or does not
-- support this operation"). Nenhuma dessas tentativas tinha chance de
-- suceder: o objeto/permissão do lado da Meta não existe mais. Como
-- `register_publicacao_falha` SEMPRE liberava a reserva
-- (`processamento_iniciado_em = null`) e `listAgendamentosVencidos` só filtra
-- `status = 'Agendado'`, cada ciclo do cron repetia a mesma chamada
-- condenada, inseria mais uma linha `publicacao` com status 'falha', mais uma
-- linha de histórico e mais um aviso ao designer — por quase três meses.
--
-- Correção estrutural (sem mudança de escopo): a falha automática continua
-- mantendo a PENDÊNCIA e o agendamento `Agendado` para publicação manual,
-- exatamente como RF014 exige. O que muda é que a tentativa AUTOMÁTICA passa
-- a ter limite: erro permanente da Meta (credencial/permissão/objeto
-- inexistente) desliga a automação daquele agendamento na hora, e erro
-- transitório desliga após `p_max_tentativas`. A partir daí o agendamento
-- segue o mesmo caminho manual já documentado que o sistema usa quando o
-- cliente não tem Instagram conectado ou a arte é PDF.
--
-- Nenhum estado novo (RN39), nenhum RF/RN novo: colunas técnicas do job,
-- nunca lidas/gravadas pelo frontend nem por rota de designer/administrador.

alter table public.agendamento_publicacao
  add column if not exists publicacao_automatica_falhas smallint not null default 0,
  add column if not exists publicacao_automatica_indisponivel_em timestamptz,
  add column if not exists publicacao_automatica_motivo text;

comment on column public.agendamento_publicacao.publicacao_automatica_falhas is
  'Marca técnica: tentativas consecutivas de publicação automática que falharam neste agendamento. Usada só para parar de insistir; não altera status nem regra de negócio.';
comment on column public.agendamento_publicacao.publicacao_automatica_indisponivel_em is
  'Marca técnica: quando preenchida, o job de publicação não tenta mais a via automática deste agendamento (erro permanente da Meta ou limite de tentativas). A publicação permanece pendente para o caminho manual (RF014).';
comment on column public.agendamento_publicacao.publicacao_automatica_motivo is
  'Motivo técnico resumido do desligamento da via automática, para diagnóstico. Nunca contém token, credencial ou dado pessoal.';

-- Índice do job: agendamentos vencidos ainda elegíveis à via automática.
create index if not exists agendamento_publicacao_job_automatico_idx
  on public.agendamento_publicacao (data_hora_publicacao)
  where status = 'Agendado' and publicacao_automatica_indisponivel_em is null;

-- A assinatura antiga (1 argumento) é removida de propósito: mantê-la viva
-- deixaria o caminho que produz o loop ainda chamável.
drop function if exists public.register_publicacao_falha(bigint);

/**
 * Registra uma tentativa FALHADA de publicação automática.
 *
 * `p_permanente = true`: o chamador identificou um erro da Meta que não
 * melhora com repetição (token inválido/revogado, permissão ausente, objeto
 * inexistente) — a via automática é desligada imediatamente.
 *
 * Retorna o estado consolidado para o chamador decidir se precisa avisar o
 * designer, de modo que o aviso aconteça uma vez por episódio e não a cada
 * ciclo do cron:
 *   falhas                  — total consecutivo após esta tentativa;
 *   automatico_desativado   — a via automática acabou de ser (ou já estava) desligada;
 *   primeira_falha          — esta foi a primeira falha do episódio.
 *
 * Nunca marca como publicado e nunca muda `status` (RF014/RN39): a
 * solicitação segue `Agendado`/pendente para o caminho manual.
 */
create or replace function public.register_publicacao_falha(
  p_id_agendamento bigint,
  p_permanente boolean default false,
  p_motivo text default null,
  p_max_tentativas smallint default 5
)
returns table (falhas smallint, automatico_desativado boolean, primeira_falha boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_solicitacao bigint;
  v_status_agendamento text;
  v_id_versao bigint;
  v_falhas smallint;
  v_ja_desativado boolean;
  v_desativar boolean;
begin
  select a.id_solicitacao, a.status, a.publicacao_automatica_falhas,
         a.publicacao_automatica_indisponivel_em is not null
  into v_id_solicitacao, v_status_agendamento, v_falhas, v_ja_desativado
  from public.agendamento_publicacao a
  where a.id_agendamento = p_id_agendamento
  for update;

  if v_id_solicitacao is null then
    raise exception 'agendamento % não encontrado', p_id_agendamento using errcode = 'P0002';
  end if;

  if v_status_agendamento <> 'Agendado' then
    raise exception
      'agendamento % não está ativo (status atual: %)', p_id_agendamento, v_status_agendamento
      using errcode = 'P0001';
  end if;

  select v.id_versao
  into v_id_versao
  from public.versao_arte v
  where v.id_solicitacao = v_id_solicitacao
  order by v.numero_versao desc
  limit 1;

  if v_id_versao is null then
    raise exception 'solicitação % não possui versão enviada', v_id_solicitacao using errcode = 'P0002';
  end if;

  v_falhas := coalesce(v_falhas, 0) + 1;
  v_desativar := p_permanente or v_falhas >= p_max_tentativas;

  -- Log da tentativa (RN34): uma linha por episódio, não uma por ciclo do
  -- cron. Sem isto, um erro permanente gerava centenas de linhas idênticas
  -- em `publicacao` e `historico_solicitacao` (foi o que ocorreu em
  -- produção) e nenhuma informação nova em nenhuma delas.
  if v_falhas = 1 then
    insert into public.publicacao (id_agendamento, id_versao, data_publicada, tipo, status)
    values (p_id_agendamento, v_id_versao, null, 'automatica', 'falha');

    insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
    values (
      v_id_solicitacao,
      null,
      'Tentativa de publicação automática no Instagram falhou — publicação pendente',
      'Agendado',
      'Agendado'
    );
  end if;

  if v_desativar and not v_ja_desativado then
    insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
    values (
      v_id_solicitacao,
      null,
      'Publicação automática no Instagram indisponível — publicação pendente de registro manual',
      'Agendado',
      'Agendado'
    );
  end if;

  update public.agendamento_publicacao
  set publicacao_automatica_falhas = v_falhas,
      publicacao_automatica_indisponivel_em = case
        when v_desativar then coalesce(publicacao_automatica_indisponivel_em, now())
        else publicacao_automatica_indisponivel_em
      end,
      publicacao_automatica_motivo = case
        when v_desativar then left(coalesce(p_motivo, 'falhas repetidas na Instagram API'), 300)
        else publicacao_automatica_motivo
      end,
      -- Libera a reserva só enquanto ainda há tentativa automática a fazer.
      processamento_iniciado_em = case when v_desativar then processamento_iniciado_em else null end
  where id_agendamento = p_id_agendamento;

  return query select v_falhas, (v_desativar or v_ja_desativado), (v_falhas = 1);
end;
$$;

revoke all on function public.register_publicacao_falha(bigint, boolean, text, smallint) from public;
revoke all on function public.register_publicacao_falha(bigint, boolean, text, smallint) from anon, authenticated;
grant execute on function public.register_publicacao_falha(bigint, boolean, text, smallint) to service_role;

/**
 * Reabilita a via automática dos agendamentos ainda pendentes de um cliente.
 * Chamada quando a conta do Instagram do cliente é (re)conectada com
 * sucesso: a causa permanente do desligamento (credencial/permissão) deixou
 * de existir, então insistir volta a fazer sentido. Autocorreção — sem esta
 * função, uma reconexão correta continuaria caindo no caminho manual para
 * sempre.
 */
create or replace function public.reabilitar_publicacao_automatica(
  p_id_cliente bigint
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row_count int;
begin
  update public.agendamento_publicacao a
  set publicacao_automatica_indisponivel_em = null,
      publicacao_automatica_motivo = null,
      publicacao_automatica_falhas = 0,
      processamento_iniciado_em = null
  from public.solicitacao s
  where a.id_solicitacao = s.id_solicitacao
    and s.id_cliente = p_id_cliente
    and a.status = 'Agendado'
    and a.publicacao_automatica_indisponivel_em is not null
    -- Segurança contra dupla publicação: um agendamento com marca de mídia
    -- já publicada na Meta nunca volta para a fila automática por aqui.
    and a.instagram_media_id_pendente is null;

  get diagnostics v_row_count = row_count;
  return v_row_count;
end;
$$;

revoke all on function public.reabilitar_publicacao_automatica(bigint) from public;
revoke all on function public.reabilitar_publicacao_automatica(bigint) from anon, authenticated;
grant execute on function public.reabilitar_publicacao_automatica(bigint) to service_role;
