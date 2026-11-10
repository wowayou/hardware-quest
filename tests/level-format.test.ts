import { describe, expect, it } from 'vitest';
import { buildLevels, parseChapters, parseLevel, splitSections } from '../src/level-format';
import { chaptersJson, fixture, withJson } from './helpers';

const IDS = ['basics', 'mcu'];
const falstad = () => fixture('falstad-ok');
const wokwi = () => fixture('wokwi-ok');
const errs = (input: ReturnType<typeof falstad>) => parseLevel(input, IDS).errors;
const only = (input: ReturnType<typeof falstad>, part: string) => {
  const e = errs(input);
  expect(e.length, e.join('\n')).toBeGreaterThan(0);
  expect(e.some((m) => m.includes(part)), e.join('\n')).toBe(true);
  expect(e.every((m) => m.includes('关卡「')), '错误要指明是哪一关').toBe(true);
};

describe('parseLevel: 合法关卡', () => {
  it('falstad', () => {
    const r = parseLevel(falstad(), IDS);
    expect(r.errors).toEqual([]);
    const l = r.level!;
    expect(l.id).toBe('closed-loop');
    expect(l.lab).toEqual({ tool: 'falstad', files: ['circuit.txt'], board: 'arduino-uno' });
    expect(l.answer).toEqual({ type: 'number', value: 9.7, tolerance: 0.5, unit: 'mA' });
    expect(l.story).toBe('今晚的活儿是一盏台灯。');
  });
  it('wokwi，board 默认 arduino-uno，可带 board 和 url', () => {
    expect(parseLevel(wokwi(), IDS).level!.lab.board).toBe('arduino-uno');
    const r = parseLevel(withJson(wokwi(), (j) => { j.lab.board = 'esp32'; j.lab.url = 'https://wokwi.com/projects/123456'; }), IDS);
    expect(r.errors).toEqual([]);
    expect(r.level!.lab.board).toBe('esp32');
    expect(r.level!.lab.url).toBe('https://wokwi.com/projects/123456');
  });
  it('none 不需要 files', () => {
    const r = parseLevel(withJson(falstad(), (j) => { j.lab = { tool: 'none' }; }), IDS);
    expect(r.errors).toEqual([]);
    expect(r.level!.lab.files).toEqual([]);
  });
  it('提示按编号排序，不按出现顺序', () => {
    expect(parseLevel(falstad(), IDS).level!.hints).toEqual(['第一条。', '第二条。']);
    const md = '## 故事\na\n## 知识点\nb\n## 任务\nc\n## 提示 10\nten\n## 提示 2\ntwo\n## 复盘\nr';
    expect(parseLevel({ ...falstad(), md }, IDS).level!.hints).toEqual(['two', 'ten']);
  });
  it('CRLF 换行也行', () => {
    const md = (falstad().md as string).replace(/\n/g, '\r\n');
    const r = parseLevel({ ...falstad(), md }, IDS);
    expect(r.errors).toEqual([]);
    expect(r.level!.review).toBe('因为回路闭合了。');
  });
  it('text 答案', () => {
    const l = parseLevel(wokwi(), IDS).level!;
    expect(l.answer).toEqual({ type: 'text', accept: ['CHIP', '芯片'], format: '4 个大写字母' });
  });
});

describe('parseLevel: level.json 错误', () => {
  it('缺 level.json / level.md', () => {
    only({ ...falstad(), json: null }, '缺少 level.json');
    only({ ...falstad(), md: null }, '缺少 level.md');
  });
  it('JSON 语法错', () => only({ ...falstad(), json: '{ nope' }, '不是合法的 JSON'));
  it.each(['id', 'chapter', 'title', 'concept', 'card', 'lab', 'answer'])('缺字段 %s', (k) => {
    only(withJson(falstad(), (j) => { delete j[k]; }), k);
  });
  it('非法 id', () => {
    for (const id of ['Closed', 'a b', '-a', 'a-', 'a--b', '中文', '']) only(withJson(falstad(), (j) => { j.id = id; }), 'id');
  });
  it('未知章节', () => only(withJson(falstad(), (j) => { j.chapter = 'nope'; }), 'chapter「nope」'));
  it('未知 tool', () => only(withJson(falstad(), (j) => { j.lab.tool = 'proteus'; }), 'lab.tool「proteus」'));
  it('wokwi 缺 diagram.json', () => {
    only(withJson(wokwi(), (j) => { j.lab.files = ['sketch.ino']; }), 'diagram.json');
  });
  it('falstad 文件数不对 / 不是 .txt', () => {
    const base = falstad();
    const two = { ...base, files: [...base.files, 'b.txt'] };
    only(withJson(two, (j) => { j.lab.files = ['circuit.txt', 'b.txt']; }), '恰好是一个 .txt');
    only(withJson(base, (j) => { j.lab.files = []; }), 'lab.files');
    const odd = { ...base, files: [...base.files, 'a.json'] };
    only(withJson(odd, (j) => { j.lab.files = ['a.json']; }), '.txt');
  });
  it('lab.files 里的文件不存在', () => {
    only(withJson(wokwi(), (j) => { j.lab.files = ['sketch.ino', 'diagram.json', 'ghost.ino']; }), '「ghost.ino」');
  });
  it('lab.files 含目录 / 重复', () => {
    only(withJson(wokwi(), (j) => { j.lab.files = ['solution/sketch.ino', 'diagram.json']; }), '不含目录');
    only(withJson(wokwi(), (j) => { j.lab.files = ['sketch.ino', 'sketch.ino', 'diagram.json']; }), '重复');
  });
  it('board / url 只能用在 wokwi，且形态要对', () => {
    only(withJson(falstad(), (j) => { j.lab.board = 'esp32'; }), 'lab.board');
    only(withJson(falstad(), (j) => { j.lab.url = 'https://wokwi.com/projects/1'; }), 'lab.url');
    only(withJson(wokwi(), (j) => { j.lab.url = 'https://example.com/x'; }), 'lab.url');
    only(withJson(wokwi(), (j) => { j.lab.url = 'https://wokwi.com/projects/abc'; }), 'lab.url');
    only(withJson(wokwi(), (j) => { j.lab.board = 'a b'; }), 'lab.board');
  });
  it('none 却给了 files', () => only(withJson(falstad(), (j) => { j.lab = { tool: 'none', files: ['circuit.txt'] }; }), 'none'));
  describe('answer', () => {
    const bad = (answer: unknown, part: string) => only(withJson(falstad(), (j) => { j.answer = answer; }), part);
    it('未知 type', () => bad({ type: 'regex' }, 'answer.type'));
    it('text 非法', () => {
      bad({ type: 'text' }, 'answer.accept');
      bad({ type: 'text', accept: [] }, 'answer.accept');
      bad({ type: 'text', accept: ['A', ''] }, 'answer.accept');
      bad({ type: 'text', accept: 'A' }, 'answer.accept');
      bad({ type: 'text', accept: ['A'], format: 3 }, 'answer.format');
      bad({ type: 'text', accept: ['A'], value: 1 }, 'value');
    });
    it('number 非法', () => {
      bad({ type: 'number', tolerance: 1 }, 'answer.value');
      bad({ type: 'number', value: '3', tolerance: 1 }, 'answer.value');
      bad({ type: 'number', value: 3 }, 'answer.tolerance');
      bad({ type: 'number', value: 3, tolerance: -1 }, 'answer.tolerance');
      bad({ type: 'number', value: 3, tolerance: 0, unit: 5 }, 'answer.unit');
      bad({ type: 'number', value: 3, tolerance: 0, accept: ['3'] }, 'accept');
      bad('42', 'answer');
    });
    it('tolerance 为 0 合法', () => {
      expect(errs(withJson(falstad(), (j) => { j.answer = { type: 'number', value: 3, tolerance: 0 }; }))).toEqual([]);
    });
  });
});

describe('parseLevel: level.md 错误', () => {
  const md = (parts: string[]) => ({ ...falstad(), md: parts.join('\n\n') });
  const full = ['## 故事\na', '## 知识点\nb', '## 任务\nc', '## 提示 1\nd', '## 复盘\ne'];
  it('齐全时通过', () => expect(errs(md(full))).toEqual([]));
  for (const name of ['故事', '知识点', '任务', '复盘']) {
    it(`缺必填分节 ${name}`, () => only(md(full.filter((p) => !p.startsWith(`## ${name}`))), `缺少必填分节「${name}」`));
  }
  it('没有提示', () => only(md(full.filter((p) => !p.startsWith('## 提示'))), '至少需要一条'));
  it('空分节、重复分节、未知分节、重复提示号', () => {
    only(md([...full.slice(0, 4), '## 复盘']), '是空的');
    only(md([...full, '## 任务\nagain']), '重复');
    only(md([...full, '## 附录\nx']), '无法识别的分节「附录」');
    only(md([...full, '## 提示 01\nagain']), '提示编号 1 重复');
  });
  it('只有代码块里的分节名不算', () => {
    const fenced = ['## 故事\na', '## 知识点\nb', '## 任务\nc\n\n```\n## 复盘\nfake\n```', '## 提示 1\nd'];
    only(md(fenced), '缺少必填分节「复盘」');
  });
});

describe('splitSections', () => {
  it('跳过围栏代码块里的 ## （``` 和 ~~~，围栏更长时不被短围栏提前关闭）', () => {
    const text = ['## A', '```', '## 假的', '```', '~~~~', '## 也是假的', '~~~', '## 还是假的', '~~~~', '## B', 'x'].join('\n');
    const s = splitSections(text);
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s[0].body).toContain('## 假的');
    expect(s[0].body).toContain('## 还是假的');
  });
  it('### 不是分节；第一个标题前的内容忽略', () => {
    const s = splitSections('前言\n\n## A\n### 小标题\ntext');
    expect(s).toHaveLength(1);
    expect(s[0].body).toBe('### 小标题\ntext');
  });
  it('缩进 4 格的 ``` 不算围栏', () => {
    expect(splitSections('## A\n    ```\n## B\nx').map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('parseChapters / buildLevels', () => {
  it('合法章节', () => expect(parseChapters(chaptersJson())).toMatchObject({ errors: [], chapters: [{ id: 'basics' }, { id: 'mcu' }] }));
  it('章节错误', () => {
    expect(parseChapters('nope').errors[0]).toContain('chapters.json');
    expect(parseChapters('{}').errors).toHaveLength(1);
    expect(parseChapters('[{"id":"a"}]').errors[0]).toContain('title');
    expect(parseChapters('[{"id":"a","title":"t","intro":"i"},{"id":"a","title":"t","intro":"i"}]').errors[0]).toContain('重复');
  });
  it('按文件夹名排序；重复 id 报错并丢弃后者', () => {
    const { chapters } = parseChapters(chaptersJson());
    const a = { ...wokwi(), folder: '02-b' };
    const b = { ...falstad(), folder: '01-a' };
    const dup = withJson({ ...falstad(), folder: '03-c' }, () => {});
    const r = buildLevels([a, dup, b], chapters);
    expect(r.levels.map((l) => l.folder)).toEqual(['01-a', '02-b']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('03-c');
    expect(r.errors[0]).toContain('重复');
  });
  it('一关坏了，其他关照常', () => {
    const { chapters } = parseChapters(chaptersJson());
    const r = buildLevels([{ ...falstad(), folder: '01-a', json: '{' }, { ...wokwi(), folder: '02-b' }], chapters);
    expect(r.levels).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
