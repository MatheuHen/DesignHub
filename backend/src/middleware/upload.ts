import multer from 'multer';
import { ValidationError } from '../lib/errors.js';

/** RF007/RN23: mesmo limite do bucket privado "artes" (Fase 2, 15 MB). */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/**
 * Primeira camada de filtro (rápida, baseada no header Content-Type do
 * cliente — não confiável sozinha). A validação definitiva do formato real
 * do arquivo acontece depois, via assinatura de bytes
 * (`lib/fileSignature.ts`, seção 12.2 "MIME real"), no service.
 */
function createSingleFileUpload(fieldName: string) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        callback(new ValidationError('Formato de arquivo não suportado. Envie PDF, JPG ou PNG.'));
        return;
      }
      callback(null, true);
    },
  }).single(fieldName);
}

/** RF007/RF008: envio de nova versão da arte. */
export const uploadVersaoArte = createSingleFileUpload('arquivo');

/** RF010/RN21: referência opcional anexada a um pedido de ajuste. */
export const uploadAvaliacaoReferencia = createSingleFileUpload('referencia');
