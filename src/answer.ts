/** 答案归一化与比较。纯函数。 */
import type { Answer } from './level-format';

export type Verdict = 'correct' | 'wrong' | 'invalid';

/** 全角字符转半角（！到～、全角空格、各种减号）。 */
export function toHalfWidth(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c >= 0xff01 && c <= 0xff5e) out += String.fromCodePoint(c - 0xfee0);
    else if (c === 0x3000) out += ' ';
    else if (c === 0x2212 || c === 0x2013 || c === 0xfe63) out += '-';
    else out += ch;
  }
  return out;
}

/** 文本答案归一化：全角转半角、去掉所有空白（含零宽字符）、不分大小写。 */
export function normalizeText(s: string): string {
  return toHalfWidth(s).replace(/[\s\u200b-\u200d\ufeff]+/g, '').toLowerCase();
}

export function checkText(input: string, accept: string[]): Verdict {
  const n = normalizeText(input);
  if (n === '') return 'invalid';
  return accept.some((a) => normalizeText(a) === n) ? 'correct' : 'wrong';
}

const NUM_RE = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;

/** 只取开头的数字（单位和其余内容忽略）；不是数字返回 null。 */
export function parseNumber(input: string): number | null {
  const m = NUM_RE.exec(toHalfWidth(input));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function checkNumber(input: string, value: number, tolerance: number): Verdict {
  const n = parseNumber(input);
  if (n === null) return 'invalid';
  // 浮点误差留一点余地，保证"恰好等于容差"算对（例如 9.7 与 9.2，容差 0.5）
  const slack = 1e-9 * Math.max(1, Math.abs(value), Math.abs(n));
  return Math.abs(n - value) <= tolerance + slack ? 'correct' : 'wrong';
}

export function checkAnswer(input: string, answer: Answer): Verdict {
  return answer.type === 'text' ? checkText(input, answer.accept) : checkNumber(input, answer.value, answer.tolerance);
}

/** 给玩家看的"标准答案"文字。 */
export function describeAnswer(answer: Answer): string {
  if (answer.type === 'text') return answer.accept[0];
  const tol = answer.tolerance > 0 ? `（±${answer.tolerance}）` : '';
  return `${answer.value}${answer.unit ? ' ' + answer.unit : ''}${tol}`;
}
