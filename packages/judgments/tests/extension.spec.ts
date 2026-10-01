import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
import { Value } from 'typebox/value';
import extension from '../extensions/judgments/index.ts';

const usage = {
  input: 100,
  output: 10,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 110,
  cost: { input: 0.01, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
};
const model = {
  provider: 'openrouter',
  id: '~typesafe/jev-latest',
  type: 'classifier',
  api: 'fixture',
};
const input = {
  content: 'Retries must preserve the submitted input.',
  purpose: 'Preserve this agreement for future implementation.',
  flavours: {
    obligation: {
      description: 'Observable obligation',
      use_when: ['Observable behavior must hold'],
      avoid_when: ['Solution detail'],
      distinguish_from: { architecture: 'States what must hold, not how' },
    },
    architecture: {
      description: 'Solution structure',
      use_when: ['Define implementation structure'],
      avoid_when: ['Product obligation'],
      distinguish_from: { obligation: 'How rather than what' },
    },
  },
};
const criteria = {
  flavour: {
    ...Object.fromEntries(
      Object.entries(input.flavours).map(([name, guidance], i) => [
        `f${i}`,
        JSON.stringify({ name, ...guidance }),
      ]),
    ),
    none: 'No declared flavour fits',
    insufficient: 'Missing context',
  },
};
const questions = {
  approved: {
    type: 'bool',
    instructions: 'Does the supplied message express approval?',
    criteria: { true: 'Express approval', false: 'No approval' },
  },
};

function setup(flags: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'judgments-regression-'));
  directories.push(dir);
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  const tools = new Map<string, ToolDefinition>();
  const registeredFlags = new Map();
  const api = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    registerFlag: (name: string, definition: unknown) => registeredFlags.set(name, definition),
    getFlag: (name: string) => flags[name],
    on: vi.fn(),
  };
  extension(api as unknown as ExtensionAPI);
  const classify = vi.fn().mockResolvedValue({
    api: 'fixture',
    provider: model.provider,
    model: model.id,
    stopReason: 'stop',
    timestamp: 1,
    usage,
    answers: { approved: { type: 'bool', probability: 0.8 } },
  });
  const registry = {
    findOfType: vi.fn().mockReturnValue(model),
    getAvailableOfType: vi.fn().mockResolvedValue([model]),
    classify,
  };
  const ctx = {
    cwd: dir,
    isProjectTrusted: () => false,
    modelRegistry: registry,
  } as unknown as ExtensionToolContext;
  async function call(name: string, args: unknown, signal?: AbortSignal) {
    const tool = tools.get(name);
    expect(tool, `registered tool ${name}`).toBeDefined();
    const prepared =
      name === 'judgments_evaluate_scenario' ? { ...(args as object), criteria } : args;
    const result = await tool!.execute('test-call', prepared, signal, undefined, ctx);
    expect(Value.Check(tool!.outputSchema!, result.structuredContent)).toBe(true);
    return result;
  }
  return { tools, api, registry, classify, call };
}

// @mara implements VER-JUDGMENTS-CONTRACT
// @mara checks REQ-JUDGMENTS-ON-DEMAND
// @mara checks REQ-JUDGMENTS-NATIVE-CLASSIFIER
// @mara checks REQ-JUDGMENTS-MARA-CONTEXT
describe('on-demand judgment tools', () => {
  it('registers four uniquely named, structured tools without lifecycle observers', async () => {
    const { tools, api, classify, call } = setup();
    expect([...tools.keys()]).toEqual([
      'judgments_list_scenarios',
      'judgments_evaluate_scenario',
      'judgments_evaluate',
      'judgments_validate_scenario',
    ]);
    expect(api.on).not.toHaveBeenCalled();
    for (const tool of tools.values()) {
      expect(tool.namespace?.name).toBe('judgments');
      expect(tool.outputSchema).toBeDefined();
    }
    const result = await call('judgments_list_scenarios', {});
    expect(result.structuredContent).toMatchObject({
      scenarios: [
        {
          id: 'mara-representation',
          useWhen: expect.any(Array),
          avoidWhen: expect.any(Array),
          inputSchema: expect.any(Object),
          dynamicQuestions: expect.any(Object),
        },
      ],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('questions');
    expect(classify).not.toHaveBeenCalled();
  });

  it('passes generic questions to the configured native classifier and reports its usage', async () => {
    const { call, classify, registry } = setup();
    const signal = new AbortController().signal;
    const result = await call(
      'judgments_evaluate',
      { state: { message: 'Looks good' }, questions },
      signal,
    );
    expect(registry.findOfType).toHaveBeenCalledWith(
      'classifier',
      'openrouter',
      '~typesafe/jev-latest',
    );
    expect(classify).toHaveBeenCalledWith(
      model,
      { state: { message: 'Looks good' }, questions },
      expect.objectContaining({ signal, maxRetries: 0 }),
    );
    expect(result.structuredContent).toMatchObject({
      status: 'assessed',
      advisory: true,
      answers: { approved: { probability: 0.8 } },
      usage,
    });
    expect(result.usage).toEqual(usage);
  });

  it('honors classifier flags without falling back to another model', async () => {
    const { call, registry } = setup({ 'judgments-provider': 'local', 'judgments-model': 'small' });
    registry.findOfType.mockReturnValue(undefined);
    const result = await call('judgments_evaluate', { state: {}, questions });
    expect(registry.findOfType).toHaveBeenCalledWith('classifier', 'local', 'small');
    expect(result.structuredContent).toMatchObject({
      status: 'unavailable',
      classifier: { provider: 'local', model: 'small' },
    });
    expect(registry.classify).not.toHaveBeenCalled();
  });

  it('reports missing authentication without making a classifier request', async () => {
    const { call, registry } = setup();
    registry.getAvailableOfType.mockResolvedValue([]);
    expect(
      (await call('judgments_evaluate', { state: {}, questions })).structuredContent,
    ).toMatchObject({ status: 'unavailable' });
    expect(registry.classify).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'evaluates custom project vocabulary with purpose supplied: %s',
    async (withPurpose) => {
      const { call, classify } = setup();
      const evidence = withPurpose ? input : { content: input.content, flavours: input.flavours };
      classify.mockResolvedValue({
        stopReason: 'stop',
        provider: model.provider,
        model: model.id,
        api: 'fixture',
        timestamp: 1,
        answers: {
          representation: {
            type: 'choice',
            choice: 'item',
            probabilities: { item: 1, narrative: 0, mixed: 0, insufficient: 0 },
            confidence: 1,
          },
          flavour: {
            type: 'choice',
            choice: 'f0',
            probabilities: { f0: 1, f1: 0, none: 0, insufficient: 0 },
            confidence: 1,
          },
        },
      });
      const result = await call('judgments_evaluate_scenario', {
        scenario: 'mara-representation',
        input: evidence,
      });
      expect(classify).toHaveBeenCalledTimes(1);
      const request = classify.mock.calls[0][1];
      expect(request.state).toEqual(evidence);
      expect(JSON.stringify(request.questions.flavour)).toContain('obligation');
      expect(JSON.stringify(request.questions.flavour)).toContain('distinguish_from');
      expect(result.structuredContent).toMatchObject({
        status: 'assessed',
        answers: { representation: { choice: 'item' }, flavour: { choice: 'f0' } },
        interpretation: expect.stringContaining('no computed assessment'),
      });
    },
  );

  it.each(['narrative', 'mixed', 'insufficient'])(
    'preserves the scenario outcome %s without forcing a flavour',
    async (representation) => {
      const { call, classify } = setup();
      classify.mockResolvedValue({
        stopReason: 'stop',
        provider: model.provider,
        model: model.id,
        answers: {
          representation: {
            type: 'choice',
            choice: representation,
            probabilities: {
              item: 0,
              narrative: 0,
              mixed: 0,
              insufficient: 0,
              [representation]: 1,
            },
            confidence: 1,
          },
          flavour: {
            type: 'choice',
            choice: 'none',
            probabilities: { f0: 0, f1: 0, none: 1, insufficient: 0 },
            confidence: 1,
          },
        },
      });
      const result = await call('judgments_evaluate_scenario', {
        scenario: 'mara-representation',
        input,
      });
      expect(result.structuredContent).toMatchObject({
        status: 'assessed',
        answers: { representation: { choice: representation } },
      });
      expect(result.structuredContent).not.toHaveProperty('assessment');
    },
  );

  it('returns no-fit rather than inventing a project flavour', async () => {
    const { call, classify } = setup();
    classify.mockResolvedValue({
      stopReason: 'stop',
      answers: {
        representation: {
          type: 'choice',
          choice: 'item',
          probabilities: { item: 1, narrative: 0, mixed: 0, insufficient: 0 },
          confidence: 1,
        },
        flavour: {
          type: 'choice',
          choice: 'none',
          probabilities: { f0: 0, f1: 0, none: 1, insufficient: 0 },
          confidence: 1,
        },
      },
    });
    expect(
      (await call('judgments_evaluate_scenario', { scenario: 'mara-representation', input }))
        .structuredContent,
    ).toMatchObject({ status: 'assessed', answers: { flavour: { choice: 'none' } } });
  });

  it('distinguishes missing flavour context from no fitting flavour and explains dynamic labels', async () => {
    const { call, classify } = setup();
    classify.mockResolvedValue({
      stopReason: 'stop',
      answers: {
        representation: {
          type: 'choice',
          choice: 'item',
          probabilities: { item: 1, narrative: 0, mixed: 0, insufficient: 0 },
          confidence: 1,
        },
        flavour: {
          type: 'choice',
          choice: 'insufficient',
          probabilities: { f0: 0, f1: 0, none: 0, insufficient: 1 },
          confidence: 1,
        },
      },
    });
    expect(
      (await call('judgments_evaluate_scenario', { scenario: 'mara-representation', input }))
        .structuredContent,
    ).toMatchObject({
      status: 'assessed',
      answers: { flavour: { choice: 'insufficient' } },
      interpretation: expect.stringContaining('missing context, not no fit'),
    });
  });

  it('supports choice and score alongside bool in a generic request', async () => {
    const { call, classify } = setup();
    const more = {
      category: { type: 'choice', instructions: 'Choose category', criteria: { a: 'A', b: 'B' } },
      strength: { type: 'score', instructions: 'Score support', criteria: ['Weak', 'Strong'] },
    };
    const answers = {
      category: { type: 'choice', choice: 'b', probabilities: { a: 0.3, b: 0.7 }, confidence: 0.7 },
      strength: { type: 'score', score: 0.7, confidence: 0.7 },
    };
    classify.mockResolvedValue({ stopReason: 'stop', answers });
    expect(
      (await call('judgments_evaluate', { state: {}, questions: more })).structuredContent,
    ).toMatchObject({ status: 'assessed', answers });
  });

  it('reports native cancellation and thrown exceptions with no fallback or fabricated usage', async () => {
    const { call, classify } = setup();
    classify.mockResolvedValueOnce({ stopReason: 'aborted', answers: {} });
    expect(
      (await call('judgments_evaluate', { state: {}, questions })).structuredContent,
    ).toMatchObject({ status: 'aborted' });
    classify.mockRejectedValueOnce(new Error('private credential'));
    const result = await call('judgments_evaluate', { state: {}, questions });
    expect(result.structuredContent).toMatchObject({ status: 'failed' });
    expect(result).not.toHaveProperty('usage');
    expect(JSON.stringify(result)).not.toContain('private credential');
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it('keeps the skill generic and scenario checkpoints in catalog metadata', async () => {
    const { tools, call } = setup();
    const skill = readFileSync(new URL('../skills/judgments/SKILL.md', import.meta.url), 'utf8');
    expect(skill).not.toMatch(/mara|work integration/i);
    expect(skill).toContain('unchanged');
    expect(skill).toContain('judgments_list_scenarios');
    expect(skill).toContain('judgments_evaluate_scenario');
    expect(skill).toContain('judgments_evaluate');
    expect(skill).toContain('probabilities');
    expect(skill).toContain('approval');
    expect(skill).toContain('configured classifier');
    expect(tools.get('judgments_evaluate')?.description).toContain('Supplied context is sent');
    const catalog = JSON.stringify((await call('judgments_list_scenarios', {})).structuredContent);
    expect(catalog).toContain('Before creating a Mara item or changing its flavour');
    expect(catalog).toContain('Ordinary wording edits');
  });

  it('rejects missing inputs and unknown scenarios before making any request', async () => {
    const { call, classify } = setup();
    await expect(
      call('judgments_evaluate_scenario', {
        scenario: 'mara-representation',
        input: { content: 'x' },
      }),
    ).rejects.toThrow();
    await expect(
      call('judgments_evaluate_scenario', { scenario: 'unknown', input }),
    ).rejects.toThrow();
    await expect(
      call('judgments_evaluate', {
        state: {},
        questions: { bad: { type: 'choice', instructions: 'Pick', criteria: {} } },
      }),
    ).rejects.toThrow();
    await expect(
      call('judgments_evaluate_scenario', {
        scenario: 'mara-representation',
        input: {
          ...input,
          flavours: {
            custom: { description: 'Custom', use_when: [], avoid_when: [], distinguish_from: {} },
          },
        },
      }),
    ).rejects.toThrow();
    expect(classify).not.toHaveBeenCalled();
  });

  it('reports errors and malformed answers without echoing provider diagnostics or fabricating approval', async () => {
    const { call, classify } = setup();
    classify.mockResolvedValueOnce({
      stopReason: 'error',
      errorMessage: 'private submitted text',
      answers: {},
      usage,
    });
    const failed = await call('judgments_evaluate', { state: {}, questions });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toMatchObject({ status: 'failed', usage });
    expect(failed.usage).toEqual(usage);
    expect(JSON.stringify(failed)).not.toContain('private submitted text');
    classify.mockResolvedValueOnce({ stopReason: 'stop', answers: {} });
    expect(
      (await call('judgments_evaluate', { state: {}, questions })).structuredContent,
    ).toMatchObject({ status: 'failed' });
  });

  it('does not submit already-aborted work or accept a late result after cancellation', async () => {
    const { call, classify } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(
      (await call('judgments_evaluate', { state: {}, questions }, controller.signal))
        .structuredContent,
    ).toMatchObject({ status: 'aborted' });
    expect(classify).not.toHaveBeenCalled();
    const late = new AbortController();
    classify.mockImplementationOnce(async () => {
      late.abort();
      return { stopReason: 'stop', usage, answers: { approved: { type: 'bool', probability: 1 } } };
    });
    const result = await call('judgments_evaluate', { state: {}, questions }, late.signal);
    expect(result.structuredContent).toMatchObject({ status: 'aborted' });
    expect(result.usage).toEqual(usage);
  });
});
