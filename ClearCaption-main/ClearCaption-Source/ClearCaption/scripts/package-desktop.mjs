import { packager } from '@electron/packager';
import { mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run = promisify(execFile);
const [platform = 'darwin', arch = 'x64'] = process.argv.slice(2);
if (!['darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported platform');
const stage = path.resolve(`.generated/desktop-${platform}-${arch}`);
rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
for (const file of ['desktop', 'server', 'web', 'drizzle', 'README.md']) cpSync(file, path.join(stage, file), { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
delete pkg.devDependencies; delete pkg.scripts;
writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
const options = { dir: stage, name: 'ClearCaption', platform, arch, electronVersion: '43.8.12',
  out: 'releases', overwrite: true, asar: true, prune: false,
  appBundleId: 'com.clearcaption.desktop', appCopyright: 'ClearCaption',
  icon: path.resolve(`desktop/icon.${platform === 'darwin' ? 'icns' : 'ico'}`),
  ...(platform === 'darwin' ? { extendInfo: {
    NSMicrophoneUsageDescription: 'ClearCaption uses your microphone for live captions. Audio recordings are not saved.',
    LSMinimumSystemVersion: '12.0',
  } } : {}),
};
const [built] = await packager(options);
const suffix = platform === 'win32' ? 'Windows-x64' : `macOS-${arch === 'x64' ? 'Intel' : 'Apple-Silicon'}`;
const archive = path.resolve(`releases/ClearCaption-${pkg.version}-${suffix}.zip`);
const temporary = archive.replace(/\.zip$/, '.tmp.zip');
rmSync(temporary, { force: true });
await run('zip', ['-y', '-q', '-r', temporary, path.basename(built)], { cwd: path.dirname(built), maxBuffer: 1024 * 1024 });
renameSync(temporary, archive);
console.log(archive);
