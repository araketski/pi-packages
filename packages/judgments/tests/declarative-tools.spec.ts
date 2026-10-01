import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';
import extension from '../extensions/judgments/index.ts';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const fixed = {
  formatVersion: 1,
  mode: 'fixed',
  purpose: 'Saved fixture',
  useWhen: ['Relevant decision'],
  avoidWhen: [],
  inputSchema: {
    type: 'object',
    properties: { evidence: { type: 'string', description: 'Grounded evidence' } },
    required: ['evidence'],
  },
  questions: {
    x: { type: 'bool', instructions: 'Assess', criteria: { true: 'Yes', false: 'No' } },
  },
  interpretation: 'Advisory fixture',
};
function setup(trusted = false, flags: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'judgments-tools-'));
  dirs.push(dir);
  const agentDir = join(dir, 'agent');
  const cwd = join(dir, 'project');
  mkdirSync(cwd);
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  const tools = new Map<string, ToolDefinition>();
  const registeredFlags = new Map<string, object>();
  const api = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    registerFlag: (name: string, value: object) => registeredFlags.set(name, value),
    getFlag: (name: string) => flags[name],
    on: vi.fn(),
  };
  extension(api as unknown as ExtensionAPI);
  const model = { provider: 'openrouter', id: '~typesafe/jev-latest' };
  const classify = vi
    .fn()
    .mockResolvedValue({ stopReason: 'stop', answers: { x: { type: 'bool', probability: 0.8 } } });
  const findOfType = vi.fn().mockReturnValue(model);
  const ctx = {
    cwd,
    isProjectTrusted: () => trusted,
    modelRegistry: { findOfType, getAvailableOfType: vi.fn().mockResolvedValue([model]), classify },
  } as unknown as ExtensionToolContext;
  const save = (scope: 'global' | 'project', name: string, value: unknown) => {
    const root = scope === 'global' ? join(agentDir, 'judgments') : join(cwd, '.pi/judgments');
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  };
  const call = async (name: string, args = {}) => {
    const tool = tools.get(name)!;
    const result = await tool.execute('fixture', args, undefined, undefined, ctx);
    expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
    return result;
  };
  return { tools, registeredFlags, api, findOfType, classify, save, call };
}

// @mara implements VER-JUDGMENTS-DECLARATIVE
// @mara checks REQ-JUDGMENTS-DECLARATIVE
describe('declarative tools', () => {
  it('registers four atomic namespaced tools with no observers or default-valued flags', async () => {
    const { tools, registeredFlags, api, call, classify } = setup();
    expect([...tools.keys()]).toEqual([
      'judgments_list_scenarios',
      'judgments_evaluate_scenario',
      'judgments_evaluate',
      'judgments_validate_scenario',
    ]);
    expect(api.on).not.toHaveBeenCalled();
    for (const tool of tools.values()) expect(tool.namespace?.name).toBe('judgments');
    for (const flag of registeredFlags.values()) expect(flag).not.toHaveProperty('default');
    const catalog = (await call('judgments_list_scenarios')).structuredContent as any;
    expect(catalog.scenarios[0]).toMatchObject({
      id: 'mara-representation',
      mode: 'dynamic',
      source: { scope: 'bundled' },
      dynamicQuestions: {
        flavour: { type: 'choice', criteriaGuidance: expect.stringContaining('distinguish_from') },
      },
    });
    expect(catalog.scenarios[0]).not.toHaveProperty('questions');
    expect(catalog.scenarios[0].inputSchema.properties.content.description).toBeTruthy();
    expect(classify).not.toHaveBeenCalled();
  });
  it('excludes denied project definitions and configuration while global data works', async () => {
    const { save, call, findOfType, classify } = setup(false);
    save('global', 'scenarios/saved.json', fixed);
    save('project', 'scenarios/saved.json', { ...fixed, purpose: 'Denied' });
    save('project', 'config.json', { provider: 'denied', model: 'denied' });
    const result = await call('judgments_evaluate_scenario', {
      scenario: 'saved',
      input: { evidence: 'Observed' },
    });
    expect(result.structuredContent).toMatchObject({
      status: 'assessed',
      source: { scope: 'global' },
      interpretation: 'Advisory fixture',
    });
    expect(findOfType).toHaveBeenCalledWith('classifier', 'openrouter', '~typesafe/jev-latest');
    expect(classify).toHaveBeenCalledTimes(1);
    expect((await call('judgments_list_scenarios')).structuredContent).toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'project_untrusted' })]),
    });
  });
  it('accepts host-reported trust for custom-only project data and config', async () => {
    const { save, call, findOfType } = setup(true);
    save('project', 'scenarios/saved.json', fixed);
    save('project', 'config.json', { provider: 'typesafe', model: 'jev-latest' });
    expect(
      (await call('judgments_validate_scenario', { scenario: 'saved' })).structuredContent,
    ).toMatchObject({ valid: true, source: { scope: 'project' } });
    await call('judgments_evaluate_scenario', {
      scenario: 'saved',
      input: { evidence: 'Observed' },
    });
    expect(findOfType).toHaveBeenCalledWith('classifier', 'typesafe', 'jev-latest');
  });
  it('validates invalid saved files without classification, repairs or lower fallback', async () => {
    const { save, call, classify } = setup(true);
    save('global', 'scenarios/saved.json', fixed);
    save('project', 'scenarios/saved.json', { ...fixed, mode: 'dynamic' });
    const invalid = await call('judgments_validate_scenario', { scenario: 'saved' });
    expect(invalid.isError).toBe(true);
    expect(invalid.structuredContent).toMatchObject({
      valid: false,
      diagnostics: expect.any(Array),
    });
    await expect(
      call('judgments_evaluate_scenario', { scenario: 'saved', input: { evidence: 'Observed' } }),
    ).rejects.toThrow();
    save('project', 'scenarios/saved.json', fixed);
    expect(
      (await call('judgments_validate_scenario', { scenario: 'saved' })).structuredContent,
    ).toMatchObject({ valid: true });
    expect(classify).not.toHaveBeenCalled();
  });
  it('exposes dynamic criteria guidance and evaluates prepared evidence through the same native runtime', async () => {
    const { save, call, classify } = setup(true);
    save('project', 'scenarios/dynamic.json', {
      ...fixed,
      mode: 'dynamic',
      questions: {
        x: {
          type: 'bool',
          instructions: 'Assess',
          criteriaGuidance: 'Retrieve grounded positive/negative descriptions',
        },
      },
    });
    await expect(
      call('judgments_evaluate_scenario', { scenario: 'dynamic', input: { evidence: 'Observed' } }),
    ).rejects.toThrow();
    const criteria = { x: { true: 'Positive observation', false: 'No positive observation' } };
    expect(
      (
        await call('judgments_evaluate_scenario', {
          scenario: 'dynamic',
          input: { evidence: 'Observed' },
          criteria,
        })
      ).structuredContent,
    ).toMatchObject({ answers: { x: { probability: 0.8 } }, scenario: 'dynamic' });
    expect(classify.mock.calls[0][1]).toEqual({
      state: { evidence: 'Observed' },
      questions: { x: { type: 'bool', instructions: 'Assess', criteria: criteria.x } },
    });
    expect(classify).toHaveBeenCalledTimes(1);
  });
});
