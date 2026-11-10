/**
 * 关卡格式解析与校验。纯函数，不碰 DOM。
 * 规则以 docs/LEVEL-FORMAT.md 为准；所有错误信息都是中文，并指明哪一关的哪个字段。
 */

export type LabTool = 'falstad' | 'wokwi' | 'none';

export interface Chapter {
  id: string;
  title: string;
  intro: string;
}

export type Answer =
  | { type: 'text'; accept: string[]; format?: string }
  | { type: 'number'; value: number; tolerance: number; unit?: string };

export interface Lab {
  tool: LabTool;
  files: string[];
  /** 仅 wokwi；默认 arduino-uno */
  board: string;
  /** 仅 wokwi；已发布工程的链接 */
  url?: string;
}

export interface Level {
  /** 稳定 id（进度按它保存） */
  id: string;
  /** 文件夹名（决定顺序） */
  folder: string;
  chapter: string;
  title: string;
  concept: string;
  card: string;
  lab: Lab;
  answer: Answer;
  story: string;
  knowledge: string;
  task: string;
  /** 已按编号排序 */
  hints: string[];
  review: string;
}

export interface ParseResult {
  level: Level | null;
  errors: string[];
}

export interface LevelInput {
  folder: string;
  /** level.json 的文本；文件不存在时为 null */
  json: string | null;
  /** level.md 的文本；文件不存在时为 null */
  md: string | null;
  /** 关卡文件夹里的文件名（不含 solution/ 子文件夹里的） */
  files: string[];
}

export const DEFAULT_BOARD = 'arduino-uno';
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOARD_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const WOKWI_URL_RE = /^https:\/\/wokwi\.com\/projects\/\d+$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/* ---------------- chapters.json ---------------- */

export function parseChapters(text: string): { chapters: Chapter[]; errors: string[] } {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (e) {
    return { chapters: [], errors: [`chapters.json 不是合法的 JSON：${(e as Error).message}`] };
  }
  if (!Array.isArray(data)) return { chapters: [], errors: ['chapters.json 必须是数组'] };
  const chapters: Chapter[] = [];
  const seen = new Set<string>();
  data.forEach((c, i) => {
    const where = `chapters.json 第 ${i + 1} 项`;
    if (!isObj(c)) {
      errors.push(`${where} 必须是对象`);
      return;
    }
    let ok = true;
    for (const k of ['id', 'title', 'intro']) {
      if (!isStr(c[k])) {
        errors.push(`${where} 缺少字符串字段 ${k}`);
        ok = false;
      }
    }
    if (!ok) return;
    const id = c.id as string;
    if (seen.has(id)) {
      errors.push(`${where} 的 id「${id}」重复`);
      return;
    }
    seen.add(id);
    chapters.push({ id, title: c.title as string, intro: c.intro as string });
  });
  return { chapters, errors };
}

/* ---------------- level.md 分节 ---------------- */

export interface Section {
  name: string;
  body: string;
}

/** 按 `## ` 二级标题分节；围栏代码块（``` 或 ~~~）里的 `## ` 不算。第一个标题之前的内容忽略。 */
export function splitSections(md: string): Section[] {
  const sections: Section[] = [];
  let current: { name: string; lines: string[] } | null = null;
  let fence: { ch: string; len: number } | null = null;
  for (const line of stripBom(md).split(/\r?\n/)) {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      const marker = f[1];
      if (!fence) {
        // 反引号围栏的信息串里不能再有反引号
        if (!(marker[0] === '`' && f[2].includes('`'))) fence = { ch: marker[0], len: marker.length };
      } else if (marker[0] === fence.ch && marker.length >= fence.len && f[2].trim() === '') {
        fence = null;
      }
    } else if (!fence) {
      const h = /^##[ \t]+(\S.*?)\s*$/.exec(line);
      if (h) {
        if (current) sections.push({ name: current.name, body: current.lines.join('\n').trim() });
        current = { name: h[1].trim(), lines: [] };
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push({ name: current.name, body: current.lines.join('\n').trim() });
  return sections;
}

const HINT_RE = /^提示[ \t　]*(\d+)$/;
const FIXED_SECTIONS: Array<[string, 'story' | 'knowledge' | 'task' | 'review']> = [
  ['故事', 'story'],
  ['知识点', 'knowledge'],
  ['任务', 'task'],
  ['复盘', 'review'],
];

/* ---------------- 单个关卡 ---------------- */

export function parseLevel(input: LevelInput, chapterIds: string[]): ParseResult {
  const errors: string[] = [];
  const at = `关卡「${input.folder}」`;
  const err = (msg: string) => errors.push(`${at}：${msg}`);

  /* level.json */
  let data: Obj | null = null;
  if (input.json == null) {
    err('缺少 level.json');
  } else {
    try {
      const parsed: unknown = JSON.parse(stripBom(input.json));
      if (isObj(parsed)) data = parsed;
      else err('level.json 必须是一个 JSON 对象');
    } catch (e) {
      err(`level.json 不是合法的 JSON（${(e as Error).message}）`);
    }
  }

  let id = '';
  let chapter = '';
  const strs: Record<'title' | 'concept' | 'card', string> = { title: '', concept: '', card: '' };
  let lab: Lab = { tool: 'none', files: [], board: DEFAULT_BOARD };
  let answer: Answer | null = null;

  if (data) {
    if (!isStr(data.id)) err('level.json 缺少 id（非空字符串）');
    else if (!ID_RE.test(data.id)) err(`level.json 的 id「${data.id}」不合法：只能用小写字母、数字和连字符，且不能以连字符开头或结尾`);
    else id = data.id;

    if (!isStr(data.chapter)) err('level.json 缺少 chapter');
    else if (!chapterIds.includes(data.chapter)) err(`level.json 的 chapter「${data.chapter}」不在 chapters.json 里（已有：${chapterIds.join('、') || '无'}）`);
    else chapter = data.chapter;

    for (const k of ['title', 'concept', 'card'] as const) {
      const v = data[k];
      if (!isStr(v)) err(`level.json 缺少 ${k}（非空字符串）`);
      else strs[k] = v;
    }

    lab = parseLab(data.lab, input.files, err);
    answer = parseAnswer(data.answer, err);
  }

  /* level.md */
  const found: Partial<Record<'story' | 'knowledge' | 'task' | 'review', string>> = {};
  const hintMap = new Map<number, string>();
  if (input.md == null) {
    err('缺少 level.md');
  } else {
    const seenNames = new Set<string>();
    for (const sec of splitSections(input.md)) {
      if (seenNames.has(sec.name)) {
        err(`level.md 的「${sec.name}」节重复`);
        continue;
      }
      seenNames.add(sec.name);
      const fixed = FIXED_SECTIONS.find(([n]) => n === sec.name);
      const hm = HINT_RE.exec(sec.name);
      if (fixed) {
        if (sec.body === '') err(`level.md 的「${sec.name}」节是空的`);
        else found[fixed[1]] = sec.body;
      } else if (hm) {
        const n = Number(hm[1]);
        if (hintMap.has(n)) err(`level.md 的提示编号 ${n} 重复`);
        else if (sec.body === '') err(`level.md 的「${sec.name}」节是空的`);
        else hintMap.set(n, sec.body);
      } else {
        err(`level.md 里有无法识别的分节「${sec.name}」（可用：故事、知识点、任务、提示 N、复盘）`);
      }
    }
    for (const [name, key] of FIXED_SECTIONS) {
      if (found[key] === undefined && !seenNames.has(name)) err(`level.md 缺少必填分节「${name}」`);
    }
    if (hintMap.size === 0 && ![...seenNames].some((n) => HINT_RE.test(n))) err('level.md 至少需要一条「提示 1」');
  }

  if (errors.length > 0 || !answer) return { level: null, errors };
  const hints = [...hintMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return {
    level: {
      id,
      folder: input.folder,
      chapter,
      title: strs.title,
      concept: strs.concept,
      card: strs.card,
      lab,
      answer,
      story: found.story as string,
      knowledge: found.knowledge as string,
      task: found.task as string,
      hints,
      review: found.review as string,
    },
    errors,
  };
}

function parseLab(raw: unknown, folderFiles: string[], err: (m: string) => void): Lab {
  const fallback: Lab = { tool: 'none', files: [], board: DEFAULT_BOARD };
  if (!isObj(raw)) {
    err('level.json 缺少 lab（对象）');
    return fallback;
  }
  const tool = raw.tool;
  if (tool !== 'falstad' && tool !== 'wokwi' && tool !== 'none') {
    err(`level.json 的 lab.tool「${String(tool)}」不认识（可用：falstad、wokwi、none）`);
    return fallback;
  }
  let files: string[] = [];
  if (tool === 'none') {
    if (raw.files !== undefined && !(Array.isArray(raw.files) && raw.files.length === 0)) err('level.json 的 lab.tool 是 none 时不应有 lab.files');
  } else if (!Array.isArray(raw.files) || raw.files.length === 0) {
    err('level.json 的 lab.files 必须是非空的文件名数组');
  } else {
    const list = raw.files as unknown[];
    if (!list.every((f) => isStr(f) && !/[\\/]/.test(f))) {
      err('level.json 的 lab.files 里每一项都必须是文件名（不含目录）');
    } else {
      files = list as string[];
      if (new Set(files).size !== files.length) err('level.json 的 lab.files 里有重复的文件名');
      for (const f of files) {
        if (!folderFiles.includes(f)) err(`level.json 的 lab.files 列了「${f}」，但关卡文件夹里没有这个文件`);
      }
      if (tool === 'falstad' && (files.length !== 1 || !files[0].toLowerCase().endsWith('.txt'))) {
        err('falstad 关卡的 lab.files 必须恰好是一个 .txt 文件');
      }
      if (tool === 'wokwi' && !files.includes('diagram.json')) err('wokwi 关卡的 lab.files 必须包含 diagram.json');
    }
  }

  let board = DEFAULT_BOARD;
  let url: string | undefined;
  if (raw.board !== undefined) {
    if (tool !== 'wokwi') err('level.json 的 lab.board 只能用在 wokwi 关卡');
    else if (!isStr(raw.board) || !BOARD_RE.test(raw.board)) err('level.json 的 lab.board 必须是开发板名（如 arduino-uno）');
    else board = raw.board;
  }
  if (raw.url !== undefined) {
    if (tool !== 'wokwi') err('level.json 的 lab.url 只能用在 wokwi 关卡');
    else if (!isStr(raw.url) || !WOKWI_URL_RE.test(raw.url)) err('level.json 的 lab.url 必须形如 https://wokwi.com/projects/<数字>');
    else url = raw.url;
  }
  return { tool, files, board, ...(url ? { url } : {}) };
}

function parseAnswer(raw: unknown, err: (m: string) => void): Answer | null {
  if (!isObj(raw)) {
    err('level.json 缺少 answer（对象）');
    return null;
  }
  if (raw.type === 'text') {
    let ok = true;
    if (!Array.isArray(raw.accept) || raw.accept.length === 0 || !raw.accept.every((a) => isStr(a))) {
      err('level.json 的 answer.accept 必须是非空字符串数组');
      ok = false;
    }
    if (raw.format !== undefined && !isStr(raw.format)) {
      err('level.json 的 answer.format 必须是非空字符串（或不写）');
      ok = false;
    }
    if (raw.value !== undefined || raw.tolerance !== undefined) {
      err('level.json 的文本答案不应有 value / tolerance（那是数值答案的字段）');
      ok = false;
    }
    if (!ok) return null;
    return { type: 'text', accept: raw.accept as string[], ...(raw.format ? { format: raw.format as string } : {}) };
  }
  if (raw.type === 'number') {
    let ok = true;
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
      err('level.json 的 answer.value 必须是数字');
      ok = false;
    }
    if (typeof raw.tolerance !== 'number' || !Number.isFinite(raw.tolerance) || raw.tolerance < 0) {
      err('level.json 的 answer.tolerance 必须是不小于 0 的数字');
      ok = false;
    }
    if (raw.unit !== undefined && !isStr(raw.unit)) {
      err('level.json 的 answer.unit 必须是非空字符串（或不写）');
      ok = false;
    }
    if (raw.accept !== undefined) {
      err('level.json 的数值答案不应有 accept（那是文本答案的字段）');
      ok = false;
    }
    if (!ok) return null;
    return { type: 'number', value: raw.value as number, tolerance: raw.tolerance as number, ...(raw.unit ? { unit: raw.unit as string } : {}) };
  }
  err(`level.json 的 answer.type「${String(raw.type)}」不认识（可用：text、number）`);
  return null;
}

/* ---------------- 全部关卡 ---------------- */

/** 解析所有关卡，按文件夹名字典序排列，并检查 id 是否重复。合法的关卡照常返回，错误另列。 */
export function buildLevels(inputs: LevelInput[], chapters: Chapter[]): { levels: Level[]; errors: string[] } {
  const sorted = [...inputs].sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
  const ids = chapters.map((c) => c.id);
  const levels: Level[] = [];
  const errors: string[] = [];
  const owner = new Map<string, string>();
  for (const input of sorted) {
    const r = parseLevel(input, ids);
    errors.push(...r.errors);
    if (!r.level) continue;
    const first = owner.get(r.level.id);
    if (first !== undefined) {
      errors.push(`关卡「${input.folder}」：id「${r.level.id}」与关卡「${first}」重复`);
      continue;
    }
    owner.set(r.level.id, input.folder);
    levels.push(r.level);
  }
  return { levels, errors };
}
