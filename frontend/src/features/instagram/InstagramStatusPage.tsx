import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { INSTAGRAM_OAUTH_MESSAGE_SOURCE } from './oauthMessage';

/**
 * RF014/ADR 0005, item 12.2/13.3 (rodada final): destino público e seguro do
 * callback OAuth do Instagram quando quem abriu o link foi o CLIENTE (fluxo
 * "enviar link ao cliente" via WhatsApp) — nunca o painel autenticado do
 * Designer aberto no navegador do cliente. Também serve de fallback universal
 * para o próprio popup do designer: quando a origem ainda não pôde ser
 * determinada (ex.: erro de state inválido/expirado), esta página repassa o
 * resultado por `postMessage` para quem a abriu e se fecha sozinha — mesmo
 * mecanismo já usado em `ClientesPage`, nunca com `origin: '*'`.
 */
export function InstagramStatusPage() {
  const [searchParams] = useSearchParams();
  const resultado = searchParams.get('resultado') === 'conectado' ? 'conectado' : 'erro';
  const { status, profile } = useAuth();
  const [isPopup] = useState(
    () => typeof window !== 'undefined' && window.opener != null && window.opener !== window,
  );

  useEffect(() => {
    if (!isPopup) return;
    try {
      (window.opener as Window).postMessage(
        { source: INSTAGRAM_OAUTH_MESSAGE_SOURCE, resultado },
        window.location.origin,
      );
    } finally {
      window.close();
    }
  }, [isPopup, resultado]);

  if (isPopup) {
    // A janela se fecha sozinha assim que o efeito acima roda; nada para exibir.
    return null;
  }

  // Item 12.2: se esta aba for de um designer com sessão ativa (ex.: fallback de
  // página inteira quando o popup foi bloqueado), oferece um caminho de volta —
  // nunca redireciona automaticamente, e nunca exige isso de quem não tem sessão.
  const mostrarVoltarParaClientes = status === 'signed-in' && profile?.perfil === 'designer';

  return (
    <main className="avaliacao-shell">
      <div className="avaliacao-card">
        {resultado === 'conectado' ? (
          <>
            <h1>Instagram conectado com sucesso</h1>
            <p role="status">Você pode fechar esta página.</p>
          </>
        ) : (
          <>
            <h1>Não foi possível conectar o Instagram</h1>
            <p role="alert">Peça um novo link de conexão ao designer responsável e tente novamente.</p>
          </>
        )}
        {mostrarVoltarParaClientes && <Link to="/designer/clientes">Voltar para Clientes</Link>}
      </div>
    </main>
  );
}
