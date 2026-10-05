export interface ProcessEvidence {
  pid: number;
  state: string;
  threadCount?: number;
  ppid: number;
  group: number;
  session: number;
  startTicks: string;
}
export function readProcess(pid: number): ProcessEvidence | undefined;
export function processes(): ProcessEvidence[];
export function alive(row: ProcessEvidence): boolean;
export function dead(row: ProcessEvidence): boolean;
export function verifyGroupQuiescence(
  group: number,
  session: number,
  probe?: { processes: () => ProcessEvidence[]; counter: () => string },
): { state: 'quiescent' | 'occupied' | 'unknown'; members: ProcessEvidence[]; reason?: string };
export function bootId(): string;
