/** 加载 levels/ 下的全部关卡。 */
import chaptersText from '../levels/chapters.json?raw';
import { buildLevels, parseChapters, type Chapter, type Level, type LevelInput } from './level-format';

export interface LoadedLevel extends Level {
  /** 实验文件的内容，按文件名 */
  fileContents: Record<string, string>;
}

export interface Content {
  chapters: Chapter[];
  levels: LoadedLevel[];
  errors: string[];
}

/**
 * files：路径 -> 文本，路径形如 `../levels/01-slug/level.json`。
 * 跳过下划线开头的文件夹和更深层的文件（如 solution/）。
 */
export function loadFromFiles(files: Record<string, string>, chaptersJson: string): Content {
  const chap = parseChapters(chaptersJson);
  const byFolder = new Map<string, Record<string, string>>();
  for (const [path, text] of Object.entries(files)) {
    const m = /(?:^|\/)levels\/([^/]+)\/([^/]+)$/.exec(path);
    if (!m || m[1].startsWith('_')) continue;
    const dir = byFolder.get(m[1]) ?? {};
    dir[m[2]] = text;
    byFolder.set(m[1], dir);
  }
  const inputs: LevelInput[] = [...byFolder.entries()].map(([folder, dir]) => ({
    folder,
    json: dir['level.json'] ?? null,
    md: dir['level.md'] ?? null,
    files: Object.keys(dir),
  }));
  const built = buildLevels(inputs, chap.chapters);
  const levels: LoadedLevel[] = built.levels.map((l) => {
    const dir = byFolder.get(l.folder) as Record<string, string>;
    const fileContents: Record<string, string> = {};
    for (const f of l.lab.files) fileContents[f] = dir[f];
    return { ...l, fileContents };
  });
  return { chapters: chap.chapters, levels, errors: [...chap.errors, ...built.errors] };
}

const modules = import.meta.glob(['../levels/*/*', '!../levels/_*/*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const content: Content = loadFromFiles(modules, chaptersText);
