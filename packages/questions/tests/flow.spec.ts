import { describe, expect, it } from 'vitest';
import { QuestionFlow } from '../extensions/ask-questions/flow.ts';
import { normalizeInput } from '../extensions/ask-questions/schema.ts';

const questions = normalizeInput({
  questions: Array.from({ length: 6 }, (_, index) => ({
    header: ` Topic ${index + 1} `,
    question: `Full question ${index + 1}?`,
    options: Array.from({ length: 8 }, (_, option) => ({ label: `Option ${option + 1}` })),
    recommendedOption: 8,
  })),
});

// @mara implements VER-QUESTIONS-INTERACTION
describe('pure questionnaire transitions', () => {
  it('accepts boundary cardinalities, clamps navigation and retains recommendation focus once', () => {
    const flow = new QuestionFlow(questions);
    expect(flow.choice.focus).toBe(7);
    expect(flow.choice.answer).toBeUndefined();
    flow.move(-100);
    expect(flow.choice.focus).toBe(0);
    flow.move(100);
    expect(flow.choice.focus).toBe(8);
    flow.back();
    expect(flow.index).toBe(0);
    expect(flow.choice.focus).toBe(8);
    expect(flow.choose(9)).toBeUndefined();
    expect(flow.stage).toBe('options');
  });

  it('submits all six final answers in original order only after review', () => {
    const flow = new QuestionFlow(questions);
    for (let index = 0; index < questions.length; index++) {
      expect(flow.choose(7)).toBeUndefined();
    }
    expect(flow.stage).toBe('review');
    const result = flow.submit();
    expect(result?.status).toBe('answered');
    expect(result?.questions.map((question) => question.questionNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(result?.answers).toEqual(
      questions.map((question) => ({
        questionNumber: question.questionNumber,
        kind: 'option',
        optionNumber: 8,
        answer: 'Option 8',
      })),
    );
    flow.clear();
    expect(result?.answers).toHaveLength(6);
    expect(result?.questions[0].options).toHaveLength(8);
  });

  it('never invents a missing answer, even if review is reached with broken state', () => {
    const flow = new QuestionFlow(questions);
    flow.stage = 'review';
    expect(flow.submit()).toBeUndefined();
    expect(flow.stage).toBe('options');
    expect(flow.index).toBe(0);
    expect(flow.feedback).toMatch(/Confirm/);
    expect(flow.choice.answer).toBeUndefined();
  });

  it('can replace custom with option and then custom while preserving unsent drafts and prior consent', () => {
    const flow = new QuestionFlow(questions.slice(0, 2));
    flow.choose(8);
    expect(flow.editorText).toBe('');
    flow.submitCustom('  first  answer\nnext  ');
    flow.back();
    flow.choose(8);
    flow.leaveEditor('unfinished');
    expect(flow.choice.answer).toMatchObject({ kind: 'custom', answer: 'first  answer\nnext' });
    flow.choose(0);
    flow.back();
    expect(flow.choice.answer).toMatchObject({ kind: 'option', optionNumber: 1 });
    flow.choose(8);
    expect(flow.editorText).toBe('unfinished');
    flow.submitCustom(' replacement ');
    flow.choose(7);
    expect(flow.submit()?.answers).toEqual([
      { questionNumber: 1, kind: 'custom', answer: 'replacement' },
      { questionNumber: 2, kind: 'option', optionNumber: 8, answer: 'Option 8' },
    ]);
  });

  it('copies valid input before waiting and submitted snapshots before disposal', () => {
    const args = {
      questions: [
        {
          header: ' Label ',
          question: ' original question ',
          options: [{ label: ' original label ', description: ' full description ' }],
        },
      ],
    };
    const normalized = normalizeInput(args);
    args.questions[0].options[0].label = 'changed';
    expect(normalized[0].options[0].label).toBe(' original label ');
    const flow = new QuestionFlow(normalized);
    const result = flow.choose(0);
    normalized[0].options[0].label = 'also changed';
    expect(result?.questions[0].options[0].label).toBe(' original label ');
    expect(result?.answers[0].answer).toBe(' original label ');
  });
});
