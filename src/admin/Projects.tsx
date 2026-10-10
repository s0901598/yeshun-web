// 案例作品：列表、編輯基本資料、封面、施工進度
import { useEffect, useState } from 'preact/hooks';
import {
  categoryOptions, lines, must, photoUrl, removeFileIfUnused, scheduleSiteUpdate, siteUrl, supabase, uploadImage,
} from './lib';
import { Field, PhotoPicker, Toggle, toast, useAction } from './ui';
import Stages, { type StageRow } from './Stages';

export interface ProjectRow {
  id: string; slug: string; title: string; category: string; location: string;
  area_ping: number | null; duration_days: number | null; status: string; summary: string;
  highlights: string[]; cover_path: string | null; featured: boolean; published: boolean;
  started_at: string | null; updated_at: string;
}

export default function Projects(props: { hash: string }) {
  const id = props.hash.split('/')[2];
  return id ? <ProjectEditor id={id} /> : <ProjectList />;
}

// ---------- 列表 ----------
function ProjectList() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const { busy, run } = useAction();

  useEffect(() => {
    run(async () => {
      setRows(must(await supabase.from('projects').select('*').order('started_at', { ascending: false, nullsFirst: true })));
    });
  }, []);

  const create = () => run(async () => {
    const slug = `case-${Date.now().toString(36)}`;
    const row = must(await supabase.from('projects').insert({
      slug, title: '新案例', category: 'residential', status: 'in_progress', published: false,
      started_at: new Date().toISOString().slice(0, 10),
    }).select('id').single()) as { id: string };
    location.hash = `#/projects/${row.id}`;
  });

  if (!rows) return <p class="a-loading">載入中…</p>;
  const shown = rows.filter((r) => filter === 'all' || (filter === 'published' ? r.published : !r.published));
  const label = (v: string) => categoryOptions.find((c) => c.value === v)?.label ?? v;

  return (
    <section>
      <div class="a-page-head">
        <h2>案例作品 <small>{rows.length} 個</small></h2>
        <button class="a-btn a-btn--primary" onClick={create} disabled={busy}>＋ 新增案例</button>
      </div>
      <div class="a-chips">
        {(['all', 'published', 'draft'] as const).map((f) => (
          <button type="button" class={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
            {{ all: '全部', published: '已發布', draft: '草稿' }[f]}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p class="a-empty">沒有符合的案例。</p>}
      <ul class="a-list">
        {shown.map((r) => (
          <li>
            <a class="a-row" href={`#/projects/${r.id}`}>
              <span class="a-row__thumb">{r.cover_path ? <img src={photoUrl(r.cover_path)} alt="" loading="lazy" /> : '無封面'}</span>
              <span class="a-row__body">
                <strong>{r.title}</strong>
                <span class="a-row__meta">{label(r.category)}・{r.location || '未填地區'}</span>
                <span class="a-badges">
                  <span class={`a-badge ${r.published ? 'a-badge--on' : ''}`}>{r.published ? '已發布' : '草稿'}</span>
                  <span class="a-badge">{r.status === 'completed' ? '已完工' : '施工中'}</span>
                  {r.featured && <span class="a-badge a-badge--gold">首頁精選</span>}
                </span>
              </span>
              <span class="a-row__go" aria-hidden="true">›</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 編輯 ----------
function ProjectEditor(props: { id: string }) {
  const [row, setRow] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<StageRow[]>([]);
  const [uploading, setUploading] = useState('');
  const { busy, run } = useAction();

  const load = async () => {
    const p = must(await supabase.from('projects').select('*').eq('id', props.id).single()) as ProjectRow;
    setRow(p);
    setForm({
      title: p.title, slug: p.slug, category: p.category, status: p.status, location: p.location,
      area_ping: p.area_ping?.toString() ?? '', duration_days: p.duration_days?.toString() ?? '',
      started_at: p.started_at ?? '', summary: p.summary, highlights: (p.highlights ?? []).join('\n'),
    });
    const st = must(await supabase.from('stages').select('*, photos(*)').eq('project_id', props.id).order('sort'));
    setStages((st as StageRow[]).map((s) => ({ ...s, photos: [...s.photos].sort((a, b) => a.sort - b.sort) })));
  };
  useEffect(() => { run(load); }, [props.id]);

  if (!row) return <p class="a-loading">載入中…</p>;

  const set = (k: string) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });

  const saveBasic = (e: Event) => {
    e.preventDefault();
    const slug = form.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return toast('網址代稱只能用英文小寫、數字和「-」，例如 luzhou-house', 'error');
    run(async () => {
      const updated = must(await supabase.from('projects').update({
        title: form.title.trim(), slug, category: form.category, status: form.status, location: form.location.trim(),
        area_ping: form.area_ping ? Number(form.area_ping) : null,
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        started_at: form.started_at || null, summary: form.summary.trim(), highlights: lines(form.highlights),
      }).eq('id', row.id).select().single()) as ProjectRow;
      setRow(updated);
      if (row.published) scheduleSiteUpdate(); // 已發布的案例有修改就更新官網
    }, '基本資料已儲存');
  };

  const setFlag = (k: 'published' | 'featured', v: boolean) => run(async () => {
    if (k === 'published' && v && !row.cover_path) throw new Error('發布前請先上傳封面照片');
    const updated = must(await supabase.from('projects').update({ [k]: v }).eq('id', row.id).select().single()) as ProjectRow;
    setRow(updated);
    if (k === 'published' || row.published) scheduleSiteUpdate();
  }, k === 'published' ? (v ? '案例已發布，官網即將更新' : '案例已改回草稿，官網即將移除') : '已更新首頁精選');

  const uploadCover = (files: File[]) => run(async () => {
    setUploading('封面上傳中…');
    try {
      const old = row.cover_path;
      const path = await uploadImage(`projects/${row.id}`, files[0]);
      setRow(must(await supabase.from('projects').update({ cover_path: path }).eq('id', row.id).select().single()) as ProjectRow);
      await removeFileIfUnused(old);
      if (row.published) scheduleSiteUpdate();
    } finally { setUploading(''); }
  }, '封面已更新');

  const setCover = (path: string) => run(async () => {
    setRow(must(await supabase.from('projects').update({ cover_path: path }).eq('id', row.id).select().single()) as ProjectRow);
    if (row.published) scheduleSiteUpdate();
  }, '已設為封面');

  const remove = () => {
    if (!confirm(`確定要刪除「${row.title}」？\n施工階段與所有照片會一起刪除，無法復原。`)) return;
    run(async () => {
      const paths = [row.cover_path, ...stages.flatMap((s) => s.photos.map((p) => p.path))];
      must(await supabase.from('projects').delete().eq('id', row.id));
      for (const p of new Set(paths)) await removeFileIfUnused(p);
      if (row.published) scheduleSiteUpdate();
      location.hash = '#/projects';
    }, '案例已刪除');
  };

  return (
    <section class="a-editor">
      <a href="#/projects" class="a-back">‹ 回案例列表</a>
      <div class="a-page-head">
        <h2>{row.title}</h2>
        {row.published && <a class="a-link" href={siteUrl(`/projects/${row.slug}/`)} target="_blank" rel="noopener">看官網頁面 ↗</a>}
      </div>

      <div class="a-card a-publish">
        <Toggle checked={row.published} onChange={(v) => setFlag('published', v)} disabled={busy}
          label={row.published ? '已發布：官網看得到這個案例' : '草稿：只有後台看得到'} />
        <Toggle checked={row.featured} onChange={(v) => setFlag('featured', v)} disabled={busy} label="放在首頁精選" />
      </div>

      <form class="a-card" onSubmit={saveBasic}>
        <h3>基本資料</h3>
        <div class="a-grid">
          <Field label="案例名稱"><input required value={form.title} onInput={set('title')} /></Field>
          <Field label="網址代稱" hint="英文小寫、數字、- ，例如 luzhou-house"><input required value={form.slug} onInput={set('slug')} /></Field>
          <Field label="分類">
            <select value={form.category} onChange={set('category')}>
              {categoryOptions.map((c) => <option value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="狀態">
            <select value={form.status} onChange={set('status')}>
              <option value="in_progress">施工中</option>
              <option value="completed">已完工</option>
            </select>
          </Field>
          <Field label="地區"><input value={form.location} onInput={set('location')} placeholder="例：新北市蘆洲區" /></Field>
          <Field label="開工日期"><input type="date" value={form.started_at} onInput={set('started_at')} /></Field>
          <Field label="坪數"><input type="number" inputMode="decimal" min="0" step="0.1" value={form.area_ping} onInput={set('area_ping')} /></Field>
          <Field label="工期（天）"><input type="number" inputMode="numeric" min="0" value={form.duration_days} onInput={set('duration_days')} /></Field>
        </div>
        <Field label="案例說明"><textarea rows={4} value={form.summary} onInput={set('summary')} /></Field>
        <Field label="案例重點" hint="一行寫一項"><textarea rows={4} value={form.highlights} onInput={set('highlights')} /></Field>
        <button class="a-btn a-btn--primary" disabled={busy}>儲存基本資料</button>
      </form>

      <div class="a-card">
        <h3>封面照片</h3>
        {row.cover_path ? <img class="a-cover" src={photoUrl(row.cover_path)} alt="封面" /> : <p class="a-empty">還沒有封面，發布前一定要有。</p>}
        <PhotoPicker busy={uploading} onFiles={uploadCover} label="上傳新封面" />
        <p class="a-hint">也可以在下方施工照片按「設為封面」。</p>
      </div>

      <Stages projectId={row.id} published={row.published} stages={stages} setStages={setStages}
        coverPath={row.cover_path} onSetCover={setCover} />

      <div class="a-danger">
        <button type="button" class="a-btn a-btn--danger" onClick={remove} disabled={busy}>刪除這個案例</button>
      </div>
    </section>
  );
}
