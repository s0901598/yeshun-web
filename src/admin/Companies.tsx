// 公司資料：關於我們頁（介紹、特色、服務項目、全站結語）、業順營造與耀三室內裝修的登記資料，以及共用的聯絡方式、首頁數據。
// 修改先暫存，按下方「全部儲存並上傳」才存進後台；按上方「發布到官網」才會更新官網。
import { useEffect, useState } from 'preact/hooks';
import { lines, must, photoUrl, refreshSiteStatus, removeFileIfUnused, setUnsaved, supabase, uploadImage } from './lib';
import { Field, PhotoPicker, toast } from './ui';

interface CompanyRow {
  id: 'yeshun' | 'yaosan'; name: string; short_name: string; english_name: string; field: string; intro: string;
  services: string[]; license_no: string; license_image_path: string | null; show_license_image: boolean; sort: number;
}
interface Feature { title: string; lead?: string; body: string }
interface SettingsRow {
  phone: string; line_id: string; line_url: string; email: string; address: string; hours: string;
  stats: { label: string; value: number | string; suffix: string }[];
  // 關於我們：服務項目在表單裡是一行一項的文字
  about_intro: string; about_features: Feature[]; about_services: string; closing_quote: string; closing_text: string;
}
type CompanyForm = Omit<CompanyRow, 'services'> & { services: string; licenseFile?: File; licensePreview?: string };

const toCompanyForm = (c: CompanyRow): CompanyForm => ({ ...c, services: (c.services ?? []).join('\n') });
const comparable = (c: CompanyForm) => JSON.stringify({ ...c, licenseFile: undefined, licensePreview: undefined });

export default function Companies() {
  const [orig, setOrig] = useState<{ companies: CompanyForm[]; settings: SettingsRow } | null>(null);
  const [companies, setCompanies] = useState<CompanyForm[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [saving, setSaving] = useState('');

  const load = async () => {
    const cs = (must(await supabase.from('companies').select('*').order('sort')) as CompanyRow[]).map(toCompanyForm);
    const st = must(await supabase.from('site_settings').select('*').eq('id', 1).single()) as SettingsRow;
    const raw = st as unknown as SettingsRow & { about_services: string[] };
    const s: SettingsRow = {
      phone: st.phone, line_id: st.line_id, line_url: st.line_url, email: st.email, address: st.address, hours: st.hours, stats: st.stats ?? [],
      about_intro: raw.about_intro ?? '', about_features: raw.about_features ?? [], about_services: (raw.about_services ?? []).join('\n'),
      closing_quote: raw.closing_quote ?? '', closing_text: raw.closing_text ?? '',
    };
    setOrig({ companies: cs, settings: s });
    setCompanies(cs);
    setSettings(s);
  };
  useEffect(() => { load().catch((e) => toast(`讀取失敗：${e.message}`, 'error')); }, []);

  const dirtyCompanies = orig ? companies.filter((c, i) => comparable(c) !== comparable(orig.companies[i]) || c.licenseFile) : [];
  const settingsDirty = !!orig && !!settings && JSON.stringify(settings) !== JSON.stringify(orig.settings);
  const changes = dirtyCompanies.length + (settingsDirty ? 1 : 0);
  useEffect(() => { setUnsaved(changes); }, [changes]);
  useEffect(() => () => setUnsaved(0), []);

  if (!orig || !settings) return <p class="a-loading">載入中…</p>;

  const patchCompany = (id: string, patch: Partial<CompanyForm>) => setCompanies(companies.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setS = (k: keyof Omit<SettingsRow, 'stats' | 'about_features'>) => (e: Event) => setSettings({ ...settings, [k]: (e.target as HTMLInputElement).value });
  const setFeatures = (about_features: Feature[]) => setSettings({ ...settings, about_features });
  const setFeature = (i: number, k: keyof Feature, v: string) => setFeatures(settings.about_features.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const moveFeature = (i: number, d: number) => {
    const list = [...settings.about_features]; const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; setFeatures(list);
  };
  const setStat = (i: number, k: 'label' | 'value' | 'suffix', v: string) =>
    setSettings({ ...settings, stats: settings.stats.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  const saveAll = async () => {
    if (companies.some((c) => !c.name.trim() || !c.short_name.trim())) return toast('公司名稱和簡稱不能空白', 'error');
    const badStat = settings.stats.findIndex((x) => x.label.trim() && !Number.isFinite(Number(x.value)));
    if (badStat >= 0) return toast(`首頁數據第 ${badStat + 1} 筆的數字格式不對`, 'error');
    try {
      for (const c of dirtyCompanies) {
        const before = orig.companies.find((o) => o.id === c.id)!;
        let licensePath = c.license_image_path;
        if (c.licenseFile) {
          setSaving(`上傳${c.short_name}登記證照片…`);
          licensePath = await uploadImage('companies', c.licenseFile);
        }
        setSaving('儲存中…');
        must(await supabase.from('companies').update({
          name: c.name.trim(), short_name: c.short_name.trim(), english_name: c.english_name.trim().toUpperCase(),
          field: c.field.trim(), intro: c.intro.trim(), services: lines(c.services), license_no: c.license_no.trim(),
          license_image_path: licensePath, show_license_image: c.show_license_image,
        }).eq('id', c.id));
        if (licensePath !== before.license_image_path) await removeFileIfUnused(before.license_image_path);
        if (c.licensePreview) URL.revokeObjectURL(c.licensePreview);
      }
      if (settingsDirty) {
        setSaving('儲存中…');
        must(await supabase.from('site_settings').update({
          phone: settings.phone.trim(), line_id: settings.line_id.trim(), line_url: settings.line_url.trim(),
          email: settings.email.trim(), address: settings.address.trim(), hours: settings.hours.trim(),
          stats: settings.stats.filter((x) => x.label.trim()).map((x) => ({ label: x.label.trim(), value: Number(x.value), suffix: x.suffix.trim() })),
          about_intro: lines(settings.about_intro).join('\n'),
          about_features: settings.about_features.map((f) => ({ title: f.title.trim(), lead: (f.lead ?? '').trim(), body: f.body.trim() })).filter((f) => f.title || f.body),
          about_services: lines(settings.about_services),
          closing_quote: settings.closing_quote.trim().replace(/^「|」$/g, ''), closing_text: settings.closing_text.trim(),
        }).eq('id', 1));
      }
      await load();
      void refreshSiteStatus();
      toast('已全部儲存。確認後按上方「發布到官網」更新官網');
    } catch (e) {
      toast(`儲存失敗：${(e as Error).message}`, 'error');
    } finally {
      setSaving('');
    }
  };

  return (
    <section class="a-editor">
      <div class="a-page-head"><h2>公司資料</h2></div>
      <p class="a-hint">沒有填的欄位，官網上就不會顯示。修改後按最下方「全部儲存並上傳」，再按上方「發布到官網」更新官網。</p>

      <div class="a-card">
        <h3>關於我們頁{settingsDirty && <span class="a-dot">未儲存</span>}</h3>
        <Field label="介紹" hint="一行就是一段"><textarea rows={8} value={settings.about_intro} onInput={setS('about_intro')} /></Field>

        <h4 class="a-subhead">特色（每一項是一格）</h4>
        <p class="a-hint">官網上會一格一格依序浮出；手機版只顯示標題，點一下才展開內文。</p>
        <ul class="a-features">
          {settings.about_features.map((f, i) => (
            <li>
              <div class="a-features__head">
                <span class="a-features__no">{String(i + 1).padStart(2, '0')}</span>
                <input aria-label={`第 ${i + 1} 格標題`} placeholder="標題，例：精湛工藝，嚴格把關" value={f.title} onInput={(e) => setFeature(i, 'title', (e.target as HTMLInputElement).value)} />
              </div>
              <input class="a-features__lead" aria-label={`第 ${i + 1} 格重點句`} placeholder="重點句（選填，大字顯示在內文上方），例：從原料到竣工，層層把關" value={f.lead ?? ''} onInput={(e) => setFeature(i, 'lead', (e.target as HTMLInputElement).value)} />
              <textarea aria-label={`第 ${i + 1} 格內文`} rows={3} placeholder="內文" value={f.body} onInput={(e) => setFeature(i, 'body', (e.target as HTMLTextAreaElement).value)} />
              <div class="a-features__btns">
                <button type="button" class="a-text-btn" disabled={i === 0} onClick={() => moveFeature(i, -1)}>↑ 上移</button>
                <button type="button" class="a-text-btn" disabled={i === settings.about_features.length - 1} onClick={() => moveFeature(i, 1)}>↓ 下移</button>
                <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => setFeatures(settings.about_features.filter((_, j) => j !== i))}>刪除</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" class="a-btn a-btn--ghost a-btn--small" onClick={() => setFeatures([...settings.about_features, { title: '', lead: '', body: '' }])}>＋ 新增一格</button>

        <h4 class="a-subhead">服務項目</h4>
        <Field label="服務項目" hint="一行寫一項。括號裡的文字會變成小字說明，例：廠房與公共工程（工業廠房、公共基礎建設）"><textarea rows={6} value={settings.about_services} onInput={setS('about_services')} /></Field>

        <h4 class="a-subhead">結語（每一頁最下方，和「預約諮詢」按鈕一起顯示）</h4>
        <Field label="引言" hint="不用加「」，官網會自動加上"><input value={settings.closing_quote} onInput={setS('closing_quote')} /></Field>
        <Field label="結語"><textarea rows={2} value={settings.closing_text} onInput={setS('closing_text')} /></Field>
      </div>

      {companies.map((c) => {
        const dirty = dirtyCompanies.includes(c);
        const licenseSrc = c.licensePreview ?? photoUrl(c.license_image_path);
        return (
          <div class="a-card" key={c.id}>
            <h3>{c.id === 'yeshun' ? '業順營造' : '耀三室內裝修'}{dirty && <span class="a-dot">未儲存</span>}</h3>
            <div class="a-grid">
              <Field label="公司全名"><input value={c.name} onInput={(e) => patchCompany(c.id, { name: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="簡稱" hint={c.id === 'yeshun' ? '頁首大字' : '頁首小字（業順營造下方）'}><input value={c.short_name} onInput={(e) => patchCompany(c.id, { short_name: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="英文名稱"><input value={c.english_name} onInput={(e) => patchCompany(c.id, { english_name: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="業務類別" hint="例：營造工程、室內裝修"><input value={c.field} onInput={(e) => patchCompany(c.id, { field: (e.target as HTMLInputElement).value })} /></Field>
            </div>
            <Field label="公司介紹"><textarea rows={4} value={c.intro} onInput={(e) => patchCompany(c.id, { intro: (e.target as HTMLTextAreaElement).value })} /></Field>
            <Field label="服務項目" hint="一行寫一項"><textarea rows={5} value={c.services} onInput={(e) => patchCompany(c.id, { services: (e.target as HTMLTextAreaElement).value })} /></Field>

            <h4 class="a-subhead">登記資料</h4>
            <Field label="登記字號" hint="例：內營室業字第 ○○○○ 號。空白時官網不顯示"><input value={c.license_no} onInput={(e) => patchCompany(c.id, { license_no: (e.target as HTMLInputElement).value })} /></Field>
            <div class="a-field">
              <span class="a-field__label">登記證照片</span>
              {licenseSrc ? <img class="a-license" src={licenseSrc} alt="登記證" /> : <p class="a-empty">還沒有上傳</p>}
              <PhotoPicker label={licenseSrc ? '換一張' : '上傳登記證照片'}
                onFiles={(files) => patchCompany(c.id, { licenseFile: files[0], licensePreview: URL.createObjectURL(files[0]) })} />
              {licenseSrc && (
                <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => {
                  if (c.licensePreview) URL.revokeObjectURL(c.licensePreview);
                  patchCompany(c.id, { license_image_path: null, licenseFile: undefined, licensePreview: undefined, show_license_image: false });
                }}>移除照片</button>
              )}
            </div>
            <label class="a-check">
              <input type="checkbox" checked={c.show_license_image} disabled={!licenseSrc}
                onChange={(e) => patchCompany(c.id, { show_license_image: (e.target as HTMLInputElement).checked })} />
              在官網「關於我們」顯示登記證照片
            </label>
          </div>
        );
      })}

      <div class="a-card">
        <h3>聯絡資料（兩家公司共用）</h3>
        <div class="a-grid">
          <Field label="電話" hint="例：02-2281-0000"><input type="tel" value={settings.phone} onInput={setS('phone')} /></Field>
          <Field label="Email"><input type="email" value={settings.email} onInput={setS('email')} /></Field>
          <Field label="LINE ID" hint="例：@yeshun"><input value={settings.line_id} onInput={setS('line_id')} /></Field>
          <Field label="LINE 加好友網址" hint="選填。沒填會用 LINE ID 自動產生"><input value={settings.line_url} onInput={setS('line_url')} /></Field>
        </div>
        <Field label="地址" hint="官網的地圖會依這個地址自動顯示"><input value={settings.address} onInput={setS('address')} /></Field>
        <Field label="營業時間" hint="例：週一至週六 09:00–18:00"><input value={settings.hours} onInput={setS('hours')} /></Field>

        <h4 class="a-subhead">首頁數據</h4>
        <p class="a-hint">首頁大圖下方的數字，例如「完成案件 120+」。沒有資料時首頁不顯示這一列。</p>
        <ul class="a-stats">
          {settings.stats.map((x, i) => (
            <li>
              <input aria-label="名稱" placeholder="名稱，例：完成案件" value={x.label} onInput={(e) => setStat(i, 'label', (e.target as HTMLInputElement).value)} />
              <input aria-label="數字" placeholder="數字" inputMode="numeric" value={String(x.value)} onInput={(e) => setStat(i, 'value', (e.target as HTMLInputElement).value)} />
              <input aria-label="單位" placeholder="單位，例：+、年" value={x.suffix} onInput={(e) => setStat(i, 'suffix', (e.target as HTMLInputElement).value)} />
              <button type="button" class="a-text-btn a-text-btn--danger" onClick={() => setSettings({ ...settings, stats: settings.stats.filter((_, j) => j !== i) })}>刪除</button>
            </li>
          ))}
        </ul>
        {settings.stats.length < 4 && (
          <button type="button" class="a-btn a-btn--ghost a-btn--small" onClick={() => setSettings({ ...settings, stats: [...settings.stats, { label: '', value: '', suffix: '' }] })}>＋ 新增一筆數據</button>
        )}
      </div>

      <div class="a-savebar" role="region" aria-label="儲存">
        <p class={`a-savebar__msg ${changes ? 'is-dirty' : ''}`} role="status">{saving || (changes ? `有 ${changes} 項變更還沒儲存` : '已全部儲存')}</p>
        <div class="a-savebar__btns">
          <button type="button" class="a-btn a-btn--primary" onClick={() => void saveAll()} disabled={!!saving || changes === 0}>全部儲存並上傳</button>
        </div>
      </div>
    </section>
  );
}
