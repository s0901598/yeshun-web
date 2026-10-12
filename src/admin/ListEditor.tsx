// 「注重的細節」與「服務流程」共用的清單編輯：新增、修改、排序、顯示／隱藏、刪除
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { move, must, refreshSiteStatus, saveOrder, supabase } from './lib';
import { MoveButtons, Toggle, useAction } from './ui';

export interface Row { id: string; sort: number; published: boolean; [k: string]: any }

interface Props {
  table: 'details' | 'process_steps';
  title: string;
  itemName: string;          // 例如「細節」「步驟」
  newRow: () => Record<string, unknown>;
  rowTitle: (row: Row) => string;
  /** 每一筆的編輯表單，save 收到要更新的欄位 */
  renderForm: (row: Row, save: (patch: Record<string, unknown>) => Promise<boolean>, busy: boolean) => ComponentChildren;
  onDeleted?: (row: Row) => Promise<void>;
  /** 顯示在最上方的提醒，例如「這一頁目前在官網上隱藏」 */
  notice?: string;
}

export default function ListEditor(props: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    run(async () => setRows(must(await supabase.from(props.table).select('*').order('sort')) as Row[]));
  }, [props.table]);

  if (!rows) return <p class="a-loading">載入中…</p>;

  const add = () => run(async () => {
    const row = must(await supabase.from(props.table).insert({ ...props.newRow(), sort: rows.length, published: false })
      .select().single()) as Row;
    setRows([...rows, row]);
    setOpen(row.id);
  }, `已新增${props.itemName}（尚未顯示在官網），請填寫內容`);

  const save = (id: string) => (patch: Record<string, unknown>) => run(async () => {
    const row = must(await supabase.from(props.table).update(patch).eq('id', id).select().single()) as Row;
    setRows(rows.map((r) => (r.id === id ? row : r)));
    void refreshSiteStatus();
  }, '已儲存');

  const reorder = (from: number, to: number) => run(async () => {
    const next = move(rows, from, to);
    setRows(next);
    await saveOrder(props.table, next.map((r) => r.id));
    void refreshSiteStatus();
  });

  const remove = (row: Row) => {
    if (!confirm(`確定要刪除「${props.rowTitle(row)}」？`)) return;
    run(async () => {
      must(await supabase.from(props.table).delete().eq('id', row.id));
      await props.onDeleted?.(row);
      setRows(rows.filter((r) => r.id !== row.id));
      void refreshSiteStatus();
    }, '已刪除');
  };

  return (
    <section>
      <div class="a-page-head">
        <h2>{props.title} <small>{rows.length} 項</small></h2>
        <button class="a-btn a-btn--primary" onClick={add} disabled={busy}>＋ 新增{props.itemName}</button>
      </div>
      {props.notice && <p class="a-notice">{props.notice}</p>}
      <p class="a-hint">官網上的順序跟這裡一樣，用 ↑↓ 調整。關掉「顯示在官網」可以暫時隱藏，不用刪除。儲存後按上方「發布到官網」才會更新官網。</p>
      <ol class="a-items">
        {rows.map((row, i) => (
          <li class={`a-card a-item ${row.published ? '' : 'is-draft'}`} key={row.id}>
            <div class="a-item__head">
              <span class="a-item__no">{String(i + 1).padStart(2, '0')}</span>
              <button type="button" class="a-item__title" onClick={() => setOpen(open === row.id ? null : row.id)} aria-expanded={open === row.id}>
                {props.rowTitle(row)}
                {!row.published && <span class="a-badge">未顯示</span>}
                <span class="a-item__chev" aria-hidden="true">{open === row.id ? '收合 ▲' : '編輯 ▼'}</span>
              </button>
              <MoveButtons index={i} total={rows.length} onMove={(to) => reorder(i, to)} />
            </div>
            {open === row.id && (
              <div class="a-item__body">
                <Toggle checked={row.published} label="顯示在官網" disabled={busy} onChange={(v) => save(row.id)({ published: v })} />
                {props.renderForm(row, save(row.id), busy)}
                <div class="a-stage__foot">
                  <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => remove(row)}>刪除這個{props.itemName}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
