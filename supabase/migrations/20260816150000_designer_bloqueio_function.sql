-- DesignHub — RF006: bloqueio de designer por solicitação vencida
-- RN11/RN12: prazo da 1ª versão é data_criacao + 5 dias
-- (solicitacao.prazo_primeira_versao, coluna gerada — Fase 2). "Vencida e
-- não resolvida" é exatamente `status = 'Em produção' and prazo vencido`:
-- upload da 1ª versão move o status para 'Enviado para avaliação' (RF007)
-- e cancelamento move para 'Cancelado' (RF009) — em ambos os casos deixa
-- de ser 'Em produção', então esta única condição já captura "resolvida
-- por upload ou por cancelamento" sem precisar checar versao_arte à parte.
--
-- Índice composto dedicado ao caminho quente desta função (chamada em todo
-- iniciarAtendimento/RF004): os índices da Fase 2 (`id_designer` isolado e
-- o parcial em `prazo_primeira_versao where status='Em produção'`) não
-- cobrem os dois filtros + a igualdade de designer juntos.
create index solicitacao_designer_vencida_idx
  on public.solicitacao (id_designer, prazo_primeira_versao)
  where status = 'Em produção';

-- Recalcula e persiste designer.bloqueado sob demanda (chamada pelo
-- backend antes de permitir nova solicitação/atendimento — RF006 "bloquear
-- criação de novas solicitações"). Mesma política de acesso das demais
-- funções SECURITY DEFINER desta base: revogar de anon/authenticated
-- explicitamente, conceder só a service_role.
--
-- Sem `for update`/lock proposital: o único ponto de decisão de negócio
-- (bloquear ou não o request atual) usa o `v_bloqueado` retornado por esta
-- própria chamada, nunca lê a coluna persistida de volta dentro da mesma
-- transação — `designer.bloqueado` é só um cache derivado para exibição
-- (ex.: lista de designers do admin, aviso na UI do designer), que se
-- autocorrige na próxima chamada real de gate. Diferente de
-- `reassign_solicitacao`, que precisa de leitura consistente sob lock
-- porque compõe múltiplas escritas relacionadas na mesma transação.
create or replace function public.sync_designer_bloqueio(p_id_designer uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bloqueado boolean;
  v_linhas_afetadas integer;
begin
  select exists (
    select 1
    from public.solicitacao s
    where s.id_designer = p_id_designer
      and s.status = 'Em produção'
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;

  update public.designer
  set bloqueado = v_bloqueado
  where id_usuario = p_id_designer;

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas = 0 then
    raise exception 'designer % não encontrado', p_id_designer using errcode = 'P0002';
  end if;

  return v_bloqueado;
end;
$$;

revoke all on function public.sync_designer_bloqueio(uuid) from public;
revoke all on function public.sync_designer_bloqueio(uuid) from anon, authenticated;
grant execute on function public.sync_designer_bloqueio(uuid) to service_role;
