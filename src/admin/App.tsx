// 後台入口：登入、上方分頁、發布到官網的狀態
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'preact/hooks';
import { confirmLeave, onSiteStatus, publishSite, refreshSiteStatus, setUnsaved, siteUrl, supabase, type SiteStatus } from './lib';
import { Field, Toaster, toast, useAction } from './ui';
import Projects from './Projects';
import Details from './Details';
import Process from './Process';
import Accounts, { roleLabel } from './Accounts';
import Companies from './Companies';
import Inquiries, { countNewInquiries, onInquiriesChanged } from './Inquiries';

const tabs = [
  { hash: '#/projects', label: '案例作品' },
  { hash: '#/inquiries', label: '客戶需求' },
  { hash: '#/details', label: '注重的細節' },
  { hash: '#/process', label: '服務流程' },
  { hash: '#/company', label: '公司資料' },
];

// 切換頁面時，如果還有沒儲存的變更就先問一下；選「取消」會留在原頁
function useHash() {
  const [hash, setHash] = useState(location.hash || '#/projects');
  useEffect(() => {
    let current = location.hash || '#/projects';
    let reverting = false;
    const on = () => {
      if (reverting) { reverting = false; return; }
      const next = location.hash || '#/projects';
      if (!confirmLeave()) {
        reverting = true;
        location.hash = current;
        return;
      }
      setUnsaved(0);
      current = next;
      setHash(next);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p class="a-loading">載入中…</p>;
  return (
    <>
      {session ? <Shell email={session.user.email ?? ''} /> : <Login />}
      <Toaster />
    </>
  );
}

// 後台用帳號登入；Supabase 需要 email 格式，沒有 @ 的帳號自動補上內部網域
const LOGIN_DOMAIN = 'yeshun.local';
const toEmail = (account: string) => (account.includes('@') ? account : `${account}@${LOGIN_DOMAIN}`);
const toAccount = (email: string) => email.replace(`@${LOGIN_DOMAIN}`, '');

function Login() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const { busy, run } = useAction();
  const submit = (e: Event) => {
    e.preventDefault();
    run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(account.trim().toLowerCase()), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? '帳號或密碼錯誤' : error.message);
    });
  };
  return (
    <main class="a-login">
      <form class="a-card a-login__form" onSubmit={submit}>
        <p class="a-eyebrow">YE-SHUN ADMIN</p>
        <h1>業順官網後台</h1>
        <Field label="帳號">
          <input type="text" autocomplete="username" autocapitalize="none" spellcheck={false} required value={account} onInput={(e) => setAccount((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="密碼">
          <input type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
        </Field>
        <button class="a-btn a-btn--primary" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
      </form>
    </main>
  );
}

const statusText: Record<SiteStatus, string> = {
  clean: '官網已是最新內容',
  pending: '後台有已儲存、但還沒發布到官網的變更',
  publishing: '發布中，官網約 1–2 分鐘後更新',
  not_configured: '發布功能尚未設定，請聯絡管理員',
  error: '發布失敗，請再試一次',
};

function Shell(props: { email: string }) {
  const hash = useHash();
  const [site, setSite] = useState<SiteStatus>('clean');
  const [role, setRole] = useState<'admin' | 'editor' | null>(null);
  const [newInquiries, setNewInquiries] = useState(0);
  useEffect(() => onSiteStatus(setSite), []);
  useEffect(() => {
    const refreshInquiries = () => countNewInquiries().then(setNewInquiries).catch(() => {});
    void refreshSiteStatus(); void refreshInquiries();
    const off = onInquiriesChanged(refreshInquiries);
    const t = setInterval(() => { void refreshSiteStatus(); void refreshInquiries(); }, 30000); // 別人改了內容、客戶新送出需求也會看到
    return () => { clearInterval(t); off(); };
  }, []);
  const publishAll = async () => {
    if (!confirm('要把後台目前已儲存的內容發布到官網嗎？\n（還沒發布的案例不會被公開，案例請在案例頁按「發布到官網」）\n官網約 1–2 分鐘後更新。')) return;
    const ok = await publishSite();
    toast(ok ? '已送出，官網約 1–2 分鐘後更新' : '發布失敗，請再試一次', ok ? 'ok' : 'error');
  };
  useEffect(() => {
    supabase.rpc('my_role').then(({ data }) => setRole(data === 'admin' || data === 'editor' ? data : null));
  }, [props.email]);
  const isAdmin = role === 'admin';

  const changePassword = async () => {
    const pw = prompt('輸入新密碼（至少 6 個字）');
    if (!pw) return;
    if (pw.length < 6) return toast('密碼至少要 6 個字', 'error');
    if (prompt('再輸入一次新密碼') !== pw) return toast('兩次輸入的密碼不一樣', 'error');
    const { error } = await supabase.auth.updateUser({ password: pw });
    toast(error ? `失敗：${error.message}` : '密碼已更新', error ? 'error' : 'ok');
  };

  const page = hash.startsWith('#/accounts') && isAdmin ? <Accounts />
    : hash.startsWith('#/details') ? <Details />
    : hash.startsWith('#/process') ? <Process />
    : hash.startsWith('#/company') ? <Companies />
    : hash.startsWith('#/inquiries') ? <Inquiries />
    : <Projects hash={hash} />;

  return (
    <div class="a-shell">
      <header class="a-header">
        <div class="a-header__top">
          <strong class="a-header__title">業順官網後台</strong>
          <span class="a-header__user">
            <a href={siteUrl('/')} target="_blank" rel="noopener">看官網 ↗</a>
            <button type="button" onClick={changePassword}>改密碼</button>
            <button type="button" onClick={() => { if (confirmLeave()) { setUnsaved(0); void supabase.auth.signOut(); } }}>登出</button>
          </span>
        </div>
        <nav class="a-tabs">
          {[...tabs, ...(isAdmin ? [{ hash: '#/accounts', label: '帳號管理' }] : [])].map((t) => (
            <a href={t.hash} class={hash.startsWith(t.hash) ? 'is-active' : ''}>
              {t.label}{t.hash === '#/inquiries' && newInquiries > 0 && <span class="a-tab-badge" aria-label={`${newInquiries} 筆未處理`}>{newInquiries}</span>}
            </a>
          ))}
        </nav>
        <div class={`a-site a-site--${site}`} role="status">
          <span>{statusText[site]}</span>
          {(site === 'pending' || site === 'error') && (
            <button type="button" class="a-site__btn" onClick={publishAll}>發布到官網</button>
          )}
        </div>
      </header>
      <main class="a-main">{page}</main>
      <footer class="a-footer">登入帳號：{toAccount(props.email)}{role && `（${roleLabel[role]}）`}</footer>
    </div>
  );
}
