import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Item 10: a suíte Playwright vive fora do projeto da aplicação
    // (`tsconfig.e2e.json`, propositalmente não referenciado por
    // `tsconfig.json` para não entrar no build de produção). Sem este bloco,
    // o `projectService` não encontra esses arquivos e o lint falha no parse.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: false,
        project: './tsconfig.e2e.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Testes E2E navegam pelo DOM real e conversam com Supabase/web-push,
      // cujos retornos são tipados de forma ampla — asserções pontuais aqui
      // não têm o mesmo risco que teriam em código de produção.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Falso positivo: o callback de fixture do Playwright recebe um
      // parâmetro chamado `use`, que a regra confunde com um React Hook.
      // Não há React nesta pasta.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
