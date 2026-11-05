import { SUPORTE_INSTAGRAM_WHATSAPP_EXIBICAO } from '../instagram/suporteConta';

/**
 * RNF010/LGPD (Lei nº 13.709/2018): página pública de Política de
 * Privacidade. Existe por exigência formal do App Review da Meta, que só
 * aceita a submissão das permissões do Instagram (`instagram_business_basic`,
 * `instagram_business_content_publish`) com uma URL pública de política de
 * privacidade.
 *
 * NÃO altera nenhum fluxo do TFC: é uma rota estática, fora de menu,
 * navegação ou dashboard, alcançável apenas por URL direta. Nenhum requisito
 * funcional, estado, permissão ou passo do processo depende dela. O conteúdo
 * apenas descreve o tratamento de dados que o sistema JÁ faz conforme o
 * RNF010 — não cria nova coleta, nova finalidade nem novo dado.
 */
export function PoliticaPrivacidadePage() {
  return (
    <main className="avaliacao-shell">
      <div className="avaliacao-card legal-card">
        <h1>Política de Privacidade — DesignHub</h1>
        <p className="legal-meta">Última atualização: 05/11/2026</p>

        <h2>1. Quem somos</h2>
        <p>
          O DesignHub é um sistema acadêmico de gerenciamento do fluxo de solicitação, produção,
          avaliação, aprovação, agendamento e publicação de artes digitais, desenvolvido como
          Trabalho Final de Curso. O tratamento de dados pessoais observa a Lei nº 13.709/2018
          (LGPD).
        </p>

        <h2>2. Quais dados tratamos</h2>
        <p>Tratamos somente os dados necessários ao funcionamento do fluxo de atendimento:</p>
        <ul>
          <li>nome do cliente;</li>
          <li>número de WhatsApp, usado para a coleta estruturada das informações da arte;</li>
          <li>identificação da conta do Instagram, quando o cliente opta por vinculá-la;</li>
          <li>
            mensagens e respostas do atendimento (tema, cores, observações e arquivos de
            referência enviados pelo próprio cliente);
          </li>
          <li>
            dados de acesso dos usuários internos (designer e administrador): nome e e-mail. Senhas
            são gerenciadas pelo subsistema de autenticação e nunca são armazenadas em texto puro
            nem acessíveis à aplicação.
          </li>
        </ul>

        <h2>3. Para que usamos</h2>
        <p>
          Exclusivamente para produzir, versionar, avaliar, aprovar, agendar e publicar a arte
          solicitada pelo próprio cliente, e para manter o histórico do atendimento. Não vendemos,
          alugamos nem compartilhamos dados pessoais com terceiros para finalidade publicitária, e
          não realizamos qualquer decisão automatizada sobre pessoas.
        </p>

        <h2>4. Integrações com a Meta (WhatsApp e Instagram)</h2>
        <p>
          Utilizamos as APIs oficiais da Meta. O <strong>WhatsApp Cloud API</strong> é usado para a
          coleta estruturada das informações da arte e para avisos do andamento da solicitação.
        </p>
        <p>
          A <strong>Instagram API</strong> é usada somente após o titular autorizar expressamente a
          própria conta profissional. Com essa autorização, acessamos apenas a identificação da
          conta vinculada (para confirmar ao usuário qual conta está conectada) e publicamos
          conteúdo exclusivamente quando: (a) a arte foi aprovada pelo próprio cliente dentro do
          sistema, e (b) existe um agendamento ativo criado por ele. Nenhuma publicação ocorre sem
          aprovação e agendamento do titular da conta.
        </p>

        <h2>5. Revogação do acesso e exclusão de dados</h2>
        <p>
          O titular pode revogar a autorização do Instagram a qualquer momento, desconectando a
          conta no próprio DesignHub ou removendo o aplicativo em{' '}
          <em>Instagram → Configurações → Apps e sites</em>. Ao revogar, a conexão e as credenciais
          de acesso daquela conta são removidas do sistema.
        </p>
        <p>
          Para solicitar a exclusão dos seus dados pessoais, entre em contato pelo WhatsApp{' '}
          {SUPORTE_INSTAGRAM_WHATSAPP_EXIBICAO}. Solicitações de exclusão recebidas pelos canais
          oficiais da Meta são processadas automaticamente pelo sistema.
        </p>

        <h2>6. Segurança e retenção</h2>
        <p>
          O acesso aos dados é restrito por perfil e por titularidade: cada designer acessa somente
          os seus próprios clientes e solicitações. Arquivos de arte e referências ficam em
          armazenamento privado, acessível apenas por links temporários e autorizados. Credenciais
          de integração são mantidas exclusivamente no servidor. Os dados são retidos enquanto
          necessários ao atendimento e ao histórico da solicitação.
        </p>

        <h2>7. Seus direitos</h2>
        <p>
          Conforme a LGPD, o titular pode solicitar confirmação do tratamento, acesso, correção,
          anonimização, portabilidade ou exclusão dos seus dados, além de revogar o consentimento.
          Os pedidos podem ser feitos pelo contato indicado na seção 5.
        </p>

        <h2>8. Contato</h2>
        <p>
          Dúvidas sobre esta política ou sobre o tratamento dos seus dados: WhatsApp{' '}
          {SUPORTE_INSTAGRAM_WHATSAPP_EXIBICAO}.
        </p>
      </div>
    </main>
  );
}
