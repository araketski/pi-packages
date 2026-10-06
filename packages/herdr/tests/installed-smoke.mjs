import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
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

// Exercise the freshly installed source seam, not checkout modules or a published library export.
const transportPath = join(packageRoot, 'extensions/herdr/transport.ts');
const transportDigest = createHash('sha256').update(readFileSync(transportPath)).digest('hex');
assert.equal(transportDigest, process.argv[4]);
const sdkRequire = createRequire(import.meta.resolve('@earendil-works/pi-coding-agent'));
const { createJiti } = sdkRequire('jiti');
const jiti = createJiti(import.meta.url, { moduleCache: false, tryNative: false });
const { HerdrTransport, resolveLocalContext } = await jiti.import(transportPath);
const socketDir = mkdtempSync(join(tmpdir(), 'hs-'));
const socketPath = join(socketDir, 'api.sock');
const sockets = new Set();
const methods = [];
let pane = {
  pane_id: 'w1:p1',
  terminal_id: 'term_installed',
  workspace_id: 'w1',
  tab_id: 'w1:t1',
  focused: false,
  agent_status: 'unknown',
  revision: 0,
  label: 'installed',
};
const server = createServer((socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    const request = JSON.parse(buffer.slice(0, newline));
    buffer = '';
    methods.push(request.method);
    let result;
    if (request.method === 'events.subscribe') result = { type: 'subscription_started' };
    else if (request.method === 'session.snapshot')
      result = {
        type: 'session_snapshot',
        snapshot: {
          version: '0.9.1',
          protocol: 22,
          panes: [pane],
          workspaces: [],
          tabs: [],
          layouts: [],
          agents: [],
        },
      };
    else if (request.method === 'pane.rename') {
      pane = { ...pane, label: request.params.label };
      result = { type: 'pane_info', pane };
    } else {
      assert.equal(request.params.pane_id, pane.pane_id);
      result = { type: 'pane_info', pane };
    }
    socket.write(JSON.stringify({ id: request.id, result }) + '\n');
  });
});
await new Promise((resolve) => server.listen(socketPath, resolve));
const transport = new HerdrTransport(
  resolveLocalContext({
    HERDR_ENV: '1',
    HERDR_SOCKET_PATH: socketPath,
    HERDR_WORKSPACE_ID: 'w1',
    HERDR_TAB_ID: 'w1:t1',
    HERDR_PANE_ID: 'w1:p1',
  }),
);
try {
  await transport.connect();
  assert.equal((await transport.getPane('w1:p1')).terminal_id, 'term_installed');
  assert.equal(
    (await transport.renamePane('w1:p1', 'consumer-renamed')).pane.label,
    'consumer-renamed',
  );
  transport.close();
  await transport.reconnect();
  assert.equal(transport.view().panes[0].label, 'consumer-renamed');
  assert.equal(methods.filter((method) => method === 'pane.rename').length, 1);
} finally {
  transport.close();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
  rmSync(socketDir, { recursive: true });
}

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
    transportPath,
    transportDigest,
    transportMethods: methods,
  }),
);
