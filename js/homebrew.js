'use strict';
// Homebrew library and app settings.

// f = fields: [key, type, label]
const HB = {
  race: { label: 'Species', f: [['desc', 'area', 'Traits and abilities']] },
  class: { label: 'Classes', f: [['hitDie', 'number', 'Hit die size (6, 8, 10 or 12)'], ['desc', 'area', 'Class features']] },
  spell: { label: 'Spells', f: [['level', 'number', 'Level (0 = cantrip)'], ['desc', 'area', 'Casting time, range, effect']] },
  item: { label: 'Items', f: [['weight', 'number', 'Weight (lb)'], ['desc', 'area', 'Description and properties']] },
  monster: { label: 'Monsters', f: [['cr', 'text', 'Challenge rating'], ['ac', 'number', 'Armor Class'], ['hp', 'number', 'Hit points'], ['init', 'number', 'Initiative bonus'],
    ['attacks', 'text', 'Attacks, e.g. Bite +5 1d8+3; Claw +4 1d6+2'], ['desc', 'area', 'Traits and notes']] },
  feature: { label: 'Feats & features', f: [['desc', 'area', 'Description']] },
  rule: { label: 'House rules', f: [['desc', 'area', 'Rule text. The AI narrator follows these.']] }
};

function viewHomebrew(p) {
  const cat = HB[p[0]] ? p[0] : 'race';
  const def = HB[cat], list = DB.homebrew[cat];
  return h('div', {},
    head('Homebrew', 'Your own content. It shows up in character sheets, the monster picker and the AI narrator.',
      h('button', { class: 'primary', onclick: () => {
        const x = { id: uid(), name: '' }; def.f.forEach(([k, t]) => { x[k] = t === 'number' ? 0 : ''; });
        list.push(x); hbOpen = x.id; save(); render();
      } }, '+ Add')),
    tabBar('#/homebrew/', Object.keys(HB).map(k => [k, HB[k].label]), cat),
    list.length ? h('div', { class: 'stack' }, list.map(x => {
      const t = h('span', { class: 'grow' }, x.name || 'Unnamed');
      return h('details', { class: 'card', open: x.id === hbOpen },
        h('summary', { class: 'row' }, t),
        lab('Name', inp(x, 'name', { on: el => { t.textContent = el.value || 'Unnamed'; } })),
        def.f.map(([k, type, label]) => lab(label, inp(x, k, type === 'area' ? { area: 1, rows: 4 } : { type }))),
        h('div', { class: 'row end' }, h('button', { class: 'ghost danger', onclick: () => ask(`Delete "${x.name || 'this entry'}"?`, () => { list.splice(list.indexOf(x), 1); save(); render(); }) }, 'Delete')));
    })) : empty('Nothing here yet. Press "+ Add" to create your first entry.'));
}
let hbOpen = null;

function viewSettings() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', () => {
    const f = file.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let d;
      try { d = JSON.parse(rd.result); } catch (e) { d = null; }
      if (!d || !d.v || !Array.isArray(d.characters)) return modal('Import failed', h('p', {}, 'That file is not a Critwright backup.'), [['OK']]);
      ask('Importing replaces everything currently in the app.', () => { const key = DB.settings.apiKey; DB = normalize(d); DB.settings.apiKey = key; save(); render(); }, 'Replace');
    };
    rd.readAsText(f);
  });
  const exportData = () => {
    const copy = JSON.parse(JSON.stringify(DB));
    copy.settings.apiKey = ''; // never write the key into a file that gets shared
    saveFile('critwright-backup.json', JSON.stringify(copy, null, 1)); // picks the right way to save for where the app is running
  };
  const synced = !!CLOUD.col;
  return h('div', {},
    head('Settings'),
    h('section', { class: 'card' }, h('h2', {}, 'AI narrator'),
      h('p', { class: 'muted' }, CLOUD.sample
        ? 'Solo mode can use Claude as the Dungeon Master. It runs on your own Claude account: you are asked to allow it the first time, and it counts toward your Claude usage.'
        : 'The AI narrator is not available in this view. Open the app from its Claude link to use it. The oracle tools in Solo mode always work.')),
    h('section', { class: 'card' }, h('h2', {}, 'Your data'),
      synced
        ? h('p', { class: 'muted' }, 'Your data is saved on this device and synced to private storage on your Claude account, so the same characters and campaigns appear on your PC and phone. Changes from another device show up when you reopen the app; if you edit on two devices at once, the most recent save wins.')
        : h('p', { class: 'muted' }, 'Everything is saved in this browser on this device. Export a backup regularly, and use export/import to move your data between devices or to share a campaign with a player.'),
      synced ? h('p', { id: 'syncstate' }, cloudStatusText()) : null,
      h('div', { class: 'row wrap' }, h('button', { onclick: exportData }, 'Export backup'), h('button', { onclick: () => file.click() }, 'Import backup'), file,
        h('button', { class: 'ghost danger', onclick: () => ask('Erase all characters, campaigns, adventures and homebrew' + (synced ? ' on every device?' : ' on this device?'), () => { DB = defaults(); save(); go('#/player'); }, 'Erase') }, 'Erase everything'))),
    h('section', { class: 'card' }, h('h2', {}, 'About'),
      h('p', { class: 'muted' }, 'Rules data comes from the Systems Reference Document 5.1 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License. This app is unofficial and not affiliated with Wizards of the Coast.')));
}
