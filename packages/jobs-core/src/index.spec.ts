import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import * as core from './index.js';
import { createJobsTestBus } from './testing.js';

function bus() {
  return { events: createJobsTestBus() };
}

const identity = { runtimeId: 'runtime-A', participantId: 'owner-A', role: 'owner' as const };
const job = {
  identity: {
    runtimeId: 'runtime-A',
    ownerId: 'owner-A',
    sessionId: 'session-A',
    jobId: 'job-A',
    producerId: 'external/未知',
  },
  execution: { state: 'unknown' as const, reason: 'backend unavailable' },
  delivery: { mode: 'automatic' as const, state: 'pending' as const },
  awaiting: true,
  lifetime: 'managed' as const,
  capabilities: {
    stop: false,
    setAwaiting: true,
    setDelivery: false,
    readOutput: false,
    readResult: false,
  },
};

it('supplies the exact library-owned stamp without accepting a consumer version', () => {
  expect(core.JOBS_CONTRACT_VERSION).toBe('0.1.0');
  const participant = core.createJobsParticipant(bus(), identity);
  expect(participant.metadata()).toEqual({ ...identity, contractVersion: '0.1.0' });
  expect(participant.metadata()).not.toHaveProperty('packageVersion');
  expect(() =>
    core.createJobsParticipant(bus(), {
      ...identity,
      contractVersion: '0.4.12',
    } as typeof identity),
  ).toThrow('the library owns the contract marker');
});

it('discovers opaque producers and retains unknown execution without granting observer authority', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  const observer = core.createJobsParticipant(host, {
    ...identity,
    participantId: 'view-A',
    role: 'observer',
  });
  owner.start();
  owner.publish('session-A', [job]);
  observer.start();
  expect(observer.view().snapshots[0]?.jobs).toEqual([job]);
  expect(observer.view().participants).toHaveLength(2);
  expect(() => observer.publish('session-A', [job])).toThrow('Invalid owner jobs snapshot');
  const external = core.createJobsParticipant(host, {
    ...identity,
    participantId: 'opaque-owner',
    role: 'owner',
  });
  external.start();
  expect(
    observer.view().participants.find((p) => p.participantId === 'opaque-owner')?.compatibility,
  ).toBe('matching');
  expect(observer.view().snapshots).toHaveLength(1); // no snapshot is not confirmed empty
  owner.close();
  observer.close();
  external.close();
});

it('rejects malformed, foreign-owner and mismatched snapshots without replacing valid state', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  const observer = core.createJobsParticipant(host, {
    ...identity,
    participantId: 'view',
    role: 'observer',
  });
  owner.start();
  observer.start();
  owner.publish('session-A', [job]);
  const before = observer.view().snapshots;
  const send = (jobs: unknown, contractVersion: unknown = '0.1.0') =>
    host.events.emit(core.JOBS_PARTICIPANT_CHANNEL, {
      kind: 'snapshot',
      participant: { ...identity, contractVersion },
      sessionId: 'session-A',
      jobs,
    });
  for (const invalid of [
    null,
    [job, job],
    [{ ...job, execution: { state: 'running', exitCode: 0 } }],
    [{ ...job, identity: { ...job.identity, ownerId: 'foreign' } }],
    [{ ...job, identity: { ...job.identity, sessionId: 'session-B' } }],
    [{ ...job, execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: NaN } } }],
    [{ ...job, delivery: { mode: 'automatic', state: 'delivered' } }],
    [{ ...job, lifetime: ['managed'] }],
    [{ ...job, delivery: { mode: ['automatic'], state: 'pending' } }],
  ])
    send(invalid);
  send([], '0.4.12');
  send([], null);
  expect(observer.view().snapshots).toEqual(before);
  expect(
    observer
      .view()
      .diagnostics.some((d) => d.code === 'contract-mismatch' && d.observedVersion === '0.4.12'),
  ).toBe(true);
  expect(observer.view().diagnostics.some((d) => d.code === 'contract-unreadable')).toBe(true);
  expect(() =>
    owner.publish('session-A', [{ ...job, identity: { ...job.identity, producerId: '' } }]),
  ).toThrow('Invalid owner jobs snapshot');
  owner.close();
  observer.close();
});

it('rejects inbound boxed scalars instead of coercing them into success', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  owner.start();
  owner.publish('session-A', [job]);
  const before = owner.view().snapshots;
  const boxedExitCode = Object(0) as unknown as number;
  const malformed: core.JobObservation = {
    ...job,
    execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: boxedExitCode } },
  };
  expect(() => owner.publish('session-A', [malformed])).toThrow('Invalid owner jobs snapshot');
  host.events.emit(core.JOBS_PARTICIPANT_CHANNEL, {
    kind: 'snapshot',
    participant: owner.metadata(),
    sessionId: 'session-A',
    jobs: [malformed],
  });
  expect(owner.view().snapshots).toEqual(before);
  expect(owner.view().diagnostics.at(-1)?.code).toBe('malformed');
  owner.close();
});

it('ignores non-serializable optional snapshot data without throwing or changing accepted state', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  owner.start();
  owner.publish('session-A', [job]);
  const before = owner.view().snapshots;
  const future: { loop?: unknown } = {};
  future.loop = future;
  expect(() =>
    host.events.emit(core.JOBS_PARTICIPANT_CHANNEL, {
      kind: 'snapshot',
      participant: owner.metadata(),
      sessionId: 'session-A',
      jobs: [job],
      future,
    }),
  ).not.toThrow();
  expect(owner.view().snapshots).toEqual(before);
  owner.close();
});

it.each(['single', 'mixed'])(
  'rejects %s-hole job arrays without replacing valid assertions',
  (kind) => {
    const host = bus();
    const owner = core.createJobsParticipant(host, identity);
    owner.start();
    owner.publish('session-A', [job]);
    const before = owner.view().snapshots;
    // Extending length deliberately leaves position zero absent in both malformed fixtures.
    const sparse: core.JobObservation[] = [];
    sparse.length = kind === 'single' ? 1 : 2;
    if (kind === 'mixed') sparse[1] = { ...job, identity: { ...job.identity, jobId: 'other-job' } };
    host.events.emit(core.JOBS_PARTICIPANT_CHANNEL, {
      kind: 'snapshot',
      participant: owner.metadata(),
      sessionId: 'session-A',
      jobs: sparse,
    });
    expect(owner.view().snapshots).toEqual(before);
    expect(owner.view().diagnostics.at(-1)?.code).toBe('malformed');
    expect(() => owner.publish('session-A', sparse)).toThrow('Invalid owner jobs snapshot');
    owner.close();
  },
);

it('preserves diagnostic text independently of bounded identities', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  const observer = core.createJobsParticipant(host, {
    ...identity,
    participantId: 'observer',
    role: 'observer',
  });
  owner.start();
  observer.start();
  const reason = '  backend unavailable\n' + 'stack trace detail '.repeat(30) + '\n  ';
  for (const execution of [
    { state: 'unknown', reason } as const,
    { state: 'terminal', outcome: { kind: 'launch-failed', reason } } as const,
  ]) {
    const observation = { ...job, execution };
    owner.publish('session-A', [observation]);
    expect(observer.view().snapshots[0]?.jobs).toEqual([observation]);
  }
  owner.close();
  observer.close();
});

it('preserves distinct execution outcomes and recorded-result assertions independently of delivery mode', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  const observer = core.createJobsParticipant(host, {
    ...identity,
    participantId: 'observer',
    role: 'observer',
  });
  owner.start();
  observer.start();
  const receipt: core.FinalResultReceipt = {
    result: { job: job.identity, resultId: 'result-A' },
    record: { sessionId: 'session-A', entryId: 'record-A', kind: 'tool-result' },
    contentDigest: 'sha256:fixture-final-content',
  };
  const terminal: core.JobObservation = {
    ...job,
    execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 1 } },
  };
  const values: core.JobObservation[] = [
    { ...job, execution: { state: 'running' } },
    terminal,
    {
      ...terminal,
      execution: { state: 'terminal', outcome: { kind: 'terminated', signal: 'SIGTERM' } },
    },
    {
      ...terminal,
      execution: {
        state: 'terminal',
        outcome: { kind: 'launch-failed', reason: 'fixture launch failure' },
      },
    },
    { ...terminal, delivery: { mode: 'next-natural-turn', state: 'pending' } },
    { ...terminal, delivery: { mode: 'display-only', state: 'not-required' } },
    { ...terminal, delivery: { mode: 'automatic', state: 'delivered', receipt } },
  ];
  for (const value of values) {
    owner.publish('session-A', [value]);
    expect(observer.view().snapshots[0]?.jobs).toEqual([value]);
  }
  const before = observer.view().snapshots;
  for (const invalidReceipt of [
    { ...receipt, record: { ...receipt.record, sessionId: 'other-session' } },
    {
      ...receipt,
      result: { ...receipt.result, job: { ...job.identity, producerId: 'relabeled' } },
    },
    { ...receipt, record: { ...receipt.record, kind: 'nested-call' } },
  ])
    host.events.emit(core.JOBS_PARTICIPANT_CHANNEL, {
      kind: 'snapshot',
      participant: owner.metadata(),
      sessionId: 'session-A',
      jobs: [
        {
          ...terminal,
          delivery: { mode: 'automatic', state: 'delivered', receipt: invalidReceipt },
        },
      ],
    });
  expect(observer.view().snapshots).toEqual(before);
  // A serialized saved result preserves producer/result identity; this is not a functioning store.
  const result: core.FinalResult = {
    identity: receipt.result,
    outcome: { kind: 'exit', exitCode: 1 },
    content: 'fixture final result',
  };
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  owner.close();
  observer.close();
});

it('isolates runtimes, copies outbound/inbound values and closes subscriptions', () => {
  const host = bus();
  const owner = core.createJobsParticipant(host, identity);
  const other = core.createJobsParticipant(host, {
    ...identity,
    runtimeId: 'other',
    participantId: 'view',
    role: 'observer',
  });
  owner.start();
  other.start();
  owner.publish('session-A', [job]);
  expect(other.view().snapshots).toEqual([]);
  const view = owner.view();
  view.snapshots[0]!.jobs[0]!.identity.producerId = 'changed';
  expect(owner.view().snapshots[0]?.jobs[0]?.identity.producerId).toBe('external/未知');
  owner.close();
  other.close();
  expect(() => owner.publish('session-A', [job])).toThrow('Jobs participant has not started');
});

it('communicates between independently loaded copies and warns on a late incompatible library', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jobs-copies-'));
  try {
    const source = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
    for (const name of ['lifecycle.js', 'storage.js', 'storage-files.js', 'delivery.js', 'session.js'])
      writeFileSync(join(root, name), readFileSync(new URL(`../dist/${name}`, import.meta.url)));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(join(root, 'a.mjs'), source);
    writeFileSync(join(root, 'b.mjs'), source);
    writeFileSync(
      join(root, 'different.mjs'),
      source.replace("JOBS_CONTRACT_VERSION = '0.1.0'", "JOBS_CONTRACT_VERSION = '0.4.12'"),
    );
    const [a, b, different] = await Promise.all(
      ['a', 'b', 'different'].map(
        (name) => import(/* @vite-ignore */ pathToFileURL(join(root, `${name}.mjs`)).href),
      ),
    );
    expect(a.createJobsParticipant).not.toBe(b.createJobsParticipant);
    const host = bus();
    const owner = a.createJobsParticipant(host, identity);
    const observer = b.createJobsParticipant(host, {
      ...identity,
      participantId: 'view',
      role: 'observer',
    });
    const late = different.createJobsParticipant(host, {
      ...identity,
      participantId: 'late',
      role: 'owner',
    });
    owner.start();
    owner.publish('session-A', [job]);
    observer.start();
    late.start();
    expect(observer.view().snapshots[0]?.jobs[0]?.identity.producerId).toBe('external/未知');
    expect(observer.view().diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'contract-mismatch',
        participantId: 'late',
        expectedVersion: '0.1.0',
        observedVersion: '0.4.12',
      }),
    );
    expect(late.view().diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'contract-mismatch',
        expectedVersion: '0.4.12',
        observedVersion: '0.1.0',
      }),
    );
    owner.close();
    observer.close();
    late.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
