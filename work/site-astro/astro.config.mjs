// @ts-check
import { defineConfig } from 'astro/config';

// Фаза 1 переезда на Astro (см. work/plan-astro.md):
//   build.format: 'file' → страницы собираются со СТАРЫМИ адресами
//   (photo.html, start.html, …) — сайт работает на новом стеке без редиректов.
// Фаза 2 (целевая схема /prompty/foto/ и т. д.): сменить на
//   build.format: 'directory' и перенести страницы в каталоги-роуты.
export default defineConfig({
  site: 'https://ediai.ru',
  build: {
    format: 'file',
  },
});
