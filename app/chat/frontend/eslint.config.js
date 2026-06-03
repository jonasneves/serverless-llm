import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';

// Dead exports / unused files / unused deps are caught by knip (`npm run knip`),
// not eslint-plugin-import's no-unused-modules, which is broken under flat config.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'scripts', '*.config.{js,ts}'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      // Hooks correctness (real bugs)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Empty catch blocks are an intentional "ignore this failure" idiom here.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Pre-existing `any` usage — surfaced as a nudge, not a blocker, for now.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Dead locals/params/imports — the rot this is meant to catch.
      // Defer to the plugin (autofixable for imports) and silence the base rules.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
    },
  },
);
