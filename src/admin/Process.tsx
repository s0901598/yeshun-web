// 服務流程
import { useState } from 'preact/hooks';
import { lines } from './lib';
import ListEditor, { type Row } from './ListEditor';
import { Field } from './ui';

export default function Process() {
  return (
    <ListEditor
      table="process_steps"
      title="服務流程"
      itemName="步驟"
      newRow={() => ({ title: '新的步驟' })}
      rowTitle={(r) => r.title}
      renderForm={(row, save, busy) => <StepForm key={row.id} row={row} save={save} busy={busy} />}
    />
  );
}

function StepForm(props: { row: Row; save: (patch: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { row } = props;
  const [form, setForm] = useState({
    title: row.title, en: row.en, description: row.description,
    items: (row.items ?? []).join('\n'), duration: row.duration,
  });
  const set = (k: keyof typeof form) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });

  const submit = (e: Event) => {
    e.preventDefault();
    props.save({
      title: form.title.trim(), en: form.en.trim().toUpperCase(), description: form.description.trim(),
      items: lines(form.items), duration: form.duration.trim(),
    });
  };

  return (
    <form onSubmit={submit}>
      <div class="a-grid">
        <Field label="步驟名稱"><input required value={form.title} onInput={set('title')} placeholder="例：現場丈量" /></Field>
        <Field label="英文小標" hint="流程頁上的小字，例如 SURVEY"><input value={form.en} onInput={set('en')} /></Field>
      </div>
      <Field label="一句話說明"><input value={form.description} onInput={set('description')} /></Field>
      <Field label="這一步會做的事" hint="一行寫一項"><textarea rows={4} value={form.items} onInput={set('items')} /></Field>
      <Field label="大約時間" hint="例：約 1 週、2–4 週"><input value={form.duration} onInput={set('duration')} /></Field>
      <button class="a-btn a-btn--primary" disabled={props.busy}>儲存</button>
    </form>
  );
}
