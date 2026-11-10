import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import { circuitUrl, wokwiNewUrl } from '../src/lab';
import { readFlat, ROOT } from './helpers';

describe('lab', () => {
  it('ctz 链接解压后与原文本逐字相同', () => {
    const samples = [
      '$ 1 0.000005 10.2 50 5 50\nr 1 2 3 4 0 1000\n',
      '含中文 // 注释\r\n  行首空格\t制表符 "引号" & ? # %\n',
      readFlat(`${ROOT}tests/fixtures/falstad-ok`)['circuit.txt'],
      '',
    ];
    for (const text of samples) {
      const url = circuitUrl(text);
      expect(url.startsWith('https://www.falstad.com/circuit/circuitjs.html?ctz=')).toBe(true);
      const ctz = url.split('?ctz=')[1];
      expect(ctz).toMatch(/^[A-Za-z0-9+\-$]*$/); // URL 安全
      expect(LZString.decompressFromEncodedURIComponent(ctz)).toBe(text);
    }
  });
  it('Wokwi 新工程链接，board 默认 arduino-uno', () => {
    expect(wokwiNewUrl()).toBe('https://wokwi.com/projects/new/arduino-uno');
    expect(wokwiNewUrl('esp32')).toBe('https://wokwi.com/projects/new/esp32');
  });
});
