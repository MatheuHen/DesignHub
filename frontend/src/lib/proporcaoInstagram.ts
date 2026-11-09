/**
 * Limites de proporção do feed do Instagram para publicação pela API oficial
 * (Content Publishing API): de 4:5 (0,80) a 1.91:1. Fora disso a Meta recusa
 * a mídia com `code 36003 / error_subcode 2207009` e a publicação automática
 * não acontece — foi o que ocorreu em produção com uma arte 360x106
 * (proporção 3,40), recusada no horário agendado.
 *
 * Isto é só AVISO ao designer, nunca bloqueio e nunca alteração do arquivo: a
 * arte continua sendo produzida e ajustada fora do DesignHub (RN15), e o
 * caminho de publicação manual previsto no RF014 segue disponível para
 * qualquer formato aceito (PDF, JPG, PNG). O objetivo é só antecipar a
 * informação para o momento do envio, em vez de ela aparecer dias depois, no
 * horário da publicação.
 */
export const PROPORCAO_MINIMA_INSTAGRAM = 0.8;
export const PROPORCAO_MAXIMA_INSTAGRAM = 1.91;

/**
 * Mensagem de aviso quando a imagem não atende aos limites do feed, ou `null`
 * quando está dentro deles (nada a dizer).
 */
export function avisoProporcaoInstagram(largura: number, altura: number): string | null {
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) {
    return null;
  }

  const proporcao = largura / altura;
  if (proporcao >= PROPORCAO_MINIMA_INSTAGRAM && proporcao <= PROPORCAO_MAXIMA_INSTAGRAM) {
    return null;
  }

  const formato = proporcao > PROPORCAO_MAXIMA_INSTAGRAM ? 'larga' : 'alta';
  return (
    `Esta imagem é ${largura}×${altura} px (proporção ${proporcao.toFixed(2)}:1), ` +
    `${formato} demais para o feed do Instagram, que aceita de 4:5 a 1.91:1. ` +
    'A publicação automática será recusada pela Meta; você ainda pode enviar ' +
    'assim e publicar manualmente, ou ajustar a arte antes de enviar.'
  );
}
