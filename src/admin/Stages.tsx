// 施工進度：階段（名稱、日期、說明）與每個階段的照片
import { useState } from 'preact/hooks';
import { move, must, photoUrl, removeFileIfUnused, saveOrder, scheduleSiteUpdate, supabase, uploadImage } from './lib';
import { Field, MoveButtons, PhotoPicker, Toggle, useAction } from './ui';

export interface PhotoRow { id: string; stage_id: string; path: string; caption: string; published: boolean; sort: number }
export interface StageRow { id: string; project_id: string; name: string; date: string | null; note: string; sort: number; photos: PhotoRow[] }

interface Props {
  projectId: string;
  published: boolean;
  stages: StageRow[];
  setStages: (s: StageRow[]) => void;
  coverPath: string | null;
  onSetCover: (path: string) => void;
}

export default function Stages(props: Props) {
  const { stages, setStages } = props;
  const { busy, run } = useAction();
  // 案例已發布時，施工進度的修改才需要更新官網
  const touch = () => { if (props.published) scheduleSiteUpdate(); };

  const add = () => run(async () => {
    const st = must(await supabase.from('stages').insert({
      project_id: props.projectId, name: '新階段', date: new Date().toISOString().slice(0, 10), sort: stages.length,
    }).select().single()) as StageRow;
    setStages([...stages, { ...st, photos: [] }]);
    touch();
  }, '已新增階段，請填寫名稱與說明');

  const reorder = (from: number, to: number) => run(async () => {
    const next = move(stages, from, to);
    setStages(next);
    await saveOrder('stages', next.map((s) => s.id));
    touch();
  });

  const update = (i: number, st: StageRow) => setStages(stages.map((s, j) => (j === i ? st : s)));

  const remove = (i: number) => {
    const st = stages[i];
    if (!confirm(`確定要刪除「${st.name}」？這個階段的 ${st.photos.length} 張照片會一起刪除。`)) return;
    run(async () => {
      must(await supabase.from('stages').delete().eq('id', st.id));
      for (const ph of st.photos) await removeFileIfUnused(ph.path);
      setStages(stages.filter((_, j) => j !== i));
      touch();
    }, '階段已刪除');
  };

  return (
    <div class="a-card">
      <div class="a-card__head">
        <h3>施工進度 <small>{stages.length} 個階段</small></h3>
        <button type="button" class="a-btn a-btn--ghost" onClick={add} disabled={busy}>＋ 新增階段</button>
      </div>
      <p class="a-hint">新上傳的照片預設是草稿，按「發布」或「全部發布」後才會出現在官網。</p>
      {stages.length === 0 && <p class="a-empty">還沒有施工階段。</p>}
      <ol class="a-stages">
        {stages.map((st, i) => (
          <StageCard key={st.id} stage={st} index={i} total={stages.length} projectId={props.projectId}
            coverPath={props.coverPath} onSetCover={props.onSetCover} touch={touch}
            onChange={(s) => update(i, s)} onMove={(to) => reorder(i, to)} onDelete={() => remove(i)} />
        ))}
      </ol>
    </div>
  );
}

interface CardProps {
  stage: StageRow; index: number; total: number; projectId: string; coverPath: string | null;
  onSetCover: (path: string) => void; touch: () => void;
  onChange: (s: StageRow) => void; onMove: (to: number) => void; onDelete: () => void;
}

function StageCard(props: CardProps) {
  const { stage } = props;
  const [form, setForm] = useState({ name: stage.name, date: stage.date ?? '', note: stage.note });
  const [uploading, setUploading] = useState('');
  const { busy, run } = useAction();
  const dirty = form.name !== stage.name || form.date !== (stage.date ?? '') || form.note !== stage.note;
  const set = (k: keyof typeof form) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });
  const setPhotos = (photos: PhotoRow[]) => props.onChange({ ...stage, photos });

  const save = (e: Event) => {
    e.preventDefault();
    run(async () => {
      const st = must(await supabase.from('stages').update({ name: form.name.trim(), date: form.date || null, note: form.note.trim() })
        .eq('id', stage.id).select().single()) as StageRow;
      props.onChange({ ...st, photos: stage.photos });
      props.touch();
    }, '階段已儲存');
  };

  const upload = (files: File[]) => run(async () => {
    const added: PhotoRow[] = [];
    try {
      for (const [n, file] of files.entries()) {
        setUploading(`照片處理與上傳中… ${n + 1} / ${files.length}`);
        const path = await uploadImage(`projects/${props.projectId}`, file);
        added.push(must(await supabase.from('photos').insert({
          stage_id: stage.id, path, published: false, sort: stage.photos.length + n,
        }).select().single()) as PhotoRow);
      }
    } finally {
      setUploading('');
      setPhotos([...stage.photos, ...added]);
    }
  }, `已上傳 ${files.length} 張照片（草稿）`);

  const patchPhoto = (id: string, patch: Partial<PhotoRow>, wasPublic: boolean) => run(async () => {
    const ph = must(await supabase.from('photos').update(patch).eq('id', id).select().single()) as PhotoRow;
    setPhotos(stage.photos.map((p) => (p.id === id ? ph : p)));
    if (wasPublic || ph.published) props.touch();
  });

  const publishAll = () => run(async () => {
    const ids = stage.photos.filter((p) => !p.published).map((p) => p.id);
    must(await supabase.from('photos').update({ published: true }).in('id', ids));
    setPhotos(stage.photos.map((p) => ({ ...p, published: true })));
    props.touch();
  }, '這個階段的照片已全部發布');

  const movePhoto = (from: number, to: number) => run(async () => {
    const next = move(stage.photos, from, to);
    setPhotos(next);
    await saveOrder('photos', next.map((p) => p.id));
    props.touch();
  });

  const removePhoto = (ph: PhotoRow) => {
    if (!confirm('確定要刪除這張照片？')) return;
    run(async () => {
      must(await supabase.from('photos').delete().eq('id', ph.id));
      await removeFileIfUnused(ph.path);
      setPhotos(stage.photos.filter((p) => p.id !== ph.id));
      if (ph.published) props.touch();
    }, '照片已刪除');
  };

  const drafts = stage.photos.filter((p) => !p.published).length;

  return (
    <li class="a-stage">
      <div class="a-stage__head">
        <span class="a-stage__no">STEP {String(props.index + 1).padStart(2, '0')}</span>
        <MoveButtons index={props.index} total={props.total} onMove={props.onMove} />
      </div>
      <form onSubmit={save}>
        <div class="a-grid">
          <Field label="階段名稱"><input required value={form.name} onInput={set('name')} placeholder="例：拆除、水電、木作、完工" /></Field>
          <Field label="日期"><input type="date" value={form.date} onInput={set('date')} /></Field>
        </div>
        <Field label="說明"><textarea rows={2} value={form.note} onInput={set('note')} /></Field>
        {dirty && <button class="a-btn a-btn--primary" disabled={busy}>儲存這個階段</button>}
      </form>

      <div class="a-photos-head">
        <strong>照片 {stage.photos.length} 張{drafts > 0 && <span class="a-badge">{drafts} 張草稿</span>}</strong>
        {drafts > 0 && <button type="button" class="a-btn a-btn--small" onClick={publishAll} disabled={busy}>全部發布</button>}
      </div>
      <ul class="a-photos">
        {stage.photos.map((ph, i) => (
          <li class={`a-photo ${ph.published ? '' : 'is-draft'}`} key={ph.id}>
            <div class="a-photo__img">
              <img src={photoUrl(ph.path)} alt={ph.caption} loading="lazy" />
              {!ph.published && <span class="a-photo__flag">草稿</span>}
              {props.coverPath === ph.path && <span class="a-photo__flag a-photo__flag--cover">封面</span>}
            </div>
            <input class="a-photo__caption" placeholder="照片說明（選填）" value={ph.caption}
              onBlur={(e) => {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v !== ph.caption) patchPhoto(ph.id, { caption: v }, ph.published);
              }} />
            <div class="a-photo__actions">
              <Toggle checked={ph.published} label="發布" disabled={busy} onChange={(v) => patchPhoto(ph.id, { published: v }, ph.published)} />
              <MoveButtons index={i} total={stage.photos.length} onMove={(to) => movePhoto(i, to)} horizontal />
            </div>
            <div class="a-photo__actions">
              <button type="button" class="a-text-btn" onClick={() => props.onSetCover(ph.path)} disabled={props.coverPath === ph.path}>設為封面</button>
              <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => removePhoto(ph)}>刪除</button>
            </div>
          </li>
        ))}
      </ul>
      <PhotoPicker multiple busy={uploading} onFiles={upload} />

      <div class="a-stage__foot">
        <button type="button" class="a-text-btn a-text-btn--danger" onClick={props.onDelete}>刪除這個階段</button>
      </div>
    </li>
  );
}
