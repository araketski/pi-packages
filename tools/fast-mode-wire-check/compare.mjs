#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length < 1) {
  console.error('usage: compare.mjs <run-dir> [run-dir...]');
  process.exit(2);
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { parse_error: String(error), line: index + 1 };
      }
    });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function maybeJsonFromSse(text) {
  if (!text) return [];
  const out = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // ignore non-JSON SSE records
    }
  }
  return out;
}

function websocketJsonMessages(flow, fromClient) {
  return (flow.websocket?.messages ?? [])
    .filter((message) => fromClient === undefined || message.from_client === fromClient)
    .map((message) => message.json)
    .filter(isObject);
}

function deepFindRequestObject(value) {
  if (!isObject(value) && !Array.isArray(value)) return undefined;
  if (isObject(value) && typeof value.model === 'string') return value;
  if (isObject(value) && isObject(value.request) && typeof value.request.model === 'string') {
    return value.request;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = deepFindRequestObject(child);
    if (found) return found;
  }
  return undefined;
}

function looksLikeProviderRequest(flow) {
  const req = flow.request ?? {};
  const json = req.json;
  const text = req.body_text ?? '';
  const url = req.url ?? '';
  if (flow.kind === 'websocket' && /\/codex\/responses|\/responses/u.test(url)) return true;
  if (req.method !== 'POST') return false;
  if (isObject(json) && typeof json.model === 'string') return true;
  if (/"model"\s*:/u.test(text)) return true;
  return /\/responses|\/chat\/completions/u.test(url) && !/analytics-events/u.test(url);
}

function extractBody(flow) {
  const req = flow.request ?? {};
  if (isObject(req.json)) return req.json;
  const text = req.body_text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      // continue to websocket messages
    }
  }
  for (const message of websocketJsonMessages(flow, true)) {
    const found = deepFindRequestObject(message);
    if (found) return found;
  }
  return undefined;
}

function summarizeResponse(flow) {
  const res = flow.response ?? {};
  const text = res.body_text ?? '';
  const events = [
    ...maybeJsonFromSse(text),
    ...websocketJsonMessages(flow, false),
  ];
  const eventTypes = [...new Set(events.map((event) => event.type ?? event.msg?.type ?? event.event).filter(Boolean))];
  const responseIds = [...new Set(events.map((event) => event.response?.id ?? event.id ?? event.msg?.id).filter(Boolean))];
  const errors = events
    .map((event) => event.error ?? event.response?.error ?? event.msg?.error)
    .filter(Boolean)
    .map((error) => (typeof error === 'string' ? error : JSON.stringify(error)));
  if (isObject(res.json)) {
    if (res.json.error) errors.push(JSON.stringify(res.json.error));
    if (res.json.id) responseIds.push(res.json.id);
  }
  return {
    status: res.status_code,
    reason: res.reason,
    responseIds: [...new Set(responseIds)],
    eventTypes,
    errors,
    websocketMessages: flow.websocket?.message_count,
    responseDecodeError: res.decode_error,
  };
}

function summarizeRun(dir) {
  const flows = readJsonl(join(dir, 'flows.jsonl'));
  const candidates = flows.filter(looksLikeProviderRequest);
  const chosen = candidates.find((flow) => {
    const body = extractBody(flow);
    return isObject(body) && (body.service_tier || body.speed);
  }) ?? candidates.find((flow) => isObject(extractBody(flow))) ?? candidates.at(-1);
  const body = chosen ? extractBody(chosen) : undefined;
  const normalized = isObject(body)
    ? {
        model: body.model,
        service_tier: body.service_tier,
        speed: body.speed,
        stream: body.stream,
        store: body.store,
        reasoning: body.reasoning,
        toolCount: Array.isArray(body.tools) ? body.tools.length : undefined,
        inputKind: Array.isArray(body.input) ? 'array' : typeof body.input,
        topLevelKeys: Object.keys(body).sort(),
      }
    : undefined;
  if (chosen) {
    writeFileSync(join(dir, 'selected-request.normalized.json'), JSON.stringify(normalized, null, 2));
    if (isObject(body)) writeFileSync(join(dir, 'selected-request.full.json'), JSON.stringify(body, null, 2));
  }
  return {
    name: basename(dir),
    dir,
    status: existsSync(join(dir, 'status.txt')) ? readFileSync(join(dir, 'status.txt'), 'utf8').trim() : 'missing',
    flowCount: flows.length,
    candidateCount: candidates.length,
    selectedUrl: chosen?.request?.url,
    requestDecodeError: chosen?.request?.decode_error,
    normalized,
    response: chosen ? summarizeResponse(chosen) : undefined,
    stdout: existsSync(join(dir, 'stdout.txt')) ? readFileSync(join(dir, 'stdout.txt'), 'utf8').trim().slice(0, 1000) : '',
    stderr: existsSync(join(dir, 'stderr.txt')) ? readFileSync(join(dir, 'stderr.txt'), 'utf8').trim().slice(0, 1000) : '',
  };
}

const runs = dirs.map(summarizeRun);
const byName = Object.fromEntries(runs.map((run) => [run.name, run]));

function mdCode(value) {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

const lines = [];
lines.push('# Fast-mode wire comparison');
lines.push('');
lines.push('| run | exit | provider requests | selected status | model | service_tier | speed | endpoint |');
lines.push('|---|---:|---:|---:|---|---|---|---|');
for (const run of runs) {
  lines.push(
    `| ${run.name} | ${run.status} | ${run.candidateCount}/${run.flowCount} | ${run.response?.status ?? ''} | ${run.normalized?.model ?? ''} | ${run.normalized?.service_tier ?? ''} | ${run.normalized?.speed ?? ''} | ${run.selectedUrl ?? ''} |`,
  );
}
lines.push('');

if (byName['pi-off'] && byName['pi-fast']) {
  lines.push('## Pi off vs Pi fast');
  lines.push('');
  lines.push('- Expected: `pi-off` has no `service_tier`; `pi-fast` has `service_tier: "priority"` for eligible OpenAI/Codex Responses models.');
  lines.push(`- Observed off service_tier: ${JSON.stringify(byName['pi-off'].normalized?.service_tier)}`);
  lines.push(`- Observed fast service_tier: ${JSON.stringify(byName['pi-fast'].normalized?.service_tier)}`);
  lines.push('');
}

if (byName['pi-fast'] && byName.codex) {
  lines.push('## Pi fast vs Codex CLI');
  lines.push('');
  lines.push('- Compare request shape, success status, and provider errors. Dynamic ids/cache/session fields are intentionally ignored in the normalized view.');
  lines.push(`- Pi fast response errors: ${JSON.stringify(byName['pi-fast'].response?.errors ?? [])}`);
  lines.push(`- Codex response errors: ${JSON.stringify(byName.codex.response?.errors ?? [])}`);
  lines.push('');
}

for (const run of runs) {
  lines.push(`## ${run.name}`);
  lines.push('');
  lines.push(`Directory: \`${run.dir}\``);
  lines.push('');
  lines.push('Normalized selected request:');
  lines.push(mdCode(run.normalized ?? null));
  lines.push('Response summary:');
  lines.push(mdCode(run.response ?? null));
  if (run.requestDecodeError || run.response?.responseDecodeError) {
    lines.push(`Decode warnings: request=${run.requestDecodeError ?? 'none'}, response=${run.response?.responseDecodeError ?? 'none'}`);
    lines.push('');
  }
  if (run.stderr) {
    lines.push('<details><summary>stderr excerpt</summary>');
    lines.push('');
    lines.push('```text');
    lines.push(run.stderr);
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }
}

console.log(lines.join('\n'));
