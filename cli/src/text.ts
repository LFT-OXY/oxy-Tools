// 按终端里的显示宽度量字、补齐、截断和折行：汉字与全角标点占两列，其余占一列。
import { stripVTControlCharacters } from 'node:util';

const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
];
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
// 收尾标点不放在行首
const NO_LINE_START = '，。、；：！？）》」';

function charWidth(char: string): number {
  if (ZERO_WIDTH.test(char)) return 0;
  const code = char.codePointAt(0) ?? 0;
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of stripVTControlCharacters(text)) width += charWidth(char);
  return width;
}

/** 超出 width 时截断并以 ellipsis 收尾；只用于不带样式的文字。 */
export function truncate(text: string, width: number, ellipsis: string): string {
  if (displayWidth(text) <= width) return text;
  const room = width - displayWidth(ellipsis);
  let kept = '';
  let used = 0;
  for (const char of text) {
    if (used + charWidth(char) > room) break;
    kept += char;
    used += charWidth(char);
  }
  return kept.trimEnd() + ellipsis;
}

export function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const gap = ' '.repeat(Math.max(0, width - displayWidth(text)));
  return align === 'right' ? gap + text : text + gap;
}

/** 西文按词断，中文可在任意两字之间断；放不下的长词（网址、路径）独占一行，不拆开。 */
export function wrap(text: string, width: number): string[] {
  const tokens = text.match(/[\u2e80-\uffef]|[^\s\u2e80-\uffef]+|\s+/gu) ?? [];
  const lines: string[] = [];
  let line: string[] = [];
  for (const token of tokens) {
    if (displayWidth(line.join('') + token) <= width || line.join('').trim() === '') {
      line.push(token);
      continue;
    }
    // 收尾标点不能放在行首：把它前面的那个字一起带到下一行
    const carried = NO_LINE_START.includes(token) && line.length > 1 ? line.splice(-1) : [];
    lines.push(line.join('').trimEnd());
    line = [...carried, ...(token.trim() === '' ? [] : [token])];
  }
  if (line.join('').trim() !== '') lines.push(line.join('').trimEnd());
  return lines;
}
