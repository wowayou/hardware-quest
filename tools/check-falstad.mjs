// 在真实的 CircuitJS（Falstad）里检查关卡：node tools/check-falstad.mjs [关卡文件夹…]
// 不带参数 = 检查 levels/ 下所有 lab.tool 为 falstad 的关卡（下划线开头的文件夹跳过）。
// 会打开 falstad.com，每关 2 次以上页面加载，顺序执行，每次之间停 2 秒。不要放进 CI，不要并发跑。
// 可选：--shots=<目录> 把每个电路加载后的截图存到该目录。
//
// ---------------------------------------------------------------------------
// solution/check.json 的写法（给新关卡写 check.json 的人看这里）
// ---------------------------------------------------------------------------
// {
//   "wait": 0.02,                       // 可选，等仿真跑到多少「仿真秒」再读数，默认 0.02
//   "reads": {                          // 要读的数，名字自取
//     "i": { "element": "LEDElm", "nth": 0, "what": "current", "scale": 1000 },
//     "r": { "element": "ResistorElm", "nth": 0, "what": "resistance" }
//   },
//   "answer": "i",                      // 哪个读数就是玩家要填的答案（level.json 的 answer 与它比较）
//   "start":    [ { "read": "i", "max": 0.001 } ],   // 可选：对「起始电路」的额外断言
//   "solution": [ { "read": "i", "max": 20 } ],      // 可选：对「参考解」的额外断言
//   "also": [                           // 可选：额外的对照电路（文件放 solution/ 里）
//     { "file": "solution/too-small.txt", "assert": [ { "read": "i", "min": 20 } ] }
//   ]
// }
//
// reads 里每项：
//   element  CircuitJS 元件类型名，按 getElements() 的顺序（= 电路文本里的行序，导线、文字标注也算元件）
//            常用：ResistorElm、LEDElm、TransistorElm、VoltageElm、SwitchElm、ProbeElm、WireElm
//   nth      同类型里的第几个，从 0 数起，默认 0
//   what     current = 流过元件的电流（安培 × scale）；voltage = 元件两端电压差（伏 × scale，
//            电压探针 ProbeElm 则是它所测点对地电压）；resistance = 电阻元件的阻值（欧 × scale，
//            从元件信息里的 "R = 20 kΩ" 解析出来）
//   scale    换算系数，默认 1。例如电流要毫安就写 1000，阻值要千欧就写 0.001
// 断言：{ "read": 名字, "min": 下限, "max": 上限 }，上下限都含；min、max 可只写一个。
//
// 脚本做的事：
//   1. 起始电路（lab.files[0]）和参考解（solution/ 下同名文件）各用 ctz 链接打开一次，
//      要求页面无 JS 报错、元件数量与文本行数一致（即文本被完整接受）；
//   2. 参考解里 answer 读数必须满足 level.json 的 answer（数值：容差内；文本：转成字符串后在 accept 里）；
//   3. 起始电路里 answer 读数必须不满足 answer；
//   4. 各断言（start / solution / also）全部成立。
// 有任何失败，退出码非 0。
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import LZString from 'lz-string';
import { launch } from './browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = join(ROOT, 'levels');
const BASE_URL = 'https://www.falstad.com/circuit/circuitjs.html?ctz=';
const PAUSE_MS = 2000;
const STEP_TIMEOUT = 60000;

const args = process.argv.slice(2);
const shotsArg = args.find((a) => a.startsWith('--shots='));
const shotsDir = shotsArg ? resolve(shotsArg.slice('--shots='.length)) : null;
const folderArgs = args.filter((a) => !a.startsWith('--'));
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function listLevelDirs() {
  if (folderArgs.length) return folderArgs.map((f) => resolve(f));
  return readdirSync(LEVELS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => join(LEVELS, d.name))
    .sort()
    .filter((dir) => {
      const lj = join(dir, 'level.json');
      return existsSync(lj) && readJson(lj).lab?.tool === 'falstad';
    });
}

/** 给每个步骤加超时和明确的出错位置。 */
async function step(where, what, fn) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('超时')), STEP_TIMEOUT);
      }),
    ]);
  } catch (e) {
    throw new Error(`${where} / ${what}：${e.message.split('\n')[0]}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 在页面里读一项数。注意：文字标注元件的 getVoltageDiff 会抛错，所以只对选中的元件调用。 */
async function readOne(page, spec) {
  const what = spec.what;
  const r = await page.evaluate(
    ({ element, nth, what }) => {
      const els = window.CircuitJS1.getElements().filter((e) => e.getType() === element);
      const e = els[nth ?? 0];
      if (!e) return { error: `找不到第 ${nth ?? 0} 个 ${element}（共 ${els.length} 个）` };
      if (what === 'current') return { v: e.getCurrent() };
      if (what === 'voltage') return { v: e.getVoltageDiff() };
      if (what === 'resistance') {
        const line = e.getInfo().find((s) => /^R = /.test(s));
        if (!line) return { error: '元件信息里没有 R = …' };
        const m = line.match(/^R = ([\d.]+) ?([kMm]?)Ω/);
        if (!m) return { error: `解析不了阻值：${line}` };
        const k = { '': 1, k: 1e3, M: 1e6, m: 1e-3 }[m[2]];
        return { v: parseFloat(m[1]) * k };
      }
      return { error: `未知的 what：${what}` };
    },
    { element: spec.element, nth: spec.nth ?? 0, what },
  );
  if (r.error) throw new Error(r.error);
  return r.v * (spec.scale ?? 1);
}

/** 打开一个电路文件，返回 { reads, notes }；出任何问题抛错。 */
async function openAndRead(browser, where, file, check, label) {
  const text = readFileSync(file, 'utf8');
  const expected = text.split(/\r?\n/).filter((l) => l.trim() && !/^[$%#]/.test(l.trim())).length;
  const url = BASE_URL + LZString.compressToEncodedURIComponent(text);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(STEP_TIMEOUT);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await step(where, '打开页面', () => page.goto(url, { waitUntil: 'load' }));
    await step(where, '等待 CircuitJS1 就绪', () =>
      page.waitForFunction(() => window.CircuitJS1 && window.CircuitJS1.getTime && window.CircuitJS1.getElements, null, {
        timeout: STEP_TIMEOUT,
      }),
    );
    const wait = check.wait ?? 0.02;
    await step(where, `等仿真跑到 ${wait} 秒`, () =>
      page.waitForFunction((w) => window.CircuitJS1.getTime() >= w, wait, { timeout: STEP_TIMEOUT, polling: 200 }),
    );
    const count = await page.evaluate(() => window.CircuitJS1.getElements().length);
    if (count !== expected) throw new Error(`${where} / 导入：电路文本有 ${expected} 个元件行，CircuitJS 只认出 ${count} 个`);
    const reads = {};
    for (const [name, spec] of Object.entries(check.reads ?? {})) {
      reads[name] = await step(where, `读数 ${name}`, () => readOne(page, spec));
    }
    if (pageErrors.length) throw new Error(`${where} / 页面报错：${pageErrors[0]}`);
    if (shotsDir) await page.screenshot({ path: join(shotsDir, `${label}.png`) });
    return reads;
  } finally {
    await page.close().catch(() => {});
  }
}

function checkAsserts(list, reads, where, fails) {
  for (const a of list ?? []) {
    const v = reads[a.read];
    if (v === undefined) {
      fails.push(`${where}：断言引用了不存在的读数 ${a.read}`);
      continue;
    }
    if (a.min !== undefined && !(v >= a.min)) fails.push(`${where}：${a.read} = ${fmt(v)}，应 ≥ ${a.min}`);
    if (a.max !== undefined && !(v <= a.max)) fails.push(`${where}：${a.read} = ${fmt(v)}，应 ≤ ${a.max}`);
  }
}

function matchesAnswer(answer, v) {
  if (answer.type === 'number') return Math.abs(v - answer.value) <= answer.tolerance;
  if (answer.type === 'text') {
    const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();
    return answer.accept.some((a) => norm(a) === norm(Number(v.toFixed(6))));
  }
  return false;
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toPrecision(6).replace(/\.?0+$/, ''));
const fmtReads = (reads) => Object.entries(reads).map(([k, v]) => `${k}=${fmt(v)}`).join(' ');

async function checkLevel(browser, dir, state) {
  const name = dir.split('/').filter(Boolean).pop();
  const fails = [];
  const lines = [];
  const level = readJson(join(dir, 'level.json'));
  if (level.lab?.tool !== 'falstad' || level.lab.files?.length !== 1) throw new Error(`${name}：lab 必须是 falstad 且恰好一个文件`);
  const file = level.lab.files[0];
  const checkPath = join(dir, 'solution', 'check.json');
  if (!existsSync(checkPath)) throw new Error(`${name}：缺少 solution/check.json`);
  const check = readJson(checkPath);
  if (!check.answer || !check.reads?.[check.answer]) throw new Error(`${name}：check.json 的 answer 必须指向 reads 里的一项`);

  const jobs = [
    { kind: 'start', file: join(dir, file), label: `${name}-start` },
    { kind: 'solution', file: join(dir, 'solution', file), label: `${name}-solution` },
    ...(check.also ?? []).map((a) => ({ kind: 'also', file: join(dir, a.file), label: `${name}-also-${a.file.split('/').pop().replace(/\.txt$/, '')}`, also: a })),
  ];
  const results = {};
  for (const job of jobs) {
    if (state.loads > 0) await sleep(PAUSE_MS);
    state.loads++;
    const where = `${name} / ${job.kind === 'also' ? job.also.file : job.kind}`;
    try {
      results[job.kind + (job.also?.file ?? '')] = await openAndRead(browser, where, job.file, check, job.label);
    } catch (e) {
      fails.push(e.message);
      lines.push(`  ${job.kind}: 出错`);
      continue;
    }
    const reads = results[job.kind + (job.also?.file ?? '')];
    lines.push(`  ${job.kind}${job.also ? ' ' + job.also.file : ''}: ${fmtReads(reads)}`);
    if (job.kind === 'solution') {
      if (!matchesAnswer(level.answer, reads[check.answer])) fails.push(`${where}：${check.answer} = ${fmt(reads[check.answer])}，不满足 level.json 的 answer`);
      checkAsserts(check.solution, reads, where, fails);
    } else if (job.kind === 'start') {
      if (matchesAnswer(level.answer, reads[check.answer])) fails.push(`${where}：起始电路的 ${check.answer} = ${fmt(reads[check.answer])} 已经满足答案，玩家不用动手`);
      checkAsserts(check.start, reads, where, fails);
    } else {
      checkAsserts(job.also.assert, reads, where, fails);
    }
  }
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${name}  (答案 ${JSON.stringify(level.answer.value ?? level.answer.accept)} ${level.answer.unit ?? ''})`);
  for (const l of lines) console.log(l);
  for (const f of fails) console.log(`  !! ${f}`);
  return fails.length === 0;
}

const dirs = listLevelDirs();
if (!dirs.length) {
  console.log('没有找到 falstad 关卡。');
  process.exit(0);
}
let browser;
let ok = true;
try {
  browser = await launch();
  const state = { loads: 0 };
  for (const dir of dirs) {
    try {
      if (!(await checkLevel(browser, dir, state))) ok = false;
    } catch (e) {
      ok = false;
      console.log(`FAIL  ${dir}\n  !! ${e.message}`);
    }
  }
} catch (e) {
  ok = false;
  console.log(`FAIL  启动浏览器失败：${e.message}`);
} finally {
  await browser?.close().catch(() => {});
}
console.log(ok ? '\n全部通过。' : '\n有失败。');
process.exit(ok ? 0 : 1);
