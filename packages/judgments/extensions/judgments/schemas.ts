import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

export const text = Type.String({ minLength: 1, pattern: '\\S' });
export const criteriaShapes = {
  choice: Type.Record(Type.String(), text, { minProperties: 1 }),
  bool: Type.Object({ true: text, false: text }, { additionalProperties: false }),
  score: Type.Array(text, { minItems: 1 }),
};
export const question = Type.Union([
  Type.Object(
    { type: Type.Literal('choice'), instructions: text, criteria: criteriaShapes.choice },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('bool'), instructions: text, criteria: criteriaShapes.bool },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('score'), instructions: text, criteria: criteriaShapes.score },
    { additionalProperties: false },
  ),
]);
export const genericInput = Type.Object(
  {
    state: Type.Record(Type.String(), Type.Unknown()),
    questions: Type.Record(Type.String(), question, { minProperties: 1 }),
  },
  { additionalProperties: false },
);
export const scenarioInput = Type.Object(
  {
    scenario: text,
    input: Type.Record(Type.String(), Type.Unknown()),
    criteria: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export const validationInput = Type.Object({ scenario: text }, { additionalProperties: false });
export const sourceSchema = Type.Object({
  scope: Type.Union(['bundled', 'global', 'project'].map((s) => Type.Literal(s))),
  path: Type.String(),
});
export const diagnosticSchema = Type.Object({
  scope: sourceSchema.properties.scope,
  path: Type.String(),
  code: Type.String(),
  message: Type.String(),
  id: Type.Optional(Type.String()),
});
const diagnostics = Type.Array(diagnosticSchema);
export const catalogOutput = Type.Object({
  scenarios: Type.Array(
    Type.Object({
      id: text,
      mode: Type.Union([Type.Literal('fixed'), Type.Literal('dynamic')]),
      purpose: text,
      useWhen: Type.Array(text),
      avoidWhen: Type.Array(text),
      inputSchema: Type.Union([Type.Boolean(), Type.Record(Type.String(), Type.Unknown())]),
      dynamicQuestions: Type.Record(
        Type.String(),
        Type.Object({
          type: Type.Union(['choice', 'bool', 'score'].map((t) => Type.Literal(t))),
          criteriaGuidance: text,
          criteriaSchema: Type.Record(Type.String(), Type.Unknown()),
        }),
      ),
      interpretation: text,
      source: sourceSchema,
    }),
  ),
  diagnostics,
});
export const validationOutput = Type.Object({
  valid: Type.Boolean(),
  id: text,
  source: Type.Optional(sourceSchema),
  diagnostics,
});
export const probability = Type.Number({ minimum: 0, maximum: 1 });
export const answer = Type.Union([
  Type.Object({
    type: Type.Literal('choice'),
    choice: Type.String(),
    probabilities: Type.Record(Type.String(), probability),
    confidence: probability,
  }),
  Type.Object({ type: Type.Literal('bool'), probability }),
  Type.Object({ type: Type.Literal('score'), score: Type.Number(), confidence: probability }),
]);
export const evaluationOutput = Type.Object({
  status: Type.Union(
    ['assessed', 'inconclusive', 'unavailable', 'failed', 'aborted'].map((s) => Type.Literal(s)),
  ),
  advisory: Type.Literal(true),
  classifier: Type.Object({ provider: Type.String(), model: Type.String() }),
  message: Type.Optional(Type.String()),
  answers: Type.Optional(Type.Record(Type.String(), answer)),
  scenario: Type.Optional(Type.String()),
  source: Type.Optional(sourceSchema),
  interpretation: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  guidance: Type.String(),
});
export function validate<T extends TSchema>(schema: T, value: unknown): asserts value is Static<T> {
  if (!Value.Check(schema, value))
    throw new Error(
      'Invalid judgment input. Consult the tool schema or scenario catalog for required fields.',
    );
}
