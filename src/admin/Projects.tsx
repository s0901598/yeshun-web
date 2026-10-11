// 案例作品：列表與編輯。
// 編輯流程：改內容、選照片（先暫存）→「全部儲存並上傳」存進後台 →「預覽」確認 →「發布這個案例」
import { useEffect, useState } from 'preact/hooks';
import {
  categoryOptions, companyOptions, lines, must, photoUrl, publishSite, refreshSiteStatus,
  removeFileIfUnused, setUnsaved, siteUrl, supabase, uploadImage,
} from './lib';
import { Field, PhotoPicker, toast } from './ui';
import Stages, { stageChanges, type PhotoDraft, type StageDraft } from './Stages';

export interface ProjectRow {
  id: string; slug: string; title: string; category: string; company: string; location: string;
  area_ping: number | null; duration_days: number | null; status: string; summary: string;
  highlights: string[]; cover_path: string | null; featured: boolean; published: boolean;
  started_at: string | null; updated_at: string;
}

const labelOf = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function Projects(props: { hash: string }) {
  const id = props.hash.split('/')[2];
  return id ? <ProjectEditor id={id} /> : <ProjectList />;
}

// ---------- 列表 ----------
function ProjectList() {
  const [rows, setRows] = useState<(ProjectRow & { drafts: number })[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const data = must(await supabase.from('projects').select('*, stages(photos(published, hidden))')
        .order('started_at', { ascending: false, nullsFirst: true })) as any[];
      setRows(data.map((r) => ({
        ...r,
        drafts: (r.stages ?? []).flatMap((s: any) => s.photos).filter((p: any) => !p.published && !p.hidden).length,
      })));
    })().catch((e) => toast(`讀取失敗：${e.message}`, 'error'));
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const row = must(await supabase.from('projects').insert({
        slug: `case-${Date.now().toString(36)}`, title: '新案例', category: 'residential', company: 'yaosan',
        status: 'in_progress', published: false, started_at: new Date().toISOString().slice(0, 10),
      }).select('id').single()) as { id: string };
      void refreshSiteStatus();
      location.hash = `#/projects/${row.id}`;
    } catch (e) {
      toast(`新增失敗：${(e as Error).message}`, 'error');
    } finally { setBusy(false); }
  };

  if (!rows) return <p class="a-loading">載入中…</p>;
  const shown = rows.filter((r) => filter === 'all' || (filter === 'published' ? r.published : !r.published));

  return (
    <section>
      <div class="a-page-head">
        <h2>案例作品 <small>{rows.length} 個</small></h2>
        <button class="a-btn a-btn--primary" onClick={create} disabled={busy}>＋ 新增案例</button>
      </div>
      <div class="a-chips">
        {(['all', 'published', 'draft'] as const).map((f) => (
          <button type="button" class={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
            {{ all: '全部', published: '已發布', draft: '未發布' }[f]}
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
                <span class="a-row__meta">{labelOf(categoryOptions, r.category)}・{labelOf(companyOptions, r.company)}・{r.location || '未填地區'}</span>
                <span class="a-badges">
                  <span class={`a-badge ${r.published ? 'a-badge--on' : ''}`}>{r.published ? '已發布' : '未發布'}</span>
                  <span class="a-badge">{r.status === 'completed' ? '已完工' : '施工中'}</span>
                  {r.featured && <span class="a-badge a-badge--gold">首頁精選</span>}
                  {r.published && r.drafts > 0 && <span class="a-badge a-badge--warn">{r.drafts} 張照片未發布</span>}
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
type Form = Record<'title' | 'slug' | 'category' | 'company' | 'status' | 'location' | 'area_ping' | 'duration_days' | 'started_at' | 'summary' | 'highlights', string> & { featured: boolean };
type Cover = { kind: 'saved'; path: string | null } | { kind: 'photo'; key: string } | { kind: 'file'; file: File; preview: string };

const toForm = (p: ProjectRow): Form => ({
  title: p.title, slug: p.slug, category: p.category, company: p.company, status: p.status, location: p.location,
  area_ping: p.area_ping?.toString() ?? '', duration_days: p.duration_days?.toString() ?? '',
  started_at: p.started_at ?? '', summary: p.summary, highlights: (p.highlights ?? []).join('\n'), featured: p.featured,
});

function ProjectEditor(props: { id: string }) {
  const [row, setRow] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [cover, setCover] = useState<Cover>({ kind: 'saved', path: null });
  const [saving, setSaving] = useState('');   // 儲存中的進度文字
  const [working, setWorking] = useState(false);

  const load = async () => {
    const p = must(await supabase.from('projects').select('*').eq('id', props.id).single()) as ProjectRow;
    const st = must(await supabase.from('stages').select('*, photos(*)').eq('project_id', props.id).order('sort')) as any[];
    setRow(p);
    setForm(toForm(p));
    setCover({ kind: 'saved', path: p.cover_path });
    setStages(st.map((s, i): StageDraft => {
      const photos = [...s.photos].sort((a: any, b: any) => a.sort - b.sort);
      return {
        key: s.id, id: s.id, name: s.name, date: s.date ?? '', note: s.note,
        orig: { name: s.name, date: s.date ?? '', note: s.note, sort: i },
        photos: photos.map((ph: any, j: number): PhotoDraft => ({
          key: ph.id, id: ph.id, path: ph.path, caption: ph.caption, hidden: ph.hidden, published: ph.published,
          orig: { caption: ph.caption, hidden: ph.hidden, sort: j },
        })),
      };
    }));
  };
  useEffect(() => { load().catch((e) => toast(`讀取失敗：${e.message}`, 'error')); }, [props.id]);

  // 未儲存的變更數
  const visibleStages = stages.filter((s) => !s.deleted);
  const basicDirty = !!(row && form) && JSON.stringify(toForm(row)) !== JSON.stringify(form);
  const coverDirty = cover.kind !== 'saved';
  const changes = (basicDirty ? 1 : 0) + (coverDirty ? 1 : 0)
    + stages.reduce((n, s) => n + stageChanges(s, visibleStages.indexOf(s)), 0);
  useEffect(() => { setUnsaved(changes); }, [changes]);
  useEffect(() => () => setUnsaved(0), []);

  if (!row || !form) return <p class="a-loading">載入中…</p>;

  const set = (k: keyof Form) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });
  const allPhotos = stages.flatMap((s) => s.photos);
  const coverKey = cover.kind === 'photo' ? cover.key
    : cover.kind === 'saved' ? allPhotos.find((p) => p.path && p.path === cover.path)?.key ?? null : null;
  const coverSrc = cover.kind === 'file' ? cover.preview
    : cover.kind === 'photo' ? (() => { const p = allPhotos.find((x) => x.key === cover.key); return p?.preview ?? photoUrl(p?.path); })()
    : photoUrl(cover.path);
  const unpublishedPhotos = allPhotos.filter((p) => !p.deleted && !p.hidden && !p.published).length;

  // ---------- 全部儲存並上傳 ----------
  const saveAll = async (): Promise<boolean> => {
    const slug = form.slug.trim().toLowerCase();
    if (!form.title.trim()) { toast('請填寫案例名稱', 'error'); return false; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { toast('網址代稱只能用英文小寫、數字和「-」，例如 luzhou-house', 'error'); return false; }
    const unnamed = visibleStages.findIndex((s) => !s.name.trim());
    if (unnamed >= 0) { toast(`第 ${unnamed + 1} 個階段還沒填名稱`, 'error'); return false; }

    setWorking(true);
    const cleanup: (string | null | undefined)[] = [];
    const toUpload = visibleStages.reduce((n, s) => n + s.photos.filter((p) => p.file && !p.deleted).length, 0) + (cover.kind === 'file' ? 1 : 0);
    let uploaded = 0;
    try {
      setSaving('儲存中…');
      // 1. 基本資料
      if (basicDirty) {
        must(await supabase.from('projects').update({
          title: form.title.trim(), slug, category: form.category, company: form.company, status: form.status,
          location: form.location.trim(), area_ping: form.area_ping ? Number(form.area_ping) : null,
          duration_days: form.duration_days ? Number(form.duration_days) : null, started_at: form.started_at || null,
          summary: form.summary.trim(), highlights: lines(form.highlights), featured: form.featured,
        }).eq('id', row.id));
      }
      // 2. 刪除的階段（照片會一起刪）
      for (const st of stages.filter((s) => s.deleted && s.id)) {
        must(await supabase.from('stages').delete().eq('id', st.id!));
        cleanup.push(...st.photos.map((p) => p.path));
      }
      // 3. 新增、修改的階段與照片（依畫面順序）
      for (const [i, st] of visibleStages.entries()) {
        const values = { name: st.name.trim(), date: st.date || null, note: st.note.trim(), sort: i };
        if (!st.id) {
          st.id = (must(await supabase.from('stages').insert({ ...values, project_id: row.id }).select('id').single()) as { id: string }).id;
          st.orig = { name: values.name, date: st.date, note: values.note, sort: i };
        } else if (stageChanges({ ...st, photos: [] }, i)) {
          must(await supabase.from('stages').update(values).eq('id', st.id));
        }
        for (const ph of st.photos.filter((p) => p.deleted && p.id)) {
          must(await supabase.from('photos').delete().eq('id', ph.id!));
          cleanup.push(ph.path);
        }
        for (const [j, ph] of st.photos.filter((p) => !p.deleted).entries()) {
          if (ph.file) {
            setSaving(`上傳照片 ${++uploaded} / ${toUpload}…`);
            const path = await uploadImage(`projects/${row.id}`, ph.file);
            const ins = must(await supabase.from('photos').insert({
              stage_id: st.id, path, caption: ph.caption.trim(), hidden: ph.hidden, published: false, sort: j,
            }).select('id').single()) as { id: string };
            Object.assign(ph, { id: ins.id, path, file: undefined, orig: { caption: ph.caption, hidden: ph.hidden, sort: j } });
          } else if (ph.orig && (ph.orig.caption !== ph.caption || ph.orig.hidden !== ph.hidden || ph.orig.sort !== j)) {
            // 設成「不放上官網」的照片同時取消發布
            must(await supabase.from('photos').update({
              caption: ph.caption.trim(), hidden: ph.hidden, sort: j, ...(ph.hidden ? { published: false } : {}),
            }).eq('id', ph.id!));
          }
        }
      }
      // 4. 封面
      let coverPath: string | null | undefined;
      if (cover.kind === 'file') {
        setSaving(`上傳照片 ${++uploaded} / ${toUpload}…`);
        coverPath = await uploadImage(`projects/${row.id}`, cover.file);
      } else if (cover.kind === 'photo') {
        coverPath = allPhotos.find((p) => p.key === cover.key)?.path;
      }
      if (coverPath !== undefined && coverPath !== row.cover_path) {
        must(await supabase.from('projects').update({ cover_path: coverPath }).eq('id', row.id));
        cleanup.push(row.cover_path);
      }
      // 5. 清掉不再使用的照片檔
      setSaving('整理照片空間…');
      for (const p of new Set(cleanup)) await removeFileIfUnused(p);

      allPhotos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      if (cover.kind === 'file') URL.revokeObjectURL(cover.preview);
      await load();
      void refreshSiteStatus();
      toast('已全部儲存。可以按「預覽」確認，沒問題再按「發布這個案例」');
      return true;
    } catch (e) {
      setStages([...stages]); // 已經存好的部分會記住，再按一次只會處理剩下的
      toast(`儲存失敗：${(e as Error).message}。已完成的部分已保存，請再按一次儲存`, 'error');
      return false;
    } finally {
      setSaving('');
      setWorking(false);
    }
  };

  // ---------- 預覽 ----------
  const preview = async () => {
    const win = window.open('', '_blank'); // 先開視窗，避免儲存完才開被瀏覽器擋下
    if (changes > 0) {
      if (!confirm('預覽會顯示已儲存的內容。要先「全部儲存並上傳」再預覽嗎？')) { win?.close(); return; }
      if (!(await saveAll())) { win?.close(); return; }
    }
    const url = `${siteUrl('/preview/')}?id=${row.id}`;
    if (win) win.location.href = url; else location.href = url;
  };

  // ---------- 發布、下架 ----------
  const publish = async () => {
    if (changes > 0) return toast('還有未儲存的變更，請先按「全部儲存並上傳」', 'error');
    if (!row.cover_path) return toast('發布前請先設定封面照片', 'error');
    const msg = row.published
      ? `要把這個案例的最新內容發布到官網嗎？${unpublishedPhotos ? `（含 ${unpublishedPhotos} 張未發布的照片）` : ''}\n官網約 1–2 分鐘後更新。`
      : `確定要發布「${row.title}」嗎？\n發布後官網約 1–2 分鐘就看得到。`;
    if (!confirm(msg)) return;
    setWorking(true);
    try {
      must(await supabase.rpc('publish_project', { project: row.id }));
      const ok = await publishSite();
      await load();
      toast(ok ? '已發布，官網約 1–2 分鐘後更新' : '已標記為發布，但通知官網更新失敗，請按上方「發布到官網」重試', ok ? 'ok' : 'error');
    } catch (e) {
      toast(`發布失敗：${(e as Error).message}`, 'error');
    } finally { setWorking(false); }
  };

  const unpublish = async () => {
    if (!confirm(`確定要把「${row.title}」從官網下架嗎？內容會保留在後台，之後可以再發布。`)) return;
    setWorking(true);
    try {
      must(await supabase.from('projects').update({ published: false }).eq('id', row.id));
      const ok = await publishSite();
      await load();
      toast(ok ? '已下架，官網約 1–2 分鐘後更新' : '已下架，但通知官網更新失敗，請按上方「發布到官網」重試', ok ? 'ok' : 'error');
    } catch (e) {
      toast(`下架失敗：${(e as Error).message}`, 'error');
    } finally { setWorking(false); }
  };

  const remove = async () => {
    if (!confirm(`確定要刪除「${row.title}」？\n施工階段與所有照片會一起刪除，無法復原。`)) return;
    setWorking(true);
    try {
      const paths = [row.cover_path, ...allPhotos.map((p) => p.path)];
      must(await supabase.from('projects').delete().eq('id', row.id));
      for (const p of new Set(paths)) await removeFileIfUnused(p);
      if (row.published) await publishSite();
      setUnsaved(0);
      toast('案例已刪除');
      location.hash = '#/projects';
    } catch (e) {
      toast(`刪除失敗：${(e as Error).message}`, 'error');
      setWorking(false);
    }
  };

  const busy = working || !!saving;

  return (
    <section class="a-editor">
      <a href="#/projects" class="a-back">‹ 回案例列表</a>
      <div class="a-page-head">
        <h2>{row.title}</h2>
        {row.published && <a class="a-link" href={siteUrl(`/projects/${row.slug}/`)} target="_blank" rel="noopener">看官網頁面 ↗</a>}
      </div>

      <div class={`a-card a-status ${row.published ? 'is-live' : ''}`}>
        <p class="a-status__main">{row.published ? '● 已發布：官網看得到這個案例' : '○ 未發布：只有後台看得到'}</p>
        {row.published && unpublishedPhotos > 0 && <p class="a-status__sub">有 {unpublishedPhotos} 張照片已上傳但還沒發布，按下方「發布這個案例」後才會出現</p>}
        {row.published && <button type="button" class="a-text-btn a-text-btn--danger" onClick={unpublish} disabled={busy}>從官網下架</button>}
      </div>

      <div class="a-card">
        <h3>基本資料{basicDirty && <span class="a-dot">未儲存</span>}</h3>
        <div class="a-grid">
          <Field label="案例名稱"><input required value={form.title} onInput={set('title')} /></Field>
          <Field label="網址代稱" hint="英文小寫、數字、- ，例如 luzhou-house"><input required value={form.slug} onInput={set('slug')} /></Field>
          <Field label="分類">
            <select value={form.category} onChange={set('category')}>
              {categoryOptions.map((c) => <option value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="承作公司">
            <select value={form.company} onChange={set('company')}>
              {companyOptions.map((c) => <option value={c.value}>{c.label}</option>)}
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
        <label class="a-check">
          <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: (e.target as HTMLInputElement).checked })} />
          放在首頁精選
        </label>
      </div>

      <div class="a-card">
        <h3>封面照片{coverDirty && <span class="a-dot">未儲存</span>}</h3>
        {coverSrc ? <img class="a-cover" src={coverSrc} alt="封面" /> : <p class="a-empty">還沒有封面，發布前一定要有。</p>}
        <PhotoPicker onFiles={(files) => setCover({ kind: 'file', file: files[0], preview: URL.createObjectURL(files[0]) })} label="換封面照片" />
        <p class="a-hint">也可以在下方施工照片按「設為封面」。</p>
      </div>

      <Stages stages={stages} onChange={setStages} coverKey={coverKey}
        onSetCover={(ph) => setCover(ph.path && ph.path === row.cover_path ? { kind: 'saved', path: row.cover_path } : { kind: 'photo', key: ph.key })} />

      <div class="a-danger">
        <button type="button" class="a-btn a-btn--danger" onClick={remove} disabled={busy}>刪除這個案例</button>
      </div>

      {/* 固定在畫面最下方的儲存列 */}
      <div class="a-savebar" role="region" aria-label="儲存與發布">
        <p class={`a-savebar__msg ${changes ? 'is-dirty' : ''}`} role="status">
          {saving || (changes ? `有 ${changes} 項變更還沒儲存` : row.published && unpublishedPhotos === 0 ? '已全部儲存' : '已全部儲存，確認預覽後可以發布')}
        </p>
        <div class="a-savebar__btns">
          <button type="button" class="a-btn a-btn--ghost a-btn--small" onClick={preview} disabled={busy}>預覽</button>
          <button type="button" class="a-btn a-btn--ghost a-btn--small" onClick={publish} disabled={busy || changes > 0}>發布這個案例</button>
          <button type="button" class="a-btn a-btn--primary" onClick={() => void saveAll()} disabled={busy || changes === 0}>全部儲存並上傳</button>
        </div>
      </div>
    </section>
  );
}
