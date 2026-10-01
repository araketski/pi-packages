import { snapshotQuestions, type Answer, type Question, type Result } from './schema.ts';

interface Choice {
  focus: number;
  answer?: Answer;
  draft?: string;
}

// @mara implements DES-QUESTIONS-TUI
export class QuestionFlow {
  index = 0;
  stage: 'options' | 'editor' | 'review' = 'options';
  feedback = '';
  readonly choices: Choice[];
  constructor(readonly questions: readonly Question[]) {
    this.choices = questions.map((question) => ({ focus: (question.recommendedOption ?? 1) - 1 }));
  }
  get question() {
    return this.questions[this.index];
  }
  get choice() {
    return this.choices[this.index];
  }

  move(delta: number) {
    this.choice.focus = Math.max(
      0,
      Math.min(this.question.options.length, this.choice.focus + delta),
    );
  }
  back() {
    if (this.stage === 'review') this.index = this.questions.length - 1;
    else this.index = Math.max(0, this.index - 1);
    this.stage = 'options';
    this.feedback = '';
  }
  choose(row = this.choice.focus): Result | undefined {
    if (row < 0 || row > this.question.options.length) return;
    this.choice.focus = row;
    this.feedback = '';
    if (row === this.question.options.length) {
      this.stage = 'editor';
      return;
    }
    return this.confirm({
      questionNumber: this.index + 1,
      kind: 'option',
      optionNumber: row + 1,
      answer: this.question.options[row].label,
    });
  }
  get editorText() {
    return (
      this.choice.draft ?? (this.choice.answer?.kind === 'custom' ? this.choice.answer.answer : '')
    );
  }
  leaveEditor(text: string) {
    this.choice.draft = text;
    this.stage = 'options';
    this.feedback = '';
  }
  submitCustom(text: string): Result | undefined {
    const answer = text.trim();
    if (!answer) {
      this.feedback = 'Enter a nonblank answer.';
      return;
    }
    this.choice.draft = answer;
    this.feedback = '';
    return this.confirm({ questionNumber: this.index + 1, kind: 'custom', answer });
  }
  private confirm(answer: Answer): Result | undefined {
    this.choice.answer = answer;
    if (this.questions.length === 1) return this.submit();
    if (this.index === this.questions.length - 1) this.stage = 'review';
    else {
      this.index++;
      this.stage = 'options';
    }
    return undefined;
  }
  submit(): Result | undefined {
    const missing = this.choices.findIndex((choice) => !choice.answer);
    if (missing !== -1) {
      this.index = missing;
      this.stage = 'options';
      this.feedback = 'Confirm an answer to every question before submitting.';
      return;
    }
    return {
      status: 'answered',
      questions: snapshotQuestions(this.questions),
      answers: this.choices.map((choice) => ({ ...choice.answer! })),
    };
  }
  clear() {
    this.choices.length = 0;
    this.feedback = '';
  }
}
