/**
 * Item 12.1/12.2 (rodada final): identificador da mensagem `postMessage`
 * trocada entre o popup de OAuth do Instagram e a janela que o abriu.
 * Compartilhado entre `ClientesPage` (designer, popup) e `InstagramStatusPage`
 * (página pública de destino quando não há `window.opener`) para os dois
 * lados sempre concordarem no mesmo `source`.
 */
export const INSTAGRAM_OAUTH_MESSAGE_SOURCE = 'designhub-instagram-oauth';
