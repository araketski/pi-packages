import { Type, type Static } from 'typebox';
import { Check, Errors } from 'typebox/value';

const text = Type.String({ minLength: 1 });
const optionSchema = Type.Object(
  {
    label: text,
    description: Type.Optional(text),
  },
  { additionalProperties: false },
);
const questionFields = {
  question: text,
  options: Type.Array(optionSchema, { minItems: 1, maxItems: 8 }),
  recommendedOption: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
};
export const inputSchema = Type.Object(
  {
    questions: Type.Array(
      Type.Object(
        {
          header: Type.Optional(text),
          ...questionFields,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 6 },
    ),
  },
  { additionalProperties: false },
);

const questionSchema = Type.Object(
  {
    questionNumber: Type.Integer({ minimum: 1, maximum: 6 }),
    header: text,
    ...questionFields,
  },
  { additionalProperties: false },
);
const answerFields = {
  questionNumber: Type.Integer({ minimum: 1, maximum: 6 }),
  answer: text,
};
const answerSchema = Type.Union([
  Type.Object(
    {
      ...answerFields,
      kind: Type.Literal('option'),
      optionNumber: Type.Integer({ minimum: 1, maximum: 8 }),
    },
    { additionalProperties: false },
  ),
  Type.Object({ ...answerFields, kind: Type.Literal('custom') }, { additionalProperties: false }),
]);
export const outputSchema = Type.Union([
  Type.Object(
    {
      status: Type.Literal('answered'),
      questions: Type.Array(questionSchema, { minItems: 1, maxItems: 6 }),
      answers: Type.Array(answerSchema, { minItems: 1, maxItems: 6 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Literal('cancelled'),
      questions: Type.Array(questionSchema, { minItems: 1, maxItems: 6 }),
      answers: Type.Tuple([]),
      reason: Type.Union([
        Type.Literal('dismissed'),
        Type.Literal('aborted'),
        Type.Literal('session_changed'),
        Type.Literal('reload'),
        Type.Literal('shutdown'),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Literal('unavailable'),
      questions: Type.Array(questionSchema, { minItems: 1, maxItems: 6 }),
      answers: Type.Tuple([]),
      reason: Type.Literal('non_tui'),
    },
    { additionalProperties: false },
  ),
]);
export type Question = Static<typeof questionSchema>;
export type Answer = Static<typeof answerSchema>;
export type Result = Static<typeof outputSchema>;
export type CancelReason = Extract<Result, { status: 'cancelled' }>['reason'];

// @mara implements DES-QUESTIONS-TOOL
export function normalizeInput(value: unknown): Question[] {
  if (!Check(inputSchema, value)) {
    const error = Errors(inputSchema, value)[0];
    throw new Error(
      `Invalid ask_questions questions input at ${error?.instancePath || '/'}: ${error?.message || 'schema mismatch'}`,
    );
  }
  return value.questions.map((question, index) => {
    const field = `questions[${index}]`;
    const nonblank = (value: string | undefined, name: string) => {
      if (value !== undefined && !value.trim())
        throw new Error(`${field}.${name} must be nonblank`);
    };
    nonblank(question.header, 'header');
    nonblank(question.question, 'question');
    question.options.forEach((option, index) => {
      nonblank(option.label, `options[${index}].label`);
      nonblank(option.description, `options[${index}].description`);
    });
    if (
      question.recommendedOption !== undefined &&
      question.recommendedOption > question.options.length
    ) {
      throw new Error(
        `${field}.recommendedOption must reference a supplied option (1–${question.options.length})`,
      );
    }
    return {
      questionNumber: index + 1,
      header: question.header?.trim() ?? `Q${index + 1}`,
      question: question.question,
      options: question.options.map((option) => ({ ...option })),
      ...(question.recommendedOption === undefined
        ? {}
        : { recommendedOption: question.recommendedOption }),
    };
  });
}

export function snapshotQuestions(questions: readonly Question[]): Question[] {
  return questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option })),
  }));
}

export function resultText(result: Result): string {
  if (result.status === 'unavailable')
    return 'Questions unavailable: the interactive Pi TUI is required. Ask the user in ordinary chat instead. Nothing was submitted.';
  if (result.status === 'cancelled')
    return `Questions cancelled (${result.reason}). Nothing was submitted.`;
  return result.questions
    .map((question, index) => {
      const answer = result.answers[index];
      return `${question.questionNumber}. ${question.header}\n${question.question}\nAnswer (${answer.kind === 'custom' ? 'custom' : `option ${answer.optionNumber}`}): ${answer.answer}`;
    })
    .join('\n\n');
}
