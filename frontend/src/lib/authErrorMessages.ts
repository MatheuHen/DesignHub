/**
 * Traduz mensagens cruas do Supabase Auth (GoTrue, em inglês) para PT-BR.
 * Nunca repassa a mensagem original ao usuário: se nenhum padrão conhecido
 * casar, cai num texto genérico em vez de expor o texto do provedor.
 */
const KNOWN_PATTERNS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha inválidos.'],
  [/email not confirmed/i, 'E-mail ainda não confirmado.'],
  [/user already registered|already been registered/i, 'Já existe um usuário cadastrado com este e-mail.'],
  [/password should be at least/i, 'A senha deve ter pelo menos 6 caracteres.'],
  [/unable to validate email address/i, 'Informe um e-mail válido.'],
  [/for security purposes/i, 'Por segurança, aguarde alguns instantes antes de tentar novamente.'],
  [/new password should be different/i, 'A nova senha deve ser diferente da senha atual.'],
  [/token has expired|invalid.*(token|refresh)/i, 'O link informado é inválido ou expirou. Solicite um novo.'],
  [/network|fetch failed|failed to fetch/i, 'Não foi possível conectar ao servidor. Verifique sua conexão.'],
];

export function translateAuthErrorMessage(rawMessage: string | null | undefined): string {
  if (rawMessage) {
    for (const [pattern, translated] of KNOWN_PATTERNS) {
      if (pattern.test(rawMessage)) return translated;
    }
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}
