/* =====================================================================
   Глобальный поиск главной страницы (хаба) по всей базе промптов.
   Ожидает встроенные генератором до этого кода:
     SIDX     = [ {i:id, t:заголовок, s:раздел, c:подраздел, d:описание, g:теги}, ... ]
     SECTMETA = { section: {f:файл, n:название с иконкой}, ... }
   Результаты — ссылки на карточки разделов (file.html#pN): раздел
   открывает и подсвечивает карточку по якорю (см. app.js).
   Событие empty_search (поиск без результатов) уходит в Метрику и GA4.
   ===================================================================== */
(function(){
"use strict";

var YM_ID = 114035585; /* тот же счётчик, что в сниппете <body> */
function trackEvent(name, data){
  try{
    if(YM_ID && window.ym){ window.ym(YM_ID, "reachGoal", name, data || {}); }
  }catch(e){}
  try{
    if(typeof window.gtag === "function"){ window.gtag("event", name, data || {}); }
  }catch(e){}
}

var input = document.getElementById("hubQ");
var res   = document.getElementById("hubRes");
if(!input || !res || typeof SIDX === "undefined") return;

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

var LIMIT = 12; /* показываем первые N, остальное — через уточнение запроса */

function search(){
  var raw = input.value.trim();
  var q = raw.toLowerCase();
  if(q.length < 2){ res.hidden = true; res.innerHTML = ""; return; }
  var hits = [];
  for(var i = 0; i < SIDX.length; i++){
    var e = SIDX[i];
    if((e.t + " " + e.d + " " + e.c + " " + e.g).toLowerCase().indexOf(q) >= 0) hits.push(e);
  }
  if(!hits.length){
    res.hidden = false;
    res.innerHTML = '<div class="hub-empty">По запросу «' + esc(raw) + '» ничего не найдено. ' +
      'Попробуйте короче: «резюме», «фото», «меню», «план», «письмо» — или выберите раздел ниже.</div>';
    trackEvent("empty_search", {q: raw, section: "hub"});
    return;
  }
  var html = '<p class="hub-res-n">Найдено: ' + hits.length + ' из ' + SIDX.length +
             (hits.length > LIMIT ? ' — показаны первые ' + LIMIT + ', уточните запрос' : '') + '</p>' +
             '<ul class="hub-res-list">';
  for(var j = 0; j < Math.min(hits.length, LIMIT); j++){
    var h = hits[j], m = SECTMETA[h.s];
    html += '<li><a href="' + m.f + '#' + h.i + '">' +
            '<span class="hr-sec">' + esc(m.n) + ' · ' + esc(h.c) + '</span>' +
            '<span class="hr-t">' + esc(h.t) + '</span>' +
            '<span class="hr-d">' + esc(h.d) + '</span></a></li>';
  }
  html += '</ul>';
  res.hidden = false;
  res.innerHTML = html;
}

var t;
input.addEventListener("input", function(){ clearTimeout(t); t = setTimeout(search, 150); });
document.addEventListener("keydown", function(e){
  if(e.key === "/" && document.activeElement !== input){ e.preventDefault(); input.focus(); }
  if(e.key === "Escape" && document.activeElement === input){
    input.value = ""; res.hidden = true; res.innerHTML = ""; input.blur();
  }
});

})();
