# Baseline de segurança — DesignHub

Este documento não cria RNF novo; transforma RNF007/RNF009/RNF010 e boas práticas necessárias em critérios verificáveis.

- autenticação e sessão;
- autorização por perfil e ownership;
- RLS/policies;
- proteção contra IDOR/BOLA/BFLA;
- validação server-side;
- CORS/headers/erros;
- rate limit e limites de recurso;
- upload PDF/JPG/PNG com validação real;
- links externos opacos/expiráveis/revogáveis;
- segredos fora do frontend/Git/logs;
- webhooks verificados e idempotentes;
- LGPD/minimização;
- dependências e vulnerabilidades;
- testes negativos e evidência.

Critério: nenhum CRITICAL/HIGH conhecido corrigível pendente para aprovação final.

## LGPD (RNF010) — minimização, finalidade, informação e retenção

- **Dados tratados:** exatamente os previstos no DER (nome, WhatsApp,
  Instagram opcional do cliente; respostas do atendimento; observações/
  descrições de solicitação, ajuste e agendamento; arquivos de arte e
  referência). Nenhum dado pessoal adicional é coletado.
- **Finalidade:** cada dado é usado só para o fluxo documentado (produção,
  avaliação, agendamento e publicação da arte) — nunca para
  perfilamento, marketing ou repasse a terceiros fora das integrações
  Meta já previstas no TFC.
- **Acesso:** restrito por perfil/ownership no backend (seção 12.1) e por
  RLS no banco (seção 12.4); nenhuma tabela/bucket sensível é acessível
  por `anon`.
- **Informação ao titular:** a primeira mensagem do questionário
  estruturado do WhatsApp (RN08, `atendimentoQuestions.ts`) e a tela
  pública de avaliação (`AvaliacaoPage.tsx`, RF009) informam a finalidade
  do tratamento e a referência à Lei nº 13.709/2018 — únicos dois pontos
  de contato direto com o cliente na aplicação.
- **Retenção:** enquanto o TFC não define prazo de retenção diferente,
  os dados permanecem associados à solicitação/cliente pelo tempo de
  vida do relacionamento designer↔cliente no sistema (não há exclusão
  automática); exclusão de cliente (RF003) e das entidades dependentes
  segue as regras de integridade referencial já definidas no DER — não
  existe funcionalidade de "esquecimento" automatizado porque não é um
  RF/RN documentado; qualquer prazo de retenção específico exigido pela
  banca deve ser tratado como decisão documental (ADR), não como
  implementação espontânea do agente.
- **Segurança de arquivos/tokens:** artes e referências ficam em
  Supabase Storage privado, acessadas só via URL assinada de curta
  duração (Fase 8/9); links de avaliação usam token opaco, aleatório,
  expirável e de uso único (Fase 9).
