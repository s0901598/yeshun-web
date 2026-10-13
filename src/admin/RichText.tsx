// 可以上色、加粗的文字欄位：選取文字 → 按「B 加粗」或「文字顏色」。
// 值是帶標記的純文字（格式見 src/lib/rich.ts），官網用同一支解析，看到的跟這裡一樣。
// 不用瀏覽器的 execCommand（各瀏覽器結果不一致），而是用「第幾個字到第幾個字」直接改片段再重畫。
import { useEffect, useRef, useState } from 'preact/hooks';
import { contrast, parseRich, segHtml, stringifyRich, type Seg } from '../lib/rich';

const SWATCHES = [
  { hex: '#94703a', name: '咖啡金' }, { hex: '#c3a27f', name: '香檳金' }, { hex: '#d7942d', name: '橘金' },
  { hex: '#b8432a', name: '磚紅' }, { hex: '#2f6f4f', name: '墨綠' }, { hex: '#2b5c8a', name: '深藍' },
  { hex: '#6f6a63', name: '灰' }, { hex: '#1c1b1a', name: '黑' },
];
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ---------- DOM ↔ 片段 ----------
function readDom(root: HTMLElement): Seg[] {
  const out: Seg[] = [];
  const walk = (node: Node, bold: boolean, color: string | undefined) => {
    node.childNodes.forEach((child, i) => {
      if (child.nodeType === Node.TEXT_NODE) { out.push({ text: (child.textContent ?? '').replace(/ /g, ' '), bold, color }); return; }
      if (!(child instanceof HTMLElement)) return;
      if (child.tagName === 'BR') { out.push({ text: '\n' }); return; }
      const block = /^(DIV|P)$/.test(child.tagName);
      if (block && (i > 0 || out.length)) out.push({ text: '\n' });
      const fw = child.style.fontWeight;
      const b = bold || /^(B|STRONG)$/.test(child.tagName) || fw === 'bold' || Number(fw) >= 600;
      const c = child.style.color ? toHex(child.style.color) : child.getAttribute('color') ?? color;
      walk(child, b, c && HEX.test(c) ? c.toLowerCase() : color);
    });
  };
  walk(root, false, undefined);
  return out;
}
function toHex(css: string): string {
  if (css.startsWith('#')) return css;
  const m = css.match(/\d+/g);
  return m && m.length >= 3 ? `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : css;
}
const toEditorHtml = (value: string) => segHtml(parseRich(value)).replace(/\n/g, '<br>') + (value.endsWith('\n') ? '<br>' : '');

// 選取範圍 ↔ 「第幾個字」
function nodeLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').length;
  if (n instanceof HTMLElement && n.tagName === 'BR') return 1;
  let sum = 0; n.childNodes.forEach((c) => { sum += nodeLength(c); }); return sum;
}
function toOffset(root: HTMLElement, node: Node, off: number): number {
  let total = 0;
  const find = (cur: Node): boolean => {
    if (cur === node) {
      if (cur.nodeType === Node.TEXT_NODE) { total += off; return true; }
      for (let i = 0; i < off && i < cur.childNodes.length; i++) total += nodeLength(cur.childNodes[i]);
      return true;
    }
    if (cur.nodeType === Node.TEXT_NODE || (cur instanceof HTMLElement && cur.tagName === 'BR')) { total += nodeLength(cur); return false; }
    for (const c of Array.from(cur.childNodes)) if (find(c)) return true;
    return false;
  };
  find(root);
  return total;
}
function fromOffset(root: HTMLElement, target: number): [Node, number] {
  let left = target;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n.textContent ?? '').length;
      if (left <= len) return [n, left];
      left -= len;
    } else if ((n as HTMLElement).tagName === 'BR') {
      if (left === 0) return [n.parentNode!, Array.from(n.parentNode!.childNodes).indexOf(n as ChildNode)];
      left -= 1;
    }
    n = walker.nextNode();
  }
  return [root, root.childNodes.length];
}

// 把 [from, to) 這段字套上 patch（加粗／顏色），其他字不變
function applyRange(segs: Seg[], from: number, to: number, patch: (s: Seg) => Seg): Seg[] {
  const out: Seg[] = []; let pos = 0;
  for (const s of segs) {
    const end = pos + s.text.length;
    const a = Math.max(from, pos), b = Math.min(to, end);
    if (a >= b) out.push(s);
    else {
      if (a > pos) out.push({ ...s, text: s.text.slice(0, a - pos) });
      out.push(patch({ ...s, text: s.text.slice(a - pos, b - pos) }));
      if (b < end) out.push({ ...s, text: s.text.slice(b - pos) });
    }
    pos = end;
  }
  return out;
}

export function RichText(props: {
  value: string; onInput: (v: string) => void; multiline?: boolean; rows?: number; label: string; placeholder?: string; compact?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const saved = useRef<[number, number] | null>(null);
  const [palette, setPalette] = useState(false);
  const [hex, setHex] = useState('#94703a');
  const [hint, setHint] = useState('');

  // 外部改了值（載入、復原）才重畫；自己打字造成的變化不重畫，游標才不會跳
  useEffect(() => {
    if (area.current && props.value !== emitted.current) {
      area.current.innerHTML = toEditorHtml(props.value ?? '');
      emitted.current = props.value;
    }
  }, [props.value]);

  const emit = (segs: Seg[]) => {
    let v = stringifyRich(segs);
    if (!props.multiline) v = v.replace(/\n/g, '');
    emitted.current = v;
    props.onInput(v);
  };
  const onInput = () => area.current && emit(readDom(area.current));

  const selection = (): [number, number] | null => {
    const sel = window.getSelection();
    const root = area.current;
    if (!sel || !root || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = toOffset(root, r.startContainer, r.startOffset), b = toOffset(root, r.endContainer, r.endOffset);
    return a === b ? null : [Math.min(a, b), Math.max(a, b)];
  };
  const restore = ([a, b]: [number, number]) => {
    const root = area.current!; const sel = window.getSelection()!;
    const r = document.createRange();
    r.setStart(...fromOffset(root, a)); r.setEnd(...fromOffset(root, b));
    sel.removeAllRanges(); sel.addRange(r);
  };
  const format = (patch: (s: Seg) => Seg, range = selection() ?? saved.current) => {
    const root = area.current;
    if (!root || !range) { setHint('請先用滑鼠或手指選取要改的字'); return; }
    setHint('');
    const segs = applyRange(readDom(root), range[0], range[1], patch);
    root.innerHTML = toEditorHtml(stringifyRich(segs));
    emit(segs);
    root.focus();
    restore(range);
  };
  const toggleBold = () => {
    const range = selection();
    if (!range) { setHint('請先用滑鼠或手指選取要加粗的字'); return; }
    let all = true; let pos = 0;
    for (const s of readDom(area.current!)) {
      const end = pos + s.text.length;
      if (end > range[0] && pos < range[1] && s.text.trim() && !s.bold) all = false;
      pos = end;
    }
    format((s) => ({ ...s, bold: !all }), range);
  };
  const openPalette = () => {
    const range = selection();
    if (!range) { setHint('請先用滑鼠或手指選取要上色的字'); return; }
    saved.current = range;
    setPalette(true);
  };
  const applyColor = (c: string | undefined) => {
    if (c && !HEX.test(c)) { setHint('色號格式要像 #c3a27f'); return; }
    format((s) => ({ ...s, color: c?.toLowerCase() }), saved.current);
    setPalette(false);
  };

  const segs = parseRich(props.value);
  const colors = [...new Set(segs.map((s) => s.color).filter(Boolean) as string[])];
  const styled = segs.some((s) => s.bold || s.color);
  const weak = colors.filter((c) => contrast(c, '#ffffff') < 3 || contrast(c, '#1a1a1a') < 3);
  // 工具列按鈕按下時不要搶走欄位裡的選取
  const keep = (e: Event) => e.preventDefault();

  return (
    <div class={`a-rich ${props.compact ? 'a-rich--compact' : ''}`}>
      <div class="a-rich__bar" role="toolbar" aria-label={`${props.label} 文字樣式`}>
        <button type="button" class="a-rich__btn" onMouseDown={keep} onClick={toggleBold} aria-label={`${props.label} 加粗`}><b>B</b> 加粗</button>
        <button type="button" class="a-rich__btn" onMouseDown={keep} onClick={openPalette} aria-label={`${props.label} 文字顏色`} aria-expanded={palette}>
          <span class="a-rich__a" style={`border-color:${hex}`}>A</span> 文字顏色
        </button>
        {hint && <span class="a-rich__hint" role="status">{hint}</span>}
      </div>
      {palette && (
        <div class="a-rich__palette" role="dialog" aria-label="選擇文字顏色">
          <div class="a-rich__swatches">
            {SWATCHES.map((s) => (
              <button type="button" key={s.hex} class="a-rich__swatch" style={`background:${s.hex}`} title={`${s.name} ${s.hex}`} aria-label={`${s.name} ${s.hex}`}
                onClick={() => { setHex(s.hex); applyColor(s.hex); }} />
            ))}
          </div>
          <div class="a-rich__custom">
            <label class="a-rich__picker" title="調色盤">
              <input type="color" value={HEX.test(hex) && hex.length === 7 ? hex : '#94703a'} aria-label="調色盤"
                onInput={(e) => setHex((e.target as HTMLInputElement).value)} />
            </label>
            <input class="a-rich__hex" value={hex} aria-label="色號" placeholder="#c3a27f" maxLength={7}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value.trim(); setHex(v.startsWith('#') ? v : `#${v}`); }} />
            <button type="button" class="a-btn a-btn--primary a-btn--small" onClick={() => applyColor(hex)}>套用</button>
          </div>
          <div class="a-rich__custom">
            <button type="button" class="a-text-btn" onClick={() => applyColor(undefined)}>清除顏色</button>
            <button type="button" class="a-text-btn" onClick={() => setPalette(false)}>取消</button>
          </div>
        </div>
      )}
      <div
        ref={area}
        class={`a-rich__area ${props.multiline ? 'is-multi' : ''}`}
        style={props.multiline ? `min-height:${(props.rows ?? 3) * 1.7 + 1.2}em` : undefined}
        contentEditable
        role="textbox"
        aria-multiline={props.multiline ? 'true' : 'false'}
        aria-label={props.label}
        data-placeholder={props.placeholder ?? ''}
        onInput={onInput}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!props.multiline) return;
          // 換行一律用 <br>，各瀏覽器一致
          const sel = window.getSelection(); if (!sel?.rangeCount) return;
          const r = sel.getRangeAt(0); r.deleteContents();
          const br = document.createElement('br'); r.insertNode(br);
          if (!br.nextSibling) br.after(document.createElement('br'));
          r.setStartAfter(br); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
          onInput();
        }}
        onPaste={(e) => {
          // 貼上一律變純文字，避免帶進其他網站的字型、顏色
          e.preventDefault();
          let t = e.clipboardData?.getData('text/plain') ?? '';
          if (!props.multiline) t = t.replace(/\s*\n\s*/g, ' ');
          const sel = window.getSelection(); if (!sel?.rangeCount) return;
          const r = sel.getRangeAt(0); r.deleteContents();
          const lines = t.split('\n'); const frag = document.createDocumentFragment();
          lines.forEach((line, i) => { if (i) frag.append(document.createElement('br')); frag.append(document.createTextNode(line)); });
          const last = frag.lastChild; r.insertNode(frag);
          if (last) { r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
          onInput();
        }}
      />
      {styled && (
        <div class="a-rich__preview" aria-label="官網預覽">
          <span class="a-rich__plabel">官網預覽</span>
          <div class="a-rich__pbox a-rich__pbox--light" dangerouslySetInnerHTML={{ __html: segHtml(segs).replace(/\n/g, '<br>') }} />
          <div class="a-rich__pbox a-rich__pbox--dark" dangerouslySetInnerHTML={{ __html: segHtml(segs).replace(/\n/g, '<br>') }} />
          {weak.length > 0 && (
            <p class="a-rich__warn">⚠ {weak.join('、')} 在{weak.some((c) => contrast(c, '#ffffff') < 3) ? '白底' : ''}{weak.some((c) => contrast(c, '#ffffff') < 3) && weak.some((c) => contrast(c, '#1a1a1a') < 3) ? '或' : ''}{weak.some((c) => contrast(c, '#1a1a1a') < 3) ? '黑底（深色模式）' : ''}上比較不清楚，建議換深一點或亮一點的顏色。仍然可以存檔。</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 跟 Field 一樣的外觀，但外層不是 <label>（label 會把點擊轉給裡面第一個按鈕） */
export function RichField(props: { label: string; hint?: string; value: string; onInput: (v: string) => void; multiline?: boolean; rows?: number; placeholder?: string }) {
  return (
    <div class="a-field">
      <span class="a-field__label">{props.label}</span>
      <RichText label={props.label} value={props.value} onInput={props.onInput} multiline={props.multiline} rows={props.rows} placeholder={props.placeholder} />
      {props.hint && <span class="a-field__hint">{props.hint}</span>}
    </div>
  );
}
