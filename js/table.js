'use strict';
// Playing together: character import/export, and a live "table" where everyone in a campaign sees each other's status.
//
// The live table uses the hosted page's room: each person joins a named room (the table code) and publishes a small
// summary of the character they are playing. Nothing is stored; it shows whoever has the app open right now.
// What other people publish is untrusted display data: it is only ever written to the page as plain text.

// ---------- Files ----------
function saveFile(filename, text) {
  if (window.AndroidHost) return window.AndroidHost.saveFile(filename, text); // Android app: the phone's own save dialog
  if (CLOUD.downloads) { // hosted version: the host shows its own save dialog
    CLOUD.downloads.save({ filename, data: text }).catch(e => {
      if (!e || e.code !== 'declined') modal('Export failed', h('p', {}, 'The file could not be saved here.'), [['OK']]);
    });
    return;
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
  document.body.append(a); a.click(); a.remove();
}

function exportChar(c) {
  const copy = JSON.parse(JSON.stringify(c));
  delete copy.id; // the importer gives it a fresh one
  const slug = (c.name || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
  saveFile(slug + '.character.json', JSON.stringify({ critwright: 'character', v: 1, character: copy }, null, 1));
}

// Build a safe, complete character from whatever was in the file: unknown or malformed parts fall back to defaults.
function adoptChar(src) {
  const c = newChar(), obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = ['name', 'race', 'cls', 'subclass', 'background', 'alignment', 'castAbil', 'profs', 'bio'];
  const nums = ['level', 'xp', 'ac', 'speed', 'initBonus', 'hitDie', 'hdUsed'];
  text.forEach(k => { if (typeof src[k] === 'string') c[k] = src[k].slice(0, 20000); });
  nums.forEach(k => { if (isFinite(+src[k])) c[k] = +src[k]; });
  c.level = Math.max(1, Math.min(20, Math.floor(c.level)));
  const fixHp = () => { c.hp.max = Math.max(0, c.hp.max); c.hp.cur = Math.max(0, Math.min(c.hp.max, c.hp.cur)); c.hp.temp = Math.max(0, c.hp.temp); };
  ['abil', 'hp', 'coins', 'death'].forEach(g => { if (obj(src[g])) for (const k in c[g]) if (isFinite(+src[g][k])) c[g][k] = +src[g][k]; });
  fixHp();
  if (obj(src.saves)) ABILS.forEach(a => { if (src.saves[a]) c.saves[a] = true; });
  if (obj(src.skills)) SKILLS.forEach(([n]) => { const v = +src.skills[n]; if (v === 1 || v === 2) c.skills[n] = v; });
  if (obj(src.slots)) for (const l in c.slots) if (obj(src.slots[l])) { c.slots[l].max = Math.max(0, +src.slots[l].max || 0); c.slots[l].used = Math.max(0, Math.min(c.slots[l].max, +src.slots[l].used || 0)); }
  if (Array.isArray(src.conditions)) c.conditions = src.conditions.filter(x => CONDITIONS.includes(x));
  const list = (key, make) => { if (Array.isArray(src[key])) c[key] = src[key].filter(obj).slice(0, 500).map(make); };
  const s = v => (v == null ? '' : String(v)).slice(0, 20000), n = v => (isFinite(+v) ? +v : 0);
  list('attacks', a => ({ name: s(a.name), bonus: n(a.bonus), dmg: s(a.dmg) }));
  list('spells', a => ({ id: uid(), name: s(a.name), level: Math.max(0, Math.min(9, n(a.level))), prep: !!a.prep, desc: s(a.desc) }));
  list('items', a => ({ name: s(a.name), qty: n(a.qty), weight: n(a.weight), note: s(a.note) }));
  list('features', a => ({ name: s(a.name), desc: s(a.desc) }));
  list('notes', a => ({ id: uid(), title: s(a.title), body: s(a.body), tag: s(a.tag), pin: !!a.pin, status: 'Active', ts: n(a.ts) || Date.now() }));
  c.inspiration = !!src.inspiration;
  c.sealed = src.sealed !== false; // a finished character arrives already sealed; an exported draft stays a draft
  return c;
}

// Accepts a single exported character, a bare character object, or a whole backup (every character in it is copied in).
function importChars(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { d = null; }
  let found = [];
  if (d && d.critwright === 'character' && d.character) found = [d.character];
  else if (d && Array.isArray(d.characters)) found = d.characters;
  else if (d && d.abil && d.hp) found = [d];
  found = found.filter(x => x && typeof x === 'object');
  if (!found.length) return modal('Import failed', h('p', {}, 'That file does not contain a Critwright character. Use a file made with "Export character", or a full backup.'), [['OK']]);
  const added = found.map(adoptChar);
  DB.characters.push(...added);
  save(); render();
  modal('Characters imported', h('p', {}, added.map(c => c.name || 'Unnamed').join(', ') + (added.length === 1 ? ' has been added to your characters.' : ' have been added to your characters.')), [['OK']]);
}

function importButton() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', () => {
    const f = file.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => importChars(String(rd.result));
    rd.readAsText(f);
  });
  return [h('button', { onclick: () => file.click() }, 'Import character'), file];
}

// ---------- The live table ----------
const cleanCode = v => String(v || '').toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 40).replace(/[^a-z0-9]+$/, '');
const newCode = () => pick(['ember', 'raven', 'oak', 'iron', 'moon', 'wolf', 'ash', 'thorn', 'gold', 'storm']) + '-' + (1000 + rand(8999));
let lastPresence = '';

function tableSummary() {
  const c = DB.characters.find(x => x.id === DB.table.charId);
  if (!c) return { role: 'dm', name: 'Dungeon Master' };
  return {
    role: 'pc', name: String(c.name || 'Unnamed').slice(0, 60), line: charLine(c).slice(0, 80),
    hp: c.hp.cur, max: c.hp.max, temp: c.hp.temp, ac: c.ac, pp: 10 + skillBonus(c, 'Perception', 'wis'),
    cond: c.conditions.slice(0, 10).join(', ')
  };
}
// Called after every save: sends the summary again only when something in it actually changed.
function tablePublish() {
  if (!CLOUD.table) return;
  const p = tableSummary(), key = JSON.stringify(p);
  if (key === lastPresence) return;
  lastPresence = key;
  CLOUD.table.presence(p).catch(() => { lastPresence = ''; });
}
async function tableLeave() {
  const t = CLOUD.table;
  CLOUD.table = null; CLOUD.peers = []; lastPresence = '';
  if (t) { try { await t.leave(); } catch (e) { /* already gone */ } }
}
async function tableJoin() {
  const code = cleanCode(DB.table.code);
  if (!CLOUD.room || !code) return;
  if (CLOUD.table && CLOUD.table.name === code) return tablePublish();
  await tableLeave();
  CLOUD.tableErr = '';
  try {
    const r = await CLOUD.room.join(code);
    CLOUD.table = r;
    r.onPeers(ch => { CLOUD.peers = ch.peers; refreshTable(); },
      e => { if (CLOUD.table === r) { CLOUD.table = null; CLOUD.peers = []; CLOUD.tableErr = e.code; refreshTable(); } });
    tablePublish();
  } catch (e) {
    CLOUD.tableErr = (e && e.code) || 'upstream_error';
  }
  refreshTable();
}

function peerCard(p) {
  const d = p.presence || {}, num = v => (isFinite(+v) ? +v : 0), str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const dm = d.role !== 'pc';
  const hp = num(d.hp), max = num(d.max);
  return h('div', { class: 'card peer' + (p.isMe ? ' me' : '') },
    h('div', { class: 'row wrap' }, h('strong', { class: 'grow' }, str(d.name, 60) || (dm ? 'Dungeon Master' : 'Unnamed')),
      dm ? h('span', { class: 'chip on' }, 'DM') : null, p.isMe ? h('span', { class: 'chip' }, 'You') : null, p.guest ? h('span', { class: 'chip' }, 'Guest') : null),
    dm ? null : [
      h('p', { class: 'muted' }, str(d.line, 80)),
      h('div', { class: 'bar' }, h('i', { style: `width:${max > 0 ? Math.max(0, Math.min(100, 100 * hp / max)) : 0}%` })),
      h('p', {}, `HP ${hp}/${max}` + (num(d.temp) ? ` (+${num(d.temp)} temp)` : '') + ` · AC ${num(d.ac)} · Passive Perception ${num(d.pp)}`),
      str(d.cond, 200) ? h('p', {}, 'Conditions: ' + str(d.cond, 200)) : null
    ]);
}
// Redraws only the list of people, so nobody loses what they are typing when someone else's HP changes.
function refreshTable() {
  const el = document.getElementById('tablelist');
  if (!el) return;
  if (!CLOUD.table) {
    const why = { not_granted: 'This view is not allowed to connect to a live table.', not_permitted: 'This view is not allowed to join a table.', limit_reached: 'Too many tables are open. Leave one and try again.' }[CLOUD.tableErr];
    el.replaceChildren(CLOUD.tableErr ? h('p', { class: 'muted' }, why || 'Could not reach the table. Try joining again.') : h('p', { class: 'muted' }, 'You are not at a table.'));
    return;
  }
  const peers = CLOUD.peers.filter(p => p.kind === 'viewer' && p.presence && p.presence.role)
    .sort((a, b) => (a.presence.role === 'pc') - (b.presence.role === 'pc') || String(a.presence.name).localeCompare(String(b.presence.name)));
  el.replaceChildren(h('p', { class: 'muted' }, `At table "${CLOUD.table.name}": ${peers.length} here now. This list updates by itself.`),
    ...(peers.length ? peers.map(peerCard) : [h('p', { class: 'muted' }, 'Waiting for the others to arrive…')]));
}

// The card shown on the Player page and in a campaign's Party tab.
function tableCard() {
  const t = DB.table;
  if (!CLOUD.room) {
    return h('section', { class: 'card' }, h('h2', {}, 'At the table'),
      h('p', { class: 'muted' }, 'Live party tracking is not available in this view. It needs everyone to open the app from its Claude link while signed in, after you have invited them to it by email. Until then, pass sheets around with "Export character" and "Import character".'));
  }
  const joined = !!CLOUD.table;
  const list = h('div', { id: 'tablelist', class: 'stack' });
  const card = h('section', { class: 'card' }, h('h2', {}, 'At the table'),
    h('p', { class: 'muted' }, 'Everyone who joins the same table code sees each other\'s hit points, armour class and conditions, live, while they have the app open.'),
    h('div', { class: 'row wrap' },
      inp(t, 'code', { ph: 'Table code, e.g. ember-4821', class: 'grow', label: 'Table code' }),
      h('button', { class: 'ghost', onclick: () => { t.code = newCode(); save(); render(); } }, 'New code')),
    lab('I am playing', sel(t, 'charId', [['', 'The Dungeon Master (no character)']].concat(DB.characters.map(c => [c.id, c.name || 'Unnamed'])), { on: tablePublish })),
    h('div', { class: 'row wrap' },
      joined
        ? h('button', { class: 'danger', onclick: async () => { t.on = false; save(); await tableLeave(); render(); } }, 'Leave the table')
        : h('button', { class: 'primary', onclick: async () => {
          t.code = cleanCode(t.code);
          if (!t.code) return modal('Table code needed', h('p', {}, 'Type the code your DM gave you, or press "New code" to start a table and share the code with your group.'), [['OK']]);
          t.on = true; save(); await tableJoin(); render();
        } }, 'Join the table')),
    list);
  setTimeout(refreshTable, 0);
  return card;
}
