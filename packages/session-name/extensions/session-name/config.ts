import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export interface Config {
  provider: string | null;
  model: string | null;
  thinking: (typeof thinkingLevels)[number];
  setTitle: boolean;
}
export const defaults: Config = { provider: null, model: null, thinking: 'off', setTitle: true };

// @mara implements REQ-SESSION-NAME-MODEL
export function loadConfig(warn: (message: string) => void): Config {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(getAgentDir(), 'session-name.json'), 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('expected an object');
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
    ) {
      throw new Error('provider and model must both be nonempty strings or both unset');
    }
    const thinking = data.thinking === undefined ? defaults.thinking : data.thinking;
    if (!thinkingLevels.includes(thinking as Config['thinking']))
      throw new Error('invalid thinking level');
    const setTitle = data.setTitle === undefined ? defaults.setTitle : data.setTitle;
    if (typeof setTitle !== 'boolean') throw new Error('setTitle must be boolean');
    return {
      provider: provider as string | null,
      model: model as string | null,
      thinking: thinking as Config['thinking'],
      setTitle,
    };
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      warn('session-name: invalid or unreadable session-name.json; using defaults');
    }
    return { ...defaults };
  }
}
