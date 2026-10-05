import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';

const cwd = process.cwd();
const require = createRequire(join(cwd, 'package.json'));
const manifestPath = require.resolve('@araketski/pi-herdr/package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const packageRoot = realpathSync(join(cwd, 'node_modules/@araketski/pi-herdr'));
assert.ok(packageRoot.startsWith(realpathSync(join(cwd, 'node_modules')) + sep));
assert.equal(manifest.name, '@araketski/pi-herdr');
assert.equal(
  manifest.version,
  process.argv[3],
  'installed version differs from the selected manifest',
);
assert.deepEqual(manifest.exports, { './package.json': './package.json' });
assert.deepEqual(manifest.pi.extensions, ['./extensions/herdr/index.ts']);
assert.equal(manifest.peerDependencies['@earendil-works/pi-coding-agent'], '*');
assert.equal(manifest.dependencies, undefined);
assert.throws(() => require.resolve('@araketski/pi-herdr'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});

const sdkManifest = JSON.parse(
  readFileSync(join(cwd, 'node_modules/@earendil-works/pi-coding-agent/package.json'), 'utf8'),
);
assert.equal(sdkManifest.version, '0.99.1');
const extensionPath = join(packageRoot, 'extensions/herdr/index.ts');
const digest = createHash('sha256').update(readFileSync(extensionPath)).digest('hex');
assert.equal(digest, process.argv[2], 'installed extension differs from the freshly packed source');

const agentDir = join(cwd, 'agent');
const settingsManager = SettingsManager.create(cwd, agentDir);
const loader = new DefaultResourceLoader({
  cwd,
  agentDir,
  settingsManager,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});
// This subprocess owns this fixture and its project package settings only.
await loader.reload({ resolveProjectTrust: async () => true });
const loaded = loader.getExtensions();
assert.deepEqual(loaded.errors, []);
assert.deepEqual(loaded.warnings ?? [], []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
assert.equal(realpathSync(extension.path), extensionPath);
assert.equal(extension.sourceInfo.origin, 'package');
assert.equal(extension.sourceInfo.scope, 'project');
assert.equal(realpathSync(extension.sourceInfo.path), extensionPath);
for (const registration of [
  'tools',
  'commands',
  'handlers',
  'flags',
  'shortcuts',
  'messageRenderers',
]) {
  assert.equal(extension[registration].size, 0, `scaffold unexpectedly registered ${registration}`);
}
assert.deepEqual(loader.getSkills().skills, []);
assert.deepEqual(loader.getPrompts().prompts, []);
assert.deepEqual(loader.getThemes().themes, []);
console.log(
  JSON.stringify({
    sdk: sdkManifest.version,
    packageRoot,
    extensionPath,
    digest,
    sourceInfo: extension.sourceInfo,
    registrations: 0,
  }),
);
