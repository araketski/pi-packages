import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runNativeFixture } from './native-fixture.ts';

it('exercises real Linux execution through Pi 0.99.1 direct, nested and native codemode cancellation', () => {
  const root = mkdtempSync(join(tmpdir(), 'local-native-'));
  try {
    const records = runNativeFixture(
      root,
      import.meta.resolve('@earendil-works/pi-coding-agent'),
      new URL('../extensions/jobs/local-executor.ts', import.meta.url).pathname,
      process.env.PI_TEST_EVIDENCE_DIR
        ? join(process.env.PI_TEST_EVIDENCE_DIR, 'native-source')
        : undefined,
    );
    expect(records).toHaveLength(9);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 70_000);
