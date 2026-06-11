import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.vue.js'],
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
    },
  },
  {
    // Enforce single source of truth for env vars. The only place that may
    // read `import.meta.env.VITE_*` or `process.env` is `src/config.js`.
    files: ['src/**/*.{js,vue}'],
    ignores: ['src/config.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Block any MemberExpression that walks into `.env` regardless of
          // its root. Catches `import.meta.env.*` and `process.env.*`.
          selector:
            "MemberExpression[property.name='env']",
          message:
            'Lee las env vars desde src/config.js (APP_CONFIG). Acceso directo a `*.env` está prohibido fuera de src/config.js.',
        },
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][object.meta.name='import']",
          message:
            'Lee las env vars desde src/config.js (APP_CONFIG). No usar `import.meta` fuera de src/config.js.',
        },
      ],
    },
  },
];
