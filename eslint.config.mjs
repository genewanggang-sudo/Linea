import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const INDENT = 4
const ROOT_DIR = dirname(fileURLToPath(import.meta.url))

export default [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.vite/**', '**/coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
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
            '@stylistic/indent': ['error', INDENT, { SwitchCase: 1 }],
            '@stylistic/key-spacing': ['error', { beforeColon: false, afterColon: true }],
            '@stylistic/keyword-spacing': ['error', { before: true, after: true }],
            '@stylistic/no-multi-spaces': 'error',
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/space-in-parens': ['error', 'never'],
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
            }],
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                { accessibility: 'explicit', overrides: { constructors: 'no-public' } },
            ],
        },
    },
    {
        files: ['**/*.{ts,tsx,vue}'],
        languageOptions: {
            parserOptions: {
                project: ['tsconfig.eslint.json'],
                tsconfigRootDir: ROOT_DIR,
            },
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
            parser: vueParser,
            parserOptions: {
                extraFileExtensions: ['.vue'],
                parser: tseslint.parser,
            },
        },
    },
]
