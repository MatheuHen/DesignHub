# DesignHub

Sistema acadêmico do TFC de Engenharia de Software para gerenciamento do fluxo de solicitação, produção externa, versionamento, avaliação, ajustes, aprovação, agendamento e publicação/registro de artes digitais, com integração ao WhatsApp e Instagram conforme as fontes oficiais do projeto.

## Stack congelada

- Frontend: React + TypeScript + HTML + CSS + Vite
- Backend: Node.js + Express + TypeScript + API REST
- Banco: PostgreSQL hospedado no Supabase
- Auth/Storage: Supabase
- WhatsApp: API oficial Meta
- Instagram: API oficial Meta + fluxo manual documental


## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
npm run preflight
```

## Portas locais iniciais

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Health: http://localhost:3001/api/health

A base inicial funciona sem credenciais apenas para health/dev shell. As funcionalidades do TFC devem ser construídas pelo roadmap congelado.
