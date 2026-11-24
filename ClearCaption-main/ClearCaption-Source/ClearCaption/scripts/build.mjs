import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
const assets = {};
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, item.name);
    if (item.isDirectory()) walk(filename);
    else if (types[path.extname(filename)]) assets[`/${path.relative('web', filename)}`] = {
      content: readFileSync(filename, 'utf8'), type: `${types[path.extname(filename)]}; charset=utf-8`,
    };
  }
}
walk('web');
mkdirSync('.generated', { recursive: true });
writeFileSync('.generated/assets.json', JSON.stringify(assets));
await build({ entryPoints: ['server/worker.mjs'], bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', outfile: 'dist/server/index.js', minify: true });
mkdirSync('dist/.openai', { recursive: true });
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log(`Built ${Object.keys(assets).length} assets and API worker.`);
