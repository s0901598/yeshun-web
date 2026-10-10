// 公司基本資料。標記 todo 的欄位是示意內容，拿到真實資料後替換並移除 todo。
export const site = {
  // 設為 false 就會隱藏頁面上所有「待補」標籤
  showTodo: true,

  name: '業順營造有限公司',
  shortName: '業順營造',
  englishName: 'YE-SHUN CONSTRUCTION',
  slogan: '從設計到完工，每個細節都看得見',
  intro:
    '業順營造專注於住宅、商業與辦公空間的室內裝修設計與施工。我們相信好的空間來自看不見的地方——防水、管線、結構補強，每一道工序都拍照記錄、透明交付。',

  license: { value: '內營室業字第 ________ 號', todo: true },
  phone: { value: '02-0000-0000', href: 'tel:0200000000', todo: true },
  line: { value: '@yeshun', href: 'https://line.me/R/ti/p/@yeshun', todo: true },
  email: { value: 'ye.shun7589@gmail.com', href: 'mailto:ye.shun7589@gmail.com', todo: false },
  address: { value: '新北市蘆洲區三民路 128 巷 118 號', todo: true },
  hours: { value: '週一至週六 09:00–18:00', todo: true },
  mapEmbed:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3613.3159559753412!2d121.46660687407683!3d25.091163835989775!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3442af3553cea2c7%3A0x384c9e37543e852a!2zMjQ35paw5YyX5biC6JiG5rSy5Y2A5LiJ5rCR6LevMTI45be3MTE46JmfMQ!5e0!3m2!1szh-TW!2stw!4v1756805704714!5m2!1szh-TW!2stw',

  stats: {
    todo: true,
    items: [
      { label: '完成案件', value: 120, suffix: '+' },
      { label: '服務年資', value: 15, suffix: '年' },
      { label: '保固期', value: 2, suffix: '年' },
      { label: '施工照片記錄', value: 100, suffix: '%' },
    ],
  },
};

export const nav = [
  { href: '/about', label: '關於業順', en: 'ABOUT' },
  { href: '/projects', label: '案例作品', en: 'PROJECTS' },
  { href: '/details', label: '注重的細節', en: 'DETAILS' },
  { href: '/process', label: '服務流程', en: 'PROCESS' },
];

// 服務流程內容改由後台管理；todo 為 true 時流程頁顯示「內容待確認」
export const processTodo = true;
