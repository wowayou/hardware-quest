import { describe, expect, it } from 'vitest';
import { checkAnswer, checkNumber, checkText, describeAnswer, normalizeText, parseNumber } from '../src/answer';

describe('文本答案', () => {
  it('全角转半角', () => {
    expect(normalizeText('ＣＨＩＰ')).toBe('chip');
    expect(normalizeText('ＡＢＣ１２３')).toBe('abc123');
    expect(checkText('ＣＨＩＰ', ['CHIP'])).toBe('correct');
  });
  it('不分大小写', () => expect(checkText('chip', ['CHIP'])).toBe('correct'));
  it('首尾、中间空白（含全角空格、换行、零宽）', () => {
    expect(checkText('  C H　I\tP\n', ['CHIP'])).toBe('correct');
    expect(checkText('CH​IP', ['CHIP'])).toBe('correct');
  });
  it('多个可接受答案', () => {
    expect(checkText('芯片', ['CHIP', '芯片'])).toBe('correct');
    expect(checkText('chip', ['CHIP', '芯片'])).toBe('correct');
    expect(checkText('boat', ['CHIP', '芯片'])).toBe('wrong');
  });
  it('accept 里的写法也被归一化', () => expect(checkText('a b', ['A-B', 'Ａ Ｂ'])).toBe('correct'));
  it('空输入是无效', () => expect(checkText('  ', ['CHIP'])).toBe('invalid'));
});

describe('数值答案', () => {
  it('容差边界：恰好等于容差算对，超出一点算错', () => {
    expect(checkNumber('9.2', 9.7, 0.5)).toBe('correct');
    expect(checkNumber('10.2', 9.7, 0.5)).toBe('correct');
    expect(checkNumber('9.1999', 9.7, 0.5)).toBe('wrong');
    expect(checkNumber('10.21', 9.7, 0.5)).toBe('wrong');
    expect(checkNumber('3.35', 3.3, 0.05)).toBe('correct');
    expect(checkNumber('0.3', 0.1, 0.2)).toBe('correct');
  });
  it('容差为 0 要完全相等', () => {
    expect(checkNumber('5', 5, 0)).toBe('correct');
    expect(checkNumber('5.01', 5, 0)).toBe('wrong');
  });
  it('带单位', () => {
    expect(checkNumber('9.7 mA', 9.7, 0.5)).toBe('correct');
    expect(checkNumber('9.7mA', 9.7, 0.5)).toBe('correct');
    expect(checkNumber('3.3V', 3.3, 0.05)).toBe('correct');
    expect(checkNumber('5 eV', 5, 0)).toBe('correct');
  });
  it('负数、正号、前导小数点、全角', () => {
    expect(checkNumber('-3.3', -3.3, 0.05)).toBe('correct');
    expect(checkNumber('−3.3 V', -3.3, 0.05)).toBe('correct');
    expect(checkNumber('－3.3', -3.3, 0.05)).toBe('correct');
    expect(checkNumber('3.3', -3.3, 0.05)).toBe('wrong');
    expect(checkNumber('+5', 5, 0)).toBe('correct');
    expect(checkNumber('.5', 0.5, 0)).toBe('correct');
    expect(checkNumber('９．７', 9.7, 0.01)).toBe('correct');
  });
  it('科学计数法', () => expect(checkNumber('1e3', 1000, 0)).toBe('correct'));
  it('非数字是"无效"而不是"错"', () => {
    for (const s of ['', '  ', 'abc', 'mA', '-', '.', 'V 3.3']) expect(checkNumber(s, 9.7, 0.5), s).toBe('invalid');
  });
  it('parseNumber 只取开头的数字', () => {
    expect(parseNumber('  12.5abc')).toBe(12.5);
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('checkAnswer / describeAnswer', () => {
  it('按类型分发', () => {
    expect(checkAnswer('chip', { type: 'text', accept: ['CHIP'] })).toBe('correct');
    expect(checkAnswer('9.7mA', { type: 'number', value: 9.7, tolerance: 0.1, unit: 'mA' })).toBe('correct');
    expect(checkAnswer('x', { type: 'number', value: 9.7, tolerance: 0.1 })).toBe('invalid');
  });
  it('描述答案', () => {
    expect(describeAnswer({ type: 'text', accept: ['CHIP', 'x'] })).toBe('CHIP');
    expect(describeAnswer({ type: 'number', value: 9.7, tolerance: 0.5, unit: 'mA' })).toBe('9.7 mA（±0.5）');
    expect(describeAnswer({ type: 'number', value: 3, tolerance: 0 })).toBe('3');
  });
});
