# DesignHub

Sistema acadêmico do TFC de Engenharia de Software para gerenciamento do fluxo de solicitação, produção externa, versionamento, avaliação, ajustes, aprovação, agendamento e publicação/registro de artes digitais, com integração ao WhatsApp e Instagram conforme as fontes oficiais do projeto.

## Stack congelada

- Frontend: React + TypeScript + HTML + CSS + Vite
- Backend: Node.js + Express + TypeScript + API REST
- Banco: PostgreSQL hospedado no Supabase
- Auth/Storage: Supabase
- WhatsApp: API oficial Meta
- Instagram: API oficial Meta

## Integração com o Instagram

A publicação automática usa a API oficial da Meta e exige uma conta profissional (Business ou Creator) autorizada no aplicativo da Meta do DesignHub. Quando não há integração ou acesso disponível, o fluxo manual de publicação com registro no sistema permanece válido.

> **Observação para a banca avaliadora:** no documento do Google Drive, na seção **"Acessos"**, estão disponíveis as credenciais de uma conta do Instagram já autorizada e conectada ao aplicativo da Meta. Essa conta pode ser utilizada para acessar o Instagram e testar o agendamento e a publicação automática de artes do DesignHub. As credenciais não são versionadas neste repositório.

