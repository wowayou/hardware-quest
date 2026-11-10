import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, isReadOnly, loadProgress, PREFIX, saveProgress } from '../src/storage';

const KEY = `${PREFIX}progress`;

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

let mem: MemStorage;
beforeEach(() => {
  mem = new MemStorage();
  vi.stubGlobal('localStorage', mem);
});
afterEach(() => vi.unstubAllGlobals());

const P = { levels: { a: { status: 'solved' as const, hints: 2 }, b: { hints: 1 } } };

describe('storage', () => {
  it('键名带前缀和版本', () => expect(PREFIX).toBe('hardware-quest:v1:'));
  it('没有数据时是空进度', () => {
    expect(loadProgress()).toEqual({ progress: { levels: {} }, readOnly: false });
  });
  it('存了再读', () => {
    expect(saveProgress(P)).toBe(true);
    expect(loadProgress().progress).toEqual(P);
    expect(JSON.parse(mem.data.get(KEY) as string).version).toBe(1);
  });
  it('清除', () => {
    saveProgress(P);
    expect(clearProgress()).toBe(true);
    expect(loadProgress().progress).toEqual({ levels: {} });
  });
  it('localStorage 抛异常：读写都不抛，回退默认', () => {
    const boom = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(loadProgress().progress).toEqual({ levels: {} });
    expect(saveProgress(P)).toBe(false);
    expect(clearProgress()).toBe(false);
  });
  it('访问 localStorage 本身就抛（被禁用）', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    expect(loadProgress().progress).toEqual({ levels: {} });
    expect(saveProgress(P)).toBe(false);
  });
  it('坏 JSON 回退默认', () => {
    mem.setItem(KEY, '{oops');
    expect(loadProgress()).toEqual({ progress: { levels: {} }, readOnly: false });
  });
  it('形状不对回退默认', () => {
    for (const bad of ['null', '[]', '"x"', '42', '{"levels":{}}', '{"version":"1","levels":{}}', '{"version":1}', '{"version":0,"levels":{}}', '{"version":1,"levels":[]}']) {
      mem.setItem(KEY, bad);
      expect(loadProgress().progress, bad).toEqual({ levels: {} });
    }
  });
  it('单条记录坏了只丢那一条', () => {
    mem.setItem(KEY, JSON.stringify({ version: 1, levels: { ok: { status: 'revealed', hints: 3 }, bad1: { hints: -1 }, bad2: { status: 'won', hints: 1 }, bad3: 5, bad4: { hints: 1.5 } } }));
    expect(loadProgress().progress).toEqual({ levels: { ok: { status: 'revealed', hints: 3 } } });
  });
  it('未来版本的数据：可读，但只读、不覆盖、不清除', () => {
    const future = JSON.stringify({ version: 2, levels: { a: { status: 'solved', hints: 1 } }, extra: true });
    mem.setItem(KEY, future);
    const r = loadProgress();
    expect(r.readOnly).toBe(true);
    expect(isReadOnly()).toBe(true);
    expect(r.progress.levels.a.status).toBe('solved');
    expect(saveProgress(P)).toBe(false);
    expect(clearProgress()).toBe(false);
    expect(mem.getItem(KEY)).toBe(future);
  });
  it('未来版本且形状无法理解：也不覆盖', () => {
    mem.setItem(KEY, JSON.stringify({ version: 3, levels: 'weird' }));
    const r = loadProgress();
    expect(r.readOnly).toBe(true);
    expect(r.progress).toEqual({ levels: {} });
    expect(saveProgress(P)).toBe(false);
    expect(JSON.parse(mem.getItem(KEY) as string).version).toBe(3);
  });
});
