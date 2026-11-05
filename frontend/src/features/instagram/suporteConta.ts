/**
 * RF014/ADR 0005: contato de suporte para liberação da conta do Instagram.
 *
 * A integração oficial da Meta usada pelo DesignHub opera no nível de acesso
 * gratuito/de desenvolvimento do App. Nesse nível, a PRÓPRIA Meta recusa o
 * login de contas profissionais que ainda não foram autorizadas no App
 * (mensagem "Função de desenvolvedor é insuficiente"), antes de qualquer
 * redirecionamento de volta para o DesignHub — por isso o sistema não tem como
 * tratar esse erro em tempo de execução, apenas orientar o usuário sobre o
 * caminho real de liberação.
 *
 * Estes valores são contato público de suporte do projeto, nunca dado pessoal
 * de cliente (RNF010/LGPD).
 */
export const SUPORTE_INSTAGRAM_WHATSAPP = '5564984035274';
export const SUPORTE_INSTAGRAM_WHATSAPP_EXIBICAO = '+55 (64) 98403-5274';
export const SUPORTE_INSTAGRAM_WHATSAPP_URL = `https://wa.me/${SUPORTE_INSTAGRAM_WHATSAPP}`;
