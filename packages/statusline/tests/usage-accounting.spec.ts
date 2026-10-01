import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SessionManager,
  type ExtensionContext,
  type SessionEntry,
} from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectUsage } from '../extensions/statusline/src/builtins/usage.js';

type Usage = Parameters<SessionManager['appendUsage']>[3];
type Message = Parameters<SessionManager['appendMessage']>[0];
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function usage(input = 100, cost = 0.1): Usage {
  return {
    input,
    output: 20,
    cacheRead: 9,
    cacheWrite: 1,
    totalTokens: input + 30,
    reasoning: 5,
    cacheWrite1h: 1,
    cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
  };
}
function assistant(value: Usage | undefined = usage()): Message {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-responses',
    provider: 'openai',
    model: 'fixture',
    usage: value,
    stopReason: 'stop',
    timestamp: 1,
  } as Message;
}
function tool(value?: Usage, details?: unknown): Message {
  return {
    role: 'toolResult',
    toolCallId: 'outer',
    toolName: 'codemode',
    content: [],
    details,
    usage: value,
    isError: false,
    timestamp: 2,
    nestedCalls: {
      calls: [{ id: 'outer/1', name: 'fixture_classifier', status: 'ok' }],
      complete: true,
    },
  } as Message;
}
function collect(manager: Pick<SessionManager, 'getBranch'>, keys = ['tokens', 'cache', 'cost']) {
  const items = new Map<string, StatuslineStatus>();
  collectUsage(items, new Set(keys), { sessionManager: manager } as ExtensionContext);
  return items;
}
function texts(manager: Pick<SessionManager, 'getBranch'>) {
  return [...collect(manager).values()].map((item) => item.text);
}

describe('native active-branch usage accounting', () => {
  it('counts assistant, outer tool aggregates, arbitrary native usage and summary generation once', () => {
    const manager = SessionManager.inMemory();
    const root = manager.appendMessage(assistant());
    manager.appendMessage(
      tool(usage(200, 0.2), { calls: [{ usage: usage(200, 0.2), cost: 0.2 }] }),
    );
    manager.appendUsage('future-kind', 'fixture', 'classifier', usage(300, 0.3));
    manager.appendCompaction(
      'summary',
      root,
      99999,
      { usage: usage(9000, 9) },
      false,
      usage(400, 0.4),
    );
    manager.branchWithSummary(
      manager.getLeafId(),
      'branch summary',
      undefined,
      false,
      usage(500, 0.5),
    );
    // Reasoning/cache-retention splits and totalTokens are not extra usage.
    expect(texts(manager)).toEqual(['1.5k↑ 100↓', '45/5 90%', '$1.50']);
    expect(texts(manager)).toEqual(['1.5k↑ 100↓', '45/5 90%', '$1.50']);
  });

  it('counts equal-valued distinct records but not repeated entry identities or details', () => {
    const manager = SessionManager.inMemory();
    manager.appendMessage(assistant());
    manager.appendMessage(assistant());
    manager.appendMessage(tool(usage(), { usage: usage(), result: { usage: usage() } }));
    const branch = manager.getBranch();
    expect(texts({ getBranch: () => [...branch, ...structuredClone(branch)] })).toEqual([
      '300↑ 60↓',
      '27/3 90%',
      '$0.30',
    ]);
  });

  it('follows branch switches, keeps compacted/edited raw history, and restores from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'statusline-usage-'));
    roots.push(dir);
    const manager = SessionManager.create(dir, dir);
    const root = manager.appendMessage({ role: 'user', content: 'root', timestamp: 0 });
    const first = manager.appendMessage(assistant());
    manager.appendUsage('cache_warm', 'fixture', 'fixture', usage(200, 0.2));
    const oldLeaf = manager.getLeafId()!;
    manager.branch(root);
    const alternate = manager.appendMessage(assistant(usage(300, 0.3)));
    manager.appendCompaction('summary', null, 99999, undefined, false, usage(400, 0.4));
    manager.appendContextEdit(alternate, null);
    const newLeaf = manager.getLeafId()!;
    expect(texts(manager)).toEqual(['700↑ 40↓', '18/2 90%', '$0.70']);
    manager.branch(oldLeaf);
    expect(texts(manager)).toEqual(['300↑ 40↓', '18/2 90%', '$0.30']);
    manager.branch(first);
    expect(texts(manager)).toEqual(['100↑ 20↓', '9/1 90%', '$0.10']);
    const restored = SessionManager.open(manager.getSessionFile()!, dir);
    restored.branch(newLeaf);
    expect(texts(restored)).toEqual(['700↑ 40↓', '18/2 90%', '$0.70']);
  });

  it('distinguishes empty recorded history and non-model tools from missing assistant accounting', () => {
    const manager = SessionManager.inMemory();
    expect(texts(manager)).toEqual(['0↑ 0↓', '0/0 0%', '$0.00']);
    manager.appendMessage({ role: 'user', content: 'hello', timestamp: 0 });
    manager.appendMessage(tool());
    manager.appendCustomEntry('unattributed', { usage: usage(9000, 9) });
    manager.appendCompaction('extension summary', null, 100, undefined, true);
    expect(texts(manager)).toEqual(['0↑ 0↓', '0/0 0%', '$0.00']);
    manager.appendMessage({ ...assistant(), usage: undefined } as Message);
    expect(texts(manager)).toEqual(['?↑ ?↓', '?/? ?%', '$?']);
    expect(collect(manager).get('cost')?.state).toBe('unknown');
  });

  it.each(['assistant', 'native'] as const)(
    'treats serialized null %s accounting as unknown rather than unattributed',
    (kind) => {
      const dir = mkdtempSync(join(tmpdir(), 'statusline-null-usage-'));
      roots.push(dir);
      const manager = SessionManager.create(dir, dir);
      manager.appendMessage({ role: 'user', content: 'root', timestamp: 0 });
      if (kind === 'assistant') {
        manager.appendMessage({ ...assistant(), usage: null } as unknown as Message);
      } else {
        manager.appendUsage('fixture', 'fixture', 'fixture', null as unknown as Usage);
      }
      const restored = SessionManager.open(manager.getSessionFile()!, dir);
      expect(texts(restored)).toEqual(['?↑ ?↓', '?/? ?%', '$?']);
      for (const item of collect(restored).values()) expect(item.state).toBe('unknown');
      restored.appendMessage(assistant());
      expect(texts(restored)).toEqual(['100+?↑ 20+?↓', '9+?/1+? ?%', '$0.10+?']);
      for (const item of collect(restored).values()) expect(item.state).toBe('partial');
    },
  );

  it('retains independent known subtotals for minimal classifier and missing pricing records', () => {
    const manager = SessionManager.inMemory();
    manager.appendMessage(assistant());
    manager.appendMessage(
      tool({ input: 200, output: 10, totalTokens: 210, cost: { total: 0.2 } } as Usage),
    );
    manager.appendUsage('fixture', 'fixture', 'fixture', { input: 300, cacheRead: 5 } as Usage);
    expect(texts(manager)).toEqual(['600↑ 30+?↓', '14+?/1+? ?%', '$0.30+?']);
    for (const item of collect(manager).values()) expect(item.state).toBe('partial');
  });

  it('does not treat zero catalog cost for positive consumption as proof of free usage', () => {
    const manager = SessionManager.inMemory();
    manager.appendMessage(tool(usage(100, 0)));
    expect(texts(manager)).toEqual(['100↑ 20↓', '9/1 90%', '$?']);
    manager.appendMessage(assistant());
    expect(texts(manager)).toEqual(['200↑ 40↓', '18/2 90%', '$0.10+?']);
  });

  it('renders malformed persisted numbers as unknown instead of NaN, infinity or negative totals', () => {
    const manager = SessionManager.inMemory();
    manager.appendUsage('fixture', 'fixture', 'fixture', {
      input: NaN,
      output: -2,
      cacheRead: Infinity,
      cacheWrite: null,
      cost: { total: -1 },
    } as unknown as Usage);
    expect(texts(manager)).toEqual(['?↑ ?↓', '?/? ?%', '$?']);
  });

  it('shows unreported native summary usage as unknown but ignores hook summaries without usage', () => {
    const manager = SessionManager.inMemory();
    manager.appendCompaction('native summary', null, 100);
    manager.branchWithSummary(manager.getLeafId(), 'native branch summary');
    expect(texts(manager)).toEqual(['?↑ ?↓', '?/? ?%', '$?']);
  });

  it('does not read history when no usage tokens are requested and emits only requested keys', () => {
    const getBranch = vi.fn(() => [] as SessionEntry[]);
    expect(collect({ getBranch }, ['model']).size).toBe(0);
    expect(getBranch).not.toHaveBeenCalled();
    expect([...collect({ getBranch }, ['cost']).keys()]).toEqual(['cost']);
  });
});
