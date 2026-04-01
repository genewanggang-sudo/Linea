import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const distDir = path.resolve(pkgDir, 'dist');
const srcPkgPath = path.resolve(pkgDir, 'package.json');
const distPkgPath = path.resolve(distDir, 'package.json');
const mathPkgPath = path.resolve(pkgDir, '..', 'math', 'package.json');

const readJson = async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
};

const srcPkg = await readJson(srcPkgPath);
const mathPkg = await readJson(mathPkgPath);

const distPkg = {
    ...srcPkg,
    main: './index.js',
    types: './types/index.d.ts',
    peerDependencies: {
        ...srcPkg.peerDependencies,
        '@ccpc/math': `^${mathPkg.version}`,
    },
};

delete distPkg.scripts;
delete distPkg.devDependencies;
delete distPkg.private;
delete distPkg.types;

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(distPkgPath, `${JSON.stringify(distPkg, null, 2)}\n`);
