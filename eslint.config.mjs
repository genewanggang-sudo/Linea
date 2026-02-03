import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

const INDENT = 4

export default [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.vite/**', '**/coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        files: ['**/*.{js,cjs,mjs,ts,tsx,vue}'],
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            'comma-dangle': ['error', 'always-multiline'],
            quotes: ['error', 'single', { avoidEscape: true }],
            'eol-last': ['error', 'always'],
            'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
            'no-trailing-spaces': 'error',
            '@stylistic/comma-spacing': ['error', { before: false, after: true }],
            '@stylistic/key-spacing': ['error', { beforeColon: false, afterColon: true }],
            '@stylistic/keyword-spacing': ['error', { before: true, after: true }],
            '@stylistic/no-multi-spaces': 'error',
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/space-in-parens': ['error', 'never'],
        },
    },
    {
        files: ['**/*.vue'],
        rules: {
            'vue/max-attributes-per-line': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': ['error', INDENT],
            'vue/script-indent': ['error', INDENT, { baseIndent: 0, switchCase: 1 }],
        },
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },
    {
        files: ['**/*.{js,cjs,mjs,ts,tsx}'],
        rules: {
            '@stylistic/indent': ['error', INDENT, { SwitchCase: 1 }],
        },
    },
]
