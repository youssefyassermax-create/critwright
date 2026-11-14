'use strict';
// Solo play: an adventure log driven by an offline oracle and/or an AI narrator.

let soloCtx = null;   // { s, push } for the session currently on screen
let soloBusy = false;

function viewSolo(p) {
  const s = DB.solo.find(x => x.id === p[0]);
  return s ? soloSession(s) : soloList();
}

function soloList() {
  return h('div', {},
    head('Solo adventures', 'No DM tonight? Play with the oracle tables, or let the AI narrator run the game.',
      h('button', { class: 'primary', onclick: () => {
        const s = { id: uid(), name: 'New Adventure', charId: (DB.characters[0] || {}).id || '', premise: '', log: [], ai: true };
        DB.solo.push(s); save(); go('#/solo/' + s.id);
      } }, '+ New adventure')),
    DB.solo.length
      ? h('div', { class: 'grid' }, DB.solo.map(s => h('a', { class: 'card link', href: '#/solo/' + s.id },
        h('h3', {}, s.name || 'Unnamed'), h('p', { class: 'muted' }, `${s.log.length} log entries`))))
      : empty('No adventures yet.'));
}

const WHO = { you: 'You', dm: 'Narrator', oracle: 'Oracle', roll: 'Dice', sys: 'System' };
const bubble = e => h('div', { class: 'msg ' + e.t }, h('span', { class: 'who' }, WHO[e.t] || e.t), h('div', { class: 'tx' }, e.text));

// Oracle: d100 against a likelihood threshold. Low rolls are stronger yes, high rolls stronger no.
const ODDS = [['95', 'Almost certain'], ['75', 'Likely'], ['50', '50 / 50'], ['25', 'Unlikely'], ['5', 'Almost impossible']];
function oracleAnswer(question, thr) {
  const r = rand(100);
  let a = r <= thr ? 'Yes' : 'No';
  if (r <= thr / 5) a = 'Yes, and something extra goes your way';
  else if (r > thr && r > 100 - (100 - thr) / 5) a = 'No, and it gets worse';
  else if (Math.abs(r - thr) <= 3) a += ', but only just';
  const extra = r % 11 === 0 ? ` Random event: ${GEN.event()}` : '';
  return `${question ? question + ' → ' : ''}${a} (rolled ${r}, needed ${thr} or less).${extra}`;
}

function soloSession(s) {
  const hasKey = !!CLOUD.sample; // AI narrator is available when the app is opened from its Claude link
  const logEl = h('div', { class: 'log' }, s.log.length ? s.log.map(bubble) : empty(hasKey
    ? 'Write an opening action, or press "Begin adventure" and the narrator will set the scene.'
    : 'Describe what your character does, then use the oracle and scene tools below to find out what happens.'));
  const push = (t, text) => {
    if (!s.log.length) logEl.replaceChildren();
    const e = { t, text }; s.log.push(e); save();
    const b = bubble(e); logEl.append(b); b.scrollIntoView({ block: 'nearest' });
  };
  soloCtx = { s, push };

  async function narrate() {
    if (soloBusy) return;
    soloBusy = true;
    if (!s.log.length) logEl.replaceChildren();
    const e = { t: 'dm', text: '' };
    const b = bubble(e); b.classList.add('wait'); b.lastChild.textContent = 'The narrator is thinking…';
    logEl.append(b); b.scrollIntoView({ block: 'nearest' });
    try {
      e.text = await callNarrator(s, t => { b.classList.remove('wait'); b.lastChild.textContent = t; });
      if (!e.text) throw new Error('The narrator returned an empty reply. Try again.');
      b.classList.remove('wait'); b.lastChild.textContent = e.text;
      s.log.push(e); save();
    } catch (err) {
      b.remove();
      push('sys', 'Narrator error: ' + err.message);
    }
    soloBusy = false;
  }

  const ta = h('textarea', { rows: 3, placeholder: 'What do you do?', 'aria-label': 'Your action' });
  const send = () => {
    const text = ta.value.trim();
    if (!text) return;
    push('you', text); ta.value = '';
    if (hasKey && s.ai) narrate();
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });

  const q = h('input', { type: 'text', class: 'grow', placeholder: 'Ask a yes/no question', 'aria-label': 'Oracle question' });
  const odds = h('select', { 'aria-label': 'Likelihood', value: '50' }, ODDS.map(([v, l]) => h('option', { value: v }, l)));
  const askOracle = () => { push('oracle', oracleAnswer(q.value.trim(), +odds.value)); q.value = ''; };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') askOracle(); });
  const tools = [['Scene prompt', () => 'Scene prompt: ' + GEN.scene()], ['Random event', () => 'Event: ' + GEN.event()], ['NPC', () => 'NPC: ' + GEN.npc()],
    ['Location', () => 'Location: ' + GEN.place()], ['Encounter', () => 'Encounter: ' + GEN.encounter()], ['Loot', () => 'Loot: ' + GEN.loot()], ['Twist', () => 'Twist: ' + GEN.twist()]];

  return h('div', {},
    h('div', { class: 'row wrap' }, h('a', { href: '#/solo', class: 'btn ghost' }, '← All'), inp(s, 'name', { class: 'title grow', ph: 'Adventure name' }), modeToggle()),
    h('details', { class: 'card', open: !s.log.length },
      h('summary', {}, 'Setup: character, premise and narrator'),
      lab('Character', sel(s, 'charId', [['', 'No character']].concat(DB.characters.map(c => [c.id, c.name])), { re: 1 })),
      lab('Premise & key facts', inp(s, 'premise', { area: 1, rows: 4, ph: 'Setting, tone, current goal, important facts to remember. The narrator always sees this box and the latest 60 log entries.' })),
      hasKey
        ? h('label', { class: 'line' }, chk(s, 'ai'), 'AI narrator replies to my actions')
        : h('p', { class: 'muted' }, 'The AI narrator is not available in this view. The oracle tools below work without it.'),
      h('div', { class: 'row end' }, h('button', { class: 'ghost danger', onclick: () => ask(`Delete adventure "${s.name}"?`, () => { DB.solo = DB.solo.filter(x => x !== s); save(); go('#/solo'); }) }, 'Delete adventure'))),
    logEl,
    h('section', { class: 'card composer' },
      ta,
      h('div', { class: 'row wrap' },
        h('button', { class: 'primary', onclick: send }, hasKey && s.ai ? 'Act (send to narrator)' : 'Add to log'),
        hasKey ? h('button', { onclick: narrate }, s.log.length ? 'Narrator: continue' : 'Begin adventure') : null,
        s.charId ? h('a', { class: 'btn ghost', href: '#/player/' + s.charId + '/combat' }, 'Open sheet') : null,
        h('span', { class: 'grow' }),
        h('button', { class: 'ghost', onclick: () => { if (s.log.length && !soloBusy) { s.log.pop(); save(); render(); } } }, 'Undo last')),
      h('div', { class: 'row wrap' }, q, odds, h('button', { onclick: askOracle }, 'Ask oracle')),
      h('div', { class: 'row wrap' }, tools.map(([l, fn]) => h('button', { class: 'chip', onclick: () => push('oracle', fn()) }, l))),
      h('p', { class: 'muted' }, 'Dice you roll (the d20 button, or from your sheet in another tab of this adventure) are added to the log automatically.')));
}

// Dice rolled while an adventure is open go into its log.
window.onRoll = r => {
  if (soloCtx && location.hash.startsWith('#/solo/' + soloCtx.s.id)) soloCtx.push('roll', `${r.label}: ${r.total}  ${r.text}`);
};

// ---- AI narrator (runs on the viewer's own Claude account when the app is opened from its Claude link) ----
function narratorSystem(s) {
  const c = DB.characters.find(x => x.id === s.charId);
  const hbText = Object.keys(HB).map(cat => {
    const items = DB.homebrew[cat].filter(x => x.name);
    if (!items.length) return '';
    return `${HB[cat].label}:\n` + items.map(x => `- ${x.name}: ` + HB[cat].f.map(([k, , l]) => x[k] !== '' && x[k] != null ? `${k} ${x[k]}` : '').filter(Boolean).join('; ')).join('\n');
  }).filter(Boolean).join('\n\n');
  return [
    'You are the Dungeon Master for a solo game of Dungeons & Dragons 5th edition (2014 rules). The player controls one character; you run the world, the NPCs and the monsters.',
    'How to run the game:',
    '- Narrate in second person, vivid but brief: under 180 words per reply unless the player asks for more.',
    '- Never roll dice for the player character and never decide their actions. When their action needs a check, save or attack, name the exact roll (for example "Roll a Dexterity (Stealth) check") and stop. Do not reveal the DC first. The player rolls in the app and the result arrives as a line starting with [Dice roll]; resolve it honestly, including failures.',
    '- Roll for monsters and NPCs yourself and state the numbers. In combat, track initiative, enemy HP and positions, and tell the player exactly how much damage they take or what resources they spend so they can update their sheet.',
    '- Lines starting with [Oracle result] come from random tables the player consulted. Treat them as true and weave them into the story.',
    '- Keep continuity with the premise, the log and the character sheet. Offer real choices and consequences; do not railroad.',
    '- The homebrew content and house rules below override the standard rules wherever they conflict.',
    '- End each reply at a point where the player has a decision to make or a roll to give you.',
    c ? 'PLAYER CHARACTER\n' + charText(c) : 'No character sheet is linked. Ask the player who they are playing if it matters.',
    s.premise ? 'PREMISE AND KEY FACTS\n' + s.premise : 'No premise was given: invent a fitting adventure hook.',
    hbText ? 'HOMEBREW CONTENT AND HOUSE RULES\n' + hbText : ''
  ].filter(Boolean).join('\n\n');
}

function narratorMessages(s) {
  const prefix = { roll: '[Dice roll] ', oracle: '[Oracle result] ' };
  const out = [];
  for (const e of s.log.filter(x => x.t !== 'sys').slice(-60)) {
    const role = e.t === 'dm' ? 'assistant' : 'user';
    const text = (prefix[e.t] || '') + e.text;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n\n' + text;
    else out.push({ role, content: text });
  }
  if (!out.length) out.push({ role: 'user', content: 'Begin the adventure. Set the opening scene.' });
  if (out[0].role !== 'user') out.unshift({ role: 'user', content: '(Earlier events are summarised in the premise.)' });
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: 'Continue the scene.' });
  return out;
}

async function callNarrator(s, onText) {
  if (CLOUD.sample) { // hosted on claude.ai: use the viewer's own Claude account, no API key
    try {
      const turns = [{ role: 'user', content: narratorSystem(s) }].concat(narratorMessages(s));
      const r = await CLOUD.sample(turns, { cache: false, onText: u => onText(u.text) });
      return (r.text + (r.truncated ? '\n\n(The reply was cut off. Press "Narrator: continue".)' : '')).trim();
    } catch (e) {
      const known = {
        not_granted: 'AI access was not allowed for this page. Reload the page if you want to be asked again.',
        rate_limited: 'Your Claude usage limit was reached. Try again later.',
        refused: 'The model declined to continue this scene. Rephrase your action or undo the last entry.',
        session_expired: 'Sign in to Claude again, then retry.'
      }[e && e.code];
      throw new Error(known || (e && e.message) || 'The narrator could not be reached.');
    }
  }
  throw new Error('The AI narrator is not available in this view.');
}
