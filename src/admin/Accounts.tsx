// 帳號管理（只有管理員看得到）：新增帳號（隨機密碼）、重設密碼、改角色、刪除
import { useEffect, useState } from 'preact/hooks';
import { supabase } from './lib';
import { Field, toast, useAction } from './ui';

interface Account { id: string; username: string; role: 'admin' | 'editor'; createdAt: string; lastSignInAt: string | null; isMe: boolean }

export const roleLabel = { admin: '管理員', editor: '編輯' } as const;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body });
  if (error) {
    const detail = 'context' in error ? await (error as any).context?.json?.().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' }) : '還沒登入過');

export default function Accounts() {
  const [rows, setRows] = useState<Account[] | null>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'editor'>('editor');
  const [secret, setSecret] = useState<{ username: string; password: string; reset?: boolean } | null>(null);
  const { busy, run } = useAction();

  const load = async () => setRows((await call<{ accounts: Account[] }>({ action: 'list' })).accounts);
  useEffect(() => { run(load); }, []);

  const create = (e: Event) => {
    e.preventDefault();
    run(async () => {
      const res = await call<{ username: string; password: string }>({ action: 'create', username, role });
      setSecret(res);
      setUsername('');
      await load();
    }, '帳號已建立');
  };

  const resetPassword = (a: Account) => {
    if (!confirm(`要幫「${a.username}」重設密碼嗎？舊密碼會立刻失效。`)) return;
    run(async () => {
      const res = await call<{ password: string }>({ action: 'reset-password', userId: a.id });
      setSecret({ username: a.username, password: res.password, reset: true });
    }, '密碼已重設');
  };

  const changeRole = (a: Account, next: string) => run(async () => {
    try {
      await call({ action: 'set-role', userId: a.id, role: next });
    } finally {
      await load(); // 被擋下時，下拉選單也要回到實際的角色
    }
  }, '角色已更新');

  const remove = (a: Account) => {
    if (!confirm(`確定要刪除帳號「${a.username}」？刪除後這個人就不能登入後台。`)) return;
    run(async () => {
      await call({ action: 'delete', userId: a.id });
      await load();
    }, '帳號已刪除');
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('已複製'); } catch { toast('無法自動複製，請手動選取', 'error'); }
  };

  return (
    <section>
      <div class="a-page-head"><h2>帳號管理 {rows && <small>{rows.length} 個帳號</small>}</h2></div>
      <p class="a-hint">管理員：可以管理內容和帳號。編輯：可以管理所有內容（新增、修改、刪除、發布），不能管理帳號。</p>

      {secret && (
        <div class="a-card a-secret" role="alert">
          <h3>{secret.reset ? '新密碼' : '帳號已建立'}</h3>
          <p>請把以下資料交給對方。<strong>密碼只會顯示這一次</strong>，關掉後就看不到了；對方登入後可以按「改密碼」換成自己的。</p>
          <dl>
            <div><dt>帳號</dt><dd>{secret.username}</dd></div>
            <div><dt>密碼</dt><dd class="a-secret__pw">{secret.password}</dd></div>
          </dl>
          <div class="a-picker">
            <button type="button" class="a-btn a-btn--primary" onClick={() => copy(`帳號：${secret.username}\n密碼：${secret.password}\n後台：${location.origin}${location.pathname}`)}>複製帳號密碼</button>
            <button type="button" class="a-btn a-btn--ghost" onClick={() => setSecret(null)}>我記下了，關閉</button>
          </div>
        </div>
      )}

      <form class="a-card" onSubmit={create}>
        <h3>新增帳號</h3>
        <div class="a-grid">
          <Field label="帳號" hint="3–30 個字，英文小寫、數字、. _ -，例如 wang">
            <input required autocapitalize="none" spellcheck={false} value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="角色">
            <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as 'admin' | 'editor')}>
              <option value="editor">編輯</option>
              <option value="admin">管理員</option>
            </select>
          </Field>
        </div>
        <button class="a-btn a-btn--primary" disabled={busy}>建立帳號並產生密碼</button>
      </form>

      {!rows ? <p class="a-loading">載入中…</p> : (
        <ul class="a-list">
          {rows.map((a) => (
            <li class="a-card a-account">
              <div class="a-account__head">
                <strong>{a.username}{a.isMe && <span class="a-badge a-badge--on">你</span>}</strong>
                <span class={`a-badge ${a.role === 'admin' ? 'a-badge--gold' : ''}`}>{roleLabel[a.role]}</span>
              </div>
              <p class="a-row__meta">建立：{fmt(a.createdAt)}・最後登入：{fmt(a.lastSignInAt)}</p>
              <div class="a-account__actions">
                <label class="a-account__role">
                  角色
                  <select value={a.role} disabled={busy} onChange={(e) => changeRole(a, (e.target as HTMLSelectElement).value)}>
                    <option value="editor">編輯</option>
                    <option value="admin">管理員</option>
                  </select>
                </label>
                <button type="button" class="a-text-btn" onClick={() => resetPassword(a)} disabled={busy}>重設密碼</button>
                {!a.isMe && <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => remove(a)} disabled={busy}>刪除</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
