import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export interface ActivityConfig {
  provider: string | null;
  model: string | null;
  thinking: (typeof thinkingLevels)[number];
  intervalTurns: number;
}
export const defaults: ActivityConfig = {
  provider: null,
  model: null,
  thinking: 'off',
  intervalTurns: 5,
};

// @mara implements REQ-SESSION-ACTIVITY-MODEL
export function loadConfig(warn: (message: string) => void): ActivityConfig {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(getAgentDir(), 'session-activity.json'), 'utf8'),
    );
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('expected object');
    const data = raw as Record<string, unknown>;
    if (Object.keys(data).some((key) => !Object.hasOwn(defaults, key)))
      throw new Error('unknown setting');
    const provider = data.provider ?? null;
    const model = data.model ?? null;
    if (
      !(
        (provider === null && model === null) ||
        (typeof provider === 'string' &&
          provider.trim() &&
          typeof model === 'string' &&
          model.trim())
      )
    )
      throw new Error('provider/model must be a complete pair');
    const thinking = data.thinking === undefined ? defaults.thinking : data.thinking;
    const intervalTurns =
      data.intervalTurns === undefined ? defaults.intervalTurns : data.intervalTurns;
    if (!thinkingLevels.includes(thinking as ActivityConfig['thinking']))
      throw new Error('invalid thinking');
    if (
      typeof intervalTurns !== 'number' ||
      !Number.isSafeInteger(intervalTurns) ||
      intervalTurns < 1
    )
      throw new Error('intervalTurns must be a positive safe integer');
    return {
      provider: provider as string | null,
      model: model as string | null,
      thinking: thinking as ActivityConfig['thinking'],
      intervalTurns,
    };
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      warn('session-activity: invalid or unreadable session-activity.json; using defaults');
    return { ...defaults };
  }
}
