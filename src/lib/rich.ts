// 文字上色／加粗：後台選取文字後套用，存成純文字裡的標記，官網與後台共用這支解析。
// 標記格式：{{b #c3a27f|文字}}——「|」前是樣式（b＝加粗、#色號＝顏色，可以只有其中一個），「|」後是文字。
// 標記不會跨行；沒有標記的文字原樣顯示。
export interface Seg { text: string; bold?: boolean; color?: string }

const MARK = /\{\{((?:b|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?:\s+(?:b|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}))*)\|([^{}\n]*?)\}\}/g;

export function parseRich(s: string | null | undefined): Seg[] {
  const src = s ?? '';
  const out: Seg[] = [];
  let last = 0;
  for (const m of src.matchAll(MARK)) {
    if (m.index! > last) out.push({ text: src.slice(last, m.index) });
    const seg: Seg = { text: m[2] };
    for (const t of m[1].split(/\s+/)) {
      if (t === 'b') seg.bold = true;
      else seg.color = t.toLowerCase();
    }
    out.push(seg);
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return merge(out);
}

// 相鄰同樣式的片段合併；空片段丟掉
function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!s.bold && prev.color === s.color) prev.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

// 片段 → 標記字串（換行會把標記切開，確保標記不跨行）
export function stringifyRich(segs: Seg[]): string {
  return merge(segs).map((s) => {
    const style = [s.bold ? 'b' : '', s.color ?? ''].filter(Boolean).join(' ');
    if (!style) return s.text;
    return s.text.split('\n').map((line) => (line ? `{{${style}|${line.replace(/[{}|]/g, '')}}}` : '')).join('\n');
  }).join('');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function segHtml(segs: Seg[]): string {
  return segs.map((s) => {
    const text = esc(s.text);
    if (!s.bold && !s.color) return text;
    const style = [s.color ? `color:${s.color}` : '', s.bold ? 'font-weight:700' : ''].filter(Boolean).join(';');
    return `<span class="rt" style="${style}">${text}</span>`;
  }).join('');
}

/** 標記字串 → 安全的 HTML（文字都會跳脫） */
export const richHtml = (s: string | null | undefined) => segHtml(parseRich(s));

/** 拿掉標記，只留文字（用在網頁標題、圖片替代文字、分享預覽） */
export const plainText = (s: string | null | undefined) => parseRich(s).map((x) => x.text).join('');

/** 「廠房與公共工程（工業廠房、公共基礎建設）」→ 主標＋括號裡的說明，各自保留顏色／粗體 */
export function splitNote(s: string): { main: string; note: string } {
  const plain = plainText(s);
  const m = plain.match(/^(.+?)[（(](.+)[）)]$/);
  if (!m) return { main: s, note: '' };
  const segs = parseRich(s);
  const take = (from: number, to: number) => {
    const out: Seg[] = []; let pos = 0;
    for (const seg of segs) {
      const a = Math.max(from, pos), b = Math.min(to, pos + seg.text.length);
      if (a < b) out.push({ ...seg, text: seg.text.slice(a - pos, b - pos) });
      pos += seg.text.length;
    }
    return stringifyRich(out);
  };
  const mainEnd = m[1].length;
  return { main: take(0, mainEnd), note: take(mainEnd + 1, plain.length - 1) };
}

/** 對比度（WCAG），後台用來提醒顏色在白底或黑底上看不清楚 */
export function contrast(hex: string, bg: string): number {
  const lum = (h: string) => {
    const v = h.replace('#', '');
    const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hex), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
