'use strict';
// Static 5e reference data (from the D&D 5e SRD 5.1, CC-BY-4.0) and random tables.

const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

const SKILLS = [
  ['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'], ['Athletics', 'str'],
  ['Deception', 'cha'], ['History', 'int'], ['Insight', 'wis'], ['Intimidation', 'cha'],
  ['Investigation', 'int'], ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'],
  ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'], ['Sleight of Hand', 'dex'],
  ['Stealth', 'dex'], ['Survival', 'wis']
];

// hd = hit die, saves = saving throw proficiencies, cast = spellcasting ability
const CLASSES = {
  Barbarian: { hd: 12, saves: ['str', 'con'], cast: '' },
  Bard: { hd: 8, saves: ['dex', 'cha'], cast: 'cha' },
  Cleric: { hd: 8, saves: ['wis', 'cha'], cast: 'wis' },
  Druid: { hd: 8, saves: ['int', 'wis'], cast: 'wis' },
  Fighter: { hd: 10, saves: ['str', 'con'], cast: '' },
  Monk: { hd: 8, saves: ['str', 'dex'], cast: '' },
  Paladin: { hd: 10, saves: ['wis', 'cha'], cast: 'cha' },
  Ranger: { hd: 10, saves: ['str', 'dex'], cast: 'wis' },
  Rogue: { hd: 8, saves: ['dex', 'int'], cast: '' },
  Sorcerer: { hd: 6, saves: ['con', 'cha'], cast: 'cha' },
  Warlock: { hd: 8, saves: ['wis', 'cha'], cast: 'cha' },
  Wizard: { hd: 6, saves: ['int', 'wis'], cast: 'int' }
};

const RACES = ['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Half-Orc', 'Halfling', 'Human', 'Tiefling'];

const CONDITIONS = ['Blinded', 'Charmed', 'Concentrating', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

// atk format: "Name +toHit damage; Name +toHit damage"
const MONSTERS = [
  { name: 'Giant Rat', cr: '1/8', ac: 12, hp: 7, init: 2, atk: 'Bite +4 1d4+2' },
  { name: 'Kobold', cr: '1/8', ac: 12, hp: 5, init: 2, atk: 'Dagger +4 1d4+2', desc: 'Pack Tactics.' },
  { name: 'Bandit', cr: '1/8', ac: 12, hp: 11, init: 1, atk: 'Scimitar +3 1d6+1; Light Crossbow +3 1d8+1' },
  { name: 'Goblin', cr: '1/4', ac: 15, hp: 7, init: 2, atk: 'Scimitar +4 1d6+2; Shortbow +4 1d6+2', desc: 'Nimble Escape.' },
  { name: 'Skeleton', cr: '1/4', ac: 13, hp: 13, init: 2, atk: 'Shortsword +4 1d6+2; Shortbow +4 1d6+2', desc: 'Vulnerable to bludgeoning.' },
  { name: 'Zombie', cr: '1/4', ac: 8, hp: 22, init: -2, atk: 'Slam +3 1d6+1', desc: 'Undead Fortitude.' },
  { name: 'Wolf', cr: '1/4', ac: 13, hp: 11, init: 2, atk: 'Bite +4 2d4+2', desc: 'Pack Tactics. Bite: DC 11 Str save or prone.' },
  { name: 'Orc', cr: '1/2', ac: 13, hp: 15, init: 1, atk: 'Greataxe +5 1d12+3; Javelin +5 1d6+3', desc: 'Aggressive.' },
  { name: 'Bugbear', cr: '1', ac: 16, hp: 27, init: 2, atk: 'Morningstar +4 2d8+2; Javelin +4 1d6+2', desc: 'Surprise Attack: +2d6 damage.' },
  { name: 'Ghoul', cr: '1', ac: 12, hp: 22, init: 2, atk: 'Claws +4 2d4+2; Bite +2 2d6+2', desc: 'Claws: DC 10 Con save or paralyzed 1 minute.' },
  { name: 'Giant Spider', cr: '1', ac: 14, hp: 26, init: 3, atk: 'Bite +5 1d8+3', desc: 'Bite adds 2d8 poison (DC 11 Con save for half). Web attack.' },
  { name: 'Bandit Captain', cr: '2', ac: 15, hp: 65, init: 3, atk: 'Scimitar +5 1d6+3; Dagger +5 1d4+3', desc: 'Multiattack: 2 scimitar + 1 dagger. Parry.' },
  { name: 'Ogre', cr: '2', ac: 11, hp: 59, init: -1, atk: 'Greatclub +6 2d8+4; Javelin +6 2d6+4' },
  { name: 'Owlbear', cr: '3', ac: 13, hp: 59, init: 1, atk: 'Beak +7 1d10+5; Claws +7 2d8+5', desc: 'Multiattack: beak + claws.' },
  { name: 'Troll', cr: '5', ac: 15, hp: 84, init: 1, atk: 'Bite +7 1d6+4; Claw +7 2d6+4', desc: 'Multiattack: bite + 2 claws. Regenerates 10 HP/turn unless hit by acid or fire.' },
  { name: 'Young Red Dragon', cr: '10', ac: 18, hp: 178, init: 0, atk: 'Bite +10 2d10+6; Claw +10 2d6+6', desc: 'Multiattack: bite + 2 claws. Bite adds 1d6 fire. Fire Breath (recharge 5-6): 30 ft cone, DC 17 Dex save, 16d6 fire.' }
];

// ---- Random tables for the generators and the solo oracle ----
const T = {
  first: ['Aldric', 'Brenna', 'Corvin', 'Dalia', 'Edric', 'Fenna', 'Garrick', 'Hesper', 'Ivo', 'Jora', 'Kellan', 'Lysa', 'Merrin', 'Nyx', 'Orin', 'Petra', 'Quill', 'Rosalind', 'Soren', 'Tamsin', 'Ulric', 'Vesna', 'Wren', 'Ysolde', 'Zeph'],
  last: ['Ashdown', 'Blackwater', 'Copperkettle', 'Dunmere', 'Emberfall', 'Fairwind', 'Greywood', 'Hollowell', 'Ironvale', 'Thornfield', 'Marsh', 'Nightbloom', 'Oakhart', 'Stoneways', 'Underbough'],
  job: ['innkeeper', 'blacksmith', 'smuggler', 'priest', 'guard captain', 'herbalist', 'scholar', 'merchant', 'hunter', 'beggar', 'noble', 'ferryman', 'gravedigger', 'bard', 'alchemist', 'mercenary'],
  trait: ['gruff', 'cheerful', 'nervous', 'haughty', 'weary', 'curious', 'suspicious', 'soft-spoken', 'boastful', 'pious', 'greedy', 'kind'],
  goal: ['to pay off a dangerous debt', 'revenge on a rival', 'to find a missing relative', 'to hide a shameful secret', 'to leave town for good', 'a rare ingredient', 'protection from something hunting them', 'to be remembered', 'to sell stolen goods quietly', 'to break a curse'],
  quirk: ['hums when thinking', 'never makes eye contact', 'collects odd buttons', 'quotes proverbs wrongly', 'always eating', 'missing two fingers', 'laughs at the wrong moments', 'talks to a pet rat', 'smells of woodsmoke', 'writes everything down'],
  action: ['Abandon', 'Ambush', 'Betray', 'Block', 'Break', 'Chase', 'Conceal', 'Defend', 'Deliver', 'Discover', 'Escape', 'Follow', 'Guard', 'Harm', 'Help', 'Hunt', 'Negotiate', 'Open', 'Protect', 'Reveal', 'Search', 'Steal', 'Summon', 'Trap', 'Warn'],
  theme: ['a debt', 'a rival', 'an heirloom', 'a storm', 'a stranger', 'the dead', 'a map', 'a promise', 'the crown', 'a beast', 'a door', 'a secret', 'gold', 'the weather', 'an oath', 'a child', 'a ruin', 'magic', 'a disease', 'a festival', 'the road', 'a temple', 'an old enemy', 'fire', 'the sea'],
  event: ['An old acquaintance appears at the worst moment.', 'The weather turns suddenly and violently.', 'Someone has been following you.', 'A valuable item goes missing.', 'A cry for help echoes nearby.', 'You find tracks that should not be here.', 'A rival group arrives with the same goal.', 'The ground gives way or a structure collapses.', 'A messenger arrives with urgent news.', 'Something you trusted turns out to be false.', 'An unexpected ally offers help, for a price.', 'A strange light or sound draws attention.'],
  twist: ['The quest giver is the real villain.', 'The treasure is cursed.', 'The enemy wants to surrender and talk.', 'An ally has been replaced by an impostor.', 'The map leads somewhere else entirely.', 'The monster is protecting something innocent.', 'Time is running out faster than expected.', 'Two factions want the same thing from you.', 'The victim does not want to be rescued.', 'What you seek was destroyed long ago.'],
  place: ['a flooded crypt', 'a roadside shrine', 'an abandoned watchtower', 'a smugglers\' cave', 'a foggy marsh village', 'a ruined abbey', 'a crowded night market', 'a collapsed mine', 'an overgrown elven road', 'a hilltop standing stone circle', 'a burned-out farmstead', 'a river barge', 'a wizard\'s sealed cellar', 'a mountain pass inn'],
  placeDetail: ['recently disturbed', 'eerily silent', 'guarded by something', 'half reclaimed by nature', 'marked with strange symbols', 'occupied by squatters', 'smelling of smoke', 'covered in old bloodstains', 'colder than it should be', 'lit by a single lantern'],
  loot: ['a potion of healing', 'a silvered dagger', 'a pouch of uncut gems (50 gp)', 'a spell scroll (1st level)', 'a fine cloak with a hidden pocket', 'a locked iron box', 'a signet ring of a local house', 'an old map fragment', 'a vial of antitoxin', 'a set of thieves\' tools', 'a carved bone whistle', 'a +1 arrow (x3)', 'a holy symbol of an unfamiliar god', 'a bag of 20 caltrops', 'a letter sealed with black wax'],
  situation: ['arguing among themselves', 'lying in ambush', 'fleeing from something bigger', 'guarding a prisoner', 'feeding', 'asleep', 'searching for something', 'wounded and desperate', 'setting a trap', 'on patrol']
};
