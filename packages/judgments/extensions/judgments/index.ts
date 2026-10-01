import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionToolContext,
} from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import { prepareScenario } from './definitions.ts';
import {
  loadCatalog,
  loadSelection,
  type Catalog,
  type Diagnostic,
  type Scope,
} from './loading.ts';
import { evaluate, guidance, toolResult, type Request } from './native.ts';
import {
  catalogOutput,
  criteriaShapes,
  evaluationOutput,
  genericInput,
  scenarioInput,
  validate,
  validationInput,
  validationOutput,
} from './schemas.ts';

function scopes(ctx: ExtensionToolContext): Scope[] {
  const authorized: Scope[] = [
    { scope: 'bundled', path: fileURLToPath(new URL('../../', import.meta.url)) },
    { scope: 'global', path: join(getAgentDir(), 'judgments') },
  ];
  if (ctx.isProjectTrusted())
    authorized.push({ scope: 'project', path: join(ctx.cwd, '.pi/judgments') });
  return authorized;
}
async function catalog(ctx: ExtensionToolContext): Promise<Catalog> {
  const loaded = await loadCatalog(scopes(ctx));
  if (!ctx.isProjectTrusted())
    loaded.diagnostics.push({
      scope: 'project',
      path: join(ctx.cwd, '.pi/judgments'),
      code: 'project_untrusted',
      message: 'Project scenarios and configuration excluded by host trust.',
    });
  return loaded;
}

// @mara implements DES-JUDGMENTS-DECLARATIVE
// @mara implements REQ-JUDGMENTS-ON-DEMAND
export default function (pi: ExtensionAPI): void {
  pi.registerFlag('judgments-provider', {
    description: 'Native classifier provider (changing provider requires an explicit model)',
    type: 'string',
  });
  pi.registerFlag('judgments-model', {
    description: 'Native classifier model ID for the selected provider',
    type: 'string',
  });
  const selection = (ctx: ExtensionToolContext) =>
    loadSelection(scopes(ctx), {
      provider: pi.getFlag('judgments-provider'),
      model: pi.getFlag('judgments-model'),
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
      'Discover bundled, global and host-trusted project JSON judgment scenarios: purpose, useWhen, avoidWhen, inputSchema, dynamicQuestions criteriaGuidance/criteriaSchema, interpretation and source. Fixed rubrics stay internal. Read diagnostics for invalid definitions. Local metadata only; no classifier call. List for unfamiliar decisions, not every turn; known suitable scenarios are directly callable.',
    promptSnippet: 'Discover reusable bounded judgments when the suitable scenario is not known.',
    parameters: Type.Object({}, { additionalProperties: false }),
    outputSchema: catalogOutput,
    async execute(_id, params, _signal, _update, ctx) {
      validate(Type.Object({}, { additionalProperties: false }), params);
      const loaded = await catalog(ctx);
      const scenarios = [...loaded.entries.values()].flatMap(({ id, source, definition }) => {
        if (!definition) return [];
        const { mode, purpose, useWhen, avoidWhen, inputSchema, interpretation } = definition;
        const dynamicQuestions = Object.fromEntries(
          Object.entries(definition.questions)
            .filter(([, saved]) => !Object.hasOwn(saved, 'criteria'))
            .map(([key, saved]) => [
              key,
              {
                type: saved.type,
                criteriaGuidance: saved.criteriaGuidance!,
                criteriaSchema: criteriaShapes[saved.type],
              },
            ]),
        );
        return [
          {
            id,
            mode,
            purpose,
            useWhen,
            avoidWhen,
            inputSchema,
            dynamicQuestions,
            interpretation,
            source,
          },
        ];
      });
      return toolResult({ scenarios, diagnostics: loaded.diagnostics });
    },
  });
  pi.registerTool({
    name: 'judgments_evaluate_scenario',
    label: 'Evaluate judgment scenario',
    namespace,
    annotations: { ...annotations, openWorldHint: true },
    description:
      'Evaluate a known suitable saved JSON scenario with input evidence and, for dynamic questions, criteria keyed by question ID. Follow its criteriaGuidance; mechanically package actual options, not a preselected answer. Missing criteria, fixed overrides, invalid evidence and blocked definitions fail before classification. Discover unfamiliar scenarios first. Call at relevant decision points, not every turn or again on unchanged evidence. Supplied context is sent to the configured native classifier using host credentials. ' +
      guidance,
    promptSnippet:
      'Delegate a saved scenario with evidence and any required dynamic criteria; fixed questions remain internal.',
    parameters: scenarioInput,
    outputSchema: evaluationOutput,
    async execute(_id, params, signal, _update, ctx) {
      validate(scenarioInput, params);
      const entry = (await catalog(ctx)).entries.get(params.scenario);
      if (!entry?.definition)
        throw new Error(
          'Scenario is missing or blocked; inspect discovery diagnostics or validate the saved definition.',
        );
      const request = prepareScenario(entry.definition, params.input, params.criteria);
      const result = await evaluate(await selection(ctx), request, ctx, signal);
      return toolResult({
        ...result,
        scenario: entry.id,
        source: entry.source,
        interpretation: entry.definition.interpretation,
      });
    },
  });
  pi.registerTool({
    name: 'judgments_evaluate',
    label: 'Evaluate generic judgment',
    namespace,
    annotations: { ...annotations, openWorldHint: true },
    description:
      'Evaluate supplied state with typed choice, bool or score questions when no saved scenario fits. Prefer saved scenarios for recurring judgments; list unfamiliar scenarios first. Use narrow atomic questions and include necessary evidence; independent questions can share a request, but cannot depend on each other’s answers. Not generation, a reasoning replacement or per-turn review. Supplied context is sent to the configured native classifier using host credentials. ' +
      guidance,
    promptSnippet: 'Delegate bounded typed judgments outside saved scenarios.',
    promptGuidelines: [
      'Use judgments only at relevant decision points; do not repeat unchanged assessments. A judgment never overrides required clarification, approval or deterministic verification.',
    ],
    parameters: genericInput,
    outputSchema: evaluationOutput,
    async execute(_id, params, signal, _update, ctx) {
      validate(genericInput, params);
      return toolResult(await evaluate(await selection(ctx), params as Request, ctx, signal));
    },
  });
  pi.registerTool({
    name: 'judgments_validate_scenario',
    label: 'Validate saved judgment scenario',
    namespace,
    annotations: { ...annotations, openWorldHint: false },
    description:
      'Validate a saved named JSON scenario selected by normal scope precedence. Returns validity, identity, source and diagnostics without classifier calls, file repair or writes. Use after intentional authoring with existing write/edit tools within delegated scope. Does not establish semantic adequacy, user acceptance or classifier quality.',
    promptSnippet:
      'Validate an intentionally authored saved JSON judgment without classification or repair.',
    parameters: validationInput,
    outputSchema: validationOutput,
    async execute(_id, params, _signal, _update, ctx) {
      validate(validationInput, params);
      const loaded = await catalog(ctx);
      const entry = loaded.entries.get(params.scenario);
      const diagnostics: Diagnostic[] = entry?.diagnostics ?? [
        {
          scope: 'project',
          path: join(ctx.cwd, '.pi/judgments'),
          id: params.scenario,
          code: 'scenario_missing',
          message: 'No authorized saved definition found; inspect discovery diagnostics.',
        },
      ];
      return toolResult({
        valid: !!entry?.definition,
        id: params.scenario,
        ...(entry ? { source: entry.source } : {}),
        diagnostics,
      });
    },
  });
}
