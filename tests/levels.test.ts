import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { loadFromFiles } from '../src/content';
import { readFlat, ROOT } from './helpers';
import { readFileSync } from 'node:fs';

const LEVELS = `${ROOT}levels`;
const chapters = readFileSync(`${LEVELS}/chapters.json`, 'utf8');

function collect(folders: Array<[string, string]>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [name, dir] of folders) {
    for (const [f, text] of Object.entries(readFlat(dir))) files[`../levels/${name}/${f}`] = text;
  }
  return files;
}

describe('仓库里的真实关卡', () => {
  const folders = readdirSync(LEVELS)
    .filter((n) => !n.startsWith('_') && statSync(`${LEVELS}/${n}`).isDirectory())
    .sort();

  it('chapters.json 合法', () => {
    expect(loadFromFiles({}, chapters).errors).toEqual([]);
  });

  it(`全部通过校验（现有 ${folders.length} 关；没有关卡也通过）`, () => {
    const r = loadFromFiles(collect(folders.map((n) => [n, `${LEVELS}/${n}`])), chapters);
    expect(r.errors).toEqual([]);
    expect(r.levels.map((l) => l.folder)).toEqual(folders);
    // 每关的实验文件内容都读到了
    for (const l of r.levels) for (const f of l.lab.files) expect(l.fileContents[f]).toBeTypeOf('string');
  });

  it('每个关卡文件夹的 solution/ 不会被当成关卡文件', () => {
    for (const n of folders) {
      if (!existsSync(`${LEVELS}/${n}/solution`)) continue;
      const files = collect([[n, `${LEVELS}/${n}`]]);
      expect(Object.keys(files).some((k) => k.includes('/solution/'))).toBe(false);
    }
  });

  it('_template 除 id 外也能通过校验（用另一个文件夹名加载）', () => {
    const r = loadFromFiles(collect([['99-template', `${LEVELS}/_template`]]), chapters);
    expect(r.errors).toEqual([]);
    expect(r.levels).toHaveLength(1);
  });

  it('下划线文件夹和 solution/ 在加载时被跳过', () => {
    const files = {
      '../levels/_template/level.json': '{',
      '../levels/_template/level.md': '',
      '../levels/01-x/solution/level.json': '{',
    };
    const r = loadFromFiles(files, chapters);
    expect(r.levels).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
