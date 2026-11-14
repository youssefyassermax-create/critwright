'use strict';
// DM side: campaigns, initiative tracker, party, NPCs, quests, notes, generators.

function newCampaign() {
  return { id: uid(), name: 'New Campaign', desc: '', party: [], enc: { round: 1, activeId: null, list: [] }, npcs: [], quests: [], notes: [] };
}

// SRD monsters plus the user's homebrew monsters, in one shape.
function bestiary() {
  return MONSTERS.concat(DB.homebrew.monster.filter(m => m.name).map(m => ({
    name: m.name, cr: m.cr || '?', ac: +m.ac || 10, hp: +m.hp || 1, init: +m.init || 0, atk: m.attacks || '', desc: m.desc || '', hb: true
  })));
}
function parseAttacks(str) {
  return String(str || '').split(';').map(s => {
    const m = s.trim().match(/^(.*?)\s*([+-]\d+)\s+(\S+)$/);
    return m ? { name: m[1] || 'Attack', bonus: +m[2], dmg: m[3] } : null;
  }).filter(Boolean);
}

function viewDM(p) {
  const k = DB.campaigns.find(x => x.id === p[0]);
  return k ? campaign(k, p[1] || 'enc') : campaignList();
}

function campaignList() {
  return h('div', {},
    head('Campaigns', 'Run the table: initiative, party, NPCs, quests and session notes.',
      h('button', { class: 'primary', onclick: () => { const k = newCampaign(); DB.campaigns.push(k); save(); go('#/dm/' + k.id + '/party'); } }, '+ New campaign')),
    DB.campaigns.length
      ? h('div', { class: 'grid' }, DB.campaigns.map(k => h('a', { class: 'card link', href: '#/dm/' + k.id },
        h('h3', {}, k.name || 'Unnamed'), h('p', { class: 'muted' }, `${k.party.length} in party · ${k.npcs.length} NPCs · ${k.quests.filter(q => q.status === 'Active').length} active quests`),
        h('p', {}, k.desc ? k.desc.slice(0, 90) : ''))))
      : empty('No campaigns yet. Create one to start running a game.'));
}

function campaign(k, tab) {
  const tabs = [['enc', 'Encounter'], ['party', 'Party'], ['npcs', 'NPCs'], ['quests', 'Quests'], ['notes', 'Notes'], ['gen', 'Generators']];
  const body = {
    enc: cEnc, party: cParty, gen: cGen,
    npcs: () => journal(k.npcs, { noun: 'NPC', bodyPh: 'Appearance, voice, wants, secrets, stat notes…' }),
    quests: () => journal(k.quests, { noun: 'quest', status: true, bodyPh: 'Goal, giver, reward, complications…' }),
    notes: () => journal(k.notes, { noun: 'note', bodyPh: 'Session prep, recaps, locations, lore…' })
  }[tab] || cEnc;
  return h('div', {},
    h('div', { class: 'row wrap' }, h('a', { href: '#/dm', class: 'btn ghost' }, '← All'),
      inp(k, 'name', { class: 'title grow', ph: 'Campaign name' }), modeToggle()),
    tabBar('#/dm/' + k.id + '/', tabs, tab),
    body(k));
}

// ---- Initiative / encounter tracker ----
const chOf = x => x.charId ? DB.characters.find(c => c.id === x.charId) : null;
const hpOf = x => { const c = chOf(x); return c ? [c.hp.cur, c.hp.max] : [x.hp, x.max]; };

function cEnc(k) {
  const e = k.enc;
  const sortList = () => e.list.sort((a, b) => b.init - a.init);
  const nextTurn = () => {
    if (!e.list.length) return;
    const i = e.list.findIndex(x => x.id === e.activeId);
    const n = (i + 1) % e.list.length;
    if (i >= 0 && n === 0) e.round++;
    e.activeId = e.list[n].id; save(); render();
  };
  const row = x => {
    const [cur, max] = hpOf(x);
    const c = chOf(x);
    const amt = h('input', { type: 'number', inputmode: 'numeric', class: 'tiny', placeholder: 'HP', 'aria-label': 'HP amount for ' + x.name });
    const change = sign => () => {
      const n = Math.max(0, Math.floor(+amt.value || 0));
      if (c) (sign < 0 ? hurt : heal)(c, n);
      else x.hp = Math.max(0, Math.min(x.max, x.hp + sign * n));
      save(); render();
    };
    const cs = h('select', { 'aria-label': 'Add condition to ' + x.name }, h('option', { value: '' }, '+ Condition'), CONDITIONS.map(n => h('option', {}, n)));
    cs.addEventListener('change', () => { if (cs.value && !x.cond.includes(cs.value)) x.cond.push(cs.value); save(); render(); });
    return h('div', { class: 'card comb' + (x.id === e.activeId ? ' active' : '') + (cur <= 0 ? ' down' : '') },
      h('div', { class: 'row wrap' },
        inp(x, 'init', { type: 'number', class: 'tiny', label: 'Initiative of ' + x.name, on: () => { sortList(); }, re: 1 }),
        h('strong', { class: 'grow' }, x.name, ' ', h('span', { class: 'chip' }, x.kind === 'pc' ? 'PC' : x.kind === 'mon' ? 'Monster' : 'NPC')),
        h('span', {}, 'AC ' + (c ? c.ac : x.ac)), h('span', { class: 'hp' }, `HP ${cur}/${max}`),
        h('button', { class: 'ghost danger', 'aria-label': 'Remove ' + x.name, onclick: () => {
          if (e.activeId === x.id) e.activeId = null;
          e.list.splice(e.list.indexOf(x), 1); save(); render();
        } }, '✕')),
      h('div', { class: 'bar' }, h('i', { style: `width:${max > 0 ? Math.min(100, 100 * cur / max) : 0}%` })),
      h('div', { class: 'row wrap' }, amt, h('button', { class: 'danger', onclick: change(-1) }, 'Damage'), h('button', { class: 'ok', onclick: change(1) }, 'Heal'), cs,
        x.cond.map(n => h('button', { class: 'chip on', title: 'Remove condition', onclick: () => { x.cond = x.cond.filter(y => y !== n); save(); render(); } }, n + ' ✕')),
        c ? h('a', { class: 'btn ghost', href: '#/player/' + c.id + '/combat' }, 'Sheet') : null),
      (x.atk || []).length ? h('div', { class: 'row wrap' }, x.atk.map(a => [
        h('button', { class: 'roll', onclick: () => d20(`${x.name}: ${a.name} to hit`, a.bonus) }, `${a.name} ${fmt(a.bonus)}`),
        h('button', { class: 'roll', onclick: () => doRoll(`${x.name}: ${a.name} damage`, a.dmg) }, a.dmg)])) : null,
      x.note ? h('p', { class: 'muted' }, x.note) : null);
  };

  // Add forms
  const draft = { name: '', init: 10, hp: 10, ac: 10 };
  const list = bestiary();
  const pickMon = h('select', { class: 'grow', 'aria-label': 'Monster' }, list.map((m, i) => h('option', { value: i }, `${m.name} (CR ${m.cr})${m.hb ? ' · homebrew' : ''}`)));
  const count = h('input', { type: 'number', class: 'tiny', value: 1, min: 1, max: 20, 'aria-label': 'How many' });
  const addMon = () => {
    const m = list[+pickMon.value]; if (!m) return;
    const n = Math.max(1, Math.min(20, Math.floor(+count.value || 1)));
    const init = rand(20) + m.init; // one roll for the whole group, as the rules suggest
    const have = e.list.filter(x => x.name.startsWith(m.name)).length;
    for (let i = 1; i <= n; i++) e.list.push({ id: uid(), name: n + have > 1 ? `${m.name} ${have + i}` : m.name, init, hp: m.hp, max: m.hp, ac: m.ac, kind: 'mon', cond: [], atk: parseAttacks(m.atk), note: m.desc || '' });
    sortList(); save(); render();
  };
  const addParty = () => {
    const pcs = k.party.map(id => DB.characters.find(c => c.id === id)).filter(c => c && !e.list.some(x => x.charId === c.id));
    if (!pcs.length) return toast({ label: 'Party', total: 0, text: 'No party members to add. Link characters in the Party tab.' });
    pcs.forEach(c => e.list.push({ id: uid(), name: c.name, init: rand(20) + mod(c.abil.dex) + c.initBonus, kind: 'pc', cond: [], charId: c.id }));
    sortList(); save(); render();
  };

  return [
    h('section', { class: 'card' }, h('div', { class: 'row wrap' },
      h('h2', { class: 'grow' }, `Round ${e.round}`),
      h('button', { class: 'primary', onclick: nextTurn }, e.activeId ? 'Next turn' : 'Start combat'),
      h('button', { class: 'ghost danger', onclick: () => ask('Clear the whole encounter?', () => { k.enc = { round: 1, activeId: null, list: [] }; save(); render(); }, 'Clear') }, 'Clear'))),
    e.list.length ? e.list.map(row) : empty('No combatants. Add the party, monsters or custom entries below.'),
    h('section', { class: 'card' }, h('h2', {}, 'Add combatants'),
      h('div', { class: 'row wrap' }, h('button', { onclick: addParty }, '+ Party (rolls initiative)')),
      h('div', { class: 'row wrap' }, pickMon, count, h('button', { onclick: addMon }, '+ Monster')),
      h('div', { class: 'row wrap' },
        inp(draft, 'name', { ph: 'Custom name', class: 'grow' }), lab('Init', inp(draft, 'init', { type: 'number', class: 'tiny' }), 'inline'),
        lab('HP', inp(draft, 'hp', { type: 'number', class: 'tiny' }), 'inline'), lab('AC', inp(draft, 'ac', { type: 'number', class: 'tiny' }), 'inline'),
        h('button', { onclick: () => {
          e.list.push({ id: uid(), name: draft.name || 'Combatant', init: draft.init, hp: draft.hp, max: draft.hp, ac: draft.ac, kind: 'npc', cond: [] });
          sortList(); save(); render();
        } }, '+ Custom')))
  ];
}

function cParty(k) {
  const members = k.party.map(id => DB.characters.find(c => c.id === id)).filter(Boolean);
  return [
    tableCard(),
    h('section', { class: 'card' }, h('h2', {}, 'About this campaign'), inp(k, 'desc', { area: 1, ph: 'Setting, tone, where the party is now…' })),
    h('section', { class: 'card' }, h('h2', {}, 'Party members'),
      DB.characters.length ? DB.characters.map(c => {
        const box = h('input', { type: 'checkbox', checked: k.party.includes(c.id) });
        box.addEventListener('change', () => { k.party = box.checked ? k.party.concat(c.id) : k.party.filter(i => i !== c.id); save(); render(); });
        return h('label', { class: 'line' }, box, h('span', { class: 'grow' }, c.name, ' ', h('span', { class: 'muted' }, charLine(c))));
      }) : empty('Create characters in the Player tab, then link them here.')),
    members.length ? h('div', { class: 'grid' }, members.map(c => h('a', { class: 'card link', href: '#/player/' + c.id },
      h('h3', {}, c.name), h('p', { class: 'muted' }, charLine(c)),
      h('p', {}, `HP ${c.hp.cur}/${c.hp.max} · AC ${c.ac} · Passive Perception ${10 + skillBonus(c, 'Perception', 'wis')}`),
      c.conditions.length ? h('p', {}, c.conditions.join(', ')) : null))) : null,
    h('div', { class: 'row end' }, h('button', { class: 'danger ghost', onclick: () => ask(`Delete campaign "${k.name}" and all its notes?`, () => {
      DB.campaigns = DB.campaigns.filter(x => x !== k); save(); go('#/dm');
    }) }, 'Delete campaign'))
  ];
}

function cGen(k) {
  const out = h('div', { class: 'stack' });
  const gens = [['NPC', 'npc', 'npcs'], ['Name', 'name', 'npcs'], ['Encounter', 'encounter', 'notes'], ['Location', 'place', 'notes'], ['Loot', 'loot', 'notes'], ['Plot twist', 'twist', 'notes'], ['Random event', 'event', 'notes']];
  const make = ([label, fn, dest]) => {
    const text = GEN[fn]();
    const btn = h('button', { class: 'ghost', onclick: () => {
      k[dest].push({ id: uid(), title: dest === 'npcs' ? text.split(',')[0] : label, body: text, tag: label.toLowerCase(), pin: false, status: 'Active', ts: Date.now() });
      save(); btn.textContent = 'Saved'; btn.disabled = true;
    } }, 'Save to ' + (dest === 'npcs' ? 'NPCs' : 'Notes'));
    out.prepend(h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'chip' }, label), h('span', { class: 'grow' }), btn), h('p', {}, text)));
  };
  return [
    h('section', { class: 'card' }, h('h2', {}, 'Quick generators'), h('p', { class: 'muted' }, 'Stuck mid-session? Roll something up and save what you like.'),
      h('div', { class: 'row wrap' }, gens.map(g => h('button', { onclick: () => make(g) }, g[0])))),
    out
  ];
}
