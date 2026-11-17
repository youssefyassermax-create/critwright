'use strict';
// Navigation and routing. Routes look like #/player/<id>/<tab>.

const ROUTES = [
  ['player', 'Player', viewPlayer], ['dm', 'DM', viewDM], ['solo', 'Solo', viewSolo],
  ['homebrew', 'Homebrew', viewHomebrew], ['settings', 'Settings', viewSettings]
];

// The bookmark ribbons are built once so they can animate between positions instead of being redrawn.
const navLinks = ROUTES.map(r => h('a', { href: '#/' + r[0] }, r[1]));
$('#nav').replaceChildren(h('a', { class: 'brand', href: '#/player' }, 'Critwright'), ...navLinks);

let lastHash = null, lastKey = null, lastIdx = null;
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const route = ROUTES.find(r => r[0] === parts[0]) || ROUTES[0];
  const moved = lastHash !== location.hash;
  const y = moved ? 0 : window.scrollY; // keep position when only data changed
  lastHash = location.hash;
  $('#view').classList.toggle('enter', moved); // fade the page in on navigation, not on every data change
  const key = parts.slice(0, 2).join('/');     // section + item, ignoring the tab inside it
  const opened = key !== lastKey;              // a different item than last time (not just another tab of it)

  // Turn a page only when moving between bookmarks: forward for a later bookmark, back for an earlier one.
  const idx = ROUTES.indexOf(route);
  if (lastIdx !== null && idx !== lastIdx && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.leaf').forEach(l => l.remove());
    const leaf = h('div', { class: idx > lastIdx ? 'leaf' : 'leaf back' });
    let strip = leaf; // ten strips, each hinged to the one before it, so the sheet can curl
    for (let i = 0; i < 10; i++) { const s = h('div', { class: 'seg' }); strip.append(s); strip = s; }
    $('#book').append(leaf);
    leaf.addEventListener('animationend', e => { if (e.target === leaf) leaf.remove(); });
    setTimeout(() => leaf.remove(), 1900); // safety net if the animation never runs
  }
  lastIdx = idx;
  lastKey = key;
  soloCtx = null;

  // Bookmarks follow the pages: the current section's ribbon and the ones before it lie on the left page,
  // the ones still to come lie on the right. Changing --x lets the stylesheet slide them across.
  navLinks.forEach((a, i) => {
    a.classList.toggle('on', i === idx);
    a.style.setProperty('--x', ((i <= idx ? 3 : 50.5) + i * 9.3) + '%');
  });
  const view = $('#view');
  view.replaceChildren();
  add(view, [route[2](parts.slice(1))]);
  window.scrollTo(0, y);

  // A character sheet is not a page of the book: it is a scroll that is brought to the table and unrolled over it.
  const layer = $('#scrolllayer');
  const hero = route[0] === 'player' ? DB.characters.find(c => c.id === parts[1]) : null;
  if (hero) {
    const inner = layer.querySelector('.scroll-inner');
    const top = inner && !moved ? inner.scrollTop : 0; // keep the reading position when only data changed
    layer.classList.toggle('unfurl', opened);
    layer.replaceChildren(sheet(hero, parts[2] || 'main'));
    layer.hidden = false;
    layer.querySelector('.scroll-inner').scrollTop = top;
    // How far the lower rod rolls while the sheet unrolls (measured once, so the animation itself never re-lays-out the sheet)
    if (opened) layer.style.setProperty('--h', layer.querySelector('.scroll-body').offsetHeight + 'px');
  } else {
    layer.replaceChildren();
    layer.hidden = true;
  }
}

window.addEventListener('hashchange', render);
$('#fab').addEventListener('click', () => { const d = $('#dice'); if (d.hidden) dicePanel(); else d.hidden = true; });
// Clicking the table beside the scroll puts it away.
$('#scrolllayer').addEventListener('click', e => { if (e.target.id === 'scrolllayer') location.hash = '#/player'; });
render();

// String the beads of the bracelet lying on the table.
for (let i = 0; i < 20; i++) $('#bracelet').append(h('b', { style: '--i:' + i }));

// Offline support when the app is served over http(s); skipped when opened as a local file.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
