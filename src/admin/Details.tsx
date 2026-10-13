// 我們注重的細節
import { useState } from 'preact/hooks';
import { photoUrl, removeFileIfUnused, uploadImage } from './lib';
import ListEditor, { type Row } from './ListEditor';
import { detailsEnabled } from '../data/site';
import { Field, PhotoPicker } from './ui';
import { RichField } from './RichText';

export default function Details() {
  return (
    <ListEditor
      table="details"
      title="注重的細節"
      itemName="細節"
      notice={detailsEnabled ? undefined : '這一頁目前在官網上是隱藏的（選單、首頁都看不到）。內容先保留在這裡，之後換好名稱要重新開放時再跟工程師說。'}
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
      <RichField label="一句話重點" hint="首頁與細節頁的金色短句" value={form.summary} onInput={(v) => setForm({ ...form, summary: v })} />
      <RichField label="詳細說明" multiline rows={4} value={form.body} onInput={(v) => setForm({ ...form, body: v })} hint="選取文字後可以加粗、上色。" />
      <button class="a-btn a-btn--primary" disabled={props.busy}>儲存</button>
    </form>
  );
}
