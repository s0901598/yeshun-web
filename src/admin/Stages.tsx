// 施工進度：階段與照片的編輯畫面。所有修改先暫存在畫面上，按下方「全部儲存並上傳」才送出。
import { useEffect, useRef, useState } from 'preact/hooks';
import { move, photoUrl } from './lib';
import { Field, MoveButtons, PhotoPicker } from './ui';
import { RichField, RichText } from './RichText';

export interface PhotoDraft {
  key: string;
  id?: string;          // 已存進資料庫的照片才有
  path?: string;        // 照片空間裡的路徑
  file?: File;          // 新選的照片（待上傳）
  preview?: string;     // 新照片的預覽網址
  caption: string;
  hidden: boolean;      // 不放上官網
  published: boolean;   // 已發布到官網
  orig?: { caption: string; hidden: boolean; sort: number };
  deleted?: boolean;    // 標記刪除，儲存後生效
}

export interface StageDraft {
  key: string;
  id?: string;
  name: string;
  date: string;
  note: string;
  orig?: { name: string; date: string; note: string; sort: number };
  photos: PhotoDraft[];
  deleted?: boolean;
}

export const newKey = () => crypto.randomUUID();

/** 這個階段有幾項未儲存的變更 */
export function stageChanges(st: StageDraft, sort: number): number {
  if (st.deleted) return st.id ? 1 : 0;
  let n = !st.id ? 1 : (st.orig && (st.orig.name !== st.name || st.orig.date !== st.date || st.orig.note !== st.note || st.orig.sort !== sort) ? 1 : 0);
  let j = 0;
  for (const ph of st.photos) {
    if (ph.deleted) { if (ph.id) n++; continue; }
    if (ph.file) n++;
    else if (ph.orig && (ph.orig.caption !== ph.caption || ph.orig.hidden !== ph.hidden || ph.orig.sort !== j)) n++;
    j++;
  }
  return n;
}

export function photoStatus(ph: PhotoDraft): { label: string; tone: string } {
  if (ph.file) return { label: '待上傳', tone: 'new' };
  if (ph.hidden) return { label: '不放上官網', tone: 'hidden' };
  if (ph.published) return { label: '已發布', tone: 'live' };
  return { label: '未發布', tone: 'draft' };
}

interface Props {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  coverKey: string | null;            // 目前封面是哪一張照片（photo key）
  onSetCover: (ph: PhotoDraft) => void;
}

export default function Stages(props: Props) {
  const { stages, onChange } = props;
  const [focusKey, setFocusKey] = useState<string | null>(null); // 剛新增的階段，畫面自動移過去
  const visible = stages.filter((s) => !s.deleted);

  const update = (key: string, patch: Partial<StageDraft>) =>
    onChange(stages.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  // 新增階段：插在指定階段的下面（沒有指定就放最後）
  const addAfter = (key: string | null) => {
    const st: StageDraft = { key: newKey(), name: '', date: new Date().toISOString().slice(0, 10), note: '', photos: [] };
    const i = key ? stages.findIndex((s) => s.key === key) + 1 : stages.length;
    onChange([...stages.slice(0, i), st, ...stages.slice(i)]);
    setFocusKey(st.key);
  };

  const reorder = (key: string, toVisibleIndex: number) => {
    const target = visible[toVisibleIndex];
    if (!target) return;
    const from = stages.findIndex((s) => s.key === key);
    const to = stages.findIndex((s) => s.key === target.key);
    onChange(move(stages, from, to));
  };

  const remove = (st: StageDraft) => {
    if (!st.id) return onChange(stages.filter((s) => s.key !== st.key)); // 還沒存過的直接拿掉
    update(st.key, { deleted: true });
  };

  return (
    <div class="a-card">
      <div class="a-card__head">
        <h3>施工進度 <small>{visible.length} 個階段</small></h3>
        <button type="button" class="a-btn a-btn--ghost" onClick={() => addAfter(null)}>＋ 新增階段</button>
      </div>
      <p class="a-hint">
        新增階段、填內容、選照片都會先暫存，按最下方「全部儲存並上傳」才會存進後台。
        新照片存進後台時是「未發布」，確認預覽沒問題後按「發布這個案例」才公開。
      </p>
      {stages.length === 0 && <p class="a-empty">還沒有施工階段，按「＋ 新增階段」開始。</p>}
      <ol class="a-stages">
        {stages.map((st) => st.deleted ? (
          <li class="a-stage a-stage--deleted" key={st.key}>
            <span>「{st.name || '未命名階段'}」和 {st.photos.length} 張照片會在儲存後刪除</span>
            <button type="button" class="a-text-btn" onClick={() => update(st.key, { deleted: false })}>復原</button>
          </li>
        ) : (
          <StageCard key={st.key} stage={st} index={visible.indexOf(st)} total={visible.length}
            focus={focusKey === st.key}
            coverKey={props.coverKey} onSetCover={props.onSetCover}
            onPatch={(patch) => update(st.key, patch)}
            onMove={(to) => reorder(st.key, to)}
            onDelete={() => remove(st)}
            onAddAfter={() => addAfter(st.key)} />
        ))}
      </ol>
    </div>
  );
}

interface CardProps {
  stage: StageDraft; index: number; total: number; focus: boolean;
  coverKey: string | null; onSetCover: (ph: PhotoDraft) => void;
  onPatch: (patch: Partial<StageDraft>) => void; onMove: (to: number) => void;
  onDelete: () => void; onAddAfter: () => void;
}

function StageCard(props: CardProps) {
  const { stage } = props;
  const ref = useRef<HTMLLIElement>(null);
  const changes = stageChanges(stage, props.index);
  const photos = stage.photos;
  const live = photos.filter((p) => !p.deleted);

  // 剛新增的階段：捲到畫面中間並把游標放在名稱欄
  useEffect(() => {
    if (!props.focus || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, [props.focus]);

  const set = (k: 'name' | 'date' | 'note') => (e: Event) => props.onPatch({ [k]: (e.target as HTMLInputElement).value });
  const setPhotos = (next: PhotoDraft[]) => props.onPatch({ photos: next });
  const patchPhoto = (key: string, patch: Partial<PhotoDraft>) => setPhotos(photos.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addFiles = (files: File[]) => setPhotos([
    ...photos,
    ...files.map((file) => ({ key: newKey(), file, preview: URL.createObjectURL(file), caption: '', hidden: false, published: false })),
  ]);

  const movePhoto = (key: string, toLiveIndex: number) => {
    const target = live[toLiveIndex];
    if (!target) return;
    setPhotos(move(photos, photos.findIndex((p) => p.key === key), photos.findIndex((p) => p.key === target.key)));
  };

  const removePhoto = (ph: PhotoDraft) => {
    if (!ph.id) {
      if (ph.preview) URL.revokeObjectURL(ph.preview);
      return setPhotos(photos.filter((p) => p.key !== ph.key));
    }
    patchPhoto(ph.key, { deleted: true });
  };

  return (
    <li class={`a-stage ${changes ? 'is-dirty' : ''}`} ref={ref}>
      <div class="a-stage__head">
        <span class="a-stage__no">STEP {String(props.index + 1).padStart(2, '0')}{changes > 0 && <span class="a-dot">未儲存</span>}</span>
        <MoveButtons index={props.index} total={props.total} onMove={props.onMove} />
      </div>
      <div class="a-grid">
        <Field label="階段名稱"><input value={stage.name} onInput={set('name')} placeholder="例：拆除、水電、木作、完工" /></Field>
        <Field label="日期"><input type="date" value={stage.date} onInput={set('date')} /></Field>
      </div>
      <RichField label="說明" multiline rows={2} value={stage.note} onInput={(v) => props.onPatch({ note: v })} />

      <div class="a-photos-head"><strong>照片 {live.length} 張</strong></div>
      {photos.length > 0 && (
        <ul class="a-photos">
          {photos.map((ph) => {
            if (ph.deleted) {
              return (
                <li class="a-photo is-deleted" key={ph.key}>
                  <div class="a-photo__img"><img src={ph.preview ?? photoUrl(ph.path)} alt="" loading="lazy" /></div>
                  <p class="a-photo__note">儲存後刪除</p>
                  <button type="button" class="a-text-btn" onClick={() => patchPhoto(ph.key, { deleted: false })}>復原</button>
                </li>
              );
            }
            const i = live.indexOf(ph);
            const st = photoStatus(ph);
            return (
              <li class={`a-photo a-photo--${st.tone}`} key={ph.key}>
                <div class="a-photo__img">
                  <img src={ph.preview ?? photoUrl(ph.path)} alt={ph.caption} loading="lazy" />
                  <span class={`a-photo__flag a-photo__flag--${st.tone}`}>{st.label}</span>
                  {props.coverKey === ph.key && <span class="a-photo__flag a-photo__flag--cover">封面</span>}
                </div>
                <RichText compact label="照片說明" placeholder="照片說明（選填）" value={ph.caption}
                  onInput={(v) => patchPhoto(ph.key, { caption: v })} />
                <label class="a-check">
                  <input type="checkbox" checked={ph.hidden} onChange={(e) => patchPhoto(ph.key, { hidden: (e.target as HTMLInputElement).checked })} />
                  不放上官網
                </label>
                <div class="a-photo__actions">
                  <MoveButtons index={i} total={live.length} onMove={(to) => movePhoto(ph.key, to)} horizontal />
                  <button type="button" class="a-text-btn" onClick={() => props.onSetCover(ph)} disabled={props.coverKey === ph.key}>設為封面</button>
                  <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => removePhoto(ph)}>刪除</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PhotoPicker multiple onFiles={addFiles} />

      <div class="a-stage__foot a-stage__foot--split">
        <button type="button" class="a-text-btn a-text-btn--danger" onClick={props.onDelete}>刪除這個階段</button>
        <button type="button" class="a-btn a-btn--ghost a-btn--small" onClick={props.onAddAfter}>＋ 新增階段</button>
      </div>
    </li>
  );
}
