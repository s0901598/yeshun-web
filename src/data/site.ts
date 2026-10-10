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
  { href: '/#process', label: '服務流程', en: 'PROCESS' },
];

export const processSteps = [
  { no: '01', title: '初步諮詢', desc: '電話或 LINE 聊聊需求、預算與時程。' },
  { no: '02', title: '現場丈量', desc: '到府丈量、檢查屋況，記錄管線與結構現況。' },
  { no: '03', title: '設計與報價', desc: '提出平面配置與明細報價，每一項目都列清楚。' },
  { no: '04', title: '簽約施工', desc: '依工序施工，各階段拍照回報進度。' },
  { no: '05', title: '驗收與保固', desc: '逐項驗收、交付完工資料，享有保固服務。' },
];

export const details = [
  {
    code: 'D-01',
    title: '防水工程',
    summary: '浴室、陽台全面做防水層，並做 48 小時試水測試。',
    body: '防水做不好，問題往往幾年後才浮現。我們在浴室、廚房與陽台施作多層防水，完成後封水 48 小時確認無滲漏，才進入下一道工序。',
    image: '/images/detail-tools.webp',
  },
  {
    code: 'D-02',
    title: '水電管線',
    summary: '管線重新配置、標示迴路，完工附管線配置圖。',
    body: '老屋常見管線老化與迴路不足。我們依用電需求重新規劃迴路，管線全程套管保護，並在封板前拍照留存，日後維修有跡可循。',
    image: '/images/stage-wall.webp',
  },
  {
    code: 'D-03',
    title: '隱蔽工程存證',
    summary: '封板、鋪磚前的每一處都拍照記錄，交付給業主。',
    body: '天花板內、地板下、牆壁裡——完工後看不見的地方最容易被省略。每個封閉前的節點我們都會拍照存證，完整交付給業主。',
    image: '/images/stage-frame.webp',
  },
  {
    code: 'D-04',
    title: '工地整潔與保護',
    summary: '進場先做公共區域保護，每日收工清潔。',
    body: '施工期間做好電梯、走道與既有裝潢的保護，每日收工清潔、垃圾分類清運，減少對鄰居與住戶的打擾。',
    image: '/images/stage-site.webp',
  },
  {
    code: 'D-05',
    title: '透明報價',
    summary: '報價逐項列明材料與工法，不用模糊的「一式」。',
    body: '報價單逐項列出品牌、規格、數量與工法，追加項目先報價再施工，讓業主清楚每一筆花費。',
    image: '/images/detail-plan.webp',
  },
  {
    code: 'D-06',
    title: '完工保固',
    summary: '驗收後提供保固與定期回訪。',
    body: '驗收完成後提供保固服務，期間內的施工問題由我們負責處理，並主動回訪確認使用狀況。',
    image: '/images/case-house.webp',
  },
];
