import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const distDir = path.resolve(pkgDir, 'dist');
const srcPkgPath = path.resolve(pkgDir, 'package.json');
const canvasPkgPath = path.resolve(pkgDir, '..', 'canvas', 'package.json');
const corePkgPath = path.resolve(pkgDir, '..', 'core', 'package.json');
const mathPkgPath = path.resolve(pkgDir, '..', 'math', 'package.json');
const snapPkgPath = path.resolve(pkgDir, '..', 'snap', 'package.json');

const readJson = async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
};

const srcPkg = await readJson(srcPkgPath);
const canvasPkg = await readJson(canvasPkgPath);
const corePkg = await readJson(corePkgPath);
const mathPkg = await readJson(mathPkgPath);
const snapPkg = await readJson(snapPkgPath);

const distPkg = {
    ...srcPkg,
    main: './index.js',
    peerDependencies: {
        '@ccpc/canvas': `^${canvasPkg.version}`,
        '@ccpc/core': `^${corePkg.version}`,
        '@ccpc/math': `^${mathPkg.version}`,
        '@ccpc/snap': `^${snapPkg.version}`,
    },
};

delete distPkg.scripts;
delete distPkg.devDependencies;
delete distPkg.private;
delete distPkg.types;
delete distPkg.exports;
delete distPkg.dependencies?.['@ccpc/canvas'];
delete distPkg.dependencies?.['@ccpc/core'];
delete distPkg.dependencies?.['@ccpc/math'];
delete distPkg.dependencies?.['@ccpc/snap'];
if (distPkg.dependencies && Object.keys(distPkg.dependencies).length === 0) {
    delete distPkg.dependencies;
}

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(path.resolve(distDir, 'package.json'), `${JSON.stringify(distPkg, null, 2)}\n`);
