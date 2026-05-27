// @ts-check
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      // 只允許 composition.ts 直接 import FileLogger；其他地方必須透過 LogPort 注入
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '.*FileLogger.*',
              message: 'Import LogPort via constructor injection. Only composition.ts may import FileLogger.',
            },
          ],
        },
      ],
    },
  },
  {
    // composition.ts 是唯一合法的 FileLogger import 位置（Composition Root）
    files: ['src/infrastructure/composition.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
