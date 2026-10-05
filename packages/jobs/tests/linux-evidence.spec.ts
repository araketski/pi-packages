import { expect, it } from 'vitest';
import { verifyGroupQuiescence, type ProcessEvidence } from '../extensions/jobs/linux-evidence.mjs';

const child: ProcessEvidence = {
  pid: 20,
  ppid: 10,
  group: 10,
  session: 10,
  state: 'S',
  startTicks: '123',
};
it('revalidates an empty scan that missed a newly forked confined child', () => {
  let scans = 0;
  expect(
    verifyGroupQuiescence(10, 10, {
      processes: () => (++scans === 1 ? [] : [child]),
      counter: () => '21',
    }),
  ).toMatchObject({ state: 'occupied', members: [child] });
});
it('never confirms empty scans spanning a PID allocation change', () => {
  let reads = 0;
  expect(
    verifyGroupQuiescence(10, 10, { processes: () => [], counter: () => String(++reads) }),
  ).toMatchObject({ state: 'unknown' });
});
it('confirms two empty scans only with stable allocation evidence', () => {
  let scans = 0;
  expect(
    verifyGroupQuiescence(10, 10, {
      processes: () => {
        scans++;
        return [];
      },
      counter: () => '21',
    }),
  ).toMatchObject({ state: 'quiescent', members: [] });
  expect(scans).toBe(2);
});
it('retains uncertainty if allocation evidence is unavailable', () => {
  expect(
    verifyGroupQuiescence(10, 10, {
      processes: () => [],
      counter: () => {
        throw Error('proc unavailable');
      },
    }),
  ).toMatchObject({ state: 'unknown', reason: expect.stringContaining('proc unavailable') });
});
