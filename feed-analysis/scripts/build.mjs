import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist'), { recursive: true });
await mkdir(resolve(root, 'dev-dist'), { recursive: true });
// Remove only known outputs from earlier builds, never unrelated workspace files.
for (const stale of ['lab.html', 'ui.js']) await rm(resolve(root, 'dist', stale), { force: true });
await build({ entryPoints: ['background', 'content', 'extension'].map(x => resolve(root, `src/${x}.ts`)),
  outdir: resolve(root, 'dist'), bundle: true, target: 'chrome120', format: 'iife', minify: true, sourcemap: false, legalComments: 'none' });
for (const file of ['popup.html', 'settings.html', 'ui.css', 'content.css'])
  await copyFile(resolve(root, 'public', file), resolve(root, 'dist', file));
await build({ entryPoints: [resolve(root, 'src/ui.ts')], outdir: resolve(root, 'dev-dist'), bundle: true, target: 'chrome120', format: 'iife', minify: true });
for (const file of ['lab.html', 'ui.css']) await copyFile(resolve(root, 'public', file), resolve(root, 'dev-dist', file));
await copyFile(resolve(root, 'manifest.json'), resolve(root, 'dist', 'manifest.json'));
const notices = await Promise.all(['effect', '@effect/platform-browser'].map(async name => {
  const folder = resolve(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8'));
  return `${name} ${pkg.version}\n\n${await readFile(resolve(folder, 'LICENSE'), 'utf8')}`;
}));
await writeFile(resolve(root, 'dist', 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n-----\n\n'));
console.log('Built Chrome extension in dist/; development lab is separate in dev-dist/');
