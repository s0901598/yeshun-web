// 後台入口：登入、上方分頁、官網更新狀態
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'preact/hooks';
import { onSiteStatus, sendSiteUpdate, siteUrl, supabase, type SiteStatus } from './lib';
import { Field, Toaster, toast, useAction } from './ui';
import Projects from './Projects';
import Details from './Details';
import Process from './Process';

const tabs = [
  { hash: '#/projects', label: '案例作品' },
  { hash: '#/details', label: '注重的細節' },
  { hash: '#/process', label: '服務流程' },
];

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/projects');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/projects');
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
  idle: '官網內容已是最新',
  pending: '有變更，幾秒後自動更新官網',
  sent: '已送出更新，官網約 1–2 分鐘後生效',
  not_configured: '自動更新尚未設定，官網暫時不會更新',
  error: '通知官網更新失敗',
};

function Shell(props: { email: string }) {
  const hash = useHash();
  const [site, setSite] = useState<SiteStatus>('idle');
  useEffect(() => onSiteStatus(setSite), []);

  const changePassword = async () => {
    const pw = prompt('輸入新密碼（至少 6 個字）');
    if (!pw) return;
    if (pw.length < 6) return toast('密碼至少要 6 個字', 'error');
    if (prompt('再輸入一次新密碼') !== pw) return toast('兩次輸入的密碼不一樣', 'error');
    const { error } = await supabase.auth.updateUser({ password: pw });
    toast(error ? `失敗：${error.message}` : '密碼已更新', error ? 'error' : 'ok');
  };

  const page = hash.startsWith('#/details') ? <Details /> : hash.startsWith('#/process') ? <Process /> : <Projects hash={hash} />;

  return (
    <div class="a-shell">
      <header class="a-header">
        <div class="a-header__top">
          <strong class="a-header__title">業順官網後台</strong>
          <span class="a-header__user">
            <a href={siteUrl('/')} target="_blank" rel="noopener">看官網 ↗</a>
            <button type="button" onClick={changePassword}>改密碼</button>
            <button type="button" onClick={() => supabase.auth.signOut()}>登出</button>
          </span>
        </div>
        <nav class="a-tabs">
          {tabs.map((t) => (
            <a href={t.hash} class={hash.startsWith(t.hash) ? 'is-active' : ''}>{t.label}</a>
          ))}
        </nav>
        <div class={`a-site a-site--${site}`} role="status">
          <span>{statusText[site]}</span>
          {(site === 'pending' || site === 'error') && (
            <button type="button" onClick={() => sendSiteUpdate()}>{site === 'error' ? '重試' : '立即更新'}</button>
          )}
        </div>
      </header>
      <main class="a-main">{page}</main>
      <footer class="a-footer">登入帳號：{toAccount(props.email)}</footer>
    </div>
  );
}
