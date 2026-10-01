import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import {
  CURSOR_MARKER,
  Editor,
  ScrollView,
  matchesKey,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type TUI,
} from '@earendil-works/pi-tui';
import { QuestionFlow } from './flow.ts';
import type { Result } from './schema.ts';

// Rendering alone must not interpret model/user-provided terminal commands.
export function displayText(text: string): string {
  return (
    stripTerminalSequences(text.replace(/\r\n?/g, '\n'))
      // eslint-disable-next-line no-control-regex -- Remove untrusted terminal control bytes.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
      .replace(/\t/g, '   ')
  );
}

interface Actions {
  submit(result: Result): void;
  dismiss(): void;
  interrupt(): void;
  fail(error: unknown): void;
}

// @mara implements DES-QUESTIONS-TUI
export class QuestionScreen implements Component, Focusable {
  private live = true;
  private hasFocus = false;
  private editor?: Editor;
  private actions?: Actions;
  private focusVisible = true;
  private previousSize = '';
  private focusStart = 0;
  private focusEnd = 0;
  private readonly viewport: ScrollView;
  private restorePaging?: () => void;
  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly kb: KeybindingsManager,
    readonly flow: QuestionFlow,
    actions: Actions,
  ) {
    this.actions = actions;
    this.scopeFullscreenPaging();
    this.viewport = new ScrollView(
      { render: (width) => this.content(width), invalidate: () => {} },
      { scrollbar: 'hidden', overscroll: 'contain' },
    );
  }
  private scopeFullscreenPaging() {
    if (this.tui.mode !== 'fullscreen') return;
    // Fullscreen intercepts viewport keys before inline components. Temporarily
    // subtract only keys owned by this dialog/editor from those two actions.
    // Public in-memory bindings API; never write the user's keybindings file.
    const previous = this.kb.getUserBindings();
    const scoped = { ...previous };
    const ownedKeys = new Set([
      ...this.kb.getKeys('tui.select.pageUp'),
      ...this.kb.getKeys('tui.select.pageDown'),
      ...this.kb.getKeys('tui.editor.pageUp'),
      ...this.kb.getKeys('tui.editor.pageDown'),
    ]);
    const changes = (['tui.altScreen.pageUp', 'tui.altScreen.pageDown'] as const).flatMap(
      (action) => {
        const keys = this.kb.getKeys(action);
        const override = keys.filter((key) => !ownedKeys.has(key));
        if (override.length === keys.length) return [];
        scoped[action] = override;
        return [{ action, override }];
      },
    );
    if (!changes.length) return;
    this.kb.setUserBindings(scoped);
    this.restorePaging = () => {
      const current = this.kb.getUserBindings();
      for (const { action, override } of changes) {
        // Preserve changes another producer made during our interval.
        if (current[action] !== override) continue;
        if (previous[action] === undefined) delete current[action];
        else current[action] = previous[action];
      }
      this.kb.setUserBindings(current);
    };
  }
  get focused() {
    return this.hasFocus;
  }
  set focused(value: boolean) {
    this.hasFocus = value;
    if (this.editor) this.editor.focused = value && this.live;
  }
  invalidate() {
    if (!this.live) return;
    this.previousSize = '';
    this.focusVisible = true;
    this.editor?.invalidate();
  }
  private redraw(ensureFocus = true) {
    if (!this.live) return;
    this.focusVisible = ensureFocus;
    this.tui.requestRender();
  }
  private openEditor() {
    this.editor = new Editor(this.tui, {
      borderColor: (text) => this.theme.fg('accent', text),
      selectList: {
        selectedPrefix: (text) => this.theme.fg('accent', text),
        selectedText: (text) => this.theme.fg('accent', text),
        description: (text) => this.theme.fg('muted', text),
        scrollInfo: (text) => this.theme.fg('dim', text),
        noMatch: (text) => this.theme.fg('muted', text),
      },
    });
    this.editor.setText(this.flow.editorText);
    this.editor.focused = this.focused;
    this.editor.onSubmit = (text) => {
      if (!this.live) return;
      const result = this.flow.submitCustom(text);
      if (result) this.actions?.submit(result);
      else {
        if (this.flow.stage !== 'editor') this.dropEditor();
        this.viewport.scrollToStart();
        this.redraw();
      }
    };
  }
  private dropEditor() {
    if (!this.editor) return;
    this.editor.onSubmit = undefined;
    this.editor.onChange = undefined;
    this.editor.focused = false;
    this.editor.setText('');
    this.editor.invalidate();
    this.editor = undefined;
  }
  private choose(row?: number) {
    const result = this.flow.choose(row);
    if (result) this.actions?.submit(result);
    else {
      if (this.flow.stage === 'editor') this.openEditor();
      this.viewport.scrollToStart();
      this.redraw();
    }
  }
  handleInput(data: string) {
    if (!this.live) return;
    try {
      // Escape retains the accepted editor-back/dialog-dismiss semantics, even
      // when it is also the host's default interrupt key.
      if (matchesKey(data, 'escape')) {
        if (this.flow.stage === 'editor') {
          this.flow.leaveEditor(this.editor!.getExpandedText());
          this.dropEditor();
          this.viewport.scrollToStart();
          this.redraw();
        } else this.actions?.dismiss();
        return;
      }
      if (matchesKey(data, 'ctrl+c') || this.kb.matches(data, 'app.interrupt')) {
        this.actions?.interrupt();
        return;
      }
      if (this.flow.stage === 'editor') {
        this.editor!.handleInput(data);
        this.redraw();
        return;
      }
      const page = this.kb.matches(data, 'tui.select.pageUp')
        ? -1
        : this.kb.matches(data, 'tui.select.pageDown')
          ? 1
          : 0;
      const direction =
        this.kb.matches(data, 'tui.select.up') || matchesKey(data, 'k')
          ? -1
          : this.kb.matches(data, 'tui.select.down') || matchesKey(data, 'j')
            ? 1
            : 0;
      if (page || (direction && this.flow.stage === 'review')) {
        this.viewport.scrollBy(
          page ? page * Math.max(1, this.viewport.viewportHeight - 1) : direction,
        );
        this.redraw(false);
        return;
      }
      if (direction) {
        this.flow.move(direction);
        this.redraw();
        return;
      }
      if (matchesKey(data, 'left') || matchesKey(data, 'h')) {
        this.flow.back();
        this.viewport.scrollToStart();
        this.redraw();
        return;
      }
      if (this.flow.stage === 'review') {
        if (this.kb.matches(data, 'tui.select.confirm')) {
          const result = this.flow.submit();
          if (result) this.actions?.submit(result);
          else this.redraw();
        }
        return;
      }
      const shortcut = (['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const).findIndex((key) =>
        matchesKey(data, key),
      );
      const number = shortcut === -1 ? undefined : shortcut + 1;
      if (
        number !== undefined ||
        this.kb.matches(data, 'tui.select.confirm') ||
        matchesKey(data, 'l')
      ) {
        if (number !== undefined && number > this.flow.question.options.length + 1) return;
        this.choose(number === undefined ? undefined : number - 1);
      }
    } catch (error) {
      this.actions?.fail(error);
    }
  }
  private content(width: number): string[] {
    const lines: string[] = [];
    const append = (text: string, prefix = '') => {
      const indent = visibleWidth(prefix);
      if (indent >= width) {
        lines.push(...wrapTextWithAnsi(prefix + text, width));
        return;
      }
      wrapTextWithAnsi(text, width - indent).forEach((line, index) =>
        lines.push((index === 0 ? prefix : ' '.repeat(indent)) + line),
      );
    };
    this.focusStart = 0;
    this.focusEnd = 0;
    if (this.flow.stage === 'review') {
      append(this.theme.fg('text', 'Confirm these answers before sending.'), ' ');
      lines.push('');
      this.flow.questions.forEach((question, index) => {
        append(this.theme.fg('muted', `${index + 1}. ${displayText(question.header)}`), ' ');
        append(this.theme.fg('text', displayText(question.question)), ' ');
        const answer = this.flow.choices[index].answer;
        append(
          answer
            ? `${this.theme.fg('muted', answer.kind === 'custom' ? 'Custom: ' : 'Answer: ')}${this.theme.fg('text', displayText(answer.answer))}`
            : this.theme.fg('error', 'No confirmed answer'),
          ' ',
        );
        lines.push('');
      });
      return lines;
    }

    append(this.theme.fg('text', displayText(this.flow.question.question)), ' ');
    lines.push('');
    [
      ...this.flow.question.options,
      { label: 'Write your own answer', description: 'Type a custom answer.' },
    ].forEach((option, index) => {
      const start = lines.length;
      const focused = this.flow.choice.focus === index;
      const recommended = this.flow.question.recommendedOption === index + 1;
      const custom = index === this.flow.question.options.length;
      const answer = this.flow.choice.answer;
      const confirmed =
        answer?.kind === 'option'
          ? answer.optionNumber === index + 1
          : answer?.kind === 'custom' && custom;
      const text = displayText(option.label);
      const label = this.theme.fg(
        recommended ? 'success' : focused ? 'accent' : 'text',
        confirmed ? this.theme.bold(text) : text,
      );
      append(
        label + (recommended ? ` ${this.theme.fg('dim', '(recommended)')}` : ''),
        this.theme.fg(focused ? 'accent' : 'text', `${focused ? '>' : ' '} ${index + 1}. `),
      );
      const markerEnd = lines.length;
      if (option.description)
        append(this.theme.fg('muted', displayText(option.description)), '   ');
      if (custom && this.flow.stage === 'editor') {
        if (this.flow.feedback) append(this.theme.fg('error', this.flow.feedback), '   ');
        const indent = ' '.repeat(Math.min(3, Math.max(0, width - 1)));
        const editorLines = this.editor!.render(width - indent.length).map((line, row, all) => {
          // Sanitize editor text, retaining only the trusted child's cursor marker.
          const safe = line.split(CURSOR_MARKER).map(displayText).join(CURSOR_MARKER);
          return (
            indent + this.theme.fg(row === 0 || row === all.length - 1 ? 'accent' : 'text', safe)
          );
        });
        const cursor = editorLines.findIndex((line) => line.includes(CURSOR_MARKER));
        this.focusStart = lines.length + Math.max(0, cursor);
        this.focusEnd = this.focusStart + 1;
        lines.push(...editorLines);
      } else {
        if (custom && this.flow.editorText)
          append(this.theme.fg('muted', `Draft: ${displayText(this.flow.editorText)}`), '   ');
        if (focused) {
          this.focusStart = start;
          this.focusEnd = markerEnd;
        }
      }
    });
    if (this.flow.feedback && this.flow.stage !== 'editor')
      append(this.theme.fg('error', this.flow.feedback));
    return lines;
  }
  private help(width: number, scrollable: boolean): string {
    const choices = this.flow.question.options.length + 1;
    const back = this.flow.index > 0;
    const hints =
      this.flow.stage === 'editor'
        ? ['Enter save', 'Shift+Enter newline', 'Esc back', 'Ctrl+C abort']
        : this.flow.stage === 'review'
          ? ['Enter submit', '←/h back', '↑↓/PgUp/PgDn scroll', 'Esc cancel']
          : [
              '↑↓/j/k move',
              `1–${choices} pick`,
              'Enter/l choose',
              ...(back ? ['←/h back'] : []),
              ...(scrollable ? ['PgUp/PgDn scroll'] : []),
              'Esc cancel',
            ];
    const compact =
      this.flow.stage === 'editor'
        ? 'Enter save • Esc back'
        : this.flow.stage === 'review'
          ? 'Enter submit • ←/h • PgUp/Dn • Esc'
          : [
              `↑↓/jk 1–${choices}`,
              'Enter/l',
              ...(back ? ['←/h'] : []),
              ...(scrollable ? ['PgUp/Dn'] : []),
              'Esc',
            ].join(' • ');
    const minimal =
      this.flow.stage === 'editor'
        ? 'Enter save · Esc'
        : this.flow.stage === 'review'
          ? 'Enter submit · Esc'
          : `↑↓ 1–${choices} Enter Esc`;
    return (
      [` ${hints.join(' • ')}`, compact, minimal].find((text) => visibleWidth(text) <= width) ??
      'Enter · Esc'
    );
  }
  render(width: number): string[] {
    if (!this.live) return [];
    try {
      width = Math.max(1, Math.floor(width));
      const budget = Math.max(1, this.tui.terminal.rows - 6);
      // Decorative framing yields first: keep usable content in tiny viewports.
      const decorated = budget >= 10;
      const hints = budget >= 3;
      const height = budget - (decorated ? 5 : hints ? 2 : 0);
      const size = `${width}:${height}`;
      if (size !== this.previousSize) {
        this.previousSize = size;
        this.focusVisible = true;
      }
      const content = this.viewport.render(width);
      this.viewport.updateLayout(content.length, height, () => {});
      if (this.focusVisible && this.flow.stage !== 'review') {
        const end = Math.min(this.focusEnd, this.focusStart + height);
        if (this.focusStart < this.viewport.scrollTop) this.viewport.scrollTo(this.focusStart);
        else if (end > this.viewport.scrollTop + height) this.viewport.scrollTo(end - height);
      }
      this.focusVisible = false;
      const visible = content.slice(this.viewport.scrollTop, this.viewport.scrollTop + height);
      const heading =
        this.flow.stage === 'review'
          ? 'Review answers'
          : `${this.flow.index + 1}/${this.flow.questions.length} • ${displayText(this.flow.question.header).replace(/\n/g, ' ')}`;
      const title =
        this.theme.fg('text', this.theme.bold('ask_questions')) +
        this.theme.fg('muted', ` ${heading}`);
      const help = this.theme.fg('dim', this.help(width, content.length > height));
      const rule = this.theme.fg('accent', '─'.repeat(width));
      return (
        decorated
          ? [rule, title, ...visible, '', help, rule]
          : hints
            ? [title, ...visible, help]
            : visible
      ).map((line) => truncateToWidth(line, width, ''));
    } catch (error) {
      this.actions?.fail(error);
      return [];
    }
  }
  dispose() {
    if (!this.live) return;
    this.live = false;
    const actions = this.actions;
    this.actions = undefined;
    this.dropEditor();
    this.flow.clear();
    const restorePaging = this.restorePaging;
    this.restorePaging = undefined;
    restorePaging?.();
    // Host disposal without a prior completion still cancels this invocation.
    actions?.dismiss();
  }
}
