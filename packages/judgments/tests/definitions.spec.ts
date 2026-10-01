import { describe, expect, it } from 'vitest';
import { prepareScenario, validateDefinition } from '../extensions/judgments/definitions.ts';

export const fixed = {
  formatVersion: 1,
  mode: 'fixed',
  purpose: 'Assess supplied evidence',
  useWhen: ['At a relevant decision'],
  avoidWhen: ['Unchanged evidence'],
  inputSchema: {
    type: 'object',
    properties: {
      evidence: {
        type: 'string',
        minLength: 1,
        description: 'Grounded evidence',
        examples: ['One observation'],
      },
    },
    required: ['evidence'],
    additionalProperties: false,
  },
  questions: {
    supported: {
      type: 'bool',
      instructions: 'Assess support',
      criteria: { true: 'Supported', false: 'Unsupported' },
    },
  },
  interpretation: 'Advisory, not approval',
};
export const dynamic = {
  ...fixed,
  mode: 'dynamic',
  questions: {
    ...fixed.questions,
    category: {
      type: 'choice',
      instructions: 'Choose a category',
      criteriaGuidance: 'Retrieve actual options and package their guidance, including no fit.',
    },
    strength: {
      type: 'score',
      instructions: 'Score support',
      criteriaGuidance: 'Supply an ordered rubric.',
    },
  },
};

// @mara checks REQ-JUDGMENTS-DECLARATIVE
// @mara implements VER-JUDGMENTS-DECLARATIVE
describe('JSON definitions', () => {
  it('prepares fixed native questions without changing evidence or definition', () => {
    const definition = validateDefinition(fixed);
    expect(prepareScenario(definition, { evidence: 'Observed' })).toEqual({
      state: { evidence: 'Observed' },
      questions: fixed.questions,
    });
    expect(fixed.questions.supported.criteria).toEqual({ true: 'Supported', false: 'Unsupported' });
  });
  it('combines fixed and caller criteria for choice and score without templates', () => {
    const criteria = {
      category: { custom: 'Actual custom option', none: 'No fit' },
      strength: ['Weak', 'Strong'],
    };
    const request = prepareScenario(
      validateDefinition(dynamic),
      { evidence: 'Observed' },
      criteria,
    );
    expect(request.questions).toEqual({
      ...fixed.questions,
      category: { type: 'choice', instructions: 'Choose a category', criteria: criteria.category },
      strength: { type: 'score', instructions: 'Score support', criteria: criteria.strength },
    });
    expect(request.questions.category).not.toHaveProperty('criteriaGuidance');
    expect(dynamic.questions.category).not.toHaveProperty('criteria');
  });
  it.each([
    { ...fixed, id: 'redundant' },
    { ...fixed, formatVersion: 2 },
    { ...dynamic, mode: 'fixed' },
    { ...fixed, mode: 'dynamic' },
    { ...dynamic, questions: { x: { type: 'bool', instructions: 'Assess' } } },
    {
      ...dynamic,
      questions: { x: { type: 'bool', instructions: 'Assess', criteriaGuidance: ' ' } },
    },
    { ...fixed, questions: {} },
    {
      ...fixed,
      questions: { x: { type: 'bool', instructions: 'Assess', criteria: { true: 'Yes' } } },
    },
    { ...fixed, inputSchema: { type: 'unrecognized' } },
    { ...fixed, inputSchema: { type: 'string', minLength: -1 } },
    { ...fixed, inputSchema: { type: 'string', pattern: '[' } },
    { ...fixed, inputSchema: { $ref: 'https://example.invalid/schema' } },
    { ...fixed, inputSchema: { $ref: '#/$defs/local', $defs: { local: { type: 'string' } } } },
    { ...fixed, inputSchema: { type: 'string', format: 'made-up' } },
    { ...fixed, inputSchema: { type: 'object', properties: { x: { from: 'state.path' } } } },
  ])('rejects invalid definitions and unsupported schema features', (definition) => {
    expect(() => validateDefinition(definition)).toThrow();
  });
  it.each([
    [{}, {}],
    [{ evidence: '' }, {}],
    [{ evidence: 'Observed', unexpected: true }, {}],
    [{ evidence: 'Observed' }, { supported: { true: 'Override', false: 'Override' } }],
    [{ evidence: 'Observed' }, { unknown: ['Unknown'] }],
  ])('rejects invalid evidence and fixed/unknown criteria', (input, criteria) => {
    expect(() => prepareScenario(validateDefinition(fixed), input, criteria)).toThrow();
  });
  it.each([
    {},
    { category: { a: 'A' } },
    { category: [], strength: ['Weak'] },
    { category: { a: ' ' }, strength: ['Weak'] },
    { category: { a: 'A' }, strength: [] },
  ])('requires every dynamic question and matching native criteria shapes', (criteria) => {
    expect(() =>
      prepareScenario(validateDefinition(dynamic), { evidence: 'Observed' }, criteria),
    ).toThrow();
  });
  it('supports nested standard schema constraints without remote resolution', () => {
    const definition = validateDefinition({
      ...fixed,
      inputSchema: {
        type: 'object',
        properties: {
          evidence: {
            anyOf: [
              { type: 'integer', minimum: 2 },
              { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
            ],
          },
        },
        required: ['evidence'],
      },
    });
    expect(() => prepareScenario(definition, { evidence: 2 })).not.toThrow();
    expect(() => prepareScenario(definition, { evidence: ['x'] })).not.toThrow();
    expect(() => prepareScenario(definition, { evidence: ['x', 'x'] })).toThrow();
    expect(() => prepareScenario(definition, { evidence: 1 })).toThrow();
  });
});
