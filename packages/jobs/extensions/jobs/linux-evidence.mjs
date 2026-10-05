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
export function bootId() {
  return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
}
