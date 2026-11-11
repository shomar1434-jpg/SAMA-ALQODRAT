import globals from 'globals';

// فحص ثابت يلتقط المراجع غير المعرّفة والإسناد إلى أسماء مستوردة قبل وصولها للمتصفح
export default [
  { ignores: ['dist/**', 'node_modules/**', 'certificate/**'] },
  {
    files: ['src/**/*.js', 'tests/**/*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, Chart: 'readonly', QRCode: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unused-vars': ['warn', { vars: 'all', args: 'none', caughtErrors: 'none' }],
    },
  },
];
