import { readFileSync, readdirSync } from 'node:fs';

export function readProcess(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/);
    return {
      pid,
      state: fields[0],
      ppid: Number(fields[1]),
      group: Number(fields[2]),
      session: Number(fields[3]),
      startTicks: fields[19],
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return undefined;
    throw error;
  }
}
export function processes() {
  const rows = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const row = readProcess(Number(name));
    if (row) rows.push(row);
  }
  return rows;
}
export function alive(row) {
  return row.state !== 'Z' && row.state !== 'X';
}
export function verifyGroupQuiescence(
  group,
  session,
  probe = { processes, counter: () => readFileSync('/proc/sys/kernel/ns_last_pid', 'utf8').trim() },
) {
  try {
    const before = probe.counter();
    if (!/^\d+$/.test(before)) throw Error('Invalid Linux PID allocation counter');
    const membersOf = (rows) =>
      rows.filter((p) => p.pid !== group && p.group === group && p.session === session && alive(p));
    const first = membersOf(probe.processes());
    if (first.length) return { state: 'occupied', members: first };
    const second = membersOf(probe.processes());
    const after = probe.counter();
    if (second.length) return { state: 'occupied', members: second };
    if (before !== after)
      return {
        state: 'unknown',
        members: [],
        reason: 'PID allocation changed during group-quiescence verification',
      };
    return { state: 'quiescent', members: [] };
  } catch (error) {
    return { state: 'unknown', members: [], reason: String(error) };
  }
}
export function bootId() {
  return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
}
