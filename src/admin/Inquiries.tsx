// 客戶需求：官網「聯絡我們」表單送出的內容（同時會寄 Email 通知）。可以標記已處理、刪除。
import { useEffect, useState } from 'preact/hooks';
import { must, supabase } from './lib';
import { toast } from './ui';

export interface Inquiry {
  id: string; created_at: string; name: string; phone: string; service: string; category: string;
  area: string; location: string; message: string; status: 'new' | 'done'; handled_at: string | null; email_sent: boolean;
}

const when = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** 未處理的筆數（分頁標籤上的數字），其他地方改了狀態時會通知更新 */
export async function countNewInquiries() {
  const { count } = await supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
  return count ?? 0;
}
const listeners = new Set<() => void>();
export const onInquiriesChanged = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn());

export default function Inquiries() {
  const [rows, setRows] = useState<Inquiry[] | null>(null);
  const [filter, setFilter] = useState<'new' | 'done' | 'all'>('new');
  const [busy, setBusy] = useState('');

  const load = async () => {
    setRows(must(await supabase.from('inquiries').select('*').order('created_at', { ascending: false }).limit(500)) as Inquiry[]);
  };
  useEffect(() => { load().catch((e) => toast(`讀取失敗：${e.message}`, 'error')); }, []);

  if (!rows) return <p class="a-loading">載入中…</p>;
  const doneRows = rows.filter((r) => r.status === 'done')
    .sort((a, b) => (b.handled_at ?? b.created_at).localeCompare(a.handled_at ?? a.created_at)); // 最近處理的在前面
  const shown = filter === 'new' ? rows.filter((r) => r.status === 'new') : filter === 'done' ? doneRows : rows;
  const newCount = rows.length - doneRows.length;

  const setStatus = async (r: Inquiry, status: 'new' | 'done') => {
    setBusy(r.id);
    try {
      must(await supabase.from('inquiries').update({ status, handled_at: status === 'done' ? new Date().toISOString() : null }).eq('id', r.id));
      await load(); changed();
      toast(status === 'done' ? `已標記「${r.name}」為已處理` : `已改回未處理`);
    } catch (e) { toast(`更新失敗：${(e as Error).message}`, 'error'); } finally { setBusy(''); }
  };
  const remove = async (r: Inquiry) => {
    if (!confirm(`確定要刪除「${r.name}」的需求嗎？刪除後無法復原。`)) return;
    setBusy(r.id);
    try {
      must(await supabase.from('inquiries').delete().eq('id', r.id));
      await load(); changed();
      toast('已刪除');
    } catch (e) { toast(`刪除失敗：${(e as Error).message}`, 'error'); } finally { setBusy(''); }
  };

  return (
    <section class="a-editor">
      <div class="a-page-head"><h2>客戶需求</h2></div>
      <p class="a-hint">官網「聯絡我們」表單送出的內容會出現在這裡，同時寄 Email 通知。聯絡完客戶後按「標記已處理」。</p>
      <div class="a-filter" role="tablist" aria-label="篩選">
        <button type="button" role="tab" aria-selected={filter === 'new'} class={filter === 'new' ? 'is-active' : ''} onClick={() => setFilter('new')}>未處理（{newCount}）</button>
        <button type="button" role="tab" aria-selected={filter === 'done'} class={filter === 'done' ? 'is-active' : ''} onClick={() => setFilter('done')}>已處理（{doneRows.length}）</button>
        <button type="button" role="tab" aria-selected={filter === 'all'} class={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部（{rows.length}）</button>
      </div>
      {shown.length === 0 ? (
        <p class="a-empty">{filter === 'new' ? '目前沒有未處理的需求。' : filter === 'done' ? '還沒有已處理的需求。' : '還沒有客戶從官網送出需求。'}</p>
      ) : (
        <ul class="a-inq">
          {shown.map((r) => (
            <li key={r.id} class={`a-card a-inq__item ${r.status === 'done' ? 'is-done' : ''}`}>
              <div class="a-inq__head">
                <h3>{r.name}{r.status === 'new' ? <span class="a-dot">未處理</span> : <span class="a-inq__done">已處理</span>}</h3>
                <time class="a-inq__time">{when(r.created_at)}{r.status === 'done' && r.handled_at && `・處理於 ${when(r.handled_at)}`}</time>
              </div>
              <p class="a-inq__phone"><a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}>📞 {r.phone}</a></p>
              <dl class="a-inq__meta">
                {r.service && <div><dt>需求類型</dt><dd>{r.service}</dd></div>}
                {r.category && <div><dt>空間類型</dt><dd>{r.category}</dd></div>}
                {r.area && <div><dt>坪數</dt><dd>{r.area} 坪</dd></div>}
                {r.location && <div><dt>案場地區</dt><dd>{r.location}</dd></div>}
              </dl>
              {r.message && <p class="a-inq__msg">{r.message}</p>}
              <div class="a-inq__foot">
                <span class="a-inq__mail">{r.email_sent ? '✉ 已寄 Email 通知' : '✉ 沒有寄出 Email（請確認寄信設定）'}</span>
                <span class="a-inq__btns">
                  {r.status === 'new'
                    ? <button type="button" class="a-btn a-btn--primary a-btn--small" disabled={busy === r.id} onClick={() => void setStatus(r, 'done')}>標記已處理</button>
                    : <button type="button" class="a-btn a-btn--ghost a-btn--small" disabled={busy === r.id} onClick={() => void setStatus(r, 'new')}>改回未處理</button>}
                  <button type="button" class="a-text-btn a-text-btn--danger" disabled={busy === r.id} onClick={() => void remove(r)}>刪除</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
