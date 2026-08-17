import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem isso, o DOM renderizado por um teste (render()) permanece no documento
// para o próximo teste do mesmo arquivo, gerando falsos positivos/negativos.
afterEach(() => {
  cleanup();
});
