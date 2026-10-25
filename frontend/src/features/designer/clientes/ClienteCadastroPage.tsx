import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { createCliente } from './api';
import { ClienteFormPanel, type ClienteFormValues } from './ClienteFormPanel';

/**
 * RF003 — tela dedicada ao CADASTRO de cliente (rodada UX: divisão clara de
 * responsabilidade entre as telas). O trabalho operacional com clientes já
 * cadastrados (iniciar atendimento, solicitações/artes, status, editar,
 * excluir, Instagram) vive no Dashboard, em `ClientesOperacionalPanel` —
 * nenhuma função foi removida do sistema, apenas reposicionada.
 *
 * Reaproveita exatamente o mesmo `ClienteFormPanel` e a mesma API
 * `createCliente` já usados antes: nenhuma validação, regra ou rota nova
 * (WhatsApp normalizado e único por designer, Observação opcional e campos
 * obrigatórios continuam vindo do mesmo formulário/schema).
 */
export function ClienteCadastroPage() {
  const navigate = useNavigate();
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function handleCreate(values: ClienteFormValues) {
    const cliente = await createCliente({
      nome: values.nome,
      whatsapp: values.whatsapp,
      observacao: values.observacao.trim() || undefined,
    });
    setSucesso(
      `Cliente "${cliente.nome}" cadastrado. Ele já aparece no Dashboard para iniciar o atendimento.`,
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Cadastrar cliente</h1>
      </div>

      <p className="clientes-foco-hint">
        Esta tela serve para cadastrar um novo cliente. Depois de cadastrado, ele aparece no{' '}
        <Link to="/designer">Dashboard</Link>, onde você inicia o atendimento e acompanha as
        artes/solicitações dele.
      </p>

      {sucesso && (
        <p role="status" className="atendimento-success">
          {sucesso}{' '}
          <Link to="/designer">Ir para o Dashboard</Link>
        </p>
      )}

      <ClienteFormPanel
        mode="create"
        onSubmit={handleCreate}
        onCancel={() => {
          // Sem cadastro em andamento, "Cancelar" volta ao centro operacional.
          void navigate('/designer');
        }}
      />
    </AppShell>
  );
}

