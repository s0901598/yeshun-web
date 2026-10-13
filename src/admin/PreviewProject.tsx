// 案例預覽：用跟官網案例頁一樣的版面，顯示後台已儲存（含尚未發布）的內容。只有登入的後台人員看得到。
import { plainText, richHtml } from '../lib/rich';
import { useEffect, useState } from 'preact/hooks';
import { categoryLabels, statusLabels, type Category, type Status } from '../data/projects';
import { photoUrl, siteUrl, supabase } from './lib';

interface Data {
  project: any;
  stages: { id: string; name: string; date: string | null; note: string; photos: { id: string; path: string; caption: string; published: boolean }[] }[];
  company: string;
}

const fmt = (d: string | null) => (d ? d.replaceAll('-', '.') : '');

export default function PreviewProject() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(location.search).get('id');
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return setError('login');
      if (!id) return setError('找不到要預覽的案例');
      const { data: p, error: e1 } = await supabase.from('projects').select('*').eq('id', id).single();
      if (e1 || !p) return setError('找不到這個案例，可能已經被刪除');
      const { data: st } = await supabase.from('stages').select('*, photos(*)').eq('project_id', id).order('sort');
      const { data: c } = await supabase.from('companies').select('short_name').eq('id', p.company).single();
      setData({
        project: p,
        company: c?.short_name ?? '',
        // 預覽顯示「發布後」的樣子：設定「不放上官網」的照片不顯示
        stages: (st ?? []).map((s: any) => ({
          ...s, photos: [...s.photos].filter((ph: any) => !ph.hidden).sort((a: any, b: any) => a.sort - b.sort),
        })),
      });
      document.title = `預覽：${p.title}`;
    })().catch((e) => setError(e.message));
  }, []);

  if (error === 'login') {
    return (
      <div class="container pv-msg">
        <p>預覽只有登入後台的人才看得到。</p>
        <a class="btn btn--primary" href={siteUrl('/admin/')}>到後台登入</a>
      </div>
    );
  }
  if (error) return <div class="container pv-msg"><p>{error}</p></div>;
  if (!data) return <div class="container pv-msg"><p>載入預覽中…</p></div>;

  const { project: pj, stages, company } = data;
  const cat = categoryLabels[pj.category as Category] ?? { zh: pj.category, en: '' };
  const coverUrl = photoUrl(pj.cover_path);
  const last = stages.at(-1);
  const gallery = [
    ...(coverUrl ? [{ url: coverUrl, caption: pj.title, draft: false }] : []),
    ...(last?.photos ?? []).filter((ph) => ph.path !== pj.cover_path).map((ph) => ({ url: photoUrl(ph.path), caption: ph.caption, draft: !ph.published })),
  ];
  const drafts = stages.flatMap((s) => s.photos).filter((ph) => !ph.published).length;

  return (
    <>
      <div class="pv-bar" role="status">
        <span>
          <strong>預覽模式</strong>　這是發布後官網的樣子
          {!pj.published ? '（這個案例還沒發布，官網目前看不到）' : drafts ? `（有 ${drafts} 張照片還沒發布，標「未發布」）` : ''}
        </span>
        <a href={`${siteUrl('/admin/')}#/projects/${pj.id}`}>回後台編輯</a>
      </div>

      <section class="intro">
        <div class="container">
          <p class="eyebrow">{cat.en} · {statusLabels[pj.status as Status]}</p>
          <h1 class="title">{pj.title}</h1>
          <dl class="specs mono">
            <div><dt>CATEGORY</dt><dd>{cat.zh}</dd></div>
            <div><dt>LOCATION</dt><dd>{pj.location}</dd></div>
            <div><dt>AREA</dt><dd>{pj.area_ping ?? 0} 坪</dd></div>
            <div><dt>DURATION</dt><dd>{pj.duration_days ?? 0} 天</dd></div>
            <div><dt>BUILDER</dt><dd>承作：{company}</dd></div>
            <div><dt>STATUS</dt><dd class={pj.status}>{statusLabels[pj.status as Status]}</dd></div>
          </dl>
        </div>
      </section>

      {gallery.length > 0 ? (
        <section class="gallery-wrap">
          <div class="container">
            <div class="gallery" style={`--thumbs: ${Math.max(Math.min(gallery.length - 1, 3), 1)}`}>
              {gallery.map((ph, i) => (
                <div class={`gallery__item corners ${i === 0 ? 'gallery__item--main' : ''}`}>
                  <img src={ph.url} alt={plainText(ph.caption)} />
                  {ph.draft && <span class="pv-flag">未發布</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div class="container"><p class="pv-warn">還沒有封面照片，發布前要先設定封面。</p></div>
      )}

      <section class="section about">
        <div class="container about__grid">
          <div class="reveal is-in">
            <p class="eyebrow">OVERVIEW</p>
            <h2 class="h-section">案例說明</h2>
            <p class="about__text" dangerouslySetInnerHTML={{ __html: richHtml(pj.summary) }} />
          </div>
          {pj.highlights?.length > 0 && (
            <div class="reveal is-in">
              <p class="eyebrow">KEY POINTS</p>
              <ul class="highlights">
                {pj.highlights.map((h: string, i: number) => <li><span class="mono">{String(i + 1).padStart(2, '0')}</span><span dangerouslySetInnerHTML={{ __html: richHtml(h) }} /></li>)}
              </ul>
            </div>
          )}
        </div>
      </section>

      {stages.length > 0 && (
        <section class="section section--alt">
          <div class="container">
            <div class="section-head">
              <p class="eyebrow">CONSTRUCTION LOG</p>
              <h2 class="h-section">施工進度</h2>
              <p class="lead">每個階段的現場照片，記錄完工後看不見的工序。</p>
            </div>
            <ol class="timeline">
              {stages.map((st, i) => {
                const current = pj.status === 'in_progress' && i === stages.length - 1;
                return (
                  <li class={`stage reveal is-in ${current ? 'is-current' : ''}`}>
                    <span class="stage__node" aria-hidden="true"></span>
                    <div class="stage__head">
                      <p class="stage__date mono">{fmt(st.date)}</p>
                      <h3 class="stage__name">
                        <span class="mono">STEP {String(i + 1).padStart(2, '0')}</span>
                        {st.name}
                        {current && <em class="stage__live">進行中</em>}
                      </h3>
                      <p class="stage__note" dangerouslySetInnerHTML={{ __html: richHtml(st.note) }} />
                    </div>
                    {st.photos.length > 0 && (
                      <ul class="stage__photos">
                        {st.photos.map((ph) => (
                          <li class="pv-photo">
                            <button type="button"><img src={photoUrl(ph.path)} alt={plainText(ph.caption)} /></button>
                            {!ph.published && <span class="pv-flag">未發布</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}
