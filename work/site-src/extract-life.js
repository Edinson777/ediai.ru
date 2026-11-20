/* Одноразовое извлечение: uploads/index (1).html → tmp/life.json
   Вырезаем объявления CATS и IDEAS из <script> и вычисляем их через eval. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../uploads/index (1).html', 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>'));

function grabArray(name) {
  const start = js.indexOf('const ' + name + ' = [');
  let i = js.indexOf('[', start), depth = 0, inStr = null;
  for (let k = i; k < js.length; k++) {
    const ch = js[k];
    if (inStr) { if (ch === '\\') k++; else if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) return eval(js.slice(i, k + 1)); }
  }
  throw new Error('не нашёл конец массива ' + name);
}

const CATS = grabArray('CATS');
const IDEAS = grabArray('IDEAS');
console.log('CATS:', CATS.length, '| IDEAS:', IDEAS.length);

const LV = { easy: 'легко', mid: 'средне', hard: 'сложно' };
function unquote(s) {
  let t = s.trim();
  if (t.startsWith('«')) t = t.slice(1);
  if (t.endsWith('».')) t = t.slice(0, -2) + '.';
  else if (t.endsWith('»')) t = t.slice(0, -1);
  return t.trim();
}
const out = IDEAS.map((it, n) => ({
  n: n + 1,
  cat: it.c,
  catTitle: (CATS.find(c => c.id === it.c) || {}).title,
  catIcon: (CATS.find(c => c.id === it.c) || {}).icon,
  title: it.t,
  desc: it.d,
  prompt: unquote(it.p),
  tags: it.tags,
  lv: LV[it.lv] || it.lv,
}));
fs.writeFileSync(__dirname + '/tmp/life.json', JSON.stringify({ cats: CATS, items: out }, null, 1), 'utf8');
console.log('записано tmp/life.json');
