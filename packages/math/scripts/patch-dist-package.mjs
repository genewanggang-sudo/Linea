import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const srcPkgPath = path.resolve(pkgDir, 'package.json');
const distDir = path.resolve(pkgDir, 'dist');
const distPkgPath = path.resolve(distDir, 'package.json');

const srcPkg = JSON.parse(await fs.readFile(srcPkgPath, 'utf8'));

const distPkg = {
    ...srcPkg,
    main: './index.js',
    types: './types/index.d.ts',
};

delete distPkg.scripts;
delete distPkg.devDependencies;
delete distPkg.private;

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(distPkgPath, `${JSON.stringify(distPkg, null, 2)}\n`);
