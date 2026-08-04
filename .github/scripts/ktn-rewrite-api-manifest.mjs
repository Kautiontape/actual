// Rewrites packages/api/package.json in place so `npm pack` produces a tarball
// that installs outside this monorepo. Two things make the workspace manifest
// unusable as-is for the fork:
//
// 1. `workspace:*` dependencies. npm cannot resolve the workspace protocol at
//    all, and `yarn pack` would rewrite those ranges to upstream's published
//    version numbers — quietly pulling upstream's loot-core instead of the
//    fork's. Neither is what we want, and neither is needed: the api bundle is
//    built with vite `ssr.noExternal: true` and only better-sqlite3 left
//    external, so loot-core and crdt are already inlined into dist.
// 2. `publishConfig.exports`, which drops the `development` condition pointing
//    at index.ts. index.ts is not in `files`, so a consumer resolving under
//    that condition would get a missing module. Apply publishConfig here
//    rather than relying on packer-specific handling of the field.

import { readFile, writeFile } from 'node:fs/promises';

const MANIFEST = 'packages/api/package.json';

const suffix = process.env.KTN_VERSION_SUFFIX;
if (!suffix) {
  throw new Error('KTN_VERSION_SUFFIX is required');
}

const pkg = JSON.parse(await readFile(MANIFEST, 'utf8'));

const upstreamVersion = pkg.version;
pkg.name = '@kautiontape/actual-api';
pkg.version = `${upstreamVersion}-ktn.${suffix}`;
pkg.repository = {
  type: 'git',
  url: 'git+https://github.com/Kautiontape/actual.git',
  directory: 'packages/api',
};

if (pkg.publishConfig) {
  Object.assign(pkg, pkg.publishConfig);
  delete pkg.publishConfig;
}

const dropped = [];
for (const field of [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
]) {
  const deps = pkg[field];
  if (!deps) {
    continue;
  }
  for (const [name, range] of Object.entries(deps)) {
    if (String(range).startsWith('workspace:')) {
      delete deps[name];
      dropped.push(`${field}.${name}`);
    }
  }
}

// Neither is meaningful to a consumer, and dropping scripts keeps `npm pack`
// and any downstream install from trying to run monorepo tooling.
delete pkg.devDependencies;
delete pkg.scripts;

await writeFile(MANIFEST, JSON.stringify(pkg, null, 2) + '\n');

console.log(`${pkg.name}@${pkg.version} (from ${upstreamVersion})`);
console.log(`dropped workspace deps: ${dropped.join(', ') || 'none'}`);
console.log(`runtime deps: ${Object.keys(pkg.dependencies ?? {}).join(', ')}`);
