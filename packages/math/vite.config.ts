import path from 'node:path';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const external = [
    'uuid',
    'numeric',
    'quadtree-lib',
    'libtess',
    'earcut',
    'poly2tri',
    'priorityqueuejs',
    'clipper2-wasm',
    'lodash',
];

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            formats: ['cjs'],
            fileName: () => 'index.cjs',
        },
        rollupOptions: {
            external,
        },
        target: 'es2020',
        outDir: 'dist',
        emptyOutDir: false,
    },
    plugins: [
        wasm(),
        topLevelAwait(),
    ],
    define: {
        global: 'globalThis',
    },
});
