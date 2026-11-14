'use strict';
// Player side: character list and the character sheet.

function newChar() {
  const slots = {};
  for (let i = 1; i <= 9; i++) slots[i] = { max: 0, used: 0 };
  return {
    id: uid(), name: 'New Hero', race: '', cls: '', subclass: '', level: 1, background: '', alignment: '', xp: 0,
    abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, saves: {}, skills: {},
    hp: { cur: 10, max: 10, temp: 0 }, ac: 10, speed: 30, initBonus: 0, hitDie: 8, hdUsed: 0,
    death: { s: 0, f: 0 }, conditions: [], inspiration: false, attacks: [],
    castAbil: '', slots, spells: [], items: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [], profs: '', bio: '', notes: [],
    sealed: false // a new character is a draft until the royal seal is pressed onto its sheet
  };
}
// Characters made before the seal existed have no flag and count as already confirmed.
const isSealed = c => c.sealed !== false;
let justSealed = null; // id of the character sealed a moment ago, so the stamp animation plays once
const charLine = c => `Level ${c.level} ${[c.race, c.cls].filter(Boolean).join(' ') || 'adventurer'}`;
const skillBonus = (c, name, ab) => mod(c.abil[ab]) + prof(c.level) * (c.skills[name] || 0);
const saveBonus = (c, ab) => mod(c.abil[ab]) + (c.saves[ab] ? prof(c.level) : 0);

function hurt(c, n) {
  n = Math.max(0, Math.floor(+n || 0));
  const t = Math.min(c.hp.temp, n);
  c.hp.temp -= t;
  c.hp.cur = Math.max(0, c.hp.cur - (n - t));
}
function heal(c, n) { c.hp.cur = Math.min(c.hp.max, c.hp.cur + Math.max(0, Math.floor(+n || 0))); }

function allClasses() {
  const out = Object.assign({}, CLASSES);
  DB.homebrew.class.forEach(k => { if (k.name) out[k.name] = { hd: +k.hitDie || 8 }; });
  return out;
}
function applyClass(c) {
  const d = allClasses()[c.cls];
  if (!d) return;
  c.hitDie = d.hd || c.hitDie;
  if (d.saves) { c.saves = {}; d.saves.forEach(a => { c.saves[a] = true; }); }
  if (d.cast !== undefined) c.castAbil = d.cast;
}

function viewPlayer(p) {
  const c = DB.characters.find(x => x.id === p[0]);
  return charList(); // the sheet itself is shown as a scroll laid over the book (see render in app.js)
}

function charList() {
  return h('div', {},
    head('Characters', 'Sheets, spells, inventory and notes for every hero you play.',
      h('div', { class: 'row wrap' }, importButton(), h('button', { class: 'primary', onclick: () => { const c = newChar(); DB.characters.push(c); save(); go('#/player/' + c.id); } }, '+ New character'))),
    DB.characters.length
      ? h('div', { class: 'grid' }, DB.characters.map(c => h('a', { class: 'card link', href: '#/player/' + c.id },
        isSealed(c) ? h('span', { class: 'seal small', title: 'Confirmed character' }) : null,
        h('h3', {}, c.name || 'Unnamed'), h('p', { class: 'muted' }, charLine(c)),
        h('p', {}, `HP ${c.hp.cur}/${c.hp.max} · AC ${c.ac}`),
        isSealed(c) ? null : h('span', { class: 'chip' }, 'Draft, not yet sealed'))))
      : empty('No characters yet. Create one, or import one from a file.'),
    tableCard());
}

function sheet(c, tab) {
  const tabs = [['main', 'Stats'], ['combat', 'Combat'], ['spells', 'Spells'], ['items', 'Inventory'], ['feats', 'Features'], ['notes', 'Notes']];
  const body = { main: sMain, combat: sCombat, spells: sSpells, items: sItems, feats: sFeats, notes: sNotes }[tab] || sMain;
  // The sheet is drawn as a scroll: two rods with the parchment unrolling between them.
  return h('div', { class: 'scroll' },
    h('div', { class: 'rod' }),
    h('div', { class: 'scroll-body' }, h('div', { class: 'scroll-paper' }, h('i')), h('div', { class: 'scroll-inner' }, h('div', { class: 'scroll-pad' },
      h('div', { class: 'row wrap' }, h('a', { href: '#/player', class: 'btn ghost' }, '← All'),
        inp(c, 'name', { class: 'title grow', ph: 'Character name' }), modeToggle()),
      h('p', { class: 'muted' }, `${charLine(c)} · Proficiency ${fmt(prof(c.level))} · HP ${c.hp.cur}/${c.hp.max} · AC ${c.ac}`),
      tabBar('#/player/' + c.id + '/', tabs, tab),
      body(c),
      sealRow(c)))),
    h('div', { class: 'rod' }));
}

// Foot of the scroll: a draft asks for the royal seal; a confirmed character simply carries it.
function sealRow(c) {
  if (!isSealed(c)) {
    return h('div', { class: 'sealrow' },
      h('p', {}, 'This character is still a draft. When the sheet is ready, press the royal seal to confirm it.'),
      h('button', { class: 'primary', onclick: () => { c.sealed = true; justSealed = c.id; save(); render(); } }, 'Press the royal seal'));
  }
  const stamping = justSealed === c.id;
  justSealed = null;
  return h('div', { class: 'sealrow' },
    h('p', {}, 'Sealed and entered in the book.'),
    h('div', { class: 'seal' + (stamping ? ' stamping' : ''), title: 'Royal seal' }));
}

function sMain(c) {
  return [
    h('datalist', { id: 'dl-race' }, RACES.concat(DB.homebrew.race.map(x => x.name)).map(x => h('option', { value: x }))),
    h('datalist', { id: 'dl-class' }, Object.keys(allClasses()).map(x => h('option', { value: x }))),
    h('section', { class: 'card' }, h('div', { class: 'form' },
      lab('Species / race', inp(c, 'race', { list: 'dl-race', re: 1, ph: 'Pick or type your own' })),
      lab('Class', inp(c, 'cls', { list: 'dl-class', re: 1, ph: 'Pick or type your own', on: () => applyClass(c) })),
      lab('Subclass', inp(c, 'subclass')),
      lab('Level', inp(c, 'level', { type: 'number', min: 1, max: 20, re: 1 })),
      lab('Background', inp(c, 'background')),
      lab('Alignment', inp(c, 'alignment')),
      lab('XP', inp(c, 'xp', { type: 'number' })))),
    h('section', { class: 'card' }, h('h2', {}, 'Abilities'), h('p', { class: 'muted' }, 'Tap a modifier to roll a check.'),
      h('div', { class: 'abils' }, ABILS.map(a => h('div', { class: 'abil' },
        h('span', { class: 'cap' }, a.toUpperCase()),
        inp(c.abil, a, { type: 'number', re: 1, label: ABIL_NAME[a] + ' score' }),
        h('button', { class: 'roll', onclick: () => d20(ABIL_NAME[a] + ' check', mod(c.abil[a])) }, fmt(mod(c.abil[a]))))))),
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('h2', {}, 'Saving throws'),
        ABILS.map(a => h('div', { class: 'line' },
          chk(c.saves, a, { re: 1, label: ABIL_NAME[a] + ' save proficiency' }),
          h('span', { class: 'grow' }, ABIL_NAME[a]),
          h('button', { class: 'roll', onclick: () => d20(ABIL_NAME[a] + ' save', saveBonus(c, a)) }, fmt(saveBonus(c, a))))),
        h('p', { class: 'muted' }, 'Passive Perception ', h('strong', {}, 10 + skillBonus(c, 'Perception', 'wis')))),
      h('section', { class: 'card' }, h('h2', {}, 'Skills'),
        h('p', { class: 'muted' }, 'Tap the circle: none, proficient (P), expertise (E).'),
        SKILLS.map(([name, ab]) => h('div', { class: 'line' },
          h('button', { class: 'pip p' + (c.skills[name] || 0), 'aria-label': name + ' proficiency',
            onclick: () => { c.skills[name] = ((c.skills[name] || 0) + 1) % 3; save(); render(); } }, ['', 'P', 'E'][c.skills[name] || 0]),
          h('span', { class: 'grow' }, name, ' ', h('span', { class: 'muted' }, ab.toUpperCase())),
          h('button', { class: 'roll', onclick: () => d20(name, skillBonus(c, name, ab)) }, fmt(skillBonus(c, name, ab))))))),
    h('div', { class: 'row end' }, h('button', { class: 'danger ghost', onclick: () => ask(`Delete ${c.name}? This cannot be undone.`, () => {
      DB.characters = DB.characters.filter(x => x !== c);
      DB.campaigns.forEach(k => { k.party = k.party.filter(i => i !== c.id); k.enc.list = k.enc.list.filter(x => x.charId !== c.id); });
      save(); go('#/player');
    }) }, 'Delete character'))
  ];
}

function sCombat(c) {
  const amt = h('input', { type: 'number', inputmode: 'numeric', placeholder: 'Amount', 'aria-label': 'HP amount', class: 'short' });
  const act = fn => () => { fn(c, amt.value); save(); render(); };
  const hdLeft = Math.max(0, c.level - c.hdUsed);
  return [
    h('section', { class: 'card' }, h('h2', {}, 'Hit points'),
      h('div', { class: 'stats' },
        lab('Current', inp(c.hp, 'cur', { type: 'number', re: 1 })), lab('Max', inp(c.hp, 'max', { type: 'number', re: 1 })),
        lab('Temp', inp(c.hp, 'temp', { type: 'number', re: 1 }))),
      h('div', { class: 'bar' }, h('i', { style: `width:${c.hp.max > 0 ? Math.min(100, 100 * c.hp.cur / c.hp.max) : 0}%` })),
      h('div', { class: 'row' }, amt, h('button', { class: 'danger', onclick: act(hurt) }, 'Damage'), h('button', { class: 'ok', onclick: act(heal) }, 'Heal'))),
    h('section', { class: 'card' }, h('div', { class: 'stats' },
      lab('Armor Class', inp(c, 'ac', { type: 'number', re: 1 })), lab('Speed (ft)', inp(c, 'speed', { type: 'number' })),
      lab('Init bonus', inp(c, 'initBonus', { type: 'number', re: 1 })), lab('Hit die d', inp(c, 'hitDie', { type: 'number', re: 1 }))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'roll', onclick: () => d20('Initiative', mod(c.abil.dex) + c.initBonus) }, 'Initiative ' + fmt(mod(c.abil.dex) + c.initBonus)),
        h('button', { onclick: () => {
          if (hdLeft < 1) return toast({ label: 'Hit dice', total: 0, text: 'No hit dice left. Take a long rest.' });
          const r = doRoll('Hit die', `1d${c.hitDie || 8}${fmt(mod(c.abil.con))}`);
          if (r) { c.hdUsed++; heal(c, Math.max(0, r.total)); save(); render(); }
        } }, `Spend hit die (${hdLeft}/${c.level} left)`),
        h('button', { onclick: () => ask('Take a long rest? HP and spell slots are restored and half your hit dice return.', () => {
          c.hp.cur = c.hp.max; c.hp.temp = 0; c.death = { s: 0, f: 0 };
          c.hdUsed = Math.max(0, c.hdUsed - Math.max(1, Math.floor(c.level / 2)));
          for (const k in c.slots) c.slots[k].used = 0;
          save(); render();
        }, 'Rest') }, 'Long rest'),
        h('label', { class: 'line' }, chk(c, 'inspiration'), 'Inspiration'))),
    h('section', { class: 'card' }, h('h2', {}, 'Attacks'),
      c.attacks.map(a => h('div', { class: 'row wrap' },
        inp(a, 'name', { ph: 'Weapon', class: 'grow' }), inp(a, 'bonus', { type: 'number', class: 'short', label: 'To hit bonus' }),
        inp(a, 'dmg', { ph: '1d8+3', class: 'short', label: 'Damage dice' }),
        h('button', { class: 'roll', onclick: () => d20((a.name || 'Attack') + ' to hit', a.bonus) }, 'Hit'),
        h('button', { class: 'roll', onclick: () => doRoll((a.name || 'Attack') + ' damage', a.dmg || '1d4') }, 'Dmg'),
        h('button', { class: 'ghost danger', 'aria-label': 'Remove attack', onclick: () => { c.attacks.splice(c.attacks.indexOf(a), 1); save(); render(); } }, '✕'))),
      h('button', { onclick: () => { c.attacks.push({ name: '', bonus: mod(c.abil.str) + prof(c.level), dmg: '1d8' + fmt(mod(c.abil.str)) }); save(); render(); } }, '+ Add attack')),
    h('section', { class: 'card' }, h('h2', {}, 'Conditions'),
      h('div', { class: 'row wrap' }, CONDITIONS.map(k => h('button', {
        class: 'chip' + (c.conditions.includes(k) ? ' on' : ''),
        onclick: () => { c.conditions = c.conditions.includes(k) ? c.conditions.filter(x => x !== k) : c.conditions.concat(k); save(); render(); }
      }, k)))),
    h('section', { class: 'card' }, h('h2', {}, 'Death saves'),
      h('div', { class: 'row wrap' }, h('span', {}, `Successes ${c.death.s}/3 · Failures ${c.death.f}/3`),
        h('button', { class: 'roll', onclick: () => {
          const r = doRoll('Death save', '1d20'); if (!r) return;
          if (r.total === 20) { c.hp.cur = 1; c.death = { s: 0, f: 0 }; }
          else if (r.total === 1) c.death.f = Math.min(3, c.death.f + 2);
          else if (r.total >= 10) c.death.s = Math.min(3, c.death.s + 1);
          else c.death.f = Math.min(3, c.death.f + 1);
          save(); render();
        } }, 'Roll'),
        h('button', { class: 'ghost', onclick: () => { c.death = { s: 0, f: 0 }; save(); render(); } }, 'Reset')))
  ];
}

function sSpells(c) {
  const ab = c.castAbil;
  const dc = ab ? 8 + prof(c.level) + mod(c.abil[ab]) : null;
  const hb = h('select', { 'aria-label': 'Homebrew spell' }, h('option', { value: '' }, 'Add homebrew spell…'),
    DB.homebrew.spell.map(s => h('option', { value: s.id }, s.name)));
  hb.addEventListener('change', () => {
    const s = DB.homebrew.spell.find(x => x.id === hb.value); if (!s) return;
    c.spells.push({ id: uid(), name: s.name, level: +s.level || 0, prep: true, desc: s.desc || '' }); save(); render();
  });
  return [
    h('section', { class: 'card' }, h('div', { class: 'row wrap' },
      lab('Spellcasting ability', sel(c, 'castAbil', [['', 'None']].concat(ABILS.map(a => [a, ABIL_NAME[a]])), { re: 1 })),
      ab ? h('p', {}, 'Save DC ', h('strong', {}, dc), ' · Spell attack ') : h('p', { class: 'muted' }, 'Pick an ability to see save DC and attack bonus.'),
      ab ? h('button', { class: 'roll', onclick: () => d20('Spell attack', dc - 8) }, fmt(dc - 8)) : null)),
    h('section', { class: 'card' }, h('h2', {}, 'Spell slots'), h('p', { class: 'muted' }, 'Set the max per level, then tap a pip to spend or restore a slot.'),
      Object.keys(c.slots).map(l => { const s = c.slots[l]; return h('div', { class: 'line' },
        h('span', { class: 'lvl' }, 'Lv ' + l), inp(s, 'max', { type: 'number', min: 0, max: 9, class: 'tiny', re: 1, label: 'Max level ' + l + ' slots', on: () => { s.used = Math.min(s.used, s.max); } }),
        h('div', { class: 'row wrap' }, Array.from({ length: Math.min(9, s.max) }, (_, i) => h('button', {
          class: 'slot' + (i < s.used ? ' used' : ''), 'aria-label': `Level ${l} slot ${i + 1}`,
          onclick: () => { s.used = i < s.used ? i : i + 1; save(); render(); } })))); })),
    h('section', { class: 'card' }, h('h2', {}, 'Spells'),
      c.spells.slice().sort((a, b) => a.level - b.level).map(s => h('details', { class: 'sub' },
        h('summary', { class: 'row' }, h('span', { class: 'chip' }, s.level ? 'Lv ' + s.level : 'Cantrip'), h('span', { class: 'grow' }, s.name || 'Unnamed spell'), s.prep ? h('span', { class: 'chip on' }, 'Prepared') : null),
        h('div', { class: 'row wrap' }, inp(s, 'name', { ph: 'Spell name', class: 'grow', re: 1 }),
          inp(s, 'level', { type: 'number', min: 0, max: 9, class: 'tiny', re: 1, label: 'Spell level' }),
          h('label', { class: 'line' }, chk(s, 'prep', { re: 1 }), 'Prepared'),
          h('button', { class: 'ghost danger', onclick: () => { c.spells.splice(c.spells.indexOf(s), 1); save(); render(); } }, 'Remove')),
        inp(s, 'desc', { area: 1, ph: 'Range, duration, effect, damage…' }))),
      h('div', { class: 'row wrap' },
        h('button', { onclick: () => { c.spells.push({ id: uid(), name: '', level: 0, prep: true, desc: '' }); save(); render(); } }, '+ Add spell'),
        DB.homebrew.spell.length ? hb : null))
  ];
}

function sItems(c) {
  const weight = c.items.reduce((s, i) => s + (+i.qty || 0) * (+i.weight || 0), 0);
  const hb = h('select', { 'aria-label': 'Homebrew item' }, h('option', { value: '' }, 'Add homebrew item…'),
    DB.homebrew.item.map(s => h('option', { value: s.id }, s.name)));
  hb.addEventListener('change', () => {
    const s = DB.homebrew.item.find(x => x.id === hb.value); if (!s) return;
    c.items.push({ name: s.name, qty: 1, weight: +s.weight || 0, note: s.desc || '' }); save(); render();
  });
  return [
    h('section', { class: 'card' }, h('h2', {}, 'Coins'),
      h('div', { class: 'stats' }, ['cp', 'sp', 'ep', 'gp', 'pp'].map(k => lab(k.toUpperCase(), inp(c.coins, k, { type: 'number' }))))),
    h('section', { class: 'card' }, h('h2', {}, 'Equipment'),
      h('p', { class: 'muted' }, `Carrying ${weight} lb of ${c.abil.str * 15} lb capacity (Strength x 15).`),
      c.items.map(i => h('div', { class: 'row wrap item' },
        inp(i, 'qty', { type: 'number', class: 'tiny', re: 1, label: 'Quantity' }), inp(i, 'name', { ph: 'Item', class: 'grow' }),
        inp(i, 'weight', { type: 'number', class: 'tiny', re: 1, label: 'Weight each (lb)', ph: 'lb' }),
        inp(i, 'note', { ph: 'Notes', class: 'grow' }),
        h('button', { class: 'ghost danger', 'aria-label': 'Remove item', onclick: () => { c.items.splice(c.items.indexOf(i), 1); save(); render(); } }, '✕'))),
      h('div', { class: 'row wrap' },
        h('button', { onclick: () => { c.items.push({ name: '', qty: 1, weight: 0, note: '' }); save(); render(); } }, '+ Add item'),
        DB.homebrew.item.length ? hb : null))
  ];
}

function sFeats(c) {
  const src = DB.homebrew.feature.concat(DB.homebrew.race, DB.homebrew.class);
  const hb = h('select', { 'aria-label': 'Homebrew feature' }, h('option', { value: '' }, 'Add from homebrew…'), src.map(s => h('option', { value: s.id }, s.name)));
  hb.addEventListener('change', () => {
    const s = src.find(x => x.id === hb.value); if (!s) return;
    c.features.push({ name: s.name, desc: s.desc || '' }); save(); render();
  });
  return [
    h('section', { class: 'card' }, h('h2', {}, 'Features & traits'),
      c.features.map(f => h('div', { class: 'sub' },
        h('div', { class: 'row' }, inp(f, 'name', { ph: 'Feature name', class: 'grow' }),
          h('button', { class: 'ghost danger', 'aria-label': 'Remove feature', onclick: () => { c.features.splice(c.features.indexOf(f), 1); save(); render(); } }, '✕')),
        inp(f, 'desc', { area: 1, ph: 'What it does, uses per rest…' }))),
      h('div', { class: 'row wrap' },
        h('button', { onclick: () => { c.features.push({ name: '', desc: '' }); save(); render(); } }, '+ Add feature'), src.length ? hb : null)),
    h('section', { class: 'card' }, h('h2', {}, 'Proficiencies & languages'), inp(c, 'profs', { area: 1, ph: 'Armor, weapons, tools, languages' })),
    h('section', { class: 'card' }, h('h2', {}, 'Backstory & personality'), inp(c, 'bio', { area: 1, rows: 6, ph: 'Traits, ideals, bonds, flaws, history' }))
  ];
}

const sNotes = c => h('section', {}, journal(c.notes, { noun: 'note', bodyPh: 'Session recap, clues, NPC names, plans…' }));

// Plain-text sheet summary, sent to the AI narrator.
function charText(c) {
  const sk = SKILLS.filter(([n]) => c.skills[n]).map(([n, a]) => `${n} ${fmt(skillBonus(c, n, a))}`).join(', ');
  return [
    `${c.name}: ${charLine(c)}${c.subclass ? ' (' + c.subclass + ')' : ''}, ${c.background || 'no background'}, ${c.alignment || ''}`,
    'Abilities: ' + ABILS.map(a => `${a.toUpperCase()} ${c.abil[a]} (${fmt(mod(c.abil[a]))})`).join(', '),
    `HP ${c.hp.cur}/${c.hp.max}, AC ${c.ac}, Speed ${c.speed} ft, Proficiency ${fmt(prof(c.level))}, Passive Perception ${10 + skillBonus(c, 'Perception', 'wis')}`,
    'Save proficiencies: ' + (ABILS.filter(a => c.saves[a]).map(a => a.toUpperCase()).join(', ') || 'none'),
    'Skills: ' + (sk || 'none'),
    'Attacks: ' + (c.attacks.map(a => `${a.name} ${fmt(+a.bonus || 0)} (${a.dmg})`).join('; ') || 'none'),
    'Spells: ' + (c.spells.map(s => `${s.name} (L${s.level})`).join(', ') || 'none'),
    'Spell slots left: ' + (Object.keys(c.slots).filter(l => c.slots[l].max).map(l => `L${l} ${c.slots[l].max - c.slots[l].used}/${c.slots[l].max}`).join(', ') || 'none'),
    'Inventory: ' + (c.items.map(i => `${i.qty} x ${i.name}`).join(', ') || 'none') + `; ${c.coins.gp} gp`,
    'Features: ' + (c.features.map(f => f.name + (f.desc ? ' - ' + f.desc : '')).join('; ') || 'none'),
    c.conditions.length ? 'Conditions: ' + c.conditions.join(', ') : '',
    c.bio ? 'Backstory: ' + c.bio : ''
  ].filter(Boolean).join('\n');
}
