import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    define: {
        global: 'globalThis',
    },
    resolve: {
        alias: {
            '@ccpc/math': path.resolve(__dirname, '../../packages/math/src'),
        },
    },
})
