/* =====================================================================
   «База промптов для ИИ» — общая логика разделов.
   Ожидает глобальные переменные (встраиваются генератором до этого кода):
     PAGE    = {section, tabs, cats:{key:{label,icon}}, catOrder:[...]}
     PROMPTS = [ {id, cat, sub, title, model, modelLabel, desc, prompt,
                  tip, tags, qw}, ... ]
   Карточки уже отрендерены в HTML статически (для SEO и работы без JS) —
   скрипт «оживляет» их (hydrate), а при фильтрации перерисовывает сетку.
   ===================================================================== */
(function(){
"use strict";

/* ---- Аналитика -------------------------------------------------------
   Впишите номер счётчика Яндекс.Метрики и раскомментируйте ym() ниже.
   События уже подключены: prompt_copy (копирование), empty_search
   (поиск без результатов — готовый список тем для новых промптов).     */
var YM_ID = 114035585; /* номер счётчика Яндекс.Метрики (совпадает со сниппетом в <body>) */
function trackEvent(name, data){
  try{
    if(YM_ID && window.ym){ window.ym(YM_ID, "reachGoal", name, data || {}); }
  }catch(e){}
  try{
    /* Google Analytics 4: работает, если в config.json задан ga_id и встроен gtag.js */
    if(typeof window.gtag === "function"){ window.gtag("event", name, data || {}); }
  }catch(e){}
}

var byId = {};
PROMPTS.forEach(function(p){ byId[p.id] = p; });

var CATS = PAGE.cats;
var state = {cat:"all", sub:"all", q:"", ft:[]};  /* ft — активные фильтры-ограничения (free/photo/quick) */
var autoOpen = true; /* при поиске карточки раскрываются автоматически */

var grid        = document.getElementById("grid");
var chipsEl     = document.getElementById("chips");
var chipsRow    = document.getElementById("chipsRow");
var chipsToggle = document.getElementById("chipsToggle");
var tabsEl      = document.getElementById("tabs");
var resultsEl   = document.getElementById("results");
var emptyEl     = document.getElementById("empty");
var searchEl    = document.getElementById("search");

/* ---- экранирование и подсветка [плейсхолдеров] (как в статике) ---- */
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function highlight(s){
  return esc(s).replace(/\[([^\]\n]{1,120})\]/g,'<span class="ph">[$1]</span>');
}

function matches(p,q){
  if(!q) return true;
  q = q.toLowerCase();
  return (p.title+" "+p.desc+" "+p.prompt+" "+p.sub+" "+p.tags.join(" ")+" "+(p.tip||"")+" "+p.modelLabel).toLowerCase().includes(q);
}
function ftMatch(p){
  if(!state.ft.length) return true;
  var f = p.f || [];
  return state.ft.every(function(t){ return f.indexOf(t) >= 0; });
}
function getFiltered(){
  var q = state.q.trim();
  return PROMPTS.filter(function(p){
    return (state.cat==="all"||p.cat===state.cat) &&
           (state.sub==="all"||p.sub===state.sub) &&
           ftMatch(p) &&
           matches(p,q);
  });
}

/* ---- табы (кнопки с aria-pressed) ---- */
function renderTabs(){
  if(!tabsEl) return;
  if(!PAGE.tabs){ tabsEl.hidden = true; return; }
  tabsEl.innerHTML = "";
  PAGE.catOrder.forEach(function(key){
    var c = PROMPTS.filter(function(p){return key==="all"||p.cat===key;}).length;
    var el = document.createElement("button");
    el.type = "button";
    el.className = "tab" + (state.cat===key ? " active" : "");
    el.setAttribute("aria-pressed", String(state.cat===key));
    el.innerHTML = CATS[key].icon+" "+CATS[key].label+'<span class="cnt">'+c+'</span>';
    el.onclick = function(){ state.cat=key; state.sub="all"; renderTabs(); renderChips(); renderGrid(); };
    tabsEl.appendChild(el);
  });
}

/* ---- чипсы подразделов ---- */
function renderChips(){
  if(!chipsEl || !chipsRow) return;
  chipsEl.innerHTML = "";
  var subs = [];
  PROMPTS.forEach(function(p){
    if((state.cat==="all"||p.cat===state.cat) && subs.indexOf(p.sub)<0) subs.push(p.sub);
  });
  if(subs.length < 2){ chipsRow.classList.add("no-sub"); return; }
  chipsRow.classList.remove("no-sub");
  function mk(label,val){
    var el = document.createElement("button");
    el.type = "button";
    el.className = "chip" + (state.sub===val ? " active" : "");
    el.setAttribute("aria-pressed", String(state.sub===val));
    el.textContent = label;
    el.onclick = function(){ state.sub=val; renderChips(); renderGrid(); closeChipsMobile(); };
    chipsEl.appendChild(el);
  }
  mk("Все подразделы","all");
  subs.forEach(function(s){ mk(s,s); });
}
/* на телефоне выпадающий список подразделов закрывается после выбора */
function closeChipsMobile(){
  if(chipsEl && window.matchMedia("(max-width: 640px)").matches){
    chipsEl.classList.remove("open");
    if(chipsToggle) chipsToggle.setAttribute("aria-expanded","false");
  }
}

/* ---- иконки и пилюли совместимости (идентичны статической сборке) ---- */
var CHEV = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 9l6 6 6-6'/></svg>";
var COPY_IC = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><rect x='9' y='9' width='12' height='12' rx='2'/><path d='M5 15V5a2 2 0 0 1 2-2h10'/></svg>";
var DONE_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg>';
function qpillHtml(p){
  var out = "";
  if(p.qw==="chat") out += "<span class='qpill full' title='Работает в Qwen Chat без изменений'>Qwen ✓</span>";
  if(p.qw==="img")  out += "<span class='qpill full' title='Работает в Qwen-Image без изменений'>Qwen-Image ✓</span>";
  if(p.qw==="core") out += "<span class='qpill core' title='Описательная часть промпта работает в Qwen-Image; параметры --ar / --niji / --style raw специфичны для Midjourney — размер и стиль в Qwen задаются в интерфейсе или API'>→ Qwen-Image</span>";
  if(p.ds==="ok")   out += "<span class='dspill full' title='Работает в DeepSeek: V3 (deepseek-chat) для текстов и креатива, R1 (deepseek-reasoner / DeepThink) для анализа, логики и кода'>DeepSeek ✓</span>";
  if(p.ds==="think")out += "<span class='dspill note' title='Ключи /think и /no_think специфичны для Qwen. Аналог в DeepSeek: переключатель DeepThink (R1) в чате или выбор модели в API — deepseek-reasoner / deepseek-chat'>DeepSeek: аналог</span>";
  if(p.ds==="ctx")  out += "<span class='dspill note' title='Контекст DeepSeek — до 128K токенов, а не 1M: очень длинные документы разбивайте на части и подавайте последовательно с промежуточными выжимками'>DeepSeek: 128K</span>";
  if(p.ds==="json") out += "<span class='dspill note' title='Надёжный JSON даёт DeepSeek-V3 (deepseek-chat) с response_format: json_object; слово «JSON» в промпте уже есть — это обязательное условие JSON-режима DeepSeek. В R1 рассуждения могут примешиваться к ответу'>DeepSeek: V3</span>";
  return out;
}

/* ---- поведение карточки (общее для статики и перерисовки) ---- */
function attachCard(card, p){
  var head = card.querySelector(".card-head");
  var toggle = function(){
    card.classList.toggle("open");
    p._open = card.classList.contains("open");
    head.setAttribute("aria-expanded", String(p._open));
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", function(e){
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(); }
  });
  var btn = card.querySelector(".copy-btn");
  if(btn) btn.addEventListener("click", function(){ copyPrompt(p, btn); });
}

/* ---- «оживление» статически отрендеренных карточек ---- */
function hydrate(){
  grid.querySelectorAll(".card[data-id]").forEach(function(card){
    var p = byId[card.getAttribute("data-id")];
    if(!p) return;
    p._open = card.classList.contains("open");
    attachCard(card, p);
  });
}

/* ---- перерисовка сетки (при фильтрации/поиске) ---- */
function renderGrid(){
  var q = state.q.trim();
  var list = getFiltered();
  grid.innerHTML = "";
  grid.removeAttribute("data-prerendered");
  emptyEl.style.display = list.length ? "none" : "block";
  resultsEl.textContent = (list.length===PROMPTS.length && !q && !state.ft.length)
    ? "Показаны все "+list.length+" промпта"
    : "Найдено: "+list.length;
  if(!list.length && q) trackEvent("empty_search", {q:q, section:PAGE.section});

  var lastSub = null;
  list.forEach(function(p){
    if(state.sub==="all" && p.sub!==lastSub){
      lastSub = p.sub;
      var h = document.createElement("div");
      h.className = "section-head";
      h.innerHTML = "<h2>"+CATS[p.cat].icon+" "+p.sub+"</h2><div class='line' aria-hidden='true'></div>";
      grid.appendChild(h);
    }
    var isOpen = !!p._open || (!!q && autoOpen);
    var bodyId = "body-"+p.id;
    var card = document.createElement("article");
    card.className = "card"+(isOpen?" open":"");
    card.id = p.id;
    card.setAttribute("data-id", p.id);
    card.innerHTML =
      "<div class='card-head' role='button' tabindex='0' aria-expanded='"+isOpen+"' aria-controls='"+bodyId+"'>"+
        "<div class='head-main'>"+
          (state.sub!=="all" ? "<div class='sub-name'>"+esc(p.sub)+"</div>" : "")+
          "<div class='card-top'><h3>"+esc(p.title)+"</h3><div class='badges'><span class='badge "+p.model+"'>"+esc(p.modelLabel)+"</span>"+qpillHtml(p)+"</div></div>"+
          "<p class='desc'>"+esc(p.desc)+"</p>"+
        "</div>"+
        "<span class='chev'>"+CHEV+"</span>"+
      "</div>"+
      "<div class='card-body' id='"+bodyId+"'>"+
        "<div class='prompt-wrap'><pre class='prompt'>"+highlight(p.prompt)+"</pre>"+
          "<button class='copy-btn' type='button'>"+COPY_IC+"Копировать</button>"+
        "</div>"+
        (p.tip ? "<div class='tip'>💡 "+p.tip+"</div>" : "")+
        "<div class='tags'>"+p.tags.map(function(t){return "<span class='tag'>#"+t+"</span>";}).join("")+"</div>"+
      "</div>";
    attachCard(card, p);
    grid.appendChild(card);
  });
}

/* ---- развернуть / свернуть все ---- */
document.getElementById("expandAll").addEventListener("click", function(){
  getFiltered().forEach(function(p){ p._open = true; });
  renderGrid();
});
document.getElementById("collapseAll").addEventListener("click", function(){
  /* P0-фикс: сворачивание больше НЕ очищает строку поиска */
  PROMPTS.forEach(function(p){ p._open = false; });
  autoOpen = false;
  renderGrid();
});

/* ---- копирование с fallback для старых браузеров ---- */
function copyPrompt(p, btn){
  var text = p.prompt;
  var restore = function(){
    btn.classList.remove("done");
    btn.innerHTML = COPY_IC+"Копировать";
  };
  var done = function(ok){
    if(ok){
      btn.classList.add("done");
      btn.innerHTML = DONE_IC+"Скопировано";
      toast("Промпт скопирован в буфер обмена ✓");
      trackEvent("prompt_copy", {id:p.id, title:p.title, section:PAGE.section});
      setTimeout(restore, 2000);
    }else{
      legacyCopy(text, btn);
    }
  };
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(function(){done(true);}).catch(function(){done(false);});
  }else{
    done(false);
  }
}
function legacyCopy(text, btn){
  try{
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if(ok){ toast("Промпт скопирован ✓"); }
    else{ selectPrompt(btn); }
  }catch(e){ selectPrompt(btn); }
}
function selectPrompt(btn){
  var pre = btn.parentElement.querySelector("pre");
  var r = document.createRange(); r.selectNodeContents(pre);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  toast("Выделите текст и нажмите Ctrl+C");
}

/* ---- тост (aria-live объявляет его скринридерам) ---- */
var toastT;
function toast(msg){
  var t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(function(){ t.classList.remove("show"); }, 2200);
}

/* ---- поиск: debounce 150 мс, хоткей «/», Escape — сброс ---- */
var searchT;
searchEl.addEventListener("input", function(e){
  autoOpen = true;
  clearTimeout(searchT);
  searchT = setTimeout(function(){ state.q = e.target.value; renderGrid(); }, 150);
});
document.addEventListener("keydown", function(e){
  if(e.key==="/" && document.activeElement!==searchEl){ e.preventDefault(); searchEl.focus(); }
  if(e.key==="Escape" && document.activeElement===searchEl){ searchEl.value=""; state.q=""; autoOpen=true; renderGrid(); searchEl.blur(); }
});

/* ---- подразделы на мобильных: кнопка-тумблер ---- */
if(chipsToggle){
  chipsToggle.addEventListener("click", function(){
    var open = chipsEl.classList.toggle("open");
    chipsToggle.setAttribute("aria-expanded", String(open));
  });
}

/* ---- фильтры-ограничения: «бесплатно / нужно фото-файл / 5 минут» ----
   Несколько чипов работают как «И»: бесплатно + 5 минут = быстрые бесплатные сценарии. */
var fchipsEl = document.getElementById("fchips");
if(fchipsEl){
  fchipsEl.querySelectorAll(".fchip").forEach(function(btn){
    btn.addEventListener("click", function(){
      var tag = btn.getAttribute("data-ftag");
      var i = state.ft.indexOf(tag);
      var on = i < 0;
      if(on){ state.ft.push(tag); } else { state.ft.splice(i, 1); }
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
      renderGrid();
    });
  });
}

/* ---- кнопка «наверх» ---- */
var toTop = document.getElementById("toTop");
window.addEventListener("scroll", function(){
  toTop.style.display = window.scrollY>600 ? "flex" : "none";
}, {passive:true});
toTop.onclick = function(){ window.scrollTo({top:0, behavior:"smooth"}); };

/* ---- инициализация ----
   Поддержка deep-link вида photo.html?q=реставрация —
   используется главной страницей и внешними ссылками. */
var urlQ = new URLSearchParams(location.search).get("q");
renderTabs();
renderChips();
if(urlQ){
  searchEl.value = urlQ;
  state.q = urlQ;
  renderGrid();
}else if(grid.getAttribute("data-prerendered")==="1"){
  hydrate();          /* статические карточки: только навешиваем обработчики */
}else{
  renderGrid();
}

/* ---- deep-link по якорю: photo.html#p12 — раскрыть карточку ----
   Используется глобальным поиском главной и ссылками из статей-кейсов. */
if(/^#p\d+$/.test(location.hash)){
  var hid = location.hash.slice(1);
  var hashCard = document.getElementById(hid);
  if(hashCard && hashCard.classList.contains("card")){
    hashCard.classList.add("open");
    var hashHead = hashCard.querySelector(".card-head");
    if(hashHead) hashHead.setAttribute("aria-expanded", "true");
    if(byId[hid]) byId[hid]._open = true;
  }
}

})();
