-- DesignHub — RF016: corrige acesso do designer reatribuído ao cliente da
-- solicitação (bug real confirmado em produção: solicitação #12 reatribuída
-- para um novo designer sumia da listagem "Solicitações" desse designer).
--
-- Causa raiz: `listSolicitacoes`/`getSolicitacaoDetail`
-- (backend/src/repositories/solicitacao.repository.ts) fazem embed de
-- `cliente` via PostgREST (`cliente!inner(nome)` / `cliente(nome)`). O embed
-- respeita a RLS da tabela `cliente`, cuja única policy de SELECT até aqui
-- era `id_designer = auth.uid() or is_admin()` — ou seja, o dono ORIGINAL do
-- cliente (RN06/RF003). RF016 só reatribui `solicitacao.id_designer`,
-- preservando o cliente (RF016 exige "preservar cliente"), então o cliente
-- de uma solicitação reatribuída continua pertencendo ao designer anterior.
-- Com `!inner`, a policy negando a leitura do cliente para o novo designer
-- fazia a linha de `solicitacao` inteira desaparecer da listagem (inner join
-- sem match visível); com embed simples, o nome do cliente ficava vazio no
-- detalhe.
--
-- RN49 já prevê exatamente este caso ("implementar leitura global apenas
-- onde necessária para conciliar RN49 com RN44"): o designer responsável
-- atual por uma solicitação precisa poder ler o nome do cliente vinculado,
-- mesmo sem ser o dono original do cadastro do cliente. Esta policy é
-- puramente aditiva (SELECT), somada via OR à policy existente — não altera
-- INSERT/UPDATE/DELETE de `cliente` (que continuam restritos ao designer
-- dono, RF003/RN06).
create policy cliente_select_via_solicitacao_responsavel on public.cliente
  for select to authenticated
  using (
    exists (
      select 1
      from public.solicitacao s
      where s.id_cliente = cliente.id_cliente
        and s.id_designer = auth.uid()
    )
  );
