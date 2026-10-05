// This process is the pinned Linux session/group leader. Only it sends group signals.
import { spawn } from 'node:child_process';
import { alive, bootId, processes, readProcess, verifyGroupQuiescence } from './linux-evidence.mjs';

const own = process.pid;
let child,
  outcome,
  timer,
  escalation,
  grace = 5000,
  stopping = false,
  ended = false;
let evidenceError;
let escalationWait;
let forcing = false;
let quiescenceUnconfirmedSince;
const known = new Map();
process.on('SIGTERM', () => {}); // Keep the group leader alive throughout graceful stop.
const send = (message) => {
  if (process.connected)
    process.send(message, (error) => {
      if (error) evidenceError = String(error);
    });
};
function sample() {
  const all = processes();
  const byPid = new Map(all.map((p) => [p.pid, p]));
  for (const [pid, startTicks] of known) {
    const current = byPid.get(pid) ?? readProcess(pid);
    if (!current || current.startTicks !== startTicks || !alive(current)) known.delete(pid);
    else if (!byPid.has(pid)) all.push(current); // Preserve directly verified live escaped identities.
  }
  const inGroup = all.filter((p) => p.group === own && p.session === own && p.pid !== own);
  const descendants = new Set([
    own,
    ...inGroup.filter(alive).map((p) => p.pid),
    ...all.filter((p) => known.get(p.pid) === p.startTicks).map((p) => p.pid),
  ]);
  // Establish ancestry without treating process names as ownership.
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of all)
      if (!descendants.has(p.pid) && descendants.has(p.ppid)) {
        descendants.add(p.pid);
        changed = true;
      }
  }
  for (const p of all)
    if (descendants.has(p.pid) && p.pid !== own && alive(p)) {
      if (known.size >= 1024 && !known.has(p.pid))
        evidenceError = 'descendant evidence limit exceeded';
      else known.set(p.pid, p.startTicks);
    }
  const escaped = all.filter(
    (p) => known.get(p.pid) === p.startTicks && alive(p) && (p.group !== own || p.session !== own),
  );
  return { group: inGroup.filter(alive), escaped };
}
function finish(state) {
  if (ended) return;
  ended = true;
  clearInterval(timer);
  clearTimeout(escalation);
  clearTimeout(escalationWait);
  const message = { kind: 'finished', execution: state };
  if (process.connected)
    process.send(message, () => {
      process.disconnect();
      process.exit(0);
    });
  else process.exit(0);
}
function poll() {
  try {
    const s = sample();
    send({ kind: 'sample', escaped: s.escaped, remainingLiveGroup: s.group, evidenceError });
    if (outcome && s.group.length === 0) {
      const confirmation = verifyGroupQuiescence(own, own);
      if (confirmation.state !== 'quiescent') {
        for (const p of confirmation.members) {
          if (known.size < 1024 || known.has(p.pid)) known.set(p.pid, p.startTicks);
          else evidenceError = 'descendant evidence limit exceeded';
        }
        send({ kind: 'sample', remainingLiveGroup: confirmation.members });
        if (confirmation.state === 'occupied') {
          quiescenceUnconfirmedSince = undefined;
          return;
        }
        quiescenceUnconfirmedSince ??= Date.now();
        if (Date.now() - quiescenceUnconfirmedSince >= 1000)
          send({
            kind: 'uncertain',
            reason: confirmation.reason ?? 'Owned group is not yet confirmed quiescent',
          });
        return; // Retain the pinned supervisor and its owned-group stop path.
      }
      finish(
        s.escaped.length || evidenceError
          ? {
              state: 'unknown',
              reason:
                evidenceError ??
                'observed escaped descendants remain alive; group termination is not complete ownership verification',
            }
          : { state: 'terminal', outcome },
      );
    } else quiescenceUnconfirmedSince = undefined;
  } catch (error) {
    evidenceError = String(error);
    send({ kind: 'sample', evidenceError });
    // Missing evidence neither proves death nor permits releasing the pinned stop authority.
    send({ kind: 'uncertain', reason: evidenceError });
  }
}
function forceGroup() {
  if (ended || forcing) return;
  forcing = true;
  clearTimeout(escalationWait);
  const kill = () => {
    if (ended) return;
    try {
      process.kill(-own, 'SIGKILL');
    } catch (error) {
      finish({ state: 'unknown', reason: 'group escalation failed: ' + String(error) });
    }
  };
  const flush = () => {
    if (ended) return;
    if (!process.connected) {
      kill();
      return;
    }
    const observed = outcome;
    process.send({ kind: 'escalating', outcome: observed }, (error) => {
      if (error) {
        kill();
        return;
      }
      // An exit arriving while this frame was buffered must be flushed before killing its observer.
      if (outcome !== observed) flush();
      else kill();
    });
  };
  flush();
}
function escalate() {
  poll();
  if (ended) return;
  if (outcome || !child) {
    forceGroup();
    return;
  }
  // Exclusive Node child reaping pins this directly owned child's PID until its exit callback.
  child.once('exit', forceGroup);
  escalationWait = setTimeout(forceGroup, 100);
  child.kill('SIGKILL');
}
function stop(ms) {
  if (stopping || ended) return;
  stopping = true;
  grace = ms;
  poll(); // A proven completed command/group wins over late cancellation.
  if (ended) return;
  try {
    // No check-then-kill: this live caller is itself the group leader.
    process.kill(-own, 'SIGTERM');
    escalation = setTimeout(escalate, grace);
  } catch (error) {
    finish({ state: 'unknown', reason: 'group stop failed: ' + String(error) });
  }
}
process.on('message', (message) => {
  if (message.kind === 'stop') {
    stop(message.graceMs);
    return;
  }
  if (message.kind !== 'launch' || child || ended) return;
  const input = message.input;
  grace = input.stopGraceMs;
  const environment = { ...input.env };
  delete environment.NODE_CHANNEL_FD;
  delete environment.NODE_CHANNEL_SERIALIZATION_MODE;
  try {
    const supervisor = readProcess(own);
    if (!supervisor || supervisor.group !== own || supervisor.session !== own)
      throw Error('supervisor is not its own Linux session/process-group leader');
    send({ kind: 'identity', bootId: bootId(), supervisor });
    child = spawn(input.shell, ['-c', input.command], {
      cwd: input.cwd,
      env: environment,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', (error) => {
      if (!child.pid) {
        outcome = { kind: 'launch-failed', reason: String(error) };
        poll();
      } else {
        evidenceError = String(error);
        send({ kind: 'uncertain', reason: evidenceError, evidenceError });
      }
    });
    child.on('spawn', () => {
      send({ kind: 'command', commandPid: child.pid, command: readProcess(child.pid) });
      poll();
    });
    child.on('exit', (code, signal) => {
      outcome =
        code === null
          ? { kind: 'terminated', signal: signal ?? 'unknown' }
          : { kind: 'exit', exitCode: code };
      send({ kind: 'outcome', outcome });
      poll();
    });
    timer = setInterval(poll, 25);
  } catch (error) {
    finish({ state: 'terminal', outcome: { kind: 'launch-failed', reason: String(error) } });
  }
});
process.on('disconnect', () => stop(grace));
