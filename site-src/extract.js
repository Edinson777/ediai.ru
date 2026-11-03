/* Одноразовый скрипт: извлекает массивы PROMPTS из исходных HTML-страниц
   и собирает единый data.json для генератора сайта.
   Запуск: node extract.js ../uploads/prompt-base.html ../uploads/photo-edit-prompts.html data.json */
const fs = require('fs');

function grabPrompts(file){
  const s = fs.readFileSync(file, 'utf8');
  const a = s.indexOf('const PROMPTS = [');
  if(a < 0) throw new Error('PROMPTS not found in ' + file);
  const b = s.indexOf('\n];', a);
  const src = s.slice(a + 'const PROMPTS = '.length, b + 3);
  return eval(src); // валидный JS-массив объектов
}

const base  = grabPrompts(process.argv[2]);
const photo = grabPrompts(process.argv[3]);

/* соответствие категорий старой «базы» новым разделам */
const SECTION_BY_CAT = { img:'generate', txt:'texts', qwen:'qwen', base:'basics' };

/* пометки совместимости с Qwen — логика из оригинального prompt-base.html */
function qwOf(p, section){
  if(section === 'texts' || section === 'basics') return 'chat';
  if(section === 'generate') return (p.model === 'mj') ? 'core' : 'img';
  return null; /* qwen и photo — без пилюль */
}

const prompts = [];
let n = 0;

for(const p of photo){
  n++;
  prompts.push({ id:'p'+n, section:'photo', cat:p.cat, sub:p.sub, title:p.title,
    model:p.model, modelLabel:p.modelLabel, desc:p.desc, prompt:p.prompt,
    tip:p.tip || null, tags:p.tags, qw:null });
}
for(const p of base){
  n++;
  const section = SECTION_BY_CAT[p.cat];
  if(!section) throw new Error('unknown cat ' + p.cat);
  prompts.push({ id:'p'+n, section, cat:p.cat, sub:p.sub, title:p.title,
    model:p.model, modelLabel:p.modelLabel, desc:p.desc, prompt:p.prompt,
    tip:p.tip || null, tags:p.tags, qw:qwOf(p, section) });
}

/* проверка целостности */
const bySec = {};
for(const p of prompts) bySec[p.section] = (bySec[p.section]||0) + 1;
console.log('sections:', JSON.stringify(bySec), 'total:', prompts.length);
const expect = { photo:54, generate:21, texts:21, qwen:23, basics:6 };
for(const k in expect) if(bySec[k] !== expect[k]) throw new Error('count mismatch '+k+': '+bySec[k]);

/* уникальные cat/sub по разделам — для самопроверки */
const meta = {};
for(const p of prompts){
  meta[p.section] = meta[p.section] || { cats:{}, subs:{} };
  meta[p.section].cats[p.cat] = (meta[p.section].cats[p.cat]||0) + 1;
  meta[p.section].subs[p.sub] = (meta[p.section].subs[p.sub]||0) + 1;
}
console.log(JSON.stringify(meta, null, 1));

fs.writeFileSync(process.argv[4], JSON.stringify({ prompts }, null, 1));
console.log('written', process.argv[4]);
