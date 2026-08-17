import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  // NEXT_PUBLIC_ é aceito apenas como fallback de conveniência local para o
  // par URL/publishable key do Supabase (valores intencionalmente públicos,
  // equivalentes ao prefixo VITE_ canônico deste projeto). Nunca usar esse
  // prefixo para segredo.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
