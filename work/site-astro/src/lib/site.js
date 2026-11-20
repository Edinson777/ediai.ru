/**
 * Общие константы и данные сайта. Всё грузится из src/vendor/ (синхронизируется
 * с work/site-src автоматически скриптом scripts/dump_data.py перед сборкой).
 */
import sectionsJson from '../vendor/sections.json';
import dataJson from '../vendor/data.json';
import cssRaw from '../vendor/style.css?raw';
import appJsRaw from '../vendor/app.js?raw';
import hubJsRaw from '../vendor/hub.js?raw';

export const D = sectionsJson;

export const SITE_URL = D.SITE_URL;
export const SITE_NAME = D.SITE_NAME;
export const SITE_DESC = D.SITE_DESC;
export const LASTMOD = D.LASTMOD;
export const UPDATED = D.UPDATED;
export const TOTAL = D.TOTAL;

export const CSS = cssRaw;
export const APPJS = appJsRaw;
export const HUBJS = hubJsRaw;
export const NOSCRIPT_CSS = D.NOSCRIPT_CSS;

export const PROMPTS = dataJson.prompts;
export const BY_SECTION = D.SECTION_ORDER.reduce((acc, key) => {
  acc[key] = PROMPTS.filter(p => p.section === key);
  return acc;
}, {});

export const FAVICON = ("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' "
  + "viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>");

// WebSite-узел JSON-LD, общий для всех страниц
export const WEBSITE_LD = {
  '@type': 'WebSite', '@id': SITE_URL + '/#website', name: SITE_NAME, url: SITE_URL + '/',
  description: SITE_DESC, inLanguage: 'ru',
};

// Яндекс.Метрика — сниппет из build.py, вставляется сразу после <body>
export const METRIKA = `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114035585', 'ym');

    ym(114035585, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/114035585" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
`;

// Google Analytics 4: только если в config.json задан ga_id
export function gtagSnippet() {
  if (!D.GA_ID) return '';
  return ('<!-- Google tag (gtag.js) -->\n'
    + '<script async src="https://www.googletagmanager.com/gtag/js?id=' + D.GA_ID + '"></script>\n'
    + '<script>\n'
    + '  window.dataLayer = window.dataLayer || [];\n'
    + '  function gtag(){dataLayer.push(arguments);}\n'
    + "  gtag('js', new Date());\n\n"
    + "  gtag('config', '" + D.GA_ID + "');\n"
    + '</script>\n'
    + '<!-- /Google tag -->\n');
}

// Яндекс РСЯ, автореклама: два async-скрипта перед </body> (пустой id = выключено)
export function adsSnippet() {
  if (!D.ADS_ID) return '';
  return ('<!-- Yandex Autoplacement ' + D.ADS_ID + ' -->\n'
    + '<script src="https://yandex.ru/ads/system/context.js" async></script>\n'
    + '<script data-page-id="' + D.ADS_ID + '" src="https://yandex.ru/ads/system/ap-loader.js" async></script>\n'
    + '<!-- /Yandex Autoplacement -->\n');
}
