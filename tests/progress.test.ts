import { describe, expect, it } from 'vitest';
import {
  continueTarget, emptyProgress, isUnlocked, nextLevel, nodeStates, stats, withHints, withRevealed, withSolved,
  type Progress,
} from '../src/progress';

const L = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const P = (o: Record<string, { status?: 'solved' | 'revealed'; hints: number }>): Progress => ({ levels: o });

describe('解锁规则', () => {
  it('新玩家：只有第一关开放', () => {
    expect(nodeStates(L, emptyProgress())).toEqual(['current', 'locked', 'locked', 'locked']);
  });
  it('已过放行下一关', () => {
    expect(nodeStates(L, P({ a: { status: 'solved', hints: 0 } }))).toEqual(['solved', 'current', 'locked', 'locked']);
  });
  it('看过答案同样放行', () => {
    expect(nodeStates(L, P({ a: { status: 'revealed', hints: 3 } }))).toEqual(['revealed', 'current', 'locked', 'locked']);
  });
  it('只揭开了提示但没过，不放行', () => {
    expect(nodeStates(L, P({ a: { hints: 2 } }))).toEqual(['current', 'locked', 'locked', 'locked']);
  });
  it('中间有未过的：后面没过的锁住，已经过了的保持开放（中间插入新关卡时不把玩家锁回去）', () => {
    const p = P({ a: { status: 'solved', hints: 0 }, c: { status: 'solved', hints: 0 } });
    expect(nodeStates(L, p)).toEqual(['solved', 'current', 'solved', 'locked']);
    expect(isUnlocked(L, p, 'c')).toBe(true);
    expect(isUnlocked(L, p, 'd')).toBe(false);
    expect(isUnlocked(L, p, 'b')).toBe(true);
    expect(isUnlocked(L, p, 'nope')).toBe(false);
  });
  it('全部过关', () => {
    const p = P(Object.fromEntries(L.map((l) => [l.id, { status: 'solved' as const, hints: 0 }])));
    expect(nodeStates(L, p)).toEqual(['solved', 'solved', 'solved', 'solved']);
  });
  it('没有关卡', () => expect(nodeStates([], emptyProgress())).toEqual([]));
});

describe('继续', () => {
  it('跳到第一个未过的开放关卡', () => {
    expect(continueTarget(L, emptyProgress())?.id).toBe('a');
    expect(continueTarget(L, P({ a: { status: 'solved', hints: 0 }, b: { status: 'revealed', hints: 1 } }))?.id).toBe('c');
  });
  it('全部过关时为 null', () => {
    const p = P(Object.fromEntries(L.map((l) => [l.id, { status: 'revealed' as const, hints: 1 }])));
    expect(continueTarget(L, p)).toBeNull();
  });
  it('没有关卡时为 null', () => expect(continueTarget([], emptyProgress())).toBeNull());
  it('nextLevel', () => {
    expect(nextLevel(L, 'a')?.id).toBe('b');
    expect(nextLevel(L, 'd')).toBeNull();
    expect(nextLevel(L, 'zzz')).toBeNull();
  });
});

describe('统计与更新', () => {
  it('stats', () => {
    const p = P({ a: { status: 'solved', hints: 0 }, b: { status: 'revealed', hints: 2 }, c: { hints: 1 } });
    expect(stats(L, p)).toEqual({ total: 4, solved: 1, revealed: 1, done: 2 });
  });
  it('提示数只增不减，且不超过上限', () => {
    let p = withHints(emptyProgress(), 'a', 2, 3);
    expect(p.levels.a.hints).toBe(2);
    p = withHints(p, 'a', 1, 3);
    expect(p.levels.a.hints).toBe(2);
    p = withHints(p, 'a', 9, 3);
    expect(p.levels.a.hints).toBe(3);
  });
  it('看过答案后答对升级为已过；已过不会被看答案降级', () => {
    let p = withRevealed(emptyProgress(), 'a');
    expect(p.levels.a.status).toBe('revealed');
    p = withSolved(p, 'a');
    expect(p.levels.a.status).toBe('solved');
    p = withRevealed(p, 'a');
    expect(p.levels.a.status).toBe('solved');
  });
  it('不修改入参', () => {
    const p = emptyProgress();
    withSolved(p, 'a');
    expect(p.levels).toEqual({});
  });
});
