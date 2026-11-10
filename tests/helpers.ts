import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelInput } from '../src/level-format';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 读取文件夹里的直接子文件（不含子文件夹）。 */
export function readFlat(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (!statSync(p).isDirectory()) out[name] = readFileSync(p, 'utf8');
  }
  return out;
}

export const chaptersJson = (): string => readFileSync(`${ROOT}tests/fixtures/chapters.json`, 'utf8');

export function fixture(name: string, folder = name): LevelInput {
  const dir = readFlat(`${ROOT}tests/fixtures/${name}`);
  return { folder, json: dir['level.json'] ?? null, md: dir['level.md'] ?? null, files: Object.keys(dir) };
}

/** 修改 level.json 后返回新的输入。 */
export function withJson(input: LevelInput, edit: (j: Record<string, any>) => void): LevelInput {
  const j = JSON.parse(input.json as string);
  edit(j);
  return { ...input, json: JSON.stringify(j) };
}
