-- DesignHub — bucket privado para versões de arte e referências
-- RF: RF007, RF008, RF010. RNF: RNF008. Seção 12.5: URLs de Storage
-- privadas/assinadas para material sensível.
--
-- Convenção de caminho (definida na aplicação, Fase 8/9): o nome do objeto
-- nunca deriva do nome de arquivo enviado pelo cliente nem de um ID
-- sequencial previsível — é sempre um UUID gerado no servidor, para não dar
-- pistas de path traversal/enumeração:
--   solicitacoes/{id_solicitacao}/versoes/{uuid-gerado}.{pdf|jpg|png}
--   solicitacoes/{id_solicitacao}/referencias/{uuid-gerado}.{pdf|jpg|png}
--
-- Bucket privado: nenhuma policy de leitura/escrita é concedida a
-- 'authenticated'/'anon'. Todo acesso (upload, download, link de avaliação
-- pública) é mediado pelo backend via service role, que gera URLs assinadas
-- de curta duração. Isso evita expor Storage RLS complexa baseada em path
-- parsing e mantém um único ponto de autorização (a API REST).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artes',
  'artes',
  false,
  15728640, -- 15 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
