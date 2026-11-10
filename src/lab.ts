/** 实验台链接。纯函数。 */
import LZString from 'lz-string';

export const CIRCUITJS_URL = 'https://www.falstad.com/circuit/circuitjs.html';

/** 由电路文本生成 CircuitJS 链接（电路压缩后放在 ctz 参数里）。 */
export function circuitUrl(text: string): string {
  return `${CIRCUITJS_URL}?ctz=${LZString.compressToEncodedURIComponent(text)}`;
}

/** Wokwi 新建工程链接。 */
export function wokwiNewUrl(board = 'arduino-uno'): string {
  return `https://wokwi.com/projects/new/${encodeURIComponent(board)}`;
}
