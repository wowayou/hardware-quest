/** localStorage 读写：被禁用、数据损坏、形状不对都回退默认值，永远不抛异常。 */
import { emptyProgress, type LevelProgress, type Progress } from './progress';

export const STORAGE_VERSION = 1;
export const PREFIX = `hardware-quest:v${STORAGE_VERSION}:`;
const KEY = PREFIX + 'progress';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizeLevels(raw: unknown): Progress | null {
  if (!isObj(raw)) return null;
  const levels: Record<string, LevelProgress> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    const hints = v.hints;
    const status = v.status;
    if (typeof hints !== 'number' || !Number.isInteger(hints) || hints < 0) continue;
    if (status !== undefined && status !== 'solved' && status !== 'revealed') continue;
    levels[id] = status === undefined ? { hints } : { status, hints };
  }
  return { levels };
}

export interface Loaded {
  progress: Progress;
  /** 数据来自更新的版本：本次只读，不会覆盖它 */
  readOnly: boolean;
}

let readOnly = false;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadProgress(): Loaded {
  readOnly = false;
  try {
    const raw = storage()?.getItem(KEY);
    if (raw == null) return { progress: emptyProgress(), readOnly };
    const data: unknown = JSON.parse(raw);
    if (!isObj(data) || typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
      return { progress: emptyProgress(), readOnly };
    }
    const progress = sanitizeLevels(data.levels);
    if (data.version > STORAGE_VERSION) {
      readOnly = true;
      return { progress: progress ?? emptyProgress(), readOnly };
    }
    return { progress: progress ?? emptyProgress(), readOnly };
  } catch {
    return { progress: emptyProgress(), readOnly };
  }
}

/** 保存进度；成功返回 true。只读模式或存储不可用时返回 false。 */
export function saveProgress(progress: Progress): boolean {
  if (readOnly) return false;
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(KEY, JSON.stringify({ version: STORAGE_VERSION, levels: progress.levels }));
    return true;
  } catch {
    return false;
  }
}

/** 清除进度。只读模式（更新版本的数据）不清除。 */
export function clearProgress(): boolean {
  if (readOnly) return false;
  try {
    const s = storage();
    if (!s) return false;
    s.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export const isReadOnly = (): boolean => readOnly;
