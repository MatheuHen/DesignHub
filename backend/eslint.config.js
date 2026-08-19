import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // api/: bundle gerado por scripts/build-vercel-function.mjs (esbuild),
  // fora do tsconfig.json do workspace (rootDir "src"). .vercel/: saída
  // local de `vercel build` (Fase 16). Nenhum dos dois é fonte.
  { ignores: ['dist', 'api', '.vercel'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
