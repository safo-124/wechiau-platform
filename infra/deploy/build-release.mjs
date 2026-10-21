#!/usr/bin/env node
/**
 * Builds a release for the VPS on this laptop: `npm run release` from the repo root.
 *
 * The VPS shares its memory with other apps, so nothing is compiled there.
 * This builds the shared package, the server and the dashboard here, then
 * packs only what the server needs into release/wechiau-<time>.tar.gz:
 *
 *   package.json, package-lock.json   install with `npm ci` on the VPS
 *   each workspace's package.json     so the lockfile still matches
 *   packages/shared/dist              shared schemas and rules
 *   apps/server/dist, prisma/         the API and its database migrations
 *   apps/web/dist                     the dashboard (Caddy serves these files)
 *   infra/deploy/                     the scripts and service files
 *
 * Copy it to the VPS, unpack it, and run its infra/deploy/deploy.sh there
 * (see infra/deploy/README.md).
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const name = `wechiau-${stamp}`;
const out = join(root, 'release', name);

console.log('Building shared, server and dashboard...');
run('npm run build');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (path, options = {}) => {
  const from = join(root, path);
  if (!existsSync(from)) throw new Error(`Missing ${path}. Did the build finish?`);
  cpSync(from, join(out, path), { recursive: true, ...options });
};
const skipBuildInfo = { filter: (source) => !source.endsWith('.tsbuildinfo') && !source.endsWith('.map') };

// The root package without its development-only install step (it compiles with tsc).
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
delete rootPackage.scripts.postinstall;
writeFileSync(join(out, 'package.json'), `${JSON.stringify(rootPackage, null, 2)}\n`);
copy('package-lock.json');

// Every workspace's package.json, so `npm ci` finds the workspaces the lockfile lists.
for (const group of ['apps', 'packages']) {
  for (const workspace of readdirSync(join(root, group))) {
    const manifest = join(group, workspace, 'package.json');
    if (existsSync(join(root, manifest))) copy(manifest);
  }
}

copy('packages/shared/dist', skipBuildInfo);
copy('apps/server/dist', skipBuildInfo);
copy('apps/server/prisma/schema.prisma');
copy('apps/server/prisma/migrations');
copy('apps/server/prisma.config.ts');
copy('apps/web/dist');
copy('infra/deploy');
rmSync(join(out, 'infra/deploy/build-release.mjs'));

const version = { name, builtAt: new Date().toISOString(), server: JSON.parse(readFileSync(join(root, 'apps/server/package.json'), 'utf8')).version };
writeFileSync(join(out, 'RELEASE.json'), `${JSON.stringify(version, null, 2)}\n`);

// tar ships with Windows 10+, macOS and Linux.
const archive = join(root, 'release', `${name}.tar.gz`);
execSync(`tar -czf "${name}.tar.gz" "${name}"`, { cwd: join(root, 'release'), stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });

const shown = relative(process.cwd(), archive) || archive;
console.log(`\nRelease ready: ${shown}`);
console.log('Next, from this folder:');
console.log(`  scp "${shown}" safo@135.181.93.156:~/`);
console.log('Then on the VPS:');
console.log(`  tar -xzf ${name}.tar.gz`);
console.log(`  sudo bash ${name}/infra/deploy/deploy.sh`);
