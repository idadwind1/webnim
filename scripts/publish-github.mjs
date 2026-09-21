import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
const directory = await mkdtemp(join(tmpdir(), 'webnim-github-package-'));
try {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const entry of manifest.files) await cp(join(root, entry), join(directory, entry), { recursive: true });
  for (const entry of ['LICENSE', 'LICENSE.md']) {
    try { await cp(join(root, entry), join(directory, entry)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  manifest.name = '@idadwind1/webnim';
  manifest.publishConfig = { registry: 'https://npm.pkg.github.com' };
  delete manifest.scripts;
  delete manifest.devDependencies;
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  execFileSync(npm, ['publish', '--registry=https://npm.pkg.github.com', ...args], { cwd: directory, stdio: 'inherit' });
} finally {
  await rm(directory, { recursive: true, force: true });
}
