// @ts-check
import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

// 目前部署在 GitHub Pages：https://s0901598.github.io/yeshun-web/
// 之後換成公司自己的網域時，把 site 改成新網域、base 改成 '/'
export default defineConfig({
  site: 'https://s0901598.github.io',
  base: '/yeshun-web',
  integrations: [preact()],
});