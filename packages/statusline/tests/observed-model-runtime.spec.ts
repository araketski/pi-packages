import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { collectCore } from '../extensions/statusline/src/builtins/core.js';

// @mara checks DES-STATUSLINE-BUILTIN-VALUES
it('shows native routed identity through the public Pi 0.99.1 transcript with loopback transport', async () => {
  const root = mkdtempSync(join(tmpdir(), 'statusline-model-runtime-'));
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { model } = JSON.parse(raw) as { model: string };
    requests.push(model);
    const item = {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'offline fixture', annotations: [] }],
    };
    const response = {
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      status: 'completed',
      model,
      output: [item],
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const event of [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...item, status: 'in_progress', content: [] },
      },
      {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        item_id: item.id,
        part: { type: 'output_text', text: '', annotations: [] },
      },
      {
        type: 'response.output_text.delta',
        output_index: 0,
        content_index: 0,
        item_id: item.id,
        delta: 'offline fixture',
      },
      {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        item_id: item.id,
        text: 'offline fixture',
      },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response },
    ])
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback port');
    const modelRuntime = await ModelRuntime.create({
      authPath: join(root, 'auth.json'),
      modelsPath: null,
      modelsStorePath: join(root, 'models.json'),
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    modelRuntime.registerProvider('model-fixture', {
      api: 'openai-responses',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'synthetic-key',
      models: ['physical', 'second'].map((id) => ({
        id,
        name: id,
        reasoning: false,
        input: ['text'],
        contextWindow: 100000,
        maxTokens: 1024,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      })),
    });
    let next = 'physical';
    let ctx: ExtensionContext | undefined;
    const snapshots: string[] = [];
    const text = (context: ExtensionContext) => {
      const items = new Map();
      collectCore(items, new Set(['model']), context, {} as never);
      return items.get('model')?.text as string;
    };
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir: root,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        (pi) => {
          pi.registerVirtualModel({
            provider: 'router-fixture',
            id: 'auto',
            name: 'Auto',
            route(_request, context) {
              return {
                model: context.modelRegistry.find('model-fixture', next)!,
                thinkingLevel: 'off',
              };
            },
          });
          pi.on('session_start', (_event, context) => {
            ctx = context;
          });
          pi.on('turn_end', (_event, context) => {
            snapshots.push(text(context));
          });
        },
      ],
    });
    await resourceLoader.reload();
    ({ session } = await createAgentSession({
      cwd: root,
      agentDir: root,
      modelRuntime,
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory(root),
      noTools: 'all',
      model: modelRuntime.getModel('model-fixture', 'physical')!,
    }));
    const errors: unknown[] = [];
    await session.bindExtensions({
      onError: (error) => {
        errors.push(error);
      },
    });
    const virtual = modelRuntime.getModel('router-fixture', 'auto')!;
    await session.setModel(virtual);
    expect(text(ctx!)).toBe('auto');
    await session.prompt('Synthetic loopback input');
    expect(text(ctx!)).toBe('auto → physical');
    next = 'second';
    expect(text(ctx!)).toBe('auto → physical'); // Not a prediction of the next route.
    await session.prompt('Synthetic second input');
    expect(text(ctx!)).toBe('auto → second');
    expect(snapshots).toEqual(['auto → physical', 'auto → second']);
    expect(requests).toEqual(['physical', 'second']);
    await session.setModel(modelRuntime.getModel('model-fixture', 'physical')!);
    expect(text(ctx!)).toBe('physical');
    await session.setModel(virtual);
    expect(text(ctx!)).toBe('auto');
    expect(errors).toEqual([]);
  } finally {
    session?.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
