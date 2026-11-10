#!/usr/bin/env node
// 在真实的 Wokwi 里检查关卡：参考解必须得到答案，起始工程必须得不到。
//
// 用法：
//   node tools/check-wokwi.mjs                      检查 levels/ 下所有 lab.tool 为 wokwi 的关卡
//   node tools/check-wokwi.mjs levels/05-gpio-blink  只检查指定的关卡文件夹（可写多个）
//   选项：--only=solution | --only=starter   只跑其中一遍（省 Wokwi 用量）
//         --shots=<目录>                     每次运行结束时截一张图存到该目录
//
// 流程和玩家一样：打开 https://wokwi.com/projects/new/arduino-uno（不登录）→ 把 sketch.ino、
// diagram.json 的内容放进两个标签页的编辑器（用页面上暴露的 monaco 对象 setValue，并读回核对）
// → 点运行 → 等编译 → 按 check.json 操作和观察。顺序执行，不并发；两次打开页面之间停 5 秒。
// 起始工程指关卡根目录的文件；参考解指 solution/ 下的同名文件（缺哪个就用根目录的）。
//
// ---------------------------------------------------------------------------------------
// solution/check.json 的格式（两遍运行共用，所以尽量小）
//
// {
//   "settleMs": 2000,             // 可省，默认 2000：程序开始运行后先等多久再执行 steps
//   "steps": [                    // 两遍运行都会执行的操作，按顺序
//     { "wait": 3000 },                                   // 等 3000 毫秒
//     { "press": "btn", "times": 4, "holdMs": 150, "gapMs": 700 }
//                                 // 用鼠标按零件 id 为 btn 的按钮 4 次；
//                                 // 每次按住 holdMs 毫秒（默认 150）、两次之间松开 gapMs 毫秒（默认 700）
//   ],
//   "answer": { ... },            // 必填。"答案观察"，写法见下。参考解必须观察到，起始工程必须观察不到。
//   "solutionAlso": [ { ... } ],  // 可选。只对参考解：这些观察也必须成立（例如串口里应有某句话）
//   "starterAlso":  [ { ... } ],  // 可选。只对起始工程：这些观察必须成立，用来证明起始工程是"坏着运行"，
//                                 //       而不是根本没跑起来（例如串口里出现"自检失败"）
//   "starterObservable": true     // 可选，默认 false。给"起始工程本来就不坏、靠玩家解码"的关卡用：
//                                 // 起始工程里 answer 观察也必须成立（口令本身不在串口里，由玩家解码）
// }
//
// "观察"有四种，都是对象，注意 steps 全部做完之后才开始计时：
//   { "serial": "正则", "timeoutMs": 15000 }
//       串口输出（从运行开始累计的全部文本）在 timeoutMs 内出现匹配正则的内容。
//       起始工程要"观察不到"时，会把整个 timeoutMs 等满。
//   { "serialNot": "正则", "forMs": 5000 }
//       在 forMs 内串口始终不出现匹配的内容。（一般用在 solutionAlso / starterAlso 里）
//   { "blinks": { "led": "led1", "groups": [3,1,4,2], "splitMs": 900, "cycleMs": 3000, "windowMs": 42000 } }
//       采样 id 为 led1 的 LED 灯 windowMs 毫秒，数闪烁次数。相邻两次"亮起"之间间隔 > splitMs 算换了一组，
//       > cycleMs 算一轮结束。取窗口里"完整的"轮（不含第一轮和最后一轮，因为它们可能被窗口切断）
//       与 groups 比较，有一轮完全一致即成立。所以 windowMs 要覆盖至少 3 轮。
//   { "frames": { "leds": ["b7","b6",...,"b0"], "expect": ["01000110", ...], "minHoldMs": 1500, "windowMs": 25000 } }
//       同时采样一组 LED（leds 里依次是左到右的 id，亮=1 灭=0），把"保持不变 >= minHoldMs 且不是全灭"的
//       画面依次记下来，expect 里的位模式必须作为连续的一段出现。
//
// 通用检查（不用写）：起始工程运行时，串口文本里不能出现 level.json 里 answer.accept 的任何一项
// （防止口令被直接打印出来）。
//
// 零件 id 就是 diagram.json 里 parts[].id。按钮必须在页面可见区域内。电位器不用自动拧：
// 在参考解的 diagram.json 里用 attrs.value 预设到位即可。
// ---------------------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NEW_PROJECT = 'https://wokwi.com/projects/new/arduino-uno';
const PAGE_GAP_MS = 5000;
const BUILD_TIMEOUT_MS = 180000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readText = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');

// ---------- 命令行 ----------
const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = '1'] = a.slice(2).split('=');
    return [k, v];
  }),
);
const folderArgs = argv.filter((a) => !a.startsWith('--'));

function findLevels() {
  if (folderArgs.length) {
    return folderArgs.map((a) => {
      const direct = resolve(a);
      if (existsSync(join(direct, 'level.json'))) return direct;
      const inLevels = join(ROOT, 'levels', a);
      if (existsSync(join(inLevels, 'level.json'))) return inLevels;
      throw new Error(`找不到关卡文件夹：${a}`);
    });
  }
  const dir = join(ROOT, 'levels');
  return readdirSync(dir)
    .filter((d) => !d.startsWith('_') && existsSync(join(dir, d, 'level.json')))
    .sort()
    .map((d) => join(dir, d))
    .filter((d) => JSON.parse(readFileSync(join(d, 'level.json'), 'utf8')).lab?.tool === 'wokwi');
}

function loadLevel(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'level.json'), 'utf8'));
  const checkPath = join(dir, 'solution', 'check.json');
  if (!existsSync(checkPath)) throw new Error('缺少 solution/check.json');
  const check = JSON.parse(readFileSync(checkPath, 'utf8'));
  const pick = (name, solution) => {
    const sp = join(dir, 'solution', name);
    if (solution && existsSync(sp)) return readText(sp);
    return readText(join(dir, name));
  };
  return {
    dir,
    name: basename(dir),
    meta,
    check,
    starter: { ino: pick('sketch.ino', false), json: pick('diagram.json', false) },
    solution: { ino: pick('sketch.ino', true), json: pick('diagram.json', true) },
  };
}

// ---------- 页面操作 ----------
class StepError extends Error {}

async function openProject(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(NEW_PROJECT, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.monaco && window.monaco.editor.getModels().length >= 2, null, { timeout: 60000 });
  } catch {
    throw new StepError('打开工程：60 秒内编辑器没有出现（页面结构变了，或遇到登录/限流页面？）');
  }
  return page;
}

// 把两个文件放进编辑器并读回核对。diagram.json 的 model 要点开标签页才会创建。
async function putFiles(page, files) {
  await page.getByText('diagram.json', { exact: true }).first().click();
  try {
    await page.waitForFunction(() => window.monaco.editor.getModels().some((m) => m.uri.toString() === 'vfs:diagram.json'), null, { timeout: 15000 });
  } catch {
    throw new StepError('放入文件：点开 diagram.json 标签页后没有出现对应的编辑器 model');
  }
  const back = await page.evaluate(({ ino, json }) => {
    const out = {};
    for (const m of window.monaco.editor.getModels()) {
      const u = m.uri.toString();
      if (u === 'vfs:sketch.ino') { m.setValue(ino); out.ino = m.getValue(); }
      if (u === 'vfs:diagram.json') { m.setValue(json); out.json = m.getValue(); }
    }
    return out;
  }, files);
  if (back.ino === undefined || back.json === undefined) throw new StepError('放入文件：找不到 sketch.ino 或 diagram.json 的编辑器 model');
  if (norm(back.ino) !== norm(files.ino)) throw new StepError('放入文件：读回的 sketch.ino 和原文不一致');
  if (norm(back.json) !== norm(files.json)) throw new StepError('放入文件：读回的 diagram.json 和原文不一致');
  await page.getByText('sketch.ino', { exact: true }).first().click();
  // 等图重画完，确认每个零件 id 都出现在页面里
  const ids = JSON.parse(files.json).parts.map((p) => p.id);
  try {
    await page.waitForFunction((ids) => ids.every((id) => document.getElementById(id)), ids, { timeout: 15000 });
  } catch {
    const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), ids);
    throw new StepError(`放入文件：diagram.json 里的零件没有全部画出来，缺：${missing.join(', ')}（diagram.json 有错？）`);
  }
}

async function startAndWait(page) {
  await page.getByRole('button', { name: 'Start the simulation' }).click();
  const t0 = Date.now();
  while (Date.now() - t0 < BUILD_TIMEOUT_MS) {
    await sleep(1000);
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf('Build failed');
      return {
        failed: i >= 0 ? t.slice(i, i + 700) : null,
        running: !!document.querySelector('button[aria-label="Stop the simulation"]'),
      };
    });
    if (st.failed) throw new StepError(`编译失败：\n${st.failed.replace(/\n+/g, '\n  ')}`);
    if (st.running) return Date.now() - t0;
  }
  throw new StepError(`编译/启动超过 ${BUILD_TIMEOUT_MS / 1000} 秒仍未开始运行`);
}

const getSerial = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('pre.notranslate')].find((e) => !e.closest('.monaco-editor'));
    return el ? el.textContent.replace(/\r\n/g, '\n') : '';
  });

// 在页面里每 5ms 采样一次 LED 的亮灭，只记录变化
async function installSampler(page, ids) {
  await page.evaluate((ids) => {
    window.__hq = { ev: [], last: {} };
    setInterval(() => {
      const now = performance.now();
      for (const id of ids) {
        const e = document.getElementById(id);
        const v = e ? (e.value ? 1 : 0) : 0;
        if (window.__hq.last[id] !== v) { window.__hq.last[id] = v; window.__hq.ev.push([now, id, v]); }
      }
    }, 5);
  }, ids);
}
const pageNow = (page) => page.evaluate(() => performance.now());
const getEvents = (page) => page.evaluate(() => window.__hq.ev);

async function pressButton(page, id, times, holdMs, gapMs) {
  for (let i = 0; i < times; i++) {
    const box = await page.evaluate((id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: innerWidth, h: innerHeight };
    }, id);
    if (!box) throw new StepError(`按按钮：页面上没有 id 为 ${id} 的零件`);
    if (box.x < 0 || box.y < 0 || box.x > box.w || box.y > box.h) throw new StepError(`按按钮：${id} 不在可见区域内`);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await sleep(holdMs);
    await page.mouse.up();
    await sleep(gapMs);
  }
}

// ---------- 观察 ----------
function leds(obs) {
  if (obs.blinks) return [obs.blinks.led];
  if (obs.frames) return obs.frames.leds;
  return [];
}

function decodeBlinks(events, led, from, to, splitMs, cycleMs) {
  const rises = events.filter(([t, id, v]) => id === led && v === 1 && t >= from && t <= to).map((e) => e[0]);
  const cycles = [];
  let cycle = [], count = 0;
  for (let i = 0; i < rises.length; i++) {
    const gap = i ? rises[i] - rises[i - 1] : 0;
    if (i && gap > cycleMs) { cycle.push(count); cycles.push(cycle); cycle = []; count = 1; }
    else if (i && gap > splitMs) { cycle.push(count); count = 1; }
    else count++;
  }
  if (count) cycle.push(count);
  if (cycle.length) cycles.push(cycle);
  return { rises: rises.length, cycles };
}

function decodeFrames(events, ledIds, from, to, minHoldMs) {
  const state = Object.fromEntries(ledIds.map((id) => [id, 0]));
  for (const [t, id, v] of events) if (t < from && id in state) state[id] = v;
  const pat = () => ledIds.map((id) => state[id]).join('');
  let cur = pat(), since = from;
  const frames = [];
  const close = (t) => { if (t - since >= minHoldMs && /1/.test(cur)) frames.push(cur); };
  for (const [t, id, v] of events) {
    if (t < from || t > to || !(id in state)) continue;
    state[id] = v;
    const p = pat();
    if (p !== cur) { close(t); cur = p; since = t; }
  }
  close(to);
  return frames;
}

const hasRun = (frames, expect) => {
  for (let i = 0; i + expect.length <= frames.length; i++) if (expect.every((e, j) => frames[i + j] === e)) return true;
  return false;
};

// 返回 { ok, detail }
async function observe(page, obs) {
  if (obs.serial) {
    const re = new RegExp(obs.serial);
    const timeout = obs.timeoutMs ?? 15000;
    const t0 = Date.now();
    let text = '';
    while (true) {
      text = await getSerial(page);
      if (re.test(text)) return { ok: true, detail: `串口出现 /${obs.serial}/：${JSON.stringify(text.match(re)[0])}` };
      if (Date.now() - t0 > timeout) return { ok: false, detail: `串口 ${timeout}ms 内没有出现 /${obs.serial}/` };
      await sleep(400);
    }
  }
  if (obs.serialNot) {
    const re = new RegExp(obs.serialNot);
    const forMs = obs.forMs ?? 5000;
    const t0 = Date.now();
    while (Date.now() - t0 < forMs) {
      const text = await getSerial(page);
      if (re.test(text)) return { ok: false, detail: `串口出现了不该有的 /${obs.serialNot}/：${JSON.stringify(text.match(re)[0])}` };
      await sleep(400);
    }
    return { ok: true, detail: `串口 ${forMs}ms 内没有出现 /${obs.serialNot}/` };
  }
  if (obs.blinks) {
    const b = obs.blinks;
    const from = await pageNow(page);
    await sleep(b.windowMs);
    const to = await pageNow(page);
    const r = decodeBlinks(await getEvents(page), b.led, from, to, b.splitMs ?? 900, b.cycleMs ?? 3000);
    const full = r.cycles.slice(1, -1);
    const ok = full.some((c) => JSON.stringify(c) === JSON.stringify(b.groups));
    return {
      ok,
      detail: `${b.led} 在 ${b.windowMs}ms 内亮起 ${r.rises} 次，分成的轮：${JSON.stringify(r.cycles)}（完整轮 ${JSON.stringify(full)}），期望 ${JSON.stringify(b.groups)}`,
    };
  }
  if (obs.frames) {
    const f = obs.frames;
    const from = await pageNow(page);
    await sleep(f.windowMs);
    const to = await pageNow(page);
    const frames = decodeFrames(await getEvents(page), f.leds, from, to, f.minHoldMs ?? 1500);
    return { ok: hasRun(frames, f.expect), detail: `观察到的画面：${JSON.stringify(frames)}，期望连续出现 ${JSON.stringify(f.expect)}` };
  }
  throw new StepError(`check.json 里有不认识的观察：${JSON.stringify(obs)}`);
}

async function runSteps(page, steps) {
  for (const s of steps ?? []) {
    if (s.wait !== undefined) await sleep(s.wait);
    else if (s.press) await pressButton(page, s.press, s.times ?? 1, s.holdMs ?? 150, s.gapMs ?? 700);
    else throw new StepError(`check.json 里有不认识的步骤：${JSON.stringify(s)}`);
  }
}

// ---------- 一次运行 ----------
async function runOne(browser, level, kind) {
  const solution = kind === 'solution';
  const files = solution ? level.solution : level.starter;
  const { check, meta } = level;
  const page = await openProject(browser);
  const lines = [];
  try {
    await putFiles(page, files);
    const allObs = [check.answer, ...(check.solutionAlso ?? []), ...(check.starterAlso ?? [])];
    const ledIds = [...new Set(allObs.flatMap(leds))];
    await installSampler(page, ledIds);
    const buildMs = await startAndWait(page);
    lines.push(`编译并启动用了 ${(buildMs / 1000).toFixed(1)} 秒`);
    await sleep(check.settleMs ?? 2000);
    await runSteps(page, check.steps);

    const verdicts = [];
    const answerWanted = solution || check.starterObservable === true;
    const a = await observe(page, check.answer);
    lines.push(`答案观察：${a.detail}`);
    verdicts.push(a.ok === answerWanted ? null : answerWanted ? '应该观察到答案，但没有' : '起始工程居然观察到了答案');
    for (const obs of (solution ? check.solutionAlso : check.starterAlso) ?? []) {
      const r = await observe(page, obs);
      lines.push(`附加观察：${r.detail}`);
      if (!r.ok) verdicts.push('附加观察不成立');
    }
    const serial = await getSerial(page);
    if (serial) lines.push(`串口末尾：\n    ${serial.trimEnd().split('\n').slice(-8).join('\n    ')}`);
    else lines.push('串口：（空）');
    if (!solution) {
      const flat = serial.replace(/\s+/g, '').toUpperCase();
      for (const acc of meta.answer?.accept ?? []) {
        if (flat.includes(acc.replace(/\s+/g, '').toUpperCase())) verdicts.push(`串口里直接出现了口令 ${acc}`);
      }
    }
    if (flags.shots) {
      mkdirSync(flags.shots, { recursive: true });
      await page.screenshot({ path: join(flags.shots, `${level.name}-${kind}.png`) });
    }
    const errs = verdicts.filter(Boolean);
    return { ok: errs.length === 0, lines, errs };
  } catch (e) {
    if (flags.shots) {
      try { mkdirSync(flags.shots, { recursive: true }); await page.screenshot({ path: join(flags.shots, `${level.name}-${kind}-ERROR.png`) }); } catch {}
    }
    if (e instanceof StepError) return { ok: false, lines, errs: [e.message] };
    return { ok: false, lines, errs: [`脚本异常：${e.stack ?? e}`] };
  } finally {
    await page.context().close();
  }
}

// ---------- 主流程 ----------
async function main() {
  const dirs = findLevels();
  if (!dirs.length) { console.log('没有要检查的 wokwi 关卡'); return 0; }
  const kinds = flags.only ? [flags.only] : ['solution', 'starter'];
  const browser = await launch();
  let failed = 0, opened = 0;
  try {
    for (const dir of dirs) {
      let level;
      try { level = loadLevel(dir); } catch (e) { console.log(`FAIL  ${basename(dir)}：${e.message}`); failed++; continue; }
      let runKinds = kinds;
      const same = level.starter.ino === level.solution.ino && level.starter.json === level.solution.json;
      if (same && level.check.starterObservable && kinds.length === 2) {
        runKinds = ['starter'];
        console.log(`（${level.name}：起始工程与参考解文件相同，只跑一遍）`);
      }
      for (const kind of runKinds) {
        if (opened++) await sleep(PAGE_GAP_MS);
        const label = kind === 'solution' ? '参考解' : '起始工程';
        console.log(`... ${level.name} ${label}`);
        const r = await runOne(browser, level, kind);
        console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${level.name} ${label}`);
        for (const l of r.lines) console.log(`  ${l}`);
        for (const e of r.errs) console.log(`  !! ${e}`);
        if (!r.ok) failed++;
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  return failed ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
