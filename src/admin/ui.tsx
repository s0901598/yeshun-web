// 後台共用的小元件
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export function Field(props: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <label class="a-field">
      <span class="a-field__label">{props.label}</span>
      {props.children}
      {props.hint && <span class="a-field__hint">{props.hint}</span>}
    </label>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label class={`a-toggle ${props.checked ? 'is-on' : ''}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span class="a-toggle__track" aria-hidden="true"><span /></span>
      <span>{props.label}</span>
    </label>
  );
}

/** 上下移動按鈕 */
export function MoveButtons(props: { index: number; total: number; onMove: (to: number) => void; horizontal?: boolean }) {
  const [prev, next] = props.horizontal ? ['←', '→'] : ['↑', '↓'];
  return (
    <span class="a-move">
      <button type="button" class="a-icon-btn" disabled={props.index === 0} onClick={() => props.onMove(props.index - 1)} aria-label="往前移">{prev}</button>
      <button type="button" class="a-icon-btn" disabled={props.index === props.total - 1} onClick={() => props.onMove(props.index + 1)} aria-label="往後移">{next}</button>
    </span>
  );
}

/** 選照片：一顆「從相簿選」、一顆「拍照」（手機會直接開相機） */
export function PhotoPicker(props: { multiple?: boolean; busy?: string; onFiles: (files: File[]) => void; label?: string }) {
  const pick = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) props.onFiles(files);
  };
  if (props.busy) return <p class="a-busy">{props.busy}</p>;
  return (
    <span class="a-picker">
      <label class="a-btn a-btn--ghost">
        {props.label ?? '從相簿選照片'}
        <input type="file" accept="image/*" multiple={props.multiple} onChange={pick} hidden />
      </label>
      <label class="a-btn a-btn--ghost">
        拍照
        <input type="file" accept="image/*" capture="environment" onChange={pick} hidden />
      </label>
    </span>
  );
}

/** 畫面下方的提示訊息 */
let pushToast: (msg: string, kind?: 'ok' | 'error') => void = () => {};
export const toast = (msg: string, kind: 'ok' | 'error' = 'ok') => pushToast(msg, kind);

export function Toaster() {
  const [item, setItem] = useState<{ id: number; msg: string; kind: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    pushToast = (msg, kind = 'ok') => {
      setItem({ id: Date.now() + Math.random(), msg, kind });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setItem(null), kind === 'error' ? 6000 : 2500);
    };
  }, []);
  if (!item) return null;
  return <div key={item.id} class={`a-toast a-toast--${item.kind}`} role="status">{item.msg}</div>;
}

/** 包住非同步動作：顯示處理中、成功或失敗訊息 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      return true;
    } catch (err) {
      toast(`失敗：${(err as Error).message}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
