export const VERSAO_ARTE_FORMATOS = ['PDF', 'JPG', 'PNG'] as const;
export type VersaoArteFormato = (typeof VERSAO_ARTE_FORMATOS)[number];

export const EXTENSION_BY_FORMATO: Record<VersaoArteFormato, string> = {
  PDF: 'pdf',
  JPG: 'jpg',
  PNG: 'png',
};

export const CONTENT_TYPE_BY_FORMATO: Record<VersaoArteFormato, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * RF007/RN23 + seção 12.2 ("validar... MIME real"): o Content-Type
 * declarado pelo cliente é apenas metadado não confiável — o formato real
 * é decidido pelos bytes iniciais do arquivo (assinatura/"magic bytes"),
 * nunca pela extensão ou pelo header enviados pelo navegador.
 */
export function detectVersaoArteFormato(buffer: Buffer): VersaoArteFormato | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'PDF';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'JPG';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'PNG';
  }
  return null;
}
