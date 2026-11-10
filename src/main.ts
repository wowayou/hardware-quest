import { marked } from 'marked';
import './styles.css';
import { checkAnswer, describeAnswer } from './answer';
import { content, type LoadedLevel } from './content';
import { circuitUrl, wokwiNewUrl } from './lab';
import {
  continueTarget,
  isDone,
  nextLevel,
  nodeStates,
  stats,
  withHints,
  withRevealed,
  withSolved,
  type NodeState,
  type Progress,
} from './progress';
import { clearProgress, isReadOnly, loadProgress, saveProgress } from './storage';
import { S } from './strings';

/* ---------------- 状态 ---------------- */

const { chapters, levels, errors } = content;
const loaded = loadProgress();
let progress: Progress = loaded.progress;
let saveFailed = false;

function commit(next: Progress): void {
  progress = next;
  const ok = saveProgress(next);
  const failed = !ok && !isReadOnly();
  if (failed !== saveFailed) {
    saveFailed = failed;
    updateNotices();
  }
}

/* ---------------- DOM 小工具 ---------------- */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | EventListener | null | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v as string;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** 关卡正文是本仓库里的一手内容（不是用户输入），所以可以直接 innerHTML。 */
function prose(text: string): HTMLElement {
  const div = h('div', { class: 'prose' });
  div.innerHTML = marked.parse(text, { async: false }) as string;
  for (const a of div.querySelectorAll('a')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return div;
}

function focusTitle(el: HTMLElement | null): void {
  if (!el) return;
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

/** 复制按钮：优先用剪贴板 API，失败就选中文本并提示手动复制。 */
function copyControl(text: string, selectable: HTMLElement, details?: HTMLDetailsElement): HTMLElement {
  const status = h('span', { class: 'copy-status', role: 'status' });
  const btn = h('button', {
    type: 'button',
    class: 'btn small',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = S.copied;
      } catch {
        if (details) details.open = true;
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          const r = document.createRange();
          r.selectNodeContents(selectable);
          sel.addRange(r);
        }
        status.textContent = S.copySelected;
      }
    },
  }, S.copy);
  return h('span', { class: 'copy' }, btn, status);
}

function link(href: string, cls: string, text: string, external = false): HTMLAnchorElement {
  return h('a', { href, class: cls, target: external ? '_blank' : null, rel: external ? 'noopener' : null }, text);
}

/* ---------------- 页面外壳 ---------------- */

const app = document.getElementById('app') as HTMLElement;
const notices = h('div', { class: 'notices' });

function updateNotices(): void {
  const items: HTMLElement[] = [];
  if (errors.length > 0) {
    items.push(
      h('div', { class: 'banner error', role: 'alert' }, h('strong', null, S.errorsTitle(errors.length)), h('ul', null, ...errors.map((e) => h('li', null, e)))),
    );
  }
  if (isReadOnly()) items.push(h('div', { class: 'banner warn', role: 'status' }, S.readOnlyBanner));
  if (saveFailed) items.push(h('div', { class: 'banner warn', role: 'status' }, S.storageFailed));
  notices.replaceChildren(...items);
}

function shell(main: HTMLElement): void {
  const st = stats(levels, progress);
  app.replaceChildren(
    h('a', { href: '#main', class: 'skip', onclick: (e: Event) => { e.preventDefault(); focusTitle(main.querySelector('h1')); } }, S.skip),
    h('header', { class: 'top' },
      h('a', { href: '#/', class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', null, S.brand)),
      h('nav', { 'aria-label': '主导航' },
        link('#/', 'navlink', S.navHome),
        link('#/cards', 'navlink', S.navCards),
        h('span', { class: 'navcount mono', 'aria-label': S.progressLabel(st.done, st.total) }, `${st.done}/${st.total}`),
      ),
    ),
    notices,
    main,
  );
  updateNotices();
}

/* ---------------- 首页 ---------------- */

const stateText: Record<NodeState, string> = {
  solved: S.stateSolved,
  revealed: S.stateRevealed,
  current: S.stateCurrent,
  locked: S.stateLocked,
};

function renderHome(): HTMLElement {
  const main = h('main', { id: 'main', class: 'page home' });
  main.append(h('h1', null, h('span', { class: 'h1-main' }, S.brand), h('span', { class: 'h1-en mono' }, S.brandEn)));
  main.append(h('p', { class: 'lead' }, S.tagline), h('p', { class: 'muted' }, S.taglineSub));

  if (levels.length === 0) {
    main.append(h('section', { class: 'empty' }, h('h2', null, S.emptyTitle), h('p', null, S.emptyBody)));
    main.append(resetBlock());
    return main;
  }

  const st = stats(levels, progress);
  const target = continueTarget(levels, progress);
  const pct = Math.round((st.done / st.total) * 100);
  main.append(
    h('section', { class: 'status', 'aria-label': '总进度' },
      h('div', null,
        h('p', { class: 'status-main' }, S.progressLabel(st.done, st.total)),
        h('p', { class: 'muted small-text' }, S.progressDetail(st.solved, st.revealed)),
        h('div', { class: 'meter', role: 'presentation' }, h('div', { class: 'meter-fill', style: `width:${pct}%` })),
      ),
      target
        ? link(`#/level/${target.id}`, 'btn primary', st.done === 0 ? S.btnStart : S.btnContinue)
        : h('div', { class: 'alldone' }, h('p', null, S.allDone), link('#/cards', 'btn primary', S.btnToCards)),
    ),
  );

  const states = nodeStates(levels, progress);
  const numbers = new Map(levels.map((l, i) => [l.id, i] as const));
  for (const ch of chapters) {
    const mine = levels.filter((l) => l.chapter === ch.id);
    if (mine.length === 0) continue;
    main.append(
      h('section', { class: 'chapter' },
        h('h2', null, ch.title),
        h('p', { class: 'muted' }, ch.intro),
        h('ol', { class: 'trace' }, ...mine.map((l) => {
          const i = numbers.get(l.id) as number;
          const state = states[i];
          const body = [
            h('span', { class: 'pad', 'aria-hidden': 'true' }),
            h('span', { class: 'node-text' },
              h('span', { class: 'node-no mono' }, S.levelNo(i + 1)),
              h('span', { class: 'node-title' }, state === 'locked' ? '???' : l.title),
              state === 'locked' ? null : h('span', { class: 'node-concept' }, l.concept),
            ),
            h('span', { class: 'node-state' }, stateText[state]),
          ];
          return h('li', { class: `state-${state}` },
            state === 'locked'
              ? h('div', { class: 'node', 'aria-disabled': 'true' }, ...body)
              : h('a', { class: 'node', href: `#/level/${l.id}`, 'aria-current': state === 'current' ? 'step' : null }, ...body),
          );
        })),
      ),
    );
  }
  main.append(resetBlock());
  return main;
}

function resetBlock(): HTMLElement {
  const box = h('footer', { class: 'reset' });
  const status = h('p', { class: 'muted small-text', role: 'status' });
  const show = () => {
    box.replaceChildren(h('button', { type: 'button', class: 'linkbtn', onclick: ask }, S.resetBtn), status);
  };
  const ask = () => {
    const confirmBtn = h('button', {
      type: 'button',
      class: 'btn danger small',
      onclick: () => {
        if (isReadOnly()) {
          show();
          status.textContent = S.resetBlocked;
          return;
        }
        progress = { levels: {} };
        clearProgress();
        render(false);
        const s = document.querySelector('.reset [role=status]');
        if (s) s.textContent = S.resetDone;
      },
    }, S.resetConfirm);
    box.replaceChildren(
      h('p', { class: 'small-text' }, S.resetAsk),
      h('div', { class: 'row' }, confirmBtn, h('button', { type: 'button', class: 'btn small', onclick: show }, S.resetCancel)),
      status,
    );
    confirmBtn.focus();
  };
  show();
  return box;
}

/* ---------------- 关卡页 ---------------- */

function labBlock(level: LoadedLevel): HTMLElement | null {
  const lab = level.lab;
  if (lab.tool === 'none') return null;
  const sec = h('section', { class: 'block lab' }, h('h2', null, S.sectionLab));

  if (lab.tool === 'falstad') {
    const text = level.fileContents[lab.files[0]] ?? '';
    const pre = h('pre', { class: 'code mono', tabindex: '0' }, text);
    const details = h('details', null, h('summary', null, S.labFalstadText));
    details.append(h('p', { class: 'muted' }, S.labFalstadFallback), copyControl(text, pre, details), pre);
    sec.append(
      h('div', { class: 'lab-main' }, link(circuitUrl(text), 'btn primary big', S.labFalstadOpen, true), h('p', { class: 'muted' }, S.labFalstadNote)),
      details,
    );
    return sec;
  }

  // wokwi
  const steps = h('ol', { class: 'steps' },
    h('li', null, S.labWokwiStep1, h('div', null, link(wokwiNewUrl(lab.board), 'btn primary', S.labWokwiOpen, true))),
    h('li', null, S.labWokwiStep2,
      h('div', { class: 'files' }, ...lab.files.map((name) => {
        const text = level.fileContents[name] ?? '';
        const pre = h('pre', { class: 'code mono', tabindex: '0' }, text);
        const d = h('details', null, h('summary', null, S.preview), pre);
        return h('div', { class: 'file' },
          h('div', { class: 'file-head' }, h('code', { class: 'mono filename' }, name), copyControl(text, pre, d)),
          d,
        );
      })),
    ),
    h('li', null, S.labWokwiStep3),
  );
  if (lab.url) {
    sec.append(
      h('div', { class: 'lab-main' }, link(lab.url, 'btn primary big', S.labWokwiOneClick, true), h('p', { class: 'muted' }, S.labWokwiOneClickNote)),
      h('details', null, h('summary', null, S.labWokwiFallback), steps),
    );
  } else {
    sec.append(steps);
  }
  return sec;
}

function renderLevel(level: LoadedLevel, index: number): HTMLElement {
  const chapter = chapters.find((c) => c.id === level.chapter);
  const main = h('main', { id: 'main', class: 'page level' });
  main.append(
    h('p', { class: 'crumb' },
      link('#/', 'crumb-link', S.backHome), ' / ', chapter?.title ?? '', ' / ', h('span', { class: 'mono' }, S.levelNo(index + 1))),
    h('h1', null, level.title),
    h('p', { class: 'concept' }, h('span', { class: 'tag' }, S.conceptLabel), level.concept),
  );
  const block = (title: string, body: Node) => h('section', { class: 'block' }, h('h2', null, title), body);
  main.append(block(S.sectionStory, prose(level.story)), block(S.sectionKnowledge, prose(level.knowledge)), block(S.sectionTask, prose(level.task)));
  const lab = labBlock(level);
  if (lab) main.append(lab);

  /* 答案 */
  const ans = level.answer;
  const input = h('input', {
    id: 'answer-input',
    class: 'mono',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    inputmode: ans.type === 'number' ? 'decimal' : 'text',
    'aria-describedby': 'answer-meta answer-feedback',
  });
  const feedback = h('p', { id: 'answer-feedback', class: 'feedback', role: 'status' });
  const setFeedback = (kind: 'ok' | 'warn' | 'err' | '', text: string) => {
    feedback.className = `feedback ${kind}`;
    feedback.textContent = text;
  };
  const metaText = ans.type === 'text' ? (ans.format ? S.answerFormat(ans.format) : '') : ans.unit ? S.answerUnit(ans.unit) : '';
  const form = h('form', {
    class: 'answer-form',
    novalidate: true,
    onsubmit: (e: Event) => {
      e.preventDefault();
      const v = checkAnswer(input.value, ans);
      if (v === 'invalid') {
        setFeedback(ans.type === 'number' ? 'err' : 'warn', ans.type === 'number' ? S.answerNeedNumber : S.answerEmptyText);
        if (ans.type === 'number') input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.removeAttribute('aria-invalid');
      if (v === 'wrong') {
        setFeedback('warn', S.answerWrong);
        return;
      }
      commit(withSolved(progress, level.id));
      setFeedback('ok', S.answerRight);
      refresh();
      focusTitle(resultBox.querySelector('h2'));
    },
  },
    h('label', { for: 'answer-input' }, S.answerLabel),
    h('div', { class: 'row' },
      input,
      ans.type === 'number' && ans.unit ? h('span', { class: 'unit mono' }, ans.unit) : null,
      h('button', { type: 'submit', class: 'btn primary' }, S.answerSubmit),
    ),
    h('p', { id: 'answer-meta', class: 'muted small-text' }, metaText),
    feedback,
  );
  main.append(block(S.sectionAnswer, form));

  /* 提示 */
  const hintsBox = h('section', { class: 'block hints' });
  const resultBox = h('section', { class: 'block result' });
  main.append(hintsBox, resultBox);

  function renderHints(focusNew = false): void {
    const entry = progress.levels[level.id];
    const shown = Math.min(entry?.hints ?? 0, level.hints.length);
    const done = isDone(entry) && entry?.status === 'solved';
    const parts: Child[] = [h('h2', null, S.sectionHints)];
    if (shown === 0) parts.push(h('p', { class: 'muted' }, S.hintsNone));
    const items = level.hints.slice(0, shown).map((t, i) =>
      h('div', { class: 'hint', id: `hint-${i + 1}` }, h('h3', null, S.hintN(i + 1)), prose(t)),
    );
    parts.push(...items);
    if (!done && shown < level.hints.length) {
      parts.push(h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => {
          commit(withHints(progress, level.id, shown + 1, level.hints.length));
          renderHints(true);
        },
      }, S.hintReveal(shown + 1, level.hints.length)));
    } else if (!isDone(entry) && shown >= level.hints.length) {
      parts.push(revealControl());
    }
    hintsBox.replaceChildren(...parts.filter(Boolean) as Node[]);
    if (focusNew && items.length > 0) focusTitle(items[items.length - 1].querySelector('h3'));
  }

  function revealControl(): HTMLElement {
    const wrap = h('div', { class: 'reveal' });
    const first = () =>
      wrap.replaceChildren(h('button', { type: 'button', class: 'btn', onclick: ask }, S.showAnswer));
    const ask = () => {
      const ok = h('button', {
        type: 'button',
        class: 'btn danger',
        onclick: () => {
          commit(withRevealed(progress, level.id));
          refresh();
          focusTitle(resultBox.querySelector('h2'));
        },
      }, S.showAnswerConfirm);
      wrap.replaceChildren(
        h('p', null, S.showAnswerAsk),
        h('div', { class: 'row' }, ok, h('button', { type: 'button', class: 'btn', onclick: () => { first(); (wrap.querySelector('button') as HTMLElement).focus(); } }, S.showAnswerCancel)),
      );
      ok.focus();
    };
    first();
    return wrap;
  }

  function renderResult(): void {
    const status = progress.levels[level.id]?.status;
    if (!status) {
      resultBox.replaceChildren();
      resultBox.hidden = true;
      return;
    }
    resultBox.hidden = false;
    const next = nextLevel(levels, level.id);
    resultBox.replaceChildren(
      h('h2', { class: status === 'solved' ? 'ok' : '' }, status === 'solved' ? S.resultSolved : S.resultRevealed),
      status === 'revealed'
        ? h('p', null, S.theAnswerIs, h('code', { class: 'mono answer-reveal' }, describeAnswer(ans)), ' ', h('span', { class: 'muted' }, S.resultRevealedNote))
        : h('span', { hidden: true }),
      h('h3', null, S.sectionReview),
      prose(level.review),
      h('aside', { class: 'knowcard' }, h('span', { class: 'knowcard-label' }, S.cardGot), h('strong', null, level.concept), h('p', null, level.card)),
      next ? link(`#/level/${next.id}`, 'btn primary big', S.btnNext) : link('#/cards', 'btn primary big', S.btnLast),
    );
  }

  function refresh(): void {
    renderHints();
    renderResult();
  }
  refresh();
  return main;
}

/* ---------------- 图鉴 ---------------- */

function renderCards(): HTMLElement {
  const main = h('main', { id: 'main', class: 'page cards' });
  const st = stats(levels, progress);
  main.append(h('h1', null, S.cardsTitle), h('p', { class: 'lead' }, S.cardsIntro));
  if (levels.length === 0) {
    main.append(h('p', { class: 'muted' }, S.cardsEmpty));
    return main;
  }
  main.append(h('p', { class: 'muted mono' }, S.cardsCount(st.done, st.total)));
  main.append(
    h('ul', { class: 'cardgrid' }, ...levels.map((l, i) => {
      const got = isDone(progress.levels[l.id]);
      return got
        ? h('li', { class: 'card got' },
            h('span', { class: 'node-no mono' }, S.levelNo(i + 1)),
            h('h2', null, l.concept),
            h('p', null, l.card),
            link(`#/level/${l.id}`, 'cardlink', `${S.cardGo}：${l.title}`),
          )
        : h('li', { class: 'card empty-card' },
            h('span', { class: 'node-no mono' }, S.levelNo(i + 1)),
            h('h2', { class: 'mono' }, '? ? ?'),
            h('p', { class: 'muted' }, `${S.cardLocked}。${S.cardLockedHint}`),
          );
    })),
  );
  return main;
}

/* ---------------- 路由 ---------------- */

type Route = { name: 'home' } | { name: 'cards' } | { name: 'level'; level: LoadedLevel; index: number };

function parseRoute(hash: string): Route | null {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };
  if (path === '/cards') return { name: 'cards' };
  const m = /^\/level\/([^/]+)$/.exec(path);
  if (m) {
    let id = m[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      return null;
    }
    const index = levels.findIndex((l) => l.id === id);
    if (index >= 0 && nodeStates(levels, progress)[index] !== 'locked') return { name: 'level', level: levels[index], index };
  }
  return null;
}

function render(scroll = true): void {
  let route = parseRoute(location.hash);
  if (!route) {
    history.replaceState(null, '', '#/');
    route = { name: 'home' };
  }
  let main: HTMLElement;
  let title: string = S.brand;
  if (route.name === 'home') main = renderHome();
  else if (route.name === 'cards') {
    main = renderCards();
    title = `${S.cardsTitle} · ${S.brand}`;
  } else {
    main = renderLevel(route.level, route.index);
    title = `${route.level.title} · ${S.brand}`;
  }
  document.title = title === S.brand ? `${S.brand} · ${S.brandEn}` : title;
  shell(main);
  if (scroll) window.scrollTo(0, 0);
  focusTitle(main.querySelector('h1'));
}

window.addEventListener('hashchange', () => render(true));
render(false);
