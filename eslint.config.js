// ═══════════════════════════════════════════════════════════════
// ESLint flat config — Ornato ERP
// ═══════════════════════════════════════════════════════════════
// Rodar:
//   npx eslint .              → lista problemas
//   npx eslint . --fix        → corrige automaticamente o que dá
//
// Escopo: frontend (React) + backend (Node ESM).
// Arquivos grandes / legados ficam com rules mais tolerantes.

import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
    // ── Ignorados ──────────────────────────────────────────────
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'server/uploads/**',
            'uploads/**',
            'output/**',
            'tmp/**',
            'cnc/**',
            'cnc_optimizer/**',
            'ornato-plugin/**',
            'extension/**',
            'showcase/**',
            'design-system/**',
            '.sistema-antigo/**',
            'ref-sistema-antigo/**',
            'public/**',
            'scripts/**',
            // Ignorar arquivo gigante — não mexer aqui
            'src/pages/ProducaoCNC.jsx',
            'server/routes/cnc.js',        // parte do módulo CNC — não mexer
            'server/benchmark-nesting.js',
            'server/lib/**',
            'marcenaria-erp-v2.jsx',
            '.venv-cnc/**',
            '.agent/**',
            '.claude/**',
            '.coverage',
        ],
    },

    // ── Base JS ────────────────────────────────────────────────
    js.configs.recommended,

    // ── Frontend (React) ───────────────────────────────────────
    {
        files: ['src/**/*.{js,jsx}'],
        plugins: { react, 'react-hooks': reactHooks },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser, ...globals.es2023 },
        },
        settings: { react: { version: '18.3' } },
        rules: {
            // React
            'react/jsx-uses-react': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react/no-unknown-property': 'warn',
            'react/jsx-key': 'warn',
            'react/no-unescaped-entities': 'off',

            // Hooks — warn em legados que misturam early-return com hooks;
            // mexer nisso exige refactor cuidadoso, não é autofix.
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/exhaustive-deps': 'warn',

            // JS gerais — pragmático, não bloqueante
            'no-unused-vars': ['warn', {
                args: 'none',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-console': 'off',
            'no-constant-binary-expression': 'warn',
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'warn',
            'no-case-declarations': 'off',
        },
    },

    // ── Backend (Node ESM) ─────────────────────────────────────
    {
        files: ['server/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.es2023 },
        },
        rules: {
            'no-unused-vars': ['warn', {
                args: 'none',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-console': 'off',
            'no-useless-escape': 'warn',
            'no-case-declarations': 'off',
        },
    },

    // ── Config files no root ───────────────────────────────────
    {
        files: ['*.config.{js,cjs}', 'vite.config.js', 'postcss.config.js', 'tailwind.config.js', 'eslint.config.js'],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
];
