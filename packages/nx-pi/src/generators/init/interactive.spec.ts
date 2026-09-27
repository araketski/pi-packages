import { readJson, writeJson, type Tree } from '@nx/devkit';
import { textPrompt } from '@nx/devkit/internal';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGenerator } from './init';

vi.mock('@nx/devkit/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nx/devkit/internal')>()),
  textPrompt: vi.fn(),
}));

const prompt = vi.mocked(textPrompt);
const streams = [process.stdin, process.stdout];
const descriptors = streams.map((stream) => Object.getOwnPropertyDescriptor(stream, 'isTTY'));

function setTerminal(stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean): void {
  Object.defineProperty(stream, 'isTTY', { configurable: true, value });
}

function workspace(manifest: Record<string, unknown> = {}): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', manifest);
  writeJson(tree, 'nx.json', { defaultBase: 'trunk' });
  return tree;
}

function snapshot(tree: Tree) {
  return tree
    .listChanges()
    .map(({ path, type, content }) => ({ path, type, content: content?.toString() }));
}

beforeEach(() => {
  vi.stubEnv('NX_INTERACTIVE', 'true');
  vi.stubEnv('CI', 'false');
  streams.forEach((stream) => setTerminal(stream, true));
  prompt.mockReset();
  prompt.mockResolvedValue('@acme/workspace');
});

afterEach(() => {
  streams.forEach((stream, index) => {
    const descriptor = descriptors[index];
    if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
    else Reflect.deleteProperty(stream, 'isTTY');
  });
  vi.unstubAllEnvs();
});

// @mara checks REQ-NXPI-INIT
// @mara checks REQ-NXPI-METADATA-SOURCE
// @mara checks DES-NXPI-INIT-CONTRACT
describe('interactive root name', () => {
  it('asks only for the absent required name and writes nothing before the answer', async () => {
    const tree = workspace({ private: true });
    const before = snapshot(tree);
    prompt.mockImplementation(async () => {
      expect(snapshot(tree)).toEqual(before);
      return '@acme/workspace';
    });
    expect(await initGenerator(tree, { license: 'MIT' })).toBeUndefined();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(readJson(tree, 'package.json')).toEqual({
      private: true,
      name: '@acme/workspace',
      license: 'MIT',
    });
    expect(readJson(tree, 'nx.json').plugins).toEqual(['@araketski/nx-pi']);
    const after = snapshot(tree);
    await initGenerator(tree, { license: 'MIT' });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(snapshot(tree)).toEqual(after);
  });

  it.each(['existing', 'explicit'])('does not prompt when the name is %s', async (source) => {
    const tree = workspace(source === 'existing' ? { name: '@acme/workspace' } : {});
    await initGenerator(tree, source === 'explicit' ? { name: '@acme/workspace' } : {});
    expect(prompt).not.toHaveBeenCalled();
    expect(readJson(tree, 'package.json')).toEqual({ name: '@acme/workspace' });
  });

  it.each(['unscoped', '', null])('does not offer to replace an existing name %j', async (name) => {
    const tree = workspace({ name });
    const before = snapshot(tree);
    await expect(initGenerator(tree)).rejects.toThrow(/name.*scoped/);
    expect(prompt).not.toHaveBeenCalled();
    expect(snapshot(tree)).toEqual(before);
  });

  it('rejects an explicit invalid name instead of asking for a replacement', async () => {
    const tree = workspace();
    const before = snapshot(tree);
    await expect(initGenerator(tree, { name: 'unscoped' })).rejects.toThrow(/name.*scoped/);
    expect(prompt).not.toHaveBeenCalled();
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['disabled', 'ci', 'stdin', 'stdout'])(
    'never prompts with %s interactivity',
    async (reason) => {
      if (reason === 'disabled') vi.stubEnv('NX_INTERACTIVE', 'false');
      if (reason === 'ci') vi.stubEnv('CI', 'true');
      if (reason === 'stdin') setTerminal(process.stdin, false);
      if (reason === 'stdout') setTerminal(process.stdout, false);
      const tree = workspace();
      const before = snapshot(tree);
      await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow(/name.*scoped/);
      expect(prompt).not.toHaveBeenCalled();
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it('validates answers without providing an implicit default', async () => {
    prompt.mockImplementation(async (options) => {
      expect(options.initialValue).toBeUndefined();
      expect(options.validate?.('')).toMatch(/scoped/i);
      expect(options.validate?.('unscoped')).toMatch(/scoped/i);
      expect(options.validate?.('@Acme/Workspace')).toMatch(/scoped/i);
      expect(options.validate?.(' @acme/workspace')).toMatch(/scoped/i);
      expect(options.validate?.('@acme/workspace')).toBeUndefined();
      return '@acme/workspace';
    });
    await initGenerator(workspace());
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('cancels without writing pending metadata or registration', async () => {
    const tree = workspace();
    const before = snapshot(tree);
    prompt.mockImplementation(async (options) => {
      expect(snapshot(tree)).toEqual(before);
      return options.onCancel!();
    });
    await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow(/cancel/i);
    expect(snapshot(tree)).toEqual(before);
  });

  it('preserves state when the prompt fails', async () => {
    const tree = workspace();
    const before = snapshot(tree);
    prompt.mockRejectedValue(new Error('terminal disconnected'));
    await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow('terminal disconnected');
    expect(snapshot(tree)).toEqual(before);
  });

  it('validates the returned answer again before writing', async () => {
    const tree = workspace();
    const before = snapshot(tree);
    prompt.mockResolvedValue('unscoped');
    await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow(/name.*scoped/);
    expect(prompt).toHaveBeenCalledOnce();
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['registration', 'metadata', 'input'])(
    'reports a known %s conflict before asking',
    async (reason) => {
      const tree = workspace(reason === 'metadata' ? { license: 'Apache-2.0' } : {});
      if (reason === 'registration')
        writeJson(tree, 'nx.json', { plugins: ['@araketski/nx-pi', '@araketski/nx-pi'] });
      const before = snapshot(tree);
      await expect(
        initGenerator(tree, { license: reason === 'input' ? '' : 'MIT' }),
      ).rejects.toThrow(
        reason === 'registration' ? /duplicate/ : reason === 'metadata' ? /conflict/ : /license/,
      );
      expect(prompt).not.toHaveBeenCalled();
      expect(snapshot(tree)).toEqual(before);
    },
  );
});
