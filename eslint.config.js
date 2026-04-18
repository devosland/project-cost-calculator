import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * ESLint flat config.
 * Split by scope:
 *  - src/**: browser globals, React rules (JSX)
 *  - server/**: Node globals, no React
 *  - *.config.js at root: Node globals + CommonJS (some configs use module/require)
 *  - Test files: include Node + browser globals
 *
 * Note: react/prop-types is disabled project-wide — this codebase uses JSDoc
 * @param annotations for prop documentation instead of the runtime PropTypes API.
 */
export default [
  { ignores: ['dist', 'node_modules', 'server/node_modules', 'data', '.claude', '.superpowers'] },

  // Frontend (React) — src/
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // React ignored: React 18+ no longer requires import for JSX transforms, but legacy imports remain.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Backend (Node) — server/
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      ...js.configs.recommended.rules,
      // React ignored: React 18+ no longer requires import for JSX transforms, but legacy imports remain.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Test files — vitest provides describe/it/expect; both browser + node available
  {
    files: ['**/*.{test,spec}.{js,jsx}', '**/__tests__/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },

  // Config files at root (Node, may mix ESM/CJS)
  {
    files: ['*.config.js', '*.config.cjs', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.commonjs },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
]
