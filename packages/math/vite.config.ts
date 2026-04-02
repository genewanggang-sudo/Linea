import path from 'node:path';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            // 写在dependencies里,运行时安装依赖
            external: [
                'uuid',
                'earcut',
                'lodash',
            ],
        },
    },
    plugins: [
        wasm(),
        topLevelAwait(),
    ],
    define: {
        // 某些三方库默认假设存在 global，这里在浏览器/ESM 环境里映射到 globalThis。
        global: 'globalThis',
    },
});
