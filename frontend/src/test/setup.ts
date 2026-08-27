import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem isso, o DOM renderizado por um teste (render()) permanece no documento
// para o próximo teste do mesmo arquivo, gerando falsos positivos/negativos.
afterEach(() => {
  cleanup();
});

// jsdom não implementa URL.createObjectURL/revokeObjectURL — necessário para
// o preview de arquivo antes do envio (FilePreviewPicker).
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock-preview-url';
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}
