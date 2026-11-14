'use strict';
// Storage, DOM helpers, dice, shared widgets.

const KEY = 'tavernkeep.v1'; // storage key keeps the app's first name so existing saved data still loads
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = n => 1 + Math.floor(Math.random() * n);

function defaults() {
  return {
    v: 1, characters: [], campaigns: [], solo: [],
    homebrew: { race: [], class: [], spell: [], item: [], monster: [], feature: [], rule: [] },
    settings: { apiKey: '', model: 'claude-opus-5-5' },
    table: { code: '', charId: '', on: false }, // the live table this person last joined
    diceLog: []
  };
}
function normalize(d) {
  const b = defaults();
  const out = Object.assign(b, d);
  out.homebrew = Object.assign(defaults().homebrew, d.homebrew || {});
  out.settings = Object.assign(defaults().settings, d.settings || {});
  out.table = Object.assign(defaults().table, d.table || {});
  return out;
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v) return normalize(d);
  } catch (e) { /* fall through to a fresh database */ }
  return defaults();
}
let DB = load();

let saveTimer;
function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast({ label: 'Could not save', total: '!', text: 'Browser storage is full or blocked.' }); }
}
function save() {
  DB.modTs = Date.now();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150);
  if (typeof cloudPush === 'function') cloudPush(); // hosted version: also sync to the account
  if (typeof tablePublish === 'function') tablePublish(); // and tell the live table if this person's status changed
}
window.addEventListener('pagehide', saveNow);

// ---- DOM builder: h('div', {class:'x', onclick:fn}, child, [children], 'text') ----
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked') el.checked = true;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

// ---- Bound form controls: they write straight into the data object and save ----
function inp(obj, key, o = {}) {
  const num = o.type === 'number';
  const el = h(o.area ? 'textarea' : 'input', {
    type: o.area ? null : (o.type || 'text'), class: o.class, placeholder: o.ph, list: o.list,
    min: o.min, max: o.max, rows: o.area ? (o.rows || 3) : null,
    inputmode: num ? 'numeric' : null, 'aria-label': o.label || o.ph || key
  });
  el.value = obj[key] == null ? '' : obj[key];
  el.addEventListener(o.re ? 'change' : 'input', () => {
    obj[key] = num ? (el.value === '' || isNaN(+el.value) ? 0 : +el.value) : el.value;
    if (o.on) o.on(el);
    save();
    if (o.re) render();
  });
  return el;
}
function chk(obj, key, o = {}) {
  const el = h('input', { type: 'checkbox', checked: !!obj[key], 'aria-label': o.label || key });
  el.addEventListener('change', () => { obj[key] = el.checked; if (o.on) o.on(el); save(); if (o.re) render(); });
  return el;
}
function sel(obj, key, options, o = {}) {
  const el = h('select', { 'aria-label': o.label || key },
    options.map(x => Array.isArray(x) ? h('option', { value: x[0] }, x[1]) : h('option', { value: x }, x)));
  el.value = obj[key] == null ? '' : obj[key];
  el.addEventListener('change', () => { obj[key] = el.value; if (o.on) o.on(el); save(); if (o.re) render(); });
  return el;
}
const lab = (text, el, cls) => h('label', { class: 'f ' + (cls || '') }, h('span', {}, text), el);
const head = (title, sub, action) => h('header', { class: 'head' },
  h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), action);
const empty = text => h('p', { class: 'empty' }, text);
const tabBar = (base, tabs, cur) => h('div', { class: 'tabs' },
  tabs.map(([k, l]) => h('a', { href: base + k, class: k === cur ? 'on' : '' }, l)));

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function modal(title, body, btns) {
  const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) bg.remove(); } },
    h('div', { class: 'modal' }, h('h3', {}, title), body,
      h('div', { class: 'row end' }, (btns || []).map(([t, fn, cls]) =>
        h('button', { class: cls || '', onclick: () => { bg.remove(); if (fn) fn(); } }, t)))));
  document.body.append(bg);
  return bg;
}
const ask = (msg, fn, word) => modal('Are you sure?', h('p', {}, msg), [['Cancel'], [word || 'Delete', fn, 'danger']]);

// ---- 5e maths ----
const mod = score => Math.floor(((+score || 0) - 10) / 2);
const fmt = n => (n >= 0 ? '+' : '') + n;
const prof = level => 2 + Math.floor((Math.max(1, +level || 1) - 1) / 4);

// ---- Dice ----
// Supports: 2d6+3, d20, 4d6kh3 (keep highest 3), 2d20kl1 (keep lowest), 1d8+1d6-2
function rollExpr(expr) {
  const s = String(expr).replace(/\s+/g, '').toLowerCase();
  if (!s) throw new Error('Type a roll like 2d6+3');
  const re = /([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/y;
  let total = 0, pos = 0, nat = null;
  const parts = [];
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || (pos > 0 && !m[1])) throw new Error('Cannot read "' + expr + '". Try 2d6+3');
    pos = re.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      const n = +(m[2] || 1), sides = +m[3];
      if (n < 1 || n > 100 || sides < 1 || sides > 1000) throw new Error('Dice out of range (max 100d1000)');
      const rolls = [];
      for (let i = 0; i < n; i++) rolls.push(rand(sides));
      let kept = rolls;
      if (m[4]) {
        const k = Math.max(1, Math.min(+m[5], n));
        kept = rolls.slice().sort((a, b) => m[4] === 'h' ? b - a : a - b).slice(0, k);
      }
      if (sides === 20 && kept.length === 1 && nat === null) nat = kept[0];
      total += sign * kept.reduce((a, b) => a + b, 0);
      parts.push((sign < 0 ? '- ' : parts.length ? '+ ' : '') + '[' + rolls.join(', ') + ']');
    } else {
      total += sign * +m[6];
      parts.push((sign < 0 ? '- ' : '+ ') + m[6]);
    }
  }
  return { total, text: parts.join(' '), expr: s, nat };
}

let rollMode = 'norm'; // norm | adv | dis, applies to d20 rolls
function doRoll(label, expr) {
  let r;
  try { r = rollExpr(expr); }
  catch (e) { toast({ label: 'Dice', total: '?', text: e.message }); return null; }
  const entry = { label, expr: r.expr, total: r.total, text: r.text, nat: r.nat };
  DB.diceLog.unshift(entry);
  DB.diceLog.length = Math.min(DB.diceLog.length, 30);
  save();
  toast(entry);
  if (window.onRoll) window.onRoll(entry);
  if (!$('#dice').hidden) dicePanel();
  return entry;
}
function d20(label, bonus) {
  const base = rollMode === 'adv' ? '2d20kh1' : rollMode === 'dis' ? '2d20kl1' : '1d20';
  const tag = rollMode === 'adv' ? ' (advantage)' : rollMode === 'dis' ? ' (disadvantage)' : '';
  return doRoll(label + tag, base + (bonus ? fmt(bonus) : ''));
}
function modeToggle() {
  const set = m => { rollMode = m; document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); };
  return h('div', { class: 'mode', title: 'Applies to d20 rolls' },
    [['dis', 'Dis'], ['norm', 'Normal'], ['adv', 'Adv']].map(([m, l]) =>
      h('button', { 'data-m': m, class: rollMode === m ? 'on' : '', onclick: () => set(m) }, l)));
}

// Result toast. Real dice rolls (entries with an expr) tumble for a moment before the number lands.
let toastTimer, rollTimer, flickTimer;
function toast(e) {
  const el = $('#toast');
  const num = h('span', {}, e.total);
  el.replaceChildren(h('div', { class: 'die' }, num),
    h('div', { class: 'info' }, h('strong', {}, e.label), h('div', { class: 'muted' }, e.text + (e.nat === 20 ? '  Natural 20!' : e.nat === 1 ? '  Natural 1' : ''))));
  clearTimeout(toastTimer); clearTimeout(rollTimer); clearInterval(flickTimer);
  const land = () => {
    clearInterval(flickTimer);
    num.textContent = e.total;
    el.className = 'land' + (e.nat === 20 ? ' crit' : e.nat === 1 ? ' fumble' : '');
  };
  const animate = e.expr && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate) {
    el.className = 'rolling';
    const top = Math.max(20, Math.abs(e.total));
    flickTimer = setInterval(() => { num.textContent = rand(top); }, 60);
    rollTimer = setTimeout(land, 750);
  } else land();
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 4800);
}

function dicePanel() {
  const el = $('#dice');
  const box = h('input', { type: 'text', placeholder: 'e.g. 2d6+3 or 4d6kh3', 'aria-label': 'Dice expression' });
  const go = () => { if (box.value.trim()) doRoll(box.value.trim(), box.value); };
  box.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  el.replaceChildren(
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, 'Dice'), modeToggle(),
      h('button', { class: 'ghost', 'aria-label': 'Close dice', onclick: () => { el.hidden = true; } }, 'Close')),
    h('div', { class: 'row wrap' }, [4, 6, 8, 10, 12, 20, 100].map(n =>
      h('button', { onclick: () => n === 20 ? d20('d20', 0) : doRoll('d' + n, '1d' + n) }, 'd' + n))),
    h('div', { class: 'row' }, box, h('button', { class: 'primary', onclick: go }, 'Roll')),
    h('div', { class: 'hist' }, DB.diceLog.slice(0, 12).map(r =>
      h('div', { class: 'row' }, h('span', { class: 'grow' }, r.label, ' ', h('span', { class: 'muted' }, r.text)), h('strong', {}, r.total)))));
  el.hidden = false;
}

// ---- Notes / journal widget, used by characters, campaigns, NPCs and quests ----
function journal(list, o = {}) {
  const noun = o.noun || 'note';
  const cards = h('div', { class: 'stack' });
  const q = h('input', { type: 'search', class: 'grow', placeholder: 'Search ' + noun + 's', 'aria-label': 'Search' });
  const filter = () => {
    const s = q.value.toLowerCase();
    cards.childNodes.forEach(c => { if (c.dataset) c.style.display = !s || c.dataset.s.includes(s) ? '' : 'none'; });
  };
  q.addEventListener('input', filter);
  function draw(openId) {
    cards.replaceChildren();
    if (!list.length) cards.append(empty('No ' + noun + 's yet.'));
    list.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.ts - a.ts).forEach(n => {
      const t = h('span', { class: 't grow' }, n.title || 'Untitled ' + noun);
      const tag = h('span', { class: 'chip' }, n.tag || '');
      tag.hidden = !n.tag;
      const st = o.status ? h('span', { class: 'chip st-' + n.status }, n.status) : null;
      const card = h('details', { class: 'card note' + (n.pin ? ' pinned' : ''), open: n.id === openId },
        h('summary', { class: 'row' }, t, tag, st, n.pin ? h('span', { class: 'chip' }, 'Pinned') : null));
      const index = () => { card.dataset.s = [n.title, n.body, n.tag].join(' ').toLowerCase(); };
      index();
      card.append(
        inp(n, 'title', { ph: 'Title', on: el => { t.textContent = el.value || 'Untitled ' + noun; index(); } }),
        inp(n, 'body', { area: 1, rows: 5, ph: o.bodyPh || 'Write here…', on: index }),
        h('div', { class: 'row wrap' },
          inp(n, 'tag', { ph: 'Tag (e.g. clue, town)', class: 'grow', on: el => { tag.textContent = el.value; tag.hidden = !el.value; index(); } }),
          o.status ? sel(n, 'status', ['Active', 'Done', 'Failed'], { on: () => draw(n.id) }) : null,
          h('button', { class: 'ghost', onclick: () => { n.pin = !n.pin; save(); draw(n.id); } }, n.pin ? 'Unpin' : 'Pin'),
          h('button', { class: 'ghost danger', onclick: () => ask('Delete this ' + noun + '?', () => { list.splice(list.indexOf(n), 1); save(); draw(); }) }, 'Delete')));
      cards.append(card);
    });
    filter();
  }
  const addNote = (preset) => {
    const n = Object.assign({ id: uid(), title: '', body: '', tag: '', pin: false, status: 'Active', ts: Date.now() }, preset || {});
    list.push(n); save(); draw(n.id);
  };
  draw();
  const el = h('div', {}, h('div', { class: 'row' }, q, h('button', { class: 'primary', onclick: () => addNote() }, '+ New ' + noun)), cards);
  el.addNote = addNote;
  return el;
}

// ---- Random generators (shared by DM tools and solo play) ----
const GEN = {
  name: () => pick(T.first) + ' ' + pick(T.last),
  npc: () => `${GEN.name()}, a ${pick(T.trait)} ${pick(RACES).toLowerCase()} ${pick(T.job)} who wants ${pick(T.goal)}. Quirk: ${pick(T.quirk)}.`,
  scene: () => `${pick(T.action)} / ${pick(T.theme)}`,
  event: () => pick(T.event),
  twist: () => pick(T.twist),
  place: () => `${pick(T.place)}, ${pick(T.placeDetail)}`,
  loot: () => `${rand(6) * rand(6) * 5} gp in mixed coin and ${pick(T.loot)}`,
  encounter: () => {
    const m = pick(bestiary());
    const cr = m.cr && String(m.cr).includes('/') ? 1 / +String(m.cr).split('/')[1] : +m.cr || 0;
    const n = cr <= 0.25 ? 1 + rand(4) : cr <= 1 ? rand(3) : 1;
    return `${n} x ${m.name} (CR ${m.cr || '?'}, AC ${m.ac}, HP ${m.hp}), ${pick(T.situation)}`;
  }
};
