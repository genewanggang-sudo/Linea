import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        sourcemap: true,
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            // core 发布时由宿主提供 math，避免把 math 一起打进 core。
            external: ['@ccpc/math'],
        },
    },
    // define: {
    //     global: 'globalThis',
    // },
});
