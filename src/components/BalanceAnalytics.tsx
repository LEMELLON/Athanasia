import React, { useState, useEffect, useRef } from 'react';
import { ItemEntity, CharacterClass } from '../types/game';
import { CLASS_PVP_DECKS, PvPCard } from '../data/pvpCards';

interface Props {
  allItems?: ItemEntity[];
}

const SANDBOX_STORAGE_KEY = 'arcana_sandbox_balance_save_v1';

// Seeded RNG: mulberry32
function createMulberry32(seedVal: number) {
  let a = seedVal >>> 0;
  return {
    next: () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    roll: (sides: number) => 1 + Math.floor((() => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    })() * sides)
  };
}

const WHEEL = ['water', 'fire', 'air', 'earth'];
function getElementMultiplier(att: string, def: string): number {
  if (att === 'light' && def === 'dark') return 1.5;
  if (att === 'dark' && def === 'light') return 1.5;
  const a = WHEEL.indexOf(att);
  const d = WHEEL.indexOf(def);
  if (a < 0 || d < 0) return 1;
  if ((a + 1) % 4 === d) return 1.5;
  if ((d + 1) % 4 === a) return 0.5;
  return 1;
}

const CHAMPIONS = {
  atalanta: { name: 'Atalanta', cls: 'Cana' as CharacterClass, attrs: { STR: 2, AGI: 3, VIT: 1, INT: 1 }, max: { STR: 15, AGI: 20, VIT: 15, INT: 15 }, homeElement: 'air' },
  achilles: { name: 'Achilles', cls: 'Bhana' as CharacterClass, attrs: { STR: 3, AGI: 1, VIT: 2, INT: 1 }, max: { STR: 20, AGI: 10, VIT: 15, INT: 10 }, homeElement: 'earth' },
  medea: { name: 'Medea', cls: 'Prana' as CharacterClass, attrs: { STR: 1, AGI: 1, VIT: 2, INT: 3 }, max: { STR: 10, AGI: 10, VIT: 15, INT: 20 }, homeElement: 'fire' },
  orpheus: { name: 'Orpheus', cls: 'Gana' as CharacterClass, attrs: { STR: 1, AGI: 2, VIT: 1, INT: 3 }, max: { STR: 10, AGI: 15, VIT: 10, INT: 20 }, homeElement: 'water' },
};

const BIOMES = {
  pyria: { name: 'Pyria', element: 'fire', guardian: 'Hephaestus' },
  hydoria: { name: 'Hydoria', element: 'water', guardian: 'Oceanus' },
  aeria: { name: 'Aeria', element: 'air', guardian: 'Aeolus' },
  geia: { name: 'Geia', element: 'earth', guardian: 'Gaia' },
  phosia: { name: 'Phosia', element: 'light', guardian: 'Apollo' },
  skotosia: { name: 'Skotosia', element: 'dark', guardian: 'Nyx' },
};

const MOBS = {
  pyria: { easy: 'Ember Imp', medium: 'Pyre Sprite', hard: 'Phlox Elemental' },
  geia: { easy: 'Pebble Golem', medium: 'Clay Gnome', hard: 'Chthonic Worm' },
  hydoria: { easy: 'Bubble Slime', medium: 'Mist Jellyfish', hard: 'Spring Naiad' },
  aeria: { easy: 'Feather Hawk', medium: 'Storm Swallow', hard: 'Thunder Cub' },
  phosia: { easy: 'Glimmer Sprite', medium: 'Halo Sentinel', hard: 'Mirror Wraith' },
  skotosia: { easy: 'Dusk Bat', medium: 'Night Stalker', hard: 'Umbral Hound' },
};

const TIER_CR: Record<string, number> = { easy: 1, medium: 4, hard: 8, guardian: 12 };
const TIER_LOOT: Record<string, 'common' | 'uncommon' | 'rare' | 'legendary'> = { easy: 'common', medium: 'uncommon', hard: 'rare', guardian: 'legendary' };

const TOTAL_SR = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450, 550, 660, 780, 910, 1050, 1200, 1360, 1530, 1710, 1900];
const PROFICIENCY = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

interface TuningBalance {
  mobHpBase: number;
  mobHpPerCr: number;
  mobDefBase: number;
  mobDefDiv: number;
  rarityDie: { common: number; uncommon: number; rare: number; legendary: number };
  armorDef: { common: number; uncommon: number; rare: number; legendary: number };
  dropThresholds: { easy: number; medium: number; hard: number; guardian: number };
  walletLossFraction: number;
}

const DEFAULT_TUNING: TuningBalance = {
  mobHpBase: 15,
  mobHpPerCr: 8,
  mobDefBase: 6,
  mobDefDiv: 2,
  rarityDie: { common: 6, uncommon: 8, rare: 10, legendary: 12 },
  armorDef: { common: 1, uncommon: 2, rare: 3, legendary: 4 },
  dropThresholds: { easy: 11, medium: 14, hard: 17, guardian: 20 },
  walletLossFraction: 0.25
};

export const BalanceAnalytics: React.FC<Props> = ({ allItems = [] }) => {
  const [tuning, setTuning] = useState<TuningBalance>(() => {
    try {
      const saved = localStorage.getItem(`${SANDBOX_STORAGE_KEY}_tuning`);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return DEFAULT_TUNING;
  });

  const [isTuningPanelOpen, setIsTuningPanelOpen] = useState(false);
  const [isHackModalOpen, setIsHackModalOpen] = useState(false);
  const [isDefeatedModalOpen, setIsDefeatedModalOpen] = useState(false);
  const [isDeckViewerOpen, setIsDeckViewerOpen] = useState(false);

  // Setup strip state (Seed input removed per user request)
  const [selectedChamp, setSelectedChamp] = useState<keyof typeof CHAMPIONS>('achilles');
  const [selectedBiome, setSelectedBiome] = useState<keyof typeof BIOMES>('pyria');
  const [selectedTier, setSelectedTier] = useState<'easy' | 'medium' | 'hard' | 'guardian'>('easy');
  const [cr, setCr] = useState<number>(1);

  // Hack popup input state
  const [hackSrAdd, setHackSrAdd] = useState<number>(100);
  const [selectedItemToSpawn, setSelectedItemToSpawn] = useState<string>(allItems[0]?.id || '');

  // PvP 9-Card hand state
  const [currentHand, setCurrentHand] = useState<PvPCard[]>([]);
  const [activeTraps, setActiveTraps] = useState<PvPCard[]>([]);

  // Character state with full inventory
  const [ch, setCh] = useState(() => {
    const base = CHAMPIONS['achilles'];
    return {
      name: base.name,
      cls: base.cls,
      element: base.homeElement,
      level: 1,
      attrs: { ...base.attrs },
      maxAttrs: { ...base.max },
      hp: 32,
      mp: 15,
      totalSR: 0,
      walletSR: 0,
      lives: 3,
      equippedWeapon: null as ItemEntity | null,
      equippedArmor: null as ItemEntity | null,
      inventory: [] as ItemEntity[],
      statuses: [] as string[]
    };
  });

  const [fragments, setFragments] = useState<string[]>([]);
  const [summons, setSummons] = useState<any[]>([]);
  const [round, setRound] = useState(1);
  const [isOver, setIsOver] = useState(false);
  const [log, setLog] = useState<{ type: string; text: string; round: number }[]>([]);
  const [tray, setTray] = useState<{ sides: number; value: number; label: string; group?: string }[]>([]);

  // Enemy state
  const [mob, setMob] = useState(() => {
    const b = BIOMES['pyria'];
    const name = MOBS['pyria']['easy'];
    const mhp = tuning.mobHpBase + tuning.mobHpPerCr * 1;
    const mdef = tuning.mobDefBase + Math.floor(1 / tuning.mobDefDiv);
    return { name, biome: 'pyria', tier: 'easy', cr: 1, element: b.element, hp: mhp, maxHp: mhp, defense: mdef };
  });

  const rngRef = useRef(createMulberry32(Date.now() % 100000));

  const addLog = (type: string, text: string) => {
    setLog(prev => [...prev.slice(-90), { type, text, round }]);
  };

  const getProficiency = (lvl: number) => PROFICIENCY[Math.min(20, Math.max(1, lvl)) - 1];

  const deriveStats = (character = ch) => {
    const prof = getProficiency(character.level);
    const m = (k: keyof typeof character.attrs) => character.attrs[k];
    const armBonus = character.equippedArmor?.baseAc || 0;
    return {
      proficiency: prof,
      maxHp: 20 + m('VIT') * (prof + 1) + m('STR') * 2,
      maxMp: 10 + m('INT') * 5,
      physDef: m('VIT') * 2 + armBonus,
      magDef: m('INT') * 2,
      speed: 1 + Math.floor(character.attrs.AGI / 5)
    };
  };

  const derived = deriveStats(ch);

  // Reset Simulation (renamed from New Game)
  const handleResetSimulation = () => {
    rngRef.current = createMulberry32(Date.now() % 100000);
    const base = CHAMPIONS[selectedChamp];
    const prof = PROFICIENCY[0];
    const maxHp = 20 + base.attrs.VIT * (prof + 1) + base.attrs.STR * 2;
    const maxMp = 10 + base.attrs.INT * 5;

    const newChar = {
      name: base.name,
      cls: base.cls,
      element: base.homeElement,
      level: 1,
      attrs: { ...base.attrs },
      maxAttrs: { ...base.max },
      hp: maxHp,
      mp: maxMp,
      totalSR: 0,
      walletSR: 0,
      lives: 3,
      equippedWeapon: null,
      equippedArmor: null,
      inventory: [
        {
          id: 'pot_hp_basic',
          name: 'Basic Health Potion',
          category: 'consumable' as const,
          rarity: 'Common' as const,
          biome: 'Universal' as const,
          classReq: 'All' as const,
          healHpPct: 25,
          description: 'Restores 25% of Max HP.'
        },
        {
          id: 'pot_mp_basic',
          name: 'Basic Mana Potion',
          category: 'consumable' as const,
          rarity: 'Common' as const,
          biome: 'Universal' as const,
          classReq: 'All' as const,
          restoreMpPct: 25,
          description: 'Restores 25% of Max MP.'
        }
      ],
      statuses: []
    };

    setCh(newChar);
    setFragments([]);
    setSummons([]);
    setRound(1);
    setTray([]);
    setCurrentHand([]);
    setActiveTraps([]);
    setIsDefeatedModalOpen(false);
    setLog([{ type: 'system', text: `Simulation reset: ${newChar.name} (${newChar.cls}).`, round: 1 }]);
    spawnMonster(selectedBiome, selectedTier, cr);
  };

  const spawnMonster = (biomeKey = selectedBiome, tierKey = selectedTier, crVal = cr) => {
    const b = BIOMES[biomeKey];
    const name = tierKey === 'guardian' ? b.guardian : MOBS[biomeKey][tierKey as 'easy' | 'medium' | 'hard'];
    const mhp = tuning.mobHpBase + tuning.mobHpPerCr * crVal;
    const mdef = tuning.mobDefBase + Math.floor(crVal / tuning.mobDefDiv);

    setMob({
      name,
      biome: biomeKey,
      tier: tierKey,
      cr: crVal,
      element: b.element,
      hp: mhp,
      maxHp: mhp,
      defense: mdef
    });
    setIsOver(false);
    setSummons([]);
    addLog('system', `Encounter: ${name} (${biomeKey}, CR ${crVal}) blocks the path. HP ${mhp}, DEF ${mdef}.`);
  };

  // Turn Actions
  const handlePlayerAttack = () => {
    if (isOver || ch.hp <= 0) return;
    const attackAttr = ch.cls === 'Prana' || ch.cls === 'Gana' ? 'INT' : 'STR';
    const attrMod = ch.attrs[attackAttr as keyof typeof ch.attrs];
    const prof = derived.proficiency;

    const d1 = rngRef.current.roll(6);
    const d2 = rngRef.current.roll(6);
    const natural = d1 + d2;
    const crit = natural === 12;
    const autoMiss = natural === 2;
    const totalHit = natural + attrMod + prof;
    const hits = crit || (!autoMiss && totalHit >= mob.defense);

    const hitRollTray = [
      { sides: 6, value: d1, label: 'Attack Die 1', group: 'to hit' },
      { sides: 6, value: d2, label: 'Attack Die 2', group: 'to hit' }
    ];

    if (!hits) {
      setTray(hitRollTray);
      addLog('attack', `${ch.name} ${autoMiss ? 'rolls natural 2' : 'misses'}: 2d6(${d1}+${d2}) +${attrMod} ${attackAttr} +${prof} prof = ${totalHit} vs DEF ${mob.defense}`);
      afterPlayerTurn();
      return;
    }

    const baseWeaponDmg = ch.equippedWeapon?.baseAtk || 5;
    const dieSides = 20; // 1d20 damage roll
    const rolledDmg = rngRef.current.roll(dieSides);
    let dmg = Math.max(1, baseWeaponDmg + rolledDmg + attrMod);
    if (crit) dmg *= 2;

    const mult = getElementMultiplier(ch.element, mob.element);
    const finalDmg = Math.max(1, Math.floor(dmg * mult));

    setTray([
      ...hitRollTray,
      { sides: dieSides, value: rolledDmg, label: 'Damage d20', group: 'damage' }
    ]);

    const dMath = `Base ${baseWeaponDmg} + d20(${rolledDmg}) +${attrMod} ${attackAttr}${crit ? ' x2 CRIT' : ''}${mult !== 1 ? ` x${mult} element` : ''} = ${finalDmg}`;
    addLog('attack', `${ch.name} ${crit ? 'CRITICAL HIT' : 'HITS'}: 2d6(${d1}+${d2}) = ${totalHit} vs DEF ${mob.defense}. Damage: ${dMath}`);

    const newMobHp = Math.max(0, mob.hp - finalDmg);
    setMob(prev => ({ ...prev, hp: newMobHp }));

    if (newMobHp <= 0) {
      handleVictory();
    } else {
      afterPlayerTurn();
    }
  };

  const afterPlayerTurn = () => {
    const behRoll = rngRef.current.roll(6);
    const action = behRoll >= 6 ? 'ultimate' : behRoll >= 4 ? 'skill' : 'basic';

    const e1 = rngRef.current.roll(6);
    const e2 = rngRef.current.roll(6);
    const eTotal = e1 + e2 + mob.cr;
    const eHits = eTotal >= derived.physDef;

    let eDmg = rngRef.current.roll(6) + mob.cr;
    if (action === 'ultimate') eDmg = Math.floor(eDmg * 1.5);

    if (summons.length > 0 && eHits) {
      setSummons(prev => prev.slice(1));
      addLog('enemy', `${mob.name} strikes for ${eDmg}, but a 1-HP Beast Familiar absorbs the entire blow! (Shatter mechanic)`);
    } else if (eHits) {
      const newChHp = Math.max(0, ch.hp - eDmg);
      setCh(prev => ({ ...prev, hp: newChHp }));
      addLog('enemy', `${mob.name} (${action}) hits for ${eDmg} damage! [2d6(${e1}+${e2}) +${mob.cr} vs DEF ${derived.physDef}].`);

      if (newChHp <= 0) {
        setIsDefeatedModalOpen(true);
      }
    } else {
      addLog('enemy', `${mob.name} (${action}) misses [2d6(${e1}+${e2}) +${mob.cr} vs DEF ${derived.physDef}].`);
    }

    setRound(r => r + 1);
  };

  const handleVictory = () => {
    const rewardSr = Math.min(10 * mob.cr, 3 * mob.cr + 21, mob.cr + 41);
    addLog('loot', `★ ${mob.name} defeated! +${rewardSr} Total & Wallet SR awarded.`);

    let nextTotal = ch.totalSR + rewardSr;
    let nextLvl = 1;
    while (nextLvl < 20 && nextTotal >= TOTAL_SR[nextLvl]) nextLvl++;

    setCh(prev => ({
      ...prev,
      totalSR: nextTotal,
      walletSR: prev.walletSR + rewardSr,
      level: nextLvl
    }));

    setIsOver(true);
  };

  // Consumable Usage
  const handleUseConsumable = (item: ItemEntity, index: number, asFreeTest: boolean = false) => {
    let healHp = 0;
    let restoreMp = 0;

    if (item.healHpPct) healHp = Math.floor(derived.maxHp * (item.healHpPct / 100));
    if (item.restoreMpPct) restoreMp = Math.floor(derived.maxMp * (item.restoreMpPct / 100));

    setCh(prev => {
      const newInv = [...prev.inventory];
      newInv.splice(index, 1);
      return {
        ...prev,
        hp: Math.min(derived.maxHp, prev.hp + healHp),
        mp: Math.min(derived.maxMp, prev.mp + restoreMp),
        inventory: newInv
      };
    });

    addLog('system', `${ch.name} uses ${item.name} (${asFreeTest ? 'FREE TEST' : 'Turn Action'}): +${healHp} HP, +${restoreMp} MP.`);

    if (!asFreeTest && !isOver) {
      afterPlayerTurn();
    }
  };

  // Equip Item from Inventory
  const handleEquipItem = (item: ItemEntity, index: number) => {
    setCh(prev => {
      const newInv = [...prev.inventory];
      newInv.splice(index, 1);

      if (item.category === 'weapon') {
        if (prev.equippedWeapon) newInv.push(prev.equippedWeapon);
        return { ...prev, equippedWeapon: item, inventory: newInv };
      } else if (item.category === 'armor' || item.category === 'shield') {
        if (prev.equippedArmor) newInv.push(prev.equippedArmor);
        return { ...prev, equippedArmor: item, inventory: newInv };
      }
      return prev;
    });
    addLog('system', `${ch.name} equips ${item.name}.`);
  };

  // Unequip item back to inventory
  const handleUnequipItem = (category: 'weapon' | 'armor') => {
    setCh(prev => {
      const newInv = [...prev.inventory];
      if (category === 'weapon' && prev.equippedWeapon) {
        newInv.push(prev.equippedWeapon);
        addLog('system', `Unequipped ${prev.equippedWeapon.name}.`);
        return { ...prev, equippedWeapon: null, inventory: newInv };
      } else if (category === 'armor' && prev.equippedArmor) {
        newInv.push(prev.equippedArmor);
        addLog('system', `Unequipped ${prev.equippedArmor.name}.`);
        return { ...prev, equippedArmor: null, inventory: newInv };
      }
      return prev;
    });
  };

  // Draw 3-Card Hand for 9-Card Crucible Format
  const handleDrawHand = () => {
    const deck = CLASS_PVP_DECKS[ch.cls] || CLASS_PVP_DECKS['Bhana'];
    // Shuffle and pick 3 cards
    const shuffled = [...deck].sort(() => 0.5 - Math.random());
    setCurrentHand(shuffled.slice(0, 3));
    addLog('system', `${ch.name} draws 3 starting cards for the 9-Card Crucible Format.`);
  };

  const handlePlayCard = (card: PvPCard, idx: number) => {
    setCurrentHand(prev => prev.filter((_, i) => i !== idx));

    if (card.type === 'Trap') {
      setActiveTraps(prev => [...prev, card]);
      addLog('attack', `${ch.name} places a Face-Down Trap: [${card.title}] on the board.`);
    } else {
      addLog('attack', `${ch.name} plays ${card.type} Card: ${card.title} — "${card.effect}"`);
      if (card.type === 'Attack' && !isOver) {
        const dmg = 8 + (card.range ? card.range * 2 : 6);
        setMob(m => ({ ...m, hp: Math.max(0, m.hp - dmg) }));
        addLog('attack', `Card Attack lands for ${dmg} damage to ${mob.name}!`);
        afterPlayerTurn();
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* Top Setup Strip (Seed Removed, Reset Simulation button) */}
      <div className="px-6 py-3 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div>
            <label className="text-[10px] text-stone-400 uppercase font-bold block">Champion</label>
            <select
              value={selectedChamp}
              onChange={e => {
                const k = e.target.value as any;
                setSelectedChamp(k);
                const base = CHAMPIONS[k as keyof typeof CHAMPIONS];
                setCh(c => ({
                  ...c,
                  name: base.name,
                  cls: base.cls,
                  element: base.homeElement,
                  attrs: { ...base.attrs },
                  maxAttrs: { ...base.max }
                }));
              }}
              className="bg-[#1b2b22] border border-[#2e4235] rounded px-2 py-1 text-stone-100"
            >
              {Object.entries(CHAMPIONS).map(([k, c]) => (
                <option key={k} value={k}>{c.name} ({c.cls})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-stone-400 uppercase font-bold block">Biome</label>
            <select
              value={selectedBiome}
              onChange={e => {
                const b = e.target.value as any;
                setSelectedBiome(b);
                spawnMonster(b, selectedTier, cr);
              }}
              className="bg-[#1b2b22] border border-[#2e4235] rounded px-2 py-1 text-stone-100"
            >
              {Object.entries(BIOMES).map(([k, b]) => (
                <option key={k} value={k}>{b.name} ({b.element})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-stone-400 uppercase font-bold block">Monster</label>
            <select
              value={selectedTier}
              onChange={e => {
                const t = e.target.value as any;
                setSelectedTier(t);
                const newCr = TIER_CR[t];
                setCr(newCr);
                spawnMonster(selectedBiome, t, newCr);
              }}
              className="bg-[#1b2b22] border border-[#2e4235] rounded px-2 py-1 text-stone-100"
            >
              <option value="easy">Easy (CR 1)</option>
              <option value="medium">Medium (CR 4)</option>
              <option value="hard">Hard (CR 8)</option>
              <option value="guardian">Guardian (CR 12)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-stone-400 uppercase font-bold block">CR (1–20)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={cr}
              onChange={e => {
                const v = Math.max(1, Math.min(20, +e.target.value));
                setCr(v);
                spawnMonster(selectedBiome, selectedTier, v);
              }}
              className="w-16 bg-[#1b2b22] border border-[#2e4235] rounded px-2 py-1 text-stone-100 font-mono-nums"
            />
          </div>

          <button
            onClick={handleResetSimulation}
            className="px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold mt-3.5 shadow-sm"
          >
            Reset Simulation
          </button>
          <button
            onClick={() => setCh(c => ({ ...c, walletSR: c.walletSR + 50, totalSR: c.totalSR + 50 }))}
            className="px-2.5 py-1.5 rounded bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] mt-3.5 font-mono-nums"
          >
            +50 SR
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDeckViewerOpen(!isDeckViewerOpen)}
            className="px-3 py-1.5 rounded-lg bg-[#203227] hover:bg-[#2b4234] text-purple-300 border border-purple-500/40 text-xs font-semibold"
          >
            🎴 9-Card Crucible Deck
          </button>
          <button
            onClick={() => setIsHackModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-xs font-bold"
          >
            ⚡ Hack Current Match
          </button>
          <button
            onClick={() => setIsTuningPanelOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#1a2820] hover:bg-[#23352b] text-teal-300 border border-[#2e4235] text-xs font-semibold"
          >
            ⚙ GM Math Tuning
          </button>
        </div>
      </div>

      {/* Main 3-Column Fighting Sandbox */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden">
        {/* Column 1: Character & Soul Corridor */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Character Card */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-base text-amber-400 font-display">
                {ch.name}
              </span>
              <span className="text-xs text-stone-400">
                {ch.cls} · Lv {ch.level} · {ch.element}
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono-nums">
              <div className="flex justify-between">
                <span>HP: {ch.hp} / {derived.maxHp}</span>
                <span className="text-red-400">Lives: {'♥'.repeat(ch.lives)}</span>
              </div>
              <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                <div className="bg-red-500 h-full transition-all" style={{ width: `${(ch.hp / derived.maxHp) * 100}%` }} />
              </div>

              <div className="flex justify-between pt-1">
                <span>MP: {ch.mp} / {derived.maxMp}</span>
                <span>Speed: {derived.speed} tiles</span>
              </div>
              <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                <div className="bg-sky-500 h-full transition-all" style={{ width: `${(ch.mp / derived.maxMp) * 100}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono-nums">
              {(['STR', 'AGI', 'VIT', 'INT'] as const).map(k => (
                <div key={k} className="p-2 rounded bg-[#0e1612] border border-[#202e26]">
                  <div className="flex justify-between text-stone-400 text-[10px]">
                    <span>{k}</span>
                    <span>max {ch.maxAttrs[k]}</span>
                  </div>
                  <div className="text-sm font-bold text-stone-100">{ch.attrs[k]}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[#090e0b] text-[11px] font-mono-nums text-stone-400">
              <div>Proficiency: <b className="text-stone-200">+{derived.proficiency}</b></div>
              <div>Phys DEF: <b className="text-amber-300">{derived.physDef}</b></div>
              <div>Weapon ATK: <b className="text-red-300">{ch.equippedWeapon?.baseAtk || 5}</b></div>
              <div>Keys: <b className="text-teal-400">{fragments.length}/4</b></div>
            </div>
          </div>

          {/* Soul Corridor Shop */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#202e26]">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide font-display">
                Soul Corridor Shop
              </span>
              <span className="text-xs font-mono-nums text-amber-300 font-bold">
                {ch.walletSR} Wallet SR
              </span>
            </div>

            {(['STR', 'AGI', 'VIT', 'INT'] as const).map(k => {
              const score = ch.attrs[k];
              const cost = score * 6;
              const atCap = score >= ch.maxAttrs[k];
              return (
                <div key={k} className="flex items-center justify-between text-xs p-2 rounded bg-[#0e1612] border border-[#202e26]">
                  <div>
                    <span className="font-bold text-stone-200">{k}</span>: {score} ➔ {score + 1}
                  </div>
                  <button
                    disabled={atCap || ch.walletSR < cost}
                    onClick={() => {
                      if (ch.walletSR < cost || atCap) return;
                      const nextAttrs = { ...ch.attrs, [k]: ch.attrs[k] + 1 };
                      const nextChar = { ...ch, attrs: nextAttrs, walletSR: ch.walletSR - cost };
                      const oldD = deriveStats(ch);
                      const newD = deriveStats(nextChar);
                      nextChar.hp = ch.hp + (newD.maxHp - oldD.maxHp);
                      nextChar.mp = ch.mp + (newD.maxMp - oldD.maxMp);
                      setCh(nextChar);
                      addLog('system', `Soul Corridor: Upgraded ${k} to ${nextAttrs[k]} for ${cost} SR.`);
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-40"
                  >
                    {atCap ? 'Max' : `${cost} SR`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Encounter, Equipment & Combat Actions */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Enemy Card */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-red-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-red-400 font-display text-base block">
                  {mob.name}
                </span>
                <span className="text-xs text-stone-400">
                  {mob.tier} · {mob.element}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-xs font-bold">
                CR {mob.cr}
              </span>
            </div>

            <div className="space-y-1 text-xs font-mono-nums">
              <div className="flex justify-between">
                <span>HP: {mob.hp} / {mob.maxHp}</span>
                <span>Defense: {mob.defense}</span>
              </div>
              <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                <div className="bg-red-600 h-full transition-all" style={{ width: `${(mob.hp / mob.maxHp) * 100}%` }} />
              </div>
            </div>

            <div className="text-[11px] text-stone-400 flex justify-between font-mono-nums">
              <span>Attack: +{mob.cr}</span>
              <span>Damage: +{mob.cr}</span>
              <span>Reward: {Math.min(10 * mob.cr, 3 * mob.cr + 21, mob.cr + 41)} SR</span>
            </div>
          </div>

          {/* Combat Actions */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] space-y-3">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wide font-display block">
              Combat Actions
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isOver || ch.hp <= 0}
                onClick={handlePlayerAttack}
                className="py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-40"
              >
                Attack (2d6 + Attr)
              </button>

              {ch.cls === 'Gana' && (
                <button
                  disabled={isOver || ch.mp < 10}
                  onClick={() => {
                    setCh(c => ({ ...c, mp: c.mp - 10 }));
                    setSummons(s => [...s, { hp: 1 }]);
                    addLog('attack', `${ch.name} calls a 1-HP Beast Familiar token!`);
                    afterPlayerTurn();
                  }}
                  className="py-2.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] font-semibold text-xs disabled:opacity-40"
                >
                  Call Familiar (10 MP)
                </button>
              )}

              {isOver && (
                <button
                  onClick={() => spawnMonster(selectedBiome, selectedTier, cr)}
                  className="py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs col-span-2"
                >
                  Next Monster ➔
                </button>
              )}
            </div>

            {/* Visual Dice Tray */}
            <div className="p-3 rounded-lg bg-[#0c120e] border border-[#202e26]">
              <span className="text-[10px] text-stone-500 uppercase font-bold block mb-1.5">
                Physical Dice Tray
              </span>
              <div className="flex gap-2 flex-wrap min-h-10 items-center">
                {tray.map((die, idx) => (
                  <div key={idx} className="flex flex-col items-center p-1.5 bg-[#17241d] border border-amber-500/40 rounded-lg min-w-10">
                    <span className="text-[9px] text-stone-400 font-mono-nums">d{die.sides}</span>
                    <span className="text-base font-bold text-amber-300 font-mono-nums">{die.value}</span>
                    <span className="text-[8px] text-teal-400">{die.group}</span>
                  </div>
                ))}
                {tray.length === 0 && <span className="text-xs text-stone-500 italic">No dice rolled this turn.</span>}
              </div>
            </div>
          </div>

          {/* Full Player Equipment & Inventory Management */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] space-y-3 text-xs">
            <span className="font-bold text-amber-400 uppercase tracking-wide font-display block">
              Equipped Loadout
            </span>

            {/* Equipped Slots */}
            <div className="p-2.5 rounded bg-[#0e1612] border border-[#202e26] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-stone-400 text-[10px] block">Weapon:</span>
                  <b className="text-amber-300">{ch.equippedWeapon?.name || 'Unarmed Strike (Base 5)'}</b>
                </div>
                {ch.equippedWeapon && (
                  <button
                    onClick={() => handleUnequipItem('weapon')}
                    className="px-2 py-0.5 rounded bg-[#203227] hover:bg-red-950/60 text-stone-300 hover:text-red-300 border border-[#32493a] text-[11px]"
                  >
                    Unequip
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#1a2821]">
                <div>
                  <span className="text-stone-400 text-[10px] block">Armor:</span>
                  <b className="text-emerald-300">{ch.equippedArmor?.name || 'Unarmored'}</b>
                </div>
                {ch.equippedArmor && (
                  <button
                    onClick={() => handleUnequipItem('armor')}
                    className="px-2 py-0.5 rounded bg-[#203227] hover:bg-red-950/60 text-stone-300 hover:text-red-300 border border-[#32493a] text-[11px]"
                  >
                    Unequip
                  </button>
                )}
              </div>
            </div>

            {/* Inventory List */}
            <div className="space-y-1.5 pt-2 border-t border-[#202e26]">
              <span className="text-[10px] text-stone-400 font-bold block uppercase tracking-wider">
                Inventory Pack ({ch.inventory.length} items):
              </span>

              {ch.inventory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-[#0e1612] border border-[#202e26]">
                  <div>
                    <span className="font-semibold text-stone-200">{item.name}</span>
                    <span className="text-[10px] text-stone-400 block">{item.category} · {item.rarity}</span>
                  </div>

                  <div className="flex gap-1.5">
                    {item.category === 'consumable' ? (
                      <>
                        <button
                          disabled={isOver}
                          onClick={() => handleUseConsumable(item, idx, false)}
                          className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-40"
                        >
                          Drink (Turn)
                        </button>
                        <button
                          onClick={() => handleUseConsumable(item, idx, true)}
                          className="px-2 py-0.5 rounded bg-[#203227] hover:bg-[#2b4234] text-teal-300 border border-[#32493a] text-[11px]"
                        >
                          Test (Free)
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleEquipItem(item, idx)}
                        className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px]"
                      >
                        Equip
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {ch.inventory.length === 0 && (
                <p className="text-[11px] text-stone-500 italic p-2 text-center">
                  Pack is empty. Use "Hack Current Match" to spawn any equipment!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Combat Event Log */}
        <div className="flex flex-col p-4 rounded-xl bg-[#090e0b] border border-[#22332a] overflow-hidden">
          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 font-display">
            Action & Math Log (Round {round})
          </span>
          <div className="flex-1 overflow-y-auto space-y-1.5 text-xs font-mono-nums pr-1">
            {log.map((entry, idx) => (
              <div
                key={idx}
                className={`p-1.5 rounded border-l-2 leading-relaxed ${entry.type === 'attack' ? 'border-amber-400 bg-[#121c17]' : entry.type === 'enemy' ? 'border-red-500 bg-[#1c1212]' : entry.type === 'loot' ? 'border-teal-400 bg-[#101b1b]' : 'border-stone-600 bg-[#0f1411]'}`}
              >
                <span className="text-[10px] text-stone-500 mr-1.5">[R{entry.round}]</span>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 9-Card Crucible Deck & Hand Viewer Modal */}
      {isDeckViewerOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-purple-500/60 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#2e3f36]">
              <div>
                <h2 className="text-base font-bold text-purple-300 font-display">
                  🎴 {ch.cls} 9-Card Crucible Format Deck (PvP System)
                </h2>
                <span className="text-xs text-stone-400">
                  3 Attack Cards · 3 Spell Cards · 3 Trap Cards | 1-HP Shatter Rule
                </span>
              </div>
              <button
                onClick={() => setIsDeckViewerOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            {/* Current Drawn Hand */}
            <div className="p-3 bg-[#0d1410] rounded-xl border border-[#22332a]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                  Current Hand ({currentHand.length} cards)
                </span>
                <button
                  onClick={handleDrawHand}
                  className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                >
                  Draw 3-Card Starting Hand
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {currentHand.map((card, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-[#18261e] border border-purple-500/50 flex flex-col justify-between text-xs">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-stone-100">{card.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${card.type === 'Attack' ? 'bg-red-950 text-red-300' : card.type === 'Spell' ? 'bg-sky-950 text-sky-300' : 'bg-amber-950 text-amber-300'}`}>
                          {card.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-300 leading-snug">{card.effect}</p>
                    </div>
                    <button
                      onClick={() => handlePlayCard(card, idx)}
                      className="mt-2 w-full py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px]"
                    >
                      {card.type === 'Trap' ? 'Set Face-Down' : 'Play Card'}
                    </button>
                  </div>
                ))}
                {currentHand.length === 0 && (
                  <p className="text-xs text-stone-500 italic col-span-3 text-center py-4">
                    Hand is empty. Click "Draw 3-Card Starting Hand" to test card combat.
                  </p>
                )}
              </div>
            </div>

            {/* Active Face-Down Traps */}
            {activeTraps.length > 0 && (
              <div className="p-2.5 bg-[#1b1522] rounded-lg border border-amber-500/40 text-xs">
                <span className="font-bold text-amber-300 block mb-1">Active Set Traps (Face-Down):</span>
                <div className="flex gap-2 flex-wrap">
                  {activeTraps.map((t, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-amber-950 text-amber-300 border border-amber-700 text-[11px]">
                      🔒 {t.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Full 9-Card Reference */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                Class Deck Manifest ({CLASS_PVP_DECKS[ch.cls]?.length || 0} Cards):
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(CLASS_PVP_DECKS[ch.cls] || []).map(card => (
                  <div key={card.id} className="p-2.5 rounded-lg bg-[#0e1612] border border-[#202e26] text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <b className="text-stone-200">{card.title}</b>
                      <span className={`text-[9px] px-1 rounded ${card.type === 'Attack' ? 'text-red-400' : card.type === 'Spell' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {card.type}
                      </span>
                    </div>
                    {card.range && <div className="text-[10px] text-teal-400">Range: {card.range} tiles</div>}
                    <p className="text-[11px] text-stone-400 leading-relaxed">{card.effect}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Defeat Resolution Modal */}
      {isDefeatedModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-red-500/60 shadow-2xl max-w-md w-full space-y-4">
            <h2 className="text-lg font-bold text-red-400 font-display">
              💔 {ch.name} Has Fallen! (0 HP)
            </h2>
            <p className="text-xs text-stone-300">
              The character is incapacitated. How would you like to resolve this defeat for testing?
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setCh(c => ({ ...c, hp: derived.maxHp, mp: derived.maxMp }));
                  setIsDefeatedModalOpen(false);
                  addLog('system', `GM Revived ${ch.name} at full HP/MP.`);
                }}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Revive Here (Full HP/MP, Continue Fight)
              </button>

              <button
                onClick={() => {
                  const newLives = ch.lives - 1;
                  const lostWallet = Math.floor(ch.walletSR * tuning.walletLossFraction);
                  setCh(c => ({
                    ...c,
                    lives: Math.max(0, newLives),
                    hp: derived.maxHp,
                    mp: derived.maxMp,
                    walletSR: c.walletSR - lostWallet
                  }));
                  setIsDefeatedModalOpen(false);
                  spawnMonster(selectedBiome, selectedTier, cr);
                  addLog('death', `Respawned at Start: Lost 1 Life (${newLives} left), lost ${lostWallet} SR.`);
                }}
                className="w-full py-2 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] font-semibold text-xs"
              >
                Respawn at Start (Standard 3-Life Rule)
              </button>

              <button
                onClick={() => {
                  setIsDefeatedModalOpen(false);
                  handleResetSimulation();
                }}
                className="w-full py-1.5 rounded-lg bg-[#1a2820] hover:bg-red-950 text-stone-400 hover:text-red-300 border border-[#2e4235] text-xs"
              >
                Full Wipe & Reset Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GM Match Hack / Combat Sandbox Modal (Includes Champion, Biome, Monster, CR, +SR, and Equipment Spawner) */}
      {isHackModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-[#2e3f36]">
              <h2 className="text-base font-bold text-amber-400 font-display">
                ⚡ GM Match Hack & Combat Sandbox
              </h2>
              <button
                onClick={() => setIsHackModalOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            {/* Quick Match Overrides: Champion, Biome, Monster, CR */}
            <div className="p-3 bg-[#0d1410] rounded-xl border border-[#22332a] space-y-3">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wide block">
                Encounter & Champion Overrides
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="text-stone-400 block mb-0.5">Champion</label>
                  <select
                    value={selectedChamp}
                    onChange={e => {
                      const k = e.target.value as any;
                      setSelectedChamp(k);
                      const base = CHAMPIONS[k as keyof typeof CHAMPIONS];
                      setCh(c => ({
                        ...c,
                        name: base.name,
                        cls: base.cls,
                        element: base.homeElement,
                        attrs: { ...base.attrs },
                        maxAttrs: { ...base.max }
                      }));
                    }}
                    className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1 text-stone-100"
                  >
                    {Object.entries(CHAMPIONS).map(([k, c]) => (
                      <option key={k} value={k}>{c.name} ({c.cls})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-stone-400 block mb-0.5">Biome</label>
                  <select
                    value={selectedBiome}
                    onChange={e => {
                      const b = e.target.value as any;
                      setSelectedBiome(b);
                      spawnMonster(b, selectedTier, cr);
                    }}
                    className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1 text-stone-100"
                  >
                    {Object.entries(BIOMES).map(([k, b]) => (
                      <option key={k} value={k}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-stone-400 block mb-0.5">Monster Tier</label>
                  <select
                    value={selectedTier}
                    onChange={e => {
                      const t = e.target.value as any;
                      setSelectedTier(t);
                      const newCr = TIER_CR[t];
                      setCr(newCr);
                      spawnMonster(selectedBiome, t, newCr);
                    }}
                    className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1 text-stone-100"
                  >
                    <option value="easy">Easy (CR 1)</option>
                    <option value="medium">Medium (CR 4)</option>
                    <option value="hard">Hard (CR 8)</option>
                    <option value="guardian">Guardian (CR 12)</option>
                  </select>
                </div>

                <div>
                  <label className="text-stone-400 block mb-0.5">Monster CR</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={cr}
                    onChange={e => {
                      const v = Math.max(1, Math.min(20, +e.target.value));
                      setCr(v);
                      spawnMonster(selectedBiome, selectedTier, v);
                    }}
                    className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1 text-stone-100 font-mono-nums"
                  />
                </div>
              </div>

              {/* + SR Input and Button */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#1a2821] text-xs">
                <span className="text-stone-300 font-semibold">Add SR:</span>
                <input
                  type="number"
                  value={hackSrAdd}
                  onChange={e => setHackSrAdd(+e.target.value)}
                  className="w-24 bg-[#1b2b22] border border-[#2e4235] rounded px-2 py-1 text-stone-100 font-mono-nums"
                />
                <button
                  onClick={() => {
                    setCh(c => ({
                      ...c,
                      totalSR: c.totalSR + hackSrAdd,
                      walletSR: c.walletSR + hackSrAdd
                    }));
                    addLog('system', `GM granted +${hackSrAdd} SR.`);
                  }}
                  className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold"
                >
                  + Add SR
                </button>
              </div>
            </div>

            {/* Equipment & Item Spawner (Synced with Item Forge) */}
            <div className="p-3 bg-[#0d1410] rounded-xl border border-[#22332a] space-y-2 text-xs">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wide block">
                Equipment Spawner (Direct to Inventory)
              </span>
              <p className="text-[11px] text-stone-400">
                Spawn any weapon, armor, or consumable into the character's inventory pack:
              </p>

              <div className="flex gap-2">
                <select
                  value={selectedItemToSpawn}
                  onChange={e => setSelectedItemToSpawn(e.target.value)}
                  className="flex-1 bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100"
                >
                  {allItems.map(it => (
                    <option key={it.id} value={it.id}>
                      [{it.category.toUpperCase()}] {it.name} ({it.rarity} - {it.biome})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const found = allItems.find(i => i.id === selectedItemToSpawn) || allItems[0];
                    if (found) {
                      setCh(c => ({
                        ...c,
                        inventory: [...c.inventory, found]
                      }));
                      addLog('loot', `GM added ${found.name} (${found.category}) directly to Inventory.`);
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold whitespace-nowrap"
                >
                  + Add to Inventory
                </button>
              </div>
            </div>

            {/* Direct Stat & HP/MP Overrides */}
            <div className="space-y-3 text-xs font-mono-nums">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 block mb-1">Player HP</label>
                  <input
                    type="number"
                    value={ch.hp}
                    onChange={e => setCh({ ...ch, hp: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Player MP</label>
                  <input
                    type="number"
                    value={ch.mp}
                    onChange={e => setCh({ ...ch, mp: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-stone-400 block mb-1">Lives (♥)</label>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={ch.lives}
                    onChange={e => setCh({ ...ch, lives: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Wallet SR</label>
                  <input
                    type="number"
                    value={ch.walletSR}
                    onChange={e => setCh({ ...ch, walletSR: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">1-HP Summons</label>
                  <input
                    type="number"
                    min={0}
                    value={summons.length}
                    onChange={e => {
                      const count = Math.max(0, +e.target.value);
                      setSummons(Array.from({ length: count }, () => ({ hp: 1 })));
                    }}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#202e26]">
                <div>
                  <label className="text-stone-400 block mb-1">Mob HP</label>
                  <input
                    type="number"
                    value={mob.hp}
                    onChange={e => setMob({ ...mob, hp: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Mob Defense (DV)</label>
                  <input
                    type="number"
                    value={mob.defense}
                    onChange={e => setMob({ ...mob, defense: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GM Math Tuning Panel Modal */}
      {isTuningPanelOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-teal-500/50 shadow-2xl max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-teal-400 font-display">
                ⚙ GM Live Math Tuning (Saved Independently)
              </h2>
              <button
                onClick={() => setIsTuningPanelOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-stone-300">
              Tune all core scaling formulas live. These changes are saved separately for testing and will not affect the main playtest table.
            </p>

            <div className="space-y-3 text-xs font-mono-nums">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 block mb-1">Mob HP Base</label>
                  <input
                    type="number"
                    value={tuning.mobHpBase}
                    onChange={e => setTuning({ ...tuning, mobHpBase: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Mob HP per CR</label>
                  <input
                    type="number"
                    value={tuning.mobHpPerCr}
                    onChange={e => setTuning({ ...tuning, mobHpPerCr: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 block mb-1">Mob Base DEF</label>
                  <input
                    type="number"
                    value={tuning.mobDefBase}
                    onChange={e => setTuning({ ...tuning, mobDefBase: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Death Wallet Loss %</label>
                  <input
                    type="number"
                    step="0.05"
                    value={tuning.walletLossFraction}
                    onChange={e => setTuning({ ...tuning, walletLossFraction: +e.target.value })}
                    className="w-full bg-[#0c120e] border border-[#2e4235] rounded p-1.5 text-stone-100"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setTuning(DEFAULT_TUNING);
                  alert('Reset to default GDD formulas.');
                }}
                className="w-full py-1.5 rounded bg-[#203227] hover:bg-[#2b4234] text-stone-300 border border-[#32493a] text-xs"
              >
                Reset Tuning to Canon Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
