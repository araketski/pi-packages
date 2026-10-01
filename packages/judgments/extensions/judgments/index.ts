import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { evaluate, guidance, toolResult, type Request } from './native.ts';
import { interpretMara, maraScenario, prepareMara } from './mara.ts';
import { evaluationOutput, genericInput, scenarioInput, validate } from './schemas.ts';

// @mara implements DES-JUDGMENTS-LIGHTWEIGHT
// @mara implements REQ-JUDGMENTS-ON-DEMAND
export default function (pi: ExtensionAPI): void {
  pi.registerFlag('judgments-provider', {
    description: 'Native classifier provider for on-demand judgments',
    type: 'string',
    default: 'openrouter',
  });
  pi.registerFlag('judgments-model', {
    description: 'Native classifier model ID for on-demand judgments',
    type: 'string',
    default: '~typesafe/jev-latest',
  });
  const selection = () => ({
    provider: String(pi.getFlag('judgments-provider') ?? 'openrouter'),
    model: String(pi.getFlag('judgments-model') ?? '~typesafe/jev-latest'),
  });
  const namespace = {
    name: 'judgments',
    description:
      'On-demand advisory classification. Supplied context is sent to the configured native classifier; no background supervision or automatic actions.',
  };
  const annotations = { readOnlyHint: true, destructiveHint: false };

  pi.registerTool({
    name: 'judgments_list_scenarios',
    label: 'Judgment scenarios',
    namespace,
    annotations: { ...annotations, openWorldHint: false },
    description:
      'Discover bundled judgment scenarios and their purpose, use_when, avoid_when, required inputs, outcomes and interpretation guidance. Local metadata only; no classifier call. List for unfamiliar decisions, not every turn. Known suitable scenarios may be evaluated directly.',
    promptSnippet: 'Discover reusable bounded judgments when the suitable scenario is not known.',
    parameters: Type.Object({}, { additionalProperties: false }),
    outputSchema: Type.Object({
      scenarios: Type.Array(
        Type.Object({
          id: Type.String(),
          purpose: Type.String(),
          use_when: Type.Array(Type.String()),
          avoid_when: Type.Array(Type.String()),
          inputs: Type.Record(Type.String(), Type.String()),
          input_schema: Type.Record(Type.String(), Type.Unknown()),
          outcomes: Type.Record(Type.String(), Type.String()),
          interpretation: Type.String(),
        }),
      ),
    }),
    async execute() {
      return toolResult({ scenarios: [maraScenario] });
    },
  });

  pi.registerTool({
    name: 'judgments_evaluate_scenario',
    label: 'Evaluate judgment scenario',
    namespace,
    annotations: { ...annotations, openWorldHint: true },
    description:
      'Evaluate a known suitable bundled scenario using its required inputs; fixed questions are internal. Discover unfamiliar scenarios first. Call at a relevant decision point, not every turn or again on unchanged evidence. Supplied context is sent to the configured native classifier using host credentials. ' +
      guidance,
    promptSnippet:
      'Delegate a known scenario with its required context; no need to reconstruct classifier questions.',
    parameters: scenarioInput,
    outputSchema: evaluationOutput,
    async execute(_id, params, signal, _update, ctx) {
      validate(scenarioInput, params);
      const result = await evaluate(selection(), prepareMara(params.input), ctx, signal);
      return toolResult(interpretMara(result, params.input));
    },
  });

  pi.registerTool({
    name: 'judgments_evaluate',
    label: 'Evaluate generic judgment',
    namespace,
    annotations: { ...annotations, openWorldHint: true },
    description:
      'Evaluate supplied state with typed choice, bool or score questions when no bundled scenario fits. Prefer saved scenarios for recurring judgments; list unfamiliar scenarios first. Use narrow atomic questions and include necessary evidence; independent questions can share a request, but cannot depend on each other’s answers. Not generation, a reasoning replacement or per-turn review. Supplied context is sent to the configured native classifier using host credentials. ' +
      guidance,
    promptSnippet: 'Delegate bounded typed judgments outside bundled scenarios.',
    promptGuidelines: [
      'Use judgments only at relevant decision points; do not repeat unchanged assessments. A judgment never overrides required clarification, approval or deterministic verification.',
    ],
    parameters: genericInput,
    outputSchema: evaluationOutput,
    async execute(_id, params, signal, _update, ctx) {
      validate(genericInput, params);
      return toolResult(await evaluate(selection(), params as Request, ctx, signal));
    },
  });
}
