'use strict';
// Extras that only exist when the app is opened as a hosted page on claude.ai:
// - sync of all data to the signed-in person's private storage (so PC and phone share it)
// - the AI narrator through the viewer's own Claude account (no API key)
// - file export through the host's save dialog
// Opened anywhere else (local file, your own web host) window.claude is missing and all of this stays off.

const CLOUD = { sample: null, downloads: null, col: null, state: 'off', err: '', room: null, table: null, peers: [], tableErr: '' };
const CHUNK = 40000;            // characters per stored document, well under the 256 KiB document limit
const startTs = DB.modTs || 0;  // what this device had when the page opened
let pushTimer = null, pushChain = Promise.resolve(), lastParts = [];

function cloudBadge() {
  const el = document.getElementById('syncstate');
  if (el) el.textContent = cloudStatusText();
}
function cloudStatusText() {
  return { off: 'Sync is not available here. Data stays on this device.', loading: 'Checking your saved data…', synced: 'All changes are saved to your Claude account.',
    saving: 'Saving…', error: 'Could not sync (' + CLOUD.err + '). Your data is still saved on this device.' }[CLOUD.state];
}

function cloudPush() {
  if (!CLOUD.col || CLOUD.state === 'loading') return;
  CLOUD.state = 'saving'; cloudBadge();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushChain = pushChain.then(doPush); }, 3000);
}
async function doPush() {
  const ts = DB.modTs || Date.now();
  const copy = Object.assign({}, DB, { settings: Object.assign({}, DB.settings, { apiKey: '' }), diceLog: [] });
  const json = JSON.stringify(copy);
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  try {
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] !== lastParts[i]) await CLOUD.col.doc('tk-part-' + i).set({ s: parts[i] });
    }
    await CLOUD.col.doc('tk-meta').set({ ts, parts: parts.length });
    lastParts = parts;
    CLOUD.state = 'synced';
  } catch (e) {
    CLOUD.state = 'error'; CLOUD.err = (e && e.code) || 'unknown';
  }
  cloudBadge();
}

async function cloudPull() {
  const meta = await CLOUD.col.doc('tk-meta').get();
  if (!meta.exists) return 'push';
  const m = meta.data();
  if (!(m.ts > startTs)) return m.ts < (DB.modTs || 0) ? 'push' : 'same';
  const snaps = await Promise.all(Array.from({ length: m.parts }, (_, i) => CLOUD.col.doc('tk-part-' + i).get()));
  const parts = snaps.map(s => (s.exists ? s.data().s : ''));
  const d = JSON.parse(parts.join('')); // throws if another device was mid-save; caught by the caller
  const key = DB.settings.apiKey, dice = DB.diceLog;
  DB = normalize(d);
  DB.settings.apiKey = key; DB.diceLog = dice; DB.modTs = m.ts;
  lastParts = parts;
  saveNow();
  return 'pulled';
}

(async () => {
  if (!window.claude || !window.claude.use) return;
  const use = n => window.claude.use(n).catch(() => null);
  const [sample, downloads, db, user, room] = await Promise.all([use('sample'), use('downloads'), use('db'), use('user'), use('room')]);
  CLOUD.room = room;
  CLOUD.sample = sample; CLOUD.downloads = downloads;
  if (db && user) {
    try {
      const id = await user.id();
      if (id) {
        CLOUD.col = db.collection('data/users/' + id);
        CLOUD.state = 'loading';
        const result = await cloudPull();
        CLOUD.state = 'synced';
        if (result === 'push') cloudPush();
      }
    } catch (e) {
      CLOUD.state = 'error'; CLOUD.err = (e && e.code) || 'unreadable';
    }
  }
  if (room && DB.table.on && DB.table.code) await tableJoin(); // come back to the table this person was at
  if (sample || downloads || CLOUD.col || room) render();
})();
