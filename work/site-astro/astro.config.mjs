// @ts-check
import { defineConfig } from 'astro/config';

// Фаза 2 переезда на Astro (см. work/plan-astro.md):
//   build.format: 'directory' → целевая URL-конвенция §3.3 стратегии:
//   /prompty/foto/, /guides/s-chego-nachat/, /glossary/ и т. д. (каталог + index.html).
//   301 со старых адресов — в public/.htaccess (Apache за Nginx, хостинг подтвердил).
export default defineConfig({
  site: 'https://ediai.ru',
  build: {
    format: 'directory',
  },
});
