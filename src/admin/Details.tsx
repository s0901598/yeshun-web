// 我們注重的細節
import { useState } from 'preact/hooks';
import { photoUrl, removeFileIfUnused, uploadImage } from './lib';
import ListEditor, { type Row } from './ListEditor';
import { Field, PhotoPicker } from './ui';

export default function Details() {
  return (
    <ListEditor
      table="details"
      title="注重的細節"
      itemName="細節"
      newRow={() => ({ title: '新的細節' })}
      rowTitle={(r) => r.title}
      onDeleted={(r) => removeFileIfUnused(r.image_path)}
      renderForm={(row, save, busy) => <DetailForm key={row.id} row={row} save={save} busy={busy} />}
    />
  );
}

function DetailForm(props: { row: Row; save: (patch: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { row } = props;
  const [form, setForm] = useState({ title: row.title, summary: row.summary, body: row.body });
  const [uploading, setUploading] = useState('');
  const set = (k: keyof typeof form) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });

  const submit = (e: Event) => {
    e.preventDefault();
    props.save({ title: form.title.trim(), summary: form.summary.trim(), body: form.body.trim() });
  };

  const upload = async (files: File[]) => {
    setUploading('照片上傳中…');
    try {
      const old = row.image_path;
      const path = await uploadImage('details', files[0]);
      if (await props.save({ image_path: path })) await removeFileIfUnused(old);
    } finally { setUploading(''); }
  };

  return (
    <form onSubmit={submit}>
      <div class="a-detail-img">
        {row.image_path ? <img src={photoUrl(row.image_path)} alt="" /> : <p class="a-empty">還沒有照片</p>}
        <PhotoPicker busy={uploading} onFiles={upload} label="換照片" />
      </div>
      <Field label="標題"><input required value={form.title} onInput={set('title')} placeholder="例：防水工程" /></Field>
      <Field label="一句話重點" hint="首頁與細節頁的金色短句"><input value={form.summary} onInput={set('summary')} /></Field>
      <Field label="詳細說明"><textarea rows={4} value={form.body} onInput={set('body')} /></Field>
      <button class="a-btn a-btn--primary" disabled={props.busy}>儲存</button>
    </form>
  );
}
