import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { question, text } from './schemas.ts';
import type { Request } from './native.ts';

const savedQuestion = Type.Object(
  {
    type: Type.Union(['choice', 'bool', 'score'].map((type) => Type.Literal(type))),
    instructions: text,
    criteria: Type.Optional(Type.Unknown()),
    criteriaGuidance: Type.Optional(text),
  },
  { additionalProperties: false },
);
const definitionSchema = Type.Object(
  {
    formatVersion: Type.Literal(1),
    mode: Type.Union([Type.Literal('fixed'), Type.Literal('dynamic')]),
    purpose: text,
    useWhen: Type.Array(text, { minItems: 1 }),
    avoidWhen: Type.Array(text),
    inputSchema: Type.Union([Type.Boolean(), Type.Record(Type.String(), Type.Unknown())]),
    questions: Type.Record(text, savedQuestion, { minProperties: 1 }),
    interpretation: text,
  },
  { additionalProperties: false },
);
export type Definition = Static<typeof definitionSchema>;

const counts = new Set([
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
]);
const numbers = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
]);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const mapKeywords = new Set(['properties', 'patternProperties']);
const listKeywords = new Set(['allOf', 'anyOf', 'oneOf']);
const singleKeywords = new Set(['items', 'additionalProperties', 'not']);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never {
  throw new Error(`Invalid scenario definition: ${message}`);
}

// A deliberately explicit, self-contained JSON Schema subset. Unknown constraints
// must not be silently accepted by a validator that does not implement them.
function validateEvidenceSchema(value: unknown): void {
  if (typeof value === 'boolean') return;
  if (!object(value)) fail('inputSchema must contain schemas, not arbitrary values.');
  for (const [key, entry] of Object.entries(value)) {
    if (mapKeywords.has(key)) {
      if (!object(entry)) fail(`Invalid ${key} schema mapping.`);
      for (const [name, child] of Object.entries(entry)) {
        if (key === 'patternProperties') checkPattern(name);
        validateEvidenceSchema(child);
      }
    } else if (listKeywords.has(key)) {
      if (!Array.isArray(entry) || entry.length === 0) fail(`Invalid ${key} schema list.`);
      entry.forEach(validateEvidenceSchema);
    } else if (singleKeywords.has(key)) validateEvidenceSchema(entry);
    else if (counts.has(key)) {
      if (!Number.isSafeInteger(entry) || (entry as number) < 0) fail(`Invalid ${key} constraint.`);
    } else if (numbers.has(key)) {
      if (
        typeof entry !== 'number' ||
        !Number.isFinite(entry) ||
        (key === 'multipleOf' && entry <= 0)
      )
        fail(`Invalid ${key} constraint.`);
    } else if (key === 'type') {
      const entries = Array.isArray(entry) ? entry : [entry];
      if (
        entries.length === 0 ||
        new Set(entries).size !== entries.length ||
        entries.some((e) => typeof e !== 'string' || !types.has(e))
      )
        fail('Invalid schema type.');
    } else if (key === 'required') {
      if (
        !Array.isArray(entry) ||
        entry.some((e) => typeof e !== 'string') ||
        new Set(entry).size !== entry.length
      )
        fail('Invalid required property list.');
    } else if (key === 'enum') {
      if (!Array.isArray(entry) || entry.length === 0) fail('Invalid enum constraint.');
    } else if (key === 'pattern') {
      if (typeof entry !== 'string') fail('Invalid pattern constraint.');
      checkPattern(entry);
    } else if (key === 'uniqueItems') {
      if (typeof entry !== 'boolean') fail('Invalid uniqueItems constraint.');
    } else if (key === 'description' || key === 'title') {
      if (typeof entry !== 'string') fail(`Invalid ${key} annotation.`);
    } else if (key === 'examples') {
      if (!Array.isArray(entry)) fail('Invalid examples annotation.');
    } else if (key !== 'const' && key !== 'default')
      fail(`Unsupported inputSchema keyword: ${key}.`);
  }
}
function checkPattern(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch {
    fail('Invalid schema regular expression.');
  }
}

// @mara implements DES-JUDGMENTS-DECLARATIVE
export function validateDefinition(raw: unknown): Definition {
  if (!Value.Check(definitionSchema, raw)) fail('Consult the version 1 definition fields.');
  validateEvidenceSchema(raw.inputSchema);
  let dynamic = 0;
  for (const saved of Object.values(raw.questions)) {
    if (Object.hasOwn(saved, 'criteria')) {
      if (
        !Value.Check(question, {
          type: saved.type,
          instructions: saved.instructions,
          criteria: saved.criteria,
        })
      )
        fail('Fixed criteria must match the native question type.');
    } else {
      dynamic++;
      if (!saved.criteriaGuidance?.trim()) fail('Dynamic questions require criteriaGuidance.');
    }
  }
  if ((raw.mode === 'fixed' && dynamic !== 0) || (raw.mode === 'dynamic' && dynamic === 0))
    fail('Mode does not match question criteria.');
  return raw;
}

export function prepareScenario(
  definition: Definition,
  input: Record<string, unknown>,
  criteria: Record<string, unknown> = {},
): Request {
  if (!Value.Check(definition.inputSchema as TSchema, input))
    throw new Error('Invalid scenario evidence; consult inputSchema.');
  for (const id of Object.keys(criteria)) {
    if (!Object.hasOwn(definition.questions, id)) throw new Error('Unknown criteria question ID.');
    if (Object.hasOwn(definition.questions[id], 'criteria'))
      throw new Error('Cannot override fixed criteria.');
  }
  const entries = Object.entries(definition.questions).map(([id, saved]) => {
    const assembled = {
      type: saved.type,
      instructions: saved.instructions,
      criteria: Object.hasOwn(saved, 'criteria') ? saved.criteria : criteria[id],
    };
    if (!Value.Check(question, assembled))
      throw new Error('Missing or invalid dynamic criteria; consult scenario guidance.');
    return [id, assembled] as const;
  });
  return { state: input as Request['state'], questions: Object.fromEntries(entries) };
}
