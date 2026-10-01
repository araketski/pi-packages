import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

export const text = Type.String({ minLength: 1, pattern: '\\S' });
const strings = Type.Record(Type.String(), text);
export const question = Type.Union([
  Type.Object(
    {
      type: Type.Literal('choice'),
      instructions: text,
      criteria: Type.Record(Type.String(), text, { minProperties: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('bool'),
      instructions: text,
      criteria: Type.Object({ true: text, false: text }, { additionalProperties: false }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('score'),
      instructions: text,
      criteria: Type.Array(text, { minItems: 1 }),
    },
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
export const maraInput = Type.Object(
  {
    content: text,
    purpose: text,
    flavours: Type.Record(
      Type.String(),
      Type.Object({
        description: text,
        use_when: Type.Array(text, { minItems: 1 }),
        avoid_when: Type.Array(text),
        distinguish_from: strings,
      }),
    ),
    context: Type.Optional(text),
  },
  { additionalProperties: false },
);
export const scenarioInput = Type.Object(
  {
    scenario: Type.Literal('mara-representation'),
    input: maraInput,
  },
  { additionalProperties: false },
);

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
  assessment: Type.Optional(Type.Record(Type.String(), Type.String())),
  flavour_labels: Type.Optional(Type.Record(Type.String(), Type.String())),
  scenario: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  guidance: Type.String(),
});

export function validate<T extends typeof genericInput | typeof scenarioInput>(
  schema: T,
  value: unknown,
): asserts value is Static<T> {
  if (!Value.Check(schema, value))
    throw new Error(
      'Invalid judgment input. Consult the tool schema or scenario catalog for required fields.',
    );
}
