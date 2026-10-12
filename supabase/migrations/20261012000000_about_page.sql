-- 關於我們改成單一頁：介紹、五格特色、服務項目、結語（結語同時是全站頁尾前的區塊），都放在 site_settings 讓後台可改
alter table public.site_settings
  add column about_intro text not null default '',
  add column about_features jsonb not null default '[]'::jsonb,
  add column about_services jsonb not null default '[]'::jsonb,
  add column closing_quote text not null default '',
  add column closing_text text not null default '';

update public.site_settings set
  about_intro = $$「安全第一、品質至上、誠信永懇」是我們堅持經營理念。細節決定成敗，每一道工序都代表著我們對建築品質的極致追求。
「用蓋自己家人的房子的心情，看待每一塊磚、每一根鋼筋。」是我們創立至今從未改變的初心。
專注於住宅營造與空間改造，不追求極致的規模，只追求讓每位業主笑著接屋的滿意度。
從法規諮詢、成本控管、營造施工到竣工驗收。跨越設計師、結構技師與施工團隊之間的溝通鴻溝，讓業主用最透明的預算、最安心的心情，看著理想空間落地成真。$$,
  about_features = $$[
    {"title": "精湛工藝，嚴格把關", "body": "施工技術與標準化管理，從原料採購到竣工檢驗，層層落實品質監控，確保結構誤差降至最低。"},
    {"title": "ESG 永續營造、綠色建築", "body": "積極響應節能減碳，取得EEWH台灣綠建築標章與LEED美國綠建築協會標章，協助業主打造符合國際 ESG 與綠建築認證標章的優質空間，為環境保護與永續發展盡一份心力！"},
    {"title": "完整服務", "body": "從前期的法規諮詢、建築設計配合，到中期的營造施工，乃至於竣工後的申請執照及完善保固，我們始終都在。"},
    {"title": "專業團隊", "body": "擁有一支涵蓋國家土木技師、結構技師、工地主任及資深工務的專業團隊，能精準掌控工程進度、成本與施工細節。"},
    {"title": "安全施工", "body": "零災害理念，多一份安全準備，少一份事故傷害。全面落實職業安全衛生，維護施工人員安全與工地秩序，讓業主放心安心。"}
  ]$$::jsonb,
  about_services = $$[
    "住宅與商業空間興建與裝修",
    "廠房與公共工程（工業廠房、公共基礎建設）",
    "舊屋翻新與結構補強（耐震補強、老舊建築改建與拉皮）",
    "全案建築統合式管理服務（工程諮詢、估驗計價、建築法規、營建法規諮詢）",
    "水電、消防、防水、無障礙等專項工程"
  ]$$::jsonb,
  closing_quote = '建築不僅僅是鋼筋與水泥的堆疊，更是承載生活與夢想的容器。',
  closing_text = '業順營造將持續以堅實的工藝底蘊，為您打造值得託付終身的安全建築。'
where id = 1;
