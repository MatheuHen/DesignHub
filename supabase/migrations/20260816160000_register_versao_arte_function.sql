-- DesignHub — RF007/RF008: registro atômico de nova versão de arte
-- RN17/RN23/RN25/RN26: V1, V2... sequenciais; upload move a solicitação
-- para "Enviado para avaliação" (1º envio a partir de "Em produção" ou
-- reenvio a partir de "Ajustes"); toda transição gera histórico (RN48).
--
-- O arquivo já foi enviado ao Storage (bucket privado "artes") pelo backend
-- antes desta chamada — esta função só persiste os metadados/estado de
-- forma atômica. Se a função falhar, o backend remove o objeto órfão do
-- Storage (compensação, mesmo padrão já usado em createDesigner/Fase 4).
--
-- Mesma política de acesso das demais funções SECURITY DEFINER desta base:
-- revogar de anon/authenticated explicitamente (o Supabase concede EXECUTE
-- a esses roles por padrão via ALTER DEFAULT PRIVILEGES), conceder só a
-- service_role.
create or replace function public.register_versao_arte(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_arquivo_path text,
  p_formato text,
  p_observacoes text
)
returns table (id_versao bigint, numero_versao integer, status_anterior text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_next_numero integer;
  v_id_versao bigint;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  -- Solicitação inexistente ou pertencente a outro designer: mesmo código
  -- de erro para os dois casos, para não vazar a existência de uma
  -- solicitação de outro designer (seção 12.1, defesa em profundidade —
  -- o backend já faz essa checagem antes de chamar a função, esta é a
  -- segunda camada, mesmo padrão do MEDIUM-1 corrigido na Fase 7).
  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  -- RF007/RN26: só é possível enviar versão quando a solicitação está
  -- aguardando a 1ª versão ("Em produção") ou retornou de ajustes
  -- ("Ajustes"). Qualquer outro status (já em avaliação, aprovada,
  -- cancelada, agendada, publicada) rejeita o envio.
  if v_status not in ('Em produção', 'Ajustes') then
    raise exception
      'solicitação % não está em um status que permite envio de nova versão (status atual: %)',
      p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  select coalesce(max(numero_versao), 0) + 1
  into v_next_numero
  from public.versao_arte
  where id_solicitacao = p_id_solicitacao;

  insert into public.versao_arte (id_solicitacao, numero_versao, arquivo_url, formato, observacoes)
  values (p_id_solicitacao, v_next_numero, p_arquivo_path, p_formato, p_observacoes)
  returning versao_arte.id_versao into v_id_versao;

  update public.solicitacao
  set status = 'Enviado para avaliação'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_id_designer,
    format('Nova versão enviada (V%s) — RF007/RF008', v_next_numero),
    v_status,
    'Enviado para avaliação'
  );

  return query select v_id_versao, v_next_numero, v_status;
end;
$$;

revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from public;
revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from anon, authenticated;
grant execute on function public.register_versao_arte(bigint, uuid, text, text, text) to service_role;
