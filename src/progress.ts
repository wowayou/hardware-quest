/** 进度：解锁规则与统计。纯函数，不碰存储。 */
import type { Level } from './level-format';

export type Status = 'solved' | 'revealed';
export interface LevelProgress {
  status?: Status;
  /** 已揭开的提示数 */
  hints: number;
}
export interface Progress {
  levels: Record<string, LevelProgress>;
}
export type NodeState = 'solved' | 'revealed' | 'current' | 'locked';

export const emptyProgress = (): Progress => ({ levels: {} });

export const isDone = (p: LevelProgress | undefined): boolean => p?.status === 'solved' || p?.status === 'revealed';

/**
 * 线性解锁：第一关开放；之前的关卡全部"已过"或"看过答案"，这一关才开放。
 * 自己已经过了的关卡永远开放：以后在中间插入新关卡，不会把玩家过了的关卡锁回去。
 */
export function nodeStates(levels: Pick<Level, 'id'>[], progress: Progress): NodeState[] {
  let allBeforeDone = true;
  return levels.map((l) => {
    const p = progress.levels[l.id];
    const open = allBeforeDone || isDone(p);
    if (!isDone(p)) allBeforeDone = false;
    if (!open) return 'locked';
    return p?.status ?? 'current';
  });
}

export function isUnlocked(levels: Pick<Level, 'id'>[], progress: Progress, id: string): boolean {
  const i = levels.findIndex((l) => l.id === id);
  return i >= 0 && nodeStates(levels, progress)[i] !== 'locked';
}

/** 「继续」的目标：第一个没过的开放关卡；全部过关时返回 null。 */
export function continueTarget<T extends Pick<Level, 'id'>>(levels: T[], progress: Progress): T | null {
  const states = nodeStates(levels, progress);
  const i = states.indexOf('current');
  return i >= 0 ? levels[i] : null;
}

/** 下一关（线性顺序里的下一个），没有则 null。 */
export function nextLevel<T extends Pick<Level, 'id'>>(levels: T[], id: string): T | null {
  const i = levels.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < levels.length ? levels[i + 1] : null;
}

export interface Stats {
  total: number;
  solved: number;
  revealed: number;
  /** solved + revealed */
  done: number;
}

export function stats(levels: Pick<Level, 'id'>[], progress: Progress): Stats {
  let solved = 0;
  let revealed = 0;
  for (const l of levels) {
    const s = progress.levels[l.id]?.status;
    if (s === 'solved') solved++;
    else if (s === 'revealed') revealed++;
  }
  return { total: levels.length, solved, revealed, done: solved + revealed };
}

/* 以下返回新对象，不修改入参 */

function update(progress: Progress, id: string, f: (p: LevelProgress) => LevelProgress): Progress {
  const old = progress.levels[id] ?? { hints: 0 };
  return { levels: { ...progress.levels, [id]: f(old) } };
}

/** 记录已揭开的提示数（只增不减，不超过 max）。 */
export function withHints(progress: Progress, id: string, count: number, max: number): Progress {
  const c = Math.max(0, Math.min(Math.floor(count), max));
  return update(progress, id, (p) => ({ ...p, hints: Math.max(p.hints, c) }));
}

/** 答对：记为已过（看过答案的也升级为已过）。 */
export function withSolved(progress: Progress, id: string): Progress {
  return update(progress, id, (p) => ({ ...p, status: 'solved' }));
}

/** 看答案：记为看过答案；已经"已过"的不降级。 */
export function withRevealed(progress: Progress, id: string): Progress {
  return update(progress, id, (p) => (p.status === 'solved' ? p : { ...p, status: 'revealed' }));
}
