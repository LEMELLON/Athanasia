import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItemEntity, CharacterClass, ElementType } from '../types/game';
import { CLASS_PVP_DECKS, PvPCard } from '../data/pvpCards';

interface Props {
  allItems?: ItemEntity[];
}

const SANDBOX_STORAGE_KEY = 'arcana_sandbox_balance_save_v2';

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

const CHAMPIONS: Record<string, {
  name: string;
  cls: CharacterClass;
  attrs: { STR: number; AGI: number; VIT: number; INT: number };
  max: { STR: number; AGI: number; VIT: number; INT: number };
  homeElement: ElementType;
}> = {
  atalanta: { name: 'Atalanta', cls: 'Cana', attrs: { STR: 2, AGI: 3, VIT: 1, INT: 1 }, max: { STR: 15, AGI: 20, VIT: 15, INT: 15 }, homeElement: 'Aero' },
  achilles: { name: 'Achilles', cls: 'Bhana', attrs: { STR: 3, AGI: 1, VIT: 2, INT: 1 }, max: { STR: 20, AGI: 10, VIT: 15, INT: 10 }, homeElement: 'Pyris' },
  medea: { name: 'Medea', cls: 'Prana', attrs: { STR: 1, AGI: 1, VIT: 2, INT: 3 }, max: { STR: 10, AGI: 10, VIT: 15, INT: 20 }, homeElement: 'Aquis' },
  orpheus: { name: 'Orpheus', cls: 'Gana', attrs: { STR: 1, AGI: 2, VIT: 1, INT: 3 }, max: { STR: 10, AGI: 15, VIT: 10, INT: 20 }, homeElement: 'Fulgo' },
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

const PROFICIENCY = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

interface DuelistState {
  name: string;
  cls: CharacterClass;
  element: ElementType;
  level: number;
  attrs: { STR: number; AGI: number; VIT: number; INT: number };
  maxAttrs: { STR: number; AGI: number; VIT: number; INT: number };
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  totalSR: number;
  walletSR: number;
  lives: number;
  equippedWeapon: ItemEntity | null;
  equippedArmor: ItemEntity | null;
  inventory: ItemEntity[];
  deck: PvPCard[];
  hand: PvPCard[];
  discard: PvPCard[];
  traps: { card: PvPCard; isRevealed: boolean }[];
  summons: { hp: number }[];
  shieldActive: boolean;
}

const DEFAULT_POTIONS: ItemEntity[] = [
  {
    id: 'pot_hp_basic',
    name: 'Basic Health Potion',
    category: 'consumable',
    rarity: 'Common',
    biome: 'Universal',
    classReq: 'All',
    healHpPct: 25,
    description: 'Restores 25% of Max HP.'
  },
  {
    id: 'pot_mp_basic',
    name: 'Basic Mana Potion',
    category: 'consumable',
    rarity: 'Common',
    biome: 'Universal',
    classReq: 'All',
    restoreMpPct: 25,
    description: 'Restores 25% of Max MP.'
  }
];

// Helper to shuffle cards
function shuffleCards(cards: PvPCard[]): PvPCard[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDuelist(champKey: keyof typeof CHAMPIONS, defaultSr = 100): DuelistState {
  const base = CHAMPIONS[champKey];
  const prof = PROFICIENCY[0];
  const maxHp = 20 + base.attrs.VIT * (prof + 1) + base.attrs.STR * 2;
  const maxMp = 10 + base.attrs.INT * 5;
  const initialDeck = shuffleCards(CLASS_PVP_DECKS[base.cls] || CLASS_PVP_DECKS.Bhana);

  return {
    name: base.name,
    cls: base.cls,
    element: base.homeElement,
    level: 1,
    attrs: { ...base.attrs },
    maxAttrs: { ...base.max },
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    totalSR: 0,
    walletSR: defaultSr,
    lives: 3,
    equippedWeapon: null,
    equippedArmor: null,
    inventory: [...DEFAULT_POTIONS],
    deck: initialDeck.slice(3),
    hand: initialDeck.slice(0, 3),
    discard: [],
    traps: [],
    summons: [],
    shieldActive: false
  };
}

export const BalanceAnalytics: React.FC<Props> = ({ allItems = [] }) => {
  // Mode Switcher: 'pve' = Monster Encounters, 'pvp' = Crucible 1v1 Arena
  const [analyticsMode, setAnalyticsMode] = useState<'pve' | 'pvp'>('pve');

  // Modals
  const [isHackModalOpen, setIsHackModalOpen] = useState(false);
  const [hackTarget, setHackTarget] = useState<'p1' | 'p2' | 'mob'>('p1');
  const [isDefeatedModalOpen, setIsDefeatedModalOpen] = useState(false);
  const [isDeckViewerOpen, setIsDeckViewerOpen] = useState(false);
  const [deckViewerTarget, setDeckViewerTarget] = useState<'p1' | 'p2'>('p1');

  // PvE Setup State
  const [selectedBiome, setSelectedBiome] = useState<keyof typeof BIOMES>('pyria');
  const [selectedTier, setSelectedTier] = useState<'easy' | 'medium' | 'hard' | 'guardian'>('easy');
  const [cr, setCr] = useState<number>(1);

  // Both Players in the System (Player 1 = Challenger, Player 2 = Defender/Rival)
  const [p1, setP1] = useState<DuelistState>(() => createDuelist('achilles', 120));
  const [p2, setP2] = useState<DuelistState>(() => createDuelist('atalanta', 100));

  // Turn tracking for PvP
  const [pvpTurn, setPvpTurn] = useState<'p1' | 'p2'>('p1');
  const [pvpRound, setPvpRound] = useState(1);
  const [pvpWinner, setPvpWinner] = useState<string | null>(null);
  const [wagerAmount, setWagerAmount] = useState(50);

  // PvE Monster State
  const [mob, setMob] = useState(() => {
    const b = BIOMES['pyria'];
    const name = MOBS['pyria']['easy'];
    const mhp = 15 + 8 * 1;
    const mdef = 6 + Math.floor(1 / 2);
    return { name, biome: 'pyria', tier: 'easy', cr: 1, element: b.element, hp: mhp, maxHp: mhp, defense: mdef };
  });

  const [isPveOver, setIsPveOver] = useState(false);
  const [log, setLog] = useState<{ type: string; text: string; round: number }[]>([]);
  const [tray, setTray] = useState<{ sides: number; value: number; label: string; group?: string }[]>([]);

  // Hack Item Spawner Selection
  const [selectedItemToSpawn, setSelectedItemToSpawn] = useState<string>(allItems[0]?.id || '');
  const [hackSrAdd, setHackSrAdd] = useState<number>(100);

  const rngRef = useRef(createMulberry32(Date.now() % 100000));

  const addLog = (type: string, text: string) => {
    setLog(prev => [...prev.slice(-90), { type, text, round: pvpRound }]);
  };

  const getProficiency = (lvl: number) => PROFICIENCY[Math.min(20, Math.max(1, lvl)) - 1];

  const getStatMod = (attrs: { STR: number; AGI: number; VIT: number; INT: number }, key?: string): number => {
    if (key === 'AGI') return attrs.AGI;
    if (key === 'VIT') return attrs.VIT;
    if (key === 'INT') return attrs.INT;
    return attrs.STR || 0;
  };

  const deriveStats = (player: DuelistState) => {
    const prof = getProficiency(player.level);
    const m = (k: keyof typeof player.attrs) => player.attrs[k];
    const armBonus = player.equippedArmor?.baseAc || 0;
    const maxHp = 20 + m('VIT') * (prof + 1) + m('STR') * 2;
    const maxMp = 10 + m('INT') * 5;
    const physDef = m('VIT') * 2 + armBonus;
    const magDef = m('INT') * 2;
    const speed = 1 + Math.floor(player.attrs.AGI / 5);

    return { proficiency: prof, maxHp, maxMp, physDef, magDef, speed };
  };

  const p1Derived = useMemo(() => deriveStats(p1), [p1.attrs, p1.level, p1.equippedArmor]);
  const p2Derived = useMemo(() => deriveStats(p2), [p2.attrs, p2.level, p2.equippedArmor]);

  // Sync HP / MP when max changes
  useEffect(() => {
    if (p1.hp > p1Derived.maxHp) setP1(p => ({ ...p, hp: p1Derived.maxHp, maxHp: p1Derived.maxHp }));
    if (p1.mp > p1Derived.maxMp) setP1(p => ({ ...p, mp: p1Derived.maxMp, maxMp: p1Derived.maxMp }));
  }, [p1Derived.maxHp, p1Derived.maxMp]);

  useEffect(() => {
    if (p2.hp > p2Derived.maxHp) setP2(p => ({ ...p, hp: p2Derived.maxHp, maxHp: p2Derived.maxHp }));
    if (p2.mp > p2Derived.maxMp) setP2(p => ({ ...p, mp: p2Derived.maxMp, maxMp: p2Derived.maxMp }));
  }, [p2Derived.maxHp, p2Derived.maxMp]);

  // --------------------------------------------------------------------------
  // PvP Arena Action Handlers
  // --------------------------------------------------------------------------

  // Reset or initialize PvP match
  const handleResetPvp = () => {
    setP1(prev => {
      const deck = shuffleCards(CLASS_PVP_DECKS[prev.cls] || CLASS_PVP_DECKS.Bhana);
      return {
        ...prev,
        hp: p1Derived.maxHp,
        mp: p1Derived.maxMp,
        deck: deck.slice(3),
        hand: deck.slice(0, 3),
        discard: [],
        traps: [],
        summons: [],
        shieldActive: false
      };
    });

    setP2(prev => {
      const deck = shuffleCards(CLASS_PVP_DECKS[prev.cls] || CLASS_PVP_DECKS.Cana);
      return {
        ...prev,
        hp: p2Derived.maxHp,
        mp: p2Derived.maxMp,
        deck: deck.slice(3),
        hand: deck.slice(0, 3),
        discard: [],
        traps: [],
        summons: [],
        shieldActive: false
      };
    });

    setPvpTurn('p1');
    setPvpRound(1);
    setPvpWinner(null);
    setTray([]);
    addLog('system', `⚔ [PvP Reset] New Crucible Duel between ${p1.name} and ${p2.name} started.`);
  };

  // Pass / End Turn in PvP
  const handleEndTurn = () => {
    const isP1 = pvpTurn === 'p1';
    const active = isP1 ? p1 : p2;
    const setActive = isP1 ? setP1 : setP2;
    const nextTurn = isP1 ? 'p2' : 'p1';

    // Draw 1 card if deck has remaining cards
    setActive(prev => {
      if (prev.deck.length > 0) {
        const [drawn, ...rest] = prev.deck;
        addLog('system', `${prev.name} drew [${drawn.title}] at end of turn.`);
        return {
          ...prev,
          hand: [...prev.hand, drawn],
          deck: rest
        };
      } else {
        addLog('system', `${prev.name}'s deck is exhausted! No cards drawn.`);
        return prev;
      }
    });

    if (!isP1) {
      setPvpRound(r => r + 1);
    }
    setPvpTurn(nextTurn);
    addLog('turn', `--- Turn passed to ${nextTurn === 'p1' ? p1.name : p2.name} ---`);
  };

  // Standard Basic Attack
  const handleBasicAttack = (attackerKey: 'p1' | 'p2') => {
    const isP1 = attackerKey === 'p1';
    const attacker = isP1 ? p1 : p2;
    const defender = isP1 ? p2 : p1;
    const setDefender = isP1 ? setP2 : setP1;
    const defStats = isP1 ? p2Derived : p1Derived;

    const r1 = rngRef.current.roll(6);
    const r2 = rngRef.current.roll(6);
    const sum = r1 + r2;

    const scaleStat = attacker.equippedWeapon?.scalingStat || 'STR';
    const statMod = getStatMod(attacker.attrs, scaleStat);
    const weaponDamage = attacker.equippedWeapon?.baseAtk || 2;
    const totalAttack = sum + statMod;

    setTray([
      { sides: 6, value: r1, label: 'd6 A' },
      { sides: 6, value: r2, label: 'd6 B' },
      { sides: 20, value: totalAttack, label: 'Total Attack' }
    ]);

    addLog('attack', `⚔ ${attacker.name} strikes with basic attack! Rolled ${r1}+${r2} (+${statMod} ${scaleStat}) = ${totalAttack} vs ${defender.name}'s DEF ${defStats.physDef}.`);

    // Check Defender's Face-Down Traps
    if (defender.traps.length > 0) {
      const trap = defender.traps[0];
      setDefender(prev => ({
        ...prev,
        traps: prev.traps.slice(1),
        discard: [...prev.discard, trap.card]
      }));
      addLog('trap', `🂠 [TRAP TRIGGERED] ${defender.name}'s face-down [${trap.card.title}] activates: "${trap.card.effect}"! Strike deflected!`);
      handleEndTurn();
      return;
    }

    // Check 1-HP Summons Shatter Rule
    if (defender.summons.length > 0) {
      setDefender(prev => ({ ...prev, summons: prev.summons.slice(1) }));
      addLog('damage', `🛡 ${defender.name}'s 1-HP Familiar shatters! It completely absorbs the entire blow with 0 bleed-through!`);
      handleEndTurn();
      return;
    }

    if (totalAttack >= defStats.physDef) {
      const netDamage = Math.max(1, (totalAttack - defStats.physDef) + weaponDamage);
      const newHp = Math.max(0, defender.hp - netDamage);
      setDefender(prev => ({ ...prev, hp: newHp }));
      addLog('damage', `💥 Direct Hit! ${attacker.name} deals ${netDamage} physical damage to ${defender.name} (Remaining HP: ${newHp}/${defStats.maxHp}).`);

      if (newHp <= 0) {
        handleDuelVictory(attackerKey);
        return;
      }
    } else {
      addLog('combat', `🛡 Glancing blow! ${defender.name}'s armor deflects the strike completely.`);
    }

    handleEndTurn();
  };

  // Play Card from Hand
  const handlePlayCard = (playerKey: 'p1' | 'p2', card: PvPCard, cardIdx: number) => {
    const isP1 = playerKey === 'p1';
    const player = isP1 ? p1 : p2;
    const setPlayer = isP1 ? setP1 : setP2;
    const target = isP1 ? p2 : p1;
    const setTarget = isP1 ? setP2 : setP1;
    const targetStats = isP1 ? p2Derived : p1Derived;

    // Check MP if spell
    if (card.type === 'Spell') {
      const mpCost = 6;
      if (player.mp < mpCost) {
        addLog('warning', `❌ Not enough MP to cast [${card.title}]! Requires ${mpCost} MP.`);
        return;
      }
      setPlayer(p => ({ ...p, mp: p.mp - mpCost }));
    }

    // Remove from hand and add to discard or trap field
    setPlayer(p => ({
      ...p,
      hand: p.hand.filter((_, idx) => idx !== cardIdx),
      discard: card.type !== 'Trap' ? [...p.discard, card] : p.discard,
      traps: card.type === 'Trap' ? [...p.traps, { card, isRevealed: false }] : p.traps
    }));

    if (card.type === 'Trap') {
      addLog('trap', `🂠 ${player.name} sets a secret card face-down onto the battlefield!`);
      handleEndTurn();
      return;
    }

    if (card.type === 'Attack') {
      const r1 = rngRef.current.roll(6);
      const r2 = rngRef.current.roll(6);
      const scaleStat = player.cls === 'Cana' ? 'AGI' : player.cls === 'Prana' ? 'INT' : 'STR';
      const mod = player.attrs[scaleStat];
      const rollTotal = r1 + r2 + mod;

      setTray([
        { sides: 6, value: r1, label: 'd6 A' },
        { sides: 6, value: r2, label: 'd6 B' },
        { sides: 20, value: rollTotal, label: 'Card Attack' }
      ]);

      addLog('attack', `⚔ ${player.name} executes [${card.title}]! Roll: ${r1}+${r2} (+${mod} ${scaleStat}) = ${rollTotal} vs ${target.name}'s DEF ${targetStats.physDef}.`);

      // Check Target Face-Down Traps
      if (target.traps.length > 0) {
        const triggered = target.traps[0];
        setTarget(t => ({
          ...t,
          traps: t.traps.slice(1),
          discard: [...t.discard, triggered.card]
        }));
        addLog('trap', `🂠 [TRAP SPRUNG] ${target.name}'s [${triggered.card.title}] triggers: "${triggered.card.effect}"! Attack countered!`);
        handleEndTurn();
        return;
      }

      // 1-HP token absorb
      if (target.summons.length > 0) {
        setTarget(t => ({ ...t, summons: t.summons.slice(1) }));
        addLog('damage', `🛡 ${target.name}'s 1-HP Summon intercepts [${card.title}] and shatters with 0 bleed-through!`);
        handleEndTurn();
        return;
      }

      const rawDamage = Math.max(3, rollTotal - targetStats.physDef + 4);
      const newHp = Math.max(0, target.hp - rawDamage);
      setTarget(t => ({ ...t, hp: newHp }));
      addLog('damage', `💥 [${card.title}] hits for ${rawDamage} damage! ${target.name} HP: ${newHp}/${targetStats.maxHp}.`);

      if (newHp <= 0) {
        handleDuelVictory(playerKey);
        return;
      }
    }

    if (card.type === 'Spell') {
      addLog('spell', `✦ ${player.name} casts [${card.title}]: "${card.effect}"!`);

      // If card mentions token/summon (e.g. Orpheus, Gana)
      if (card.effect.toLowerCase().includes('familiar') || card.effect.toLowerCase().includes('token') || card.effect.toLowerCase().includes('decoy')) {
        setPlayer(p => ({ ...p, summons: [...p.summons, { hp: 1 }] }));
        addLog('system', `🛡 ${player.name} placed a 1-HP barrier token on the field.`);
      }

      // If card deals direct spell damage
      if (card.effect.toLowerCase().includes('damage') || card.effect.toLowerCase().includes('burn') || card.effect.toLowerCase().includes('shock')) {
        const spellDmg = Math.max(4, 6 + player.attrs.INT);
        const newHp = Math.max(0, target.hp - spellDmg);
        setTarget(t => ({ ...t, hp: newHp }));
        addLog('damage', `⚡ Arcane surge deals ${spellDmg} magical damage to ${target.name}! HP: ${newHp}/${targetStats.maxHp}.`);
        if (newHp <= 0) {
          handleDuelVictory(playerKey);
          return;
        }
      }
    }

    handleEndTurn();
  };

  // Victory Resolution
  const handleDuelVictory = (victorKey: 'p1' | 'p2') => {
    const victor = victorKey === 'p1' ? p1 : p2;
    const loser = victorKey === 'p1' ? p2 : p1;
    const pot = Math.min(wagerAmount, p1.walletSR) + Math.min(wagerAmount, p2.walletSR);

    // Victor gets the wager pot into walletSR
    if (victorKey === 'p1') {
      setP1(p => ({ ...p, walletSR: p.walletSR + Math.min(wagerAmount, p2.walletSR) }));
      setP2(p => ({ ...p, walletSR: Math.max(0, p.walletSR - Math.min(wagerAmount, p.walletSR)) }));
    } else {
      setP2(p => ({ ...p, walletSR: p.walletSR + Math.min(wagerAmount, p1.walletSR) }));
      setP1(p => ({ ...p, walletSR: Math.max(0, p.walletSR - Math.min(wagerAmount, p.walletSR)) }));
    }

    setPvpWinner(victor.name);
    addLog('system', `👑 [DUEL RESOLUTION] ${victor.name} emerged victorious! Claimed ${pot} Wallet SR pot from ${loser.name}. Campaign lives preserved (0 lost).`);
  };

  // GM Auto-Play Turn (Simulate AI for testing balance)
  const handleAutoPlay = (playerKey: 'p1' | 'p2') => {
    const isP1 = playerKey === 'p1';
    const player = isP1 ? p1 : p2;

    // 1. Play attack card if available
    const attackIdx = player.hand.findIndex(c => c.type === 'Attack');
    if (attackIdx >= 0) {
      handlePlayCard(playerKey, player.hand[attackIdx], attackIdx);
      return;
    }

    // 2. Play spell card if enough MP
    const spellIdx = player.hand.findIndex(c => c.type === 'Spell');
    if (spellIdx >= 0 && player.mp >= 6) {
      handlePlayCard(playerKey, player.hand[spellIdx], spellIdx);
      return;
    }

    // 3. Play trap card
    const trapIdx = player.hand.findIndex(c => c.type === 'Trap');
    if (trapIdx >= 0 && player.traps.length === 0) {
      handlePlayCard(playerKey, player.hand[trapIdx], trapIdx);
      return;
    }

    // 4. Default to basic attack
    handleBasicAttack(playerKey);
  };

  // --------------------------------------------------------------------------
  // PvE Monster Simulation Handlers
  // --------------------------------------------------------------------------
  const spawnMonster = (biomeKey: keyof typeof BIOMES, tierKey: 'easy' | 'medium' | 'hard' | 'guardian', targetCr: number) => {
    const b = BIOMES[biomeKey];
    const name = tierKey === 'guardian' ? `${b.guardian} (Guardian)` : MOBS[biomeKey][tierKey];
    const mhp = 15 + 8 * targetCr;
    const mdef = 6 + Math.floor(targetCr / 2);
    setMob({ name, biome: biomeKey, tier: tierKey, cr: targetCr, element: b.element, hp: mhp, maxHp: mhp, defense: mdef });
    setIsPveOver(false);
    addLog('system', `⚔ Encampment encountered: [CR ${targetCr} ${tierKey.toUpperCase()}] ${name} (${b.element.toUpperCase()}) in ${b.name}.`);
  };

  const handlePveAttack = () => {
    if (isPveOver || p1.hp <= 0) return;
    const r1 = rngRef.current.roll(6);
    const r2 = rngRef.current.roll(6);
    const sum = r1 + r2;
    const scaleStat = p1.equippedWeapon?.scalingStat || 'STR';
    const statMod = getStatMod(p1.attrs, scaleStat);
    const totalAtk = sum + statMod;

    setTray([
      { sides: 6, value: r1, label: 'd6 A' },
      { sides: 6, value: r2, label: 'd6 B' },
      { sides: 20, value: totalAtk, label: 'Player Attack' }
    ]);

    addLog('attack', `⚔ ${p1.name} strikes with 2d6 + ${statMod} (${scaleStat}) = ${totalAtk} vs Mob Defense ${mob.defense}.`);

    if (totalAtk >= mob.defense) {
      const dmg = Math.max(1, (totalAtk - mob.defense) + (p1.equippedWeapon?.baseAtk || 3));
      const mult = getElementMultiplier(p1.element.toLowerCase(), mob.element.toLowerCase());
      const finalDmg = Math.round(dmg * mult);

      const newHp = Math.max(0, mob.hp - finalDmg);
      setMob(m => ({ ...m, hp: newHp }));
      addLog('damage', `💥 Direct Hit! Dealt ${finalDmg} damage to ${mob.name} (${newHp}/${mob.maxHp} HP).`);

      if (newHp <= 0) {
        setIsPveOver(true);
        const rewardSr = Math.min(10 * mob.cr, 3 * mob.cr + 21, mob.cr + 41);
        setP1(p => ({ ...p, walletSR: p.walletSR + rewardSr, totalSR: p.totalSR + rewardSr }));
        addLog('loot', `🎉 ${mob.name} slain! Awarded ${rewardSr} SR.`);
        return;
      }
    } else {
      addLog('combat', `🛡 Miss! ${mob.name} evaded or deflected the blow.`);
    }

    // Mob counter-attacks
    setTimeout(() => {
      const mobDmg = Math.max(2, mob.cr * 2 + 1);
      const newHp = Math.max(0, p1.hp - mobDmg);
      setP1(p => ({ ...p, hp: newHp }));
      addLog('damage', `🩸 ${mob.name} counter-attacks for ${mobDmg} damage! ${p1.name} HP: ${newHp}/${p1Derived.maxHp}.`);
      if (newHp <= 0) {
        setIsDefeatedModalOpen(true);
      }
    }, 300);
  };

  // --------------------------------------------------------------------------
  // Inventory & Consumable Handlers (Applicable to P1 or P2)
  // --------------------------------------------------------------------------
  const handleUseConsumable = (targetKey: 'p1' | 'p2', item: ItemEntity, itemIdx: number, consumesTurn: boolean) => {
    const isP1 = targetKey === 'p1';
    const player = isP1 ? p1 : p2;
    const setPlayer = isP1 ? setP1 : setP2;
    const stats = isP1 ? p1Derived : p2Derived;

    let healVal = 0;
    let restoreMp = 0;

    if (item.healHpPct) {
      healVal = Math.round((stats.maxHp * item.healHpPct) / 100);
    }
    if (item.restoreMpPct) {
      restoreMp = Math.round((stats.maxMp * item.restoreMpPct) / 100);
    }

    setPlayer(p => ({
      ...p,
      hp: Math.min(stats.maxHp, p.hp + healVal),
      mp: Math.min(stats.maxMp, p.mp + restoreMp),
      inventory: p.inventory.filter((_, idx) => idx !== itemIdx)
    }));

    addLog('item', `🧪 ${player.name} consumed [${item.name}]! Restored +${healVal} HP, +${restoreMp} MP. (${consumesTurn ? 'Turn Consumed' : 'Test Sandbox: 0 Turn Cost'})`);

    if (consumesTurn && analyticsMode === 'pvp' && pvpTurn === targetKey) {
      handleEndTurn();
    }
  };

  const handleEquipItem = (targetKey: 'p1' | 'p2', item: ItemEntity, itemIdx: number) => {
    const isP1 = targetKey === 'p1';
    const setPlayer = isP1 ? setP1 : setP2;

    setPlayer(prev => {
      const newInv = prev.inventory.filter((_, i) => i !== itemIdx);
      if (item.category === 'weapon') {
        if (prev.equippedWeapon) newInv.push(prev.equippedWeapon);
        return { ...prev, equippedWeapon: item, inventory: newInv };
      } else if (item.category === 'armor' || item.category === 'shield') {
        if (prev.equippedArmor) newInv.push(prev.equippedArmor);
        return { ...prev, equippedArmor: item, inventory: newInv };
      }
      return prev;
    });

    addLog('equipment', `🛡 Equipped [${item.name}] onto ${targetKey === 'p1' ? p1.name : p2.name}.`);
  };

  const handleUnequipItem = (targetKey: 'p1' | 'p2', slot: 'weapon' | 'armor') => {
    const isP1 = targetKey === 'p1';
    const setPlayer = isP1 ? setP1 : setP2;

    setPlayer(prev => {
      const item = slot === 'weapon' ? prev.equippedWeapon : prev.equippedArmor;
      if (!item) return prev;
      return {
        ...prev,
        [slot === 'weapon' ? 'equippedWeapon' : 'equippedArmor']: null,
        inventory: [...prev.inventory, item]
      };
    });
    addLog('equipment', `Unequipped ${slot} from ${targetKey === 'p1' ? p1.name : p2.name}.`);
  };

  const handleSpawnItemIntoPlayer = (targetKey: 'p1' | 'p2') => {
    const found = allItems.find(i => i.id === selectedItemToSpawn) || allItems[0];
    if (!found) return;

    const setPlayer = targetKey === 'p1' ? setP1 : setP2;
    setPlayer(p => ({ ...p, inventory: [...p.inventory, found] }));
    addLog('loot', `🎁 GM spawned [${found.name}] into ${targetKey === 'p1' ? p1.name : p2.name}'s inventory.`);
  };

  // Change Champion Preset for P1 or P2
  const handleChangeChampionPreset = (targetKey: 'p1' | 'p2', champKey: keyof typeof CHAMPIONS) => {
    const newDuelist = createDuelist(champKey, targetKey === 'p1' ? p1.walletSR : p2.walletSR);
    if (targetKey === 'p1') {
      setP1(newDuelist);
    } else {
      setP2(newDuelist);
    }
    addLog('system', `Switched ${targetKey.toUpperCase()} preset to ${newDuelist.name} (${newDuelist.cls}).`);
  };

  return (
    <div className="h-full flex flex-col bg-[#0b100d] text-stone-200 overflow-hidden font-sans">
      {/* Top Navigation & Mode Switcher */}
      <div className="p-3 bg-[#111a14] border-b border-[#233529] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-amber-400 font-display flex items-center gap-2">
            📊 Combat Balance Analytics
          </h1>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 bg-[#0b120e] rounded-xl border border-[#233529]">
            <button
              onClick={() => setAnalyticsMode('pve')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${analyticsMode === 'pve' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
            >
              ⚔ PvE Monster Encounter
            </button>
            <button
              onClick={() => setAnalyticsMode('pvp')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${analyticsMode === 'pvp' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
            >
              🤺 PvP Crucible Duel Arena
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setHackTarget(analyticsMode === 'pvp' && pvpTurn === 'p2' ? 'p2' : 'p1');
              setIsHackModalOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1.5"
          >
            🛠 Hack Current Match
          </button>
          <button
            onClick={analyticsMode === 'pvp' ? handleResetPvp : () => spawnMonster(selectedBiome, selectedTier, cr)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#192720] hover:bg-[#22352b] text-stone-300 border border-[#2f4437]"
          >
            ↺ Reset Simulation
          </button>
        </div>
      </div>

      {/* Main Simulation Viewport */}
      <div className="flex-1 overflow-hidden p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT PANEL: Combatant 1 (Player 1 / Challenger) */}
        <div className="lg:col-span-4 flex flex-col gap-3 overflow-y-auto pr-1">
          <div className={`p-4 rounded-xl bg-[#121c16] border transition-all ${analyticsMode === 'pvp' && pvpTurn === 'p1' ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-lg' : 'border-[#233529]'}`}>
            {/* Player 1 Header */}
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-mono-nums">
                  Player 1 · {p1.cls}
                </span>
                <h2 className="text-base font-bold text-stone-100 font-display">
                  {p1.name}
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono-nums font-bold text-emerald-400 block">
                  {p1.hp} / {p1Derived.maxHp} HP
                </span>
                <span className="text-[11px] font-mono-nums text-sky-400">
                  {p1.mp} / {p1Derived.maxMp} MP
                </span>
              </div>
            </div>

            {/* Health & Mana Bars */}
            <div className="space-y-1.5 mb-3">
              <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (p1.hp / p1Derived.maxHp) * 100)}%` }}
                />
              </div>
              <div className="w-full h-1.5 bg-[#090e0b] rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (p1.mp / p1Derived.maxMp) * 100)}%` }}
                />
              </div>
            </div>

            {/* Attributes Grid with Tooltips */}
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono-nums mb-3">
              {(['STR', 'AGI', 'VIT', 'INT'] as const).map(k => (
                <div key={k} className="p-1.5 rounded bg-[#0d1410] border border-[#1e2f25]">
                  <span className="text-[10px] text-stone-400 block">{k}</span>
                  <span className="font-bold text-amber-300">{p1.attrs[k]}</span>
                </div>
              ))}
            </div>

            {/* Derived Defenses & Speed */}
            <div className="flex justify-between text-[11px] text-stone-400 font-mono-nums pb-2 border-b border-[#1b2b21] mb-3">
              <span>Phys DEF: <b className="text-stone-200">{p1Derived.physDef}</b></span>
              <span>Mag DEF: <b className="text-stone-200">{p1Derived.magDef}</b></span>
              <span>Speed: <b className="text-stone-200">{p1Derived.speed}</b></span>
              <span>Wallet: <b className="text-amber-400">{p1.walletSR} SR</b></span>
            </div>

            {/* Equipped Gear Slots */}
            <div className="text-xs space-y-1 mb-3">
              <div className="flex justify-between items-center p-1.5 rounded bg-[#0b120e] border border-[#1f3025]">
                <span className="text-stone-400 text-[11px]">Weapon:</span>
                <span className="font-semibold text-amber-300 text-[11px] truncate max-w-[160px]">
                  {p1.equippedWeapon ? p1.equippedWeapon.name : 'Unarmed (2d6+STR)'}
                </span>
              </div>
              <div className="flex justify-between items-center p-1.5 rounded bg-[#0b120e] border border-[#1f3025]">
                <span className="text-stone-400 text-[11px]">Armor:</span>
                <span className="font-semibold text-emerald-300 text-[11px] truncate max-w-[160px]">
                  {p1.equippedArmor ? p1.equippedArmor.name : 'Cloth Garb (+0 AC)'}
                </span>
              </div>
            </div>

            {/* Summons and Traps (PvP) */}
            {analyticsMode === 'pvp' && (
              <div className="space-y-1.5 pt-2 border-t border-[#1b2b21]">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-400">Summon Tokens:</span>
                  <span className="font-mono-nums text-purple-300 font-bold">
                    {p1.summons.length} {p1.summons.length > 0 ? '(Absorbs Hit)' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-400">Face-Down Traps:</span>
                  <span className="font-mono-nums text-purple-300 font-bold">
                    {p1.traps.length} hidden
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Player 1 Inventory & Consumables Quick Strip */}
          <div className="p-3 rounded-xl bg-[#121c16] border border-[#233529] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                {p1.name}'s Bag ({p1.inventory.length})
              </span>
              <button
                onClick={() => {
                  setDeckViewerTarget('p1');
                  setIsDeckViewerOpen(true);
                }}
                className="text-[10px] text-sky-400 hover:underline"
              >
                Inspect 9-Card Deck ➔
              </button>
            </div>

            {p1.inventory.length === 0 ? (
              <span className="text-xs text-stone-500 italic">Inventory empty. Spawn items in Hack modal.</span>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                {p1.inventory.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="p-2 rounded bg-[#0b120e] border border-[#1d2d23] flex items-center justify-between text-xs">
                    <div className="truncate mr-2">
                      <span className="font-bold text-stone-200 block truncate">{item.name}</span>
                      <span className="text-[10px] text-stone-400">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.category === 'consumable' ? (
                        <>
                          <button
                            onClick={() => handleUseConsumable('p1', item, idx, true)}
                            className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px]"
                            title="Consume and pass turn"
                          >
                            Use
                          </button>
                          <button
                            onClick={() => handleUseConsumable('p1', item, idx, false)}
                            className="px-1.5 py-0.5 rounded bg-[#1e2f25] hover:bg-[#2a4033] text-stone-300 text-[10px]"
                            title="Test item without consuming turn"
                          >
                            0-Turn
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEquipItem('p1', item, idx)}
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-[10px]"
                        >
                          Equip
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Arena Battleground, Combat Actions & Dice Tray */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-3">
          {/* Top Arena Info Banner */}
          <div className="p-3 rounded-xl bg-[#142019] border border-[#273a30] text-center space-y-1">
            {analyticsMode === 'pvp' ? (
              <>
                <div className="flex justify-between items-center text-xs font-mono-nums">
                  <span className="text-amber-400 font-bold">Round {pvpRound}</span>
                  <span className="text-stone-300">
                    Active Turn: <b className="text-amber-300 uppercase">{pvpTurn === 'p1' ? p1.name : p2.name}</b>
                  </span>
                  <span className="text-emerald-400 font-bold">Pot: {wagerAmount * 2} SR</span>
                </div>
                {pvpWinner ? (
                  <div className="p-2 bg-amber-500/20 border border-amber-400 rounded-lg text-amber-300 font-bold text-xs mt-1 animate-bounce">
                    👑 {pvpWinner} Wins the Crucible Duel!
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    Deterministic 9-card decks · 1-HP summon shatter absorb enabled
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between items-center text-xs font-mono-nums">
                <span className="text-amber-400 font-bold">PvE Zone: {BIOMES[selectedBiome].name}</span>
                <span className="text-stone-300">CR {cr} ({selectedTier.toUpperCase()})</span>
                <span className="text-emerald-400 font-bold">Loot Drop Ready</span>
              </div>
            )}
          </div>

          {/* ACTIVE CONTROLS FOR CURRENT PLAYER */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#273a30] space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide font-display">
                {analyticsMode === 'pvp'
                  ? `${pvpTurn === 'p1' ? p1.name : p2.name}'s Actions`
                  : `${p1.name}'s Actions`}
              </span>
              {analyticsMode === 'pvp' && !pvpWinner && (
                <button
                  onClick={() => handleAutoPlay(pvpTurn)}
                  className="px-2 py-0.5 text-[10px] rounded bg-purple-900/60 text-purple-300 border border-purple-600/50 hover:bg-purple-800"
                >
                  ⚡ Auto-Play Turn
                </button>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={analyticsMode === 'pvp' ? Boolean(pvpWinner) : (isPveOver || p1.hp <= 0)}
                onClick={() => {
                  if (analyticsMode === 'pvp') {
                    handleBasicAttack(pvpTurn);
                  } else {
                    handlePveAttack();
                  }
                }}
                className="py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-40 shadow"
              >
                ⚔ Basic Attack (2d6)
              </button>

              {analyticsMode === 'pvp' ? (
                <button
                  disabled={Boolean(pvpWinner)}
                  onClick={handleEndTurn}
                  className="py-2.5 rounded-lg bg-[#1f3026] hover:bg-[#2a4234] text-stone-200 border border-[#334e3e] font-semibold text-xs"
                >
                  ⏭ Pass / End Turn
                </button>
              ) : (
                <button
                  disabled={isPveOver || p1.mp < 10}
                  onClick={() => {
                    setP1(c => ({ ...c, mp: c.mp - 10, summons: [...c.summons, { hp: 1 }] }));
                    addLog('spell', `${p1.name} conjured a 1-HP Beast Familiar (10 MP).`);
                  }}
                  className="py-2.5 rounded-lg bg-[#1f3026] hover:bg-[#2a4234] text-amber-300 border border-[#334e3e] font-semibold text-xs disabled:opacity-40"
                >
                  🛡 Conjure Familiar (10 MP)
                </button>
              )}
            </div>

            {/* Hand Cards (In PvP Mode, shows the active player's hand cards) */}
            {analyticsMode === 'pvp' && (
              <div className="space-y-1.5 pt-2 border-t border-[#1e2f25]">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-300 font-bold">
                    {pvpTurn === 'p1' ? p1.name : p2.name}'s Hand ({pvpTurn === 'p1' ? p1.hand.length : p2.hand.length}):
                  </span>
                  <span className="text-[10px] text-stone-500">
                    Remaining Deck: {pvpTurn === 'p1' ? p1.deck.length : p2.deck.length}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(pvpTurn === 'p1' ? p1.hand : p2.hand).map((card, idx) => {
                    const isAtk = card.type === 'Attack';
                    const isSpell = card.type === 'Spell';
                    const badgeBg = isAtk ? 'bg-red-950/60 text-red-300' : isSpell ? 'bg-sky-950/60 text-sky-300' : 'bg-purple-950/60 text-purple-300';

                    return (
                      <div
                        key={`${card.id}-${idx}`}
                        className="p-2 rounded-lg bg-[#0d1611] border border-[#233529] hover:border-amber-400 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="truncate mr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-stone-200">{card.title}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${badgeBg}`}>
                              {card.type}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-400 block truncate">{card.effect}</span>
                        </div>

                        <button
                          disabled={Boolean(pvpWinner)}
                          onClick={() => handlePlayCard(pvpTurn, card, idx)}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shrink-0"
                        >
                          Play
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Visual Dice Tray */}
            <div className="p-2.5 rounded-lg bg-[#0c120e] border border-[#202e26]">
              <span className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                Simulation Dice Tray
              </span>
              <div className="flex gap-2 min-h-[32px] items-center">
                {tray.length === 0 ? (
                  <span className="text-xs text-stone-600 italic">No recent roll</span>
                ) : (
                  tray.map((d, i) => (
                    <div key={i} className="px-2.5 py-1 rounded bg-[#16241c] border border-amber-500/40 text-center font-mono-nums">
                      <span className="text-xs font-bold text-amber-400 block">{d.value}</span>
                      <span className="text-[8px] text-stone-400 uppercase">{d.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Combat Log Console */}
          <div className="p-3 rounded-xl bg-[#0b120e] border border-[#1f2f25] flex-1 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">
              Combat Feed
            </span>
            {log.length === 0 ? (
              <span className="text-stone-600 italic">Battle started. Actions will stream here.</span>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="text-stone-300 leading-tight">
                  <span className="text-stone-500 mr-1.5">[R{entry.round}]</span>
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Combatant 2 (Player 2 in PvP, or Mob in PvE) */}
        <div className="lg:col-span-4 flex flex-col gap-3 overflow-y-auto pl-1">
          {analyticsMode === 'pvp' ? (
            /* Player 2 (Defender / Rival) Display */
            <>
              <div className={`p-4 rounded-xl bg-[#121c16] border transition-all ${pvpTurn === 'p2' ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-lg' : 'border-[#233529]'}`}>
                {/* Player 2 Header */}
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest font-mono-nums">
                      Player 2 · {p2.cls}
                    </span>
                    <h2 className="text-base font-bold text-stone-100 font-display">
                      {p2.name}
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono-nums font-bold text-emerald-400 block">
                      {p2.hp} / {p2Derived.maxHp} HP
                    </span>
                    <span className="text-[11px] font-mono-nums text-sky-400">
                      {p2.mp} / {p2Derived.maxMp} MP
                    </span>
                  </div>
                </div>

                {/* Health & Mana Bars */}
                <div className="space-y-1.5 mb-3">
                  <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (p2.hp / p2Derived.maxHp) * 100)}%` }}
                    />
                  </div>
                  <div className="w-full h-1.5 bg-[#090e0b] rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (p2.mp / p2Derived.maxMp) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Attributes Grid */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono-nums mb-3">
                  {(['STR', 'AGI', 'VIT', 'INT'] as const).map(k => (
                    <div key={k} className="p-1.5 rounded bg-[#0d1410] border border-[#1e2f25]">
                      <span className="text-[10px] text-stone-400 block">{k}</span>
                      <span className="font-bold text-sky-300">{p2.attrs[k]}</span>
                    </div>
                  ))}
                </div>

                {/* Derived Stats */}
                <div className="flex justify-between text-[11px] text-stone-400 font-mono-nums pb-2 border-b border-[#1b2b21] mb-3">
                  <span>Phys DEF: <b className="text-stone-200">{p2Derived.physDef}</b></span>
                  <span>Mag DEF: <b className="text-stone-200">{p2Derived.magDef}</b></span>
                  <span>Speed: <b className="text-stone-200">{p2Derived.speed}</b></span>
                  <span>Wallet: <b className="text-amber-400">{p2.walletSR} SR</b></span>
                </div>

                {/* Equipped Gear Slots */}
                <div className="text-xs space-y-1 mb-3">
                  <div className="flex justify-between items-center p-1.5 rounded bg-[#0b120e] border border-[#1f3025]">
                    <span className="text-stone-400 text-[11px]">Weapon:</span>
                    <span className="font-semibold text-amber-300 text-[11px] truncate max-w-[160px]">
                      {p2.equippedWeapon ? p2.equippedWeapon.name : 'Unarmed (2d6+STR)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-1.5 rounded bg-[#0b120e] border border-[#1f3025]">
                    <span className="text-stone-400 text-[11px]">Armor:</span>
                    <span className="font-semibold text-emerald-300 text-[11px] truncate max-w-[160px]">
                      {p2.equippedArmor ? p2.equippedArmor.name : 'Cloth Garb (+0 AC)'}
                    </span>
                  </div>
                </div>

                {/* Summons & Traps */}
                <div className="space-y-1.5 pt-2 border-t border-[#1b2b21]">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-400">Summon Tokens:</span>
                    <span className="font-mono-nums text-purple-300 font-bold">
                      {p2.summons.length} {p2.summons.length > 0 ? '(Absorbs Hit)' : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-400">Face-Down Traps:</span>
                    <span className="font-mono-nums text-purple-300 font-bold">
                      {p2.traps.length} hidden
                    </span>
                  </div>
                </div>
              </div>

              {/* Player 2 Inventory */}
              <div className="p-3 rounded-xl bg-[#121c16] border border-[#233529] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wide">
                    {p2.name}'s Bag ({p2.inventory.length})
                  </span>
                  <button
                    onClick={() => {
                      setDeckViewerTarget('p2');
                      setIsDeckViewerOpen(true);
                    }}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Inspect 9-Card Deck ➔
                  </button>
                </div>

                {p2.inventory.length === 0 ? (
                  <span className="text-xs text-stone-500 italic">Inventory empty. Spawn items in Hack modal.</span>
                ) : (
                  <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                    {p2.inventory.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} className="p-2 rounded bg-[#0b120e] border border-[#1d2d23] flex items-center justify-between text-xs">
                        <div className="truncate mr-2">
                          <span className="font-bold text-stone-200 block truncate">{item.name}</span>
                          <span className="text-[10px] text-stone-400">{item.category}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.category === 'consumable' ? (
                            <>
                              <button
                                onClick={() => handleUseConsumable('p2', item, idx, true)}
                                className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px]"
                              >
                                Use
                              </button>
                              <button
                                onClick={() => handleUseConsumable('p2', item, idx, false)}
                                className="px-1.5 py-0.5 rounded bg-[#1e2f25] hover:bg-[#2a4033] text-stone-300 text-[10px]"
                              >
                                0-Turn
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleEquipItem('p2', item, idx)}
                              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-[10px]"
                            >
                              Equip
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* PvE Mob Display */
            <div className="p-4 rounded-xl bg-[#121c16] border border-[#233529] space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest font-mono-nums">
                    CR {mob.cr} Monster · {mob.element.toUpperCase()}
                  </span>
                  <h2 className="text-base font-bold text-stone-100 font-display">
                    {mob.name}
                  </h2>
                </div>
                <span className="text-xs font-mono-nums font-bold text-red-400">
                  {mob.hp} / {mob.maxHp} HP
                </span>
              </div>

              <div className="w-full h-2 bg-[#090e0b] rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all duration-300"
                  style={{ width: `${(mob.hp / mob.maxHp) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono-nums">
                <div className="p-2 rounded bg-[#0d1410] border border-[#1e2f25]">
                  <span className="text-[10px] text-stone-400 block">Defense (DV)</span>
                  <span className="font-bold text-stone-200">{mob.defense}</span>
                </div>
                <div className="p-2 rounded bg-[#0d1410] border border-[#1e2f25]">
                  <span className="text-[10px] text-stone-400 block">Element</span>
                  <span className="font-bold text-amber-300 capitalize">{mob.element}</span>
                </div>
              </div>

              {/* Monster Config Controls */}
              <div className="space-y-2 pt-2 border-t border-[#1b2b21] text-xs">
                <label className="text-stone-400 block text-[11px]">Spawn Biome</label>
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(BIOMES) as (keyof typeof BIOMES)[]).map(bKey => (
                    <button
                      key={bKey}
                      onClick={() => {
                        setSelectedBiome(bKey);
                        spawnMonster(bKey, selectedTier, cr);
                      }}
                      className={`py-1 rounded text-[11px] font-semibold transition-colors ${selectedBiome === bKey ? 'bg-amber-500 text-black' : 'bg-[#18261e] text-stone-300'}`}
                    >
                      {BIOMES[bKey].name}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 items-center mt-2">
                  <span className="text-[11px] text-stone-400">CR:</span>
                  {[1, 4, 8, 12].map(cVal => (
                    <button
                      key={cVal}
                      onClick={() => {
                        setCr(cVal);
                        spawnMonster(selectedBiome, selectedTier, cVal);
                      }}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${cr === cVal ? 'bg-amber-500 text-black' : 'bg-[#18261e] text-stone-400'}`}
                    >
                      {cVal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* UNIVERSAL HACK CURRENT MATCH MODAL (DUAL-PLAYER GM CONTROL) */}
      {/* -------------------------------------------------------------------------- */}
      {isHackModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121c16] p-6 rounded-2xl border border-emerald-500/50 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            {/* Modal Header & Target Switcher */}
            <div className="flex justify-between items-center pb-2 border-b border-[#233529]">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-emerald-400 font-display">
                  🛠 Hack Current Match
                </h2>

                {/* Target Combatant Tabs */}
                <div className="flex items-center p-0.5 bg-[#0a100d] rounded-lg border border-[#203025]">
                  <button
                    onClick={() => setHackTarget('p1')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${hackTarget === 'p1' ? 'bg-emerald-600 text-white' : 'text-stone-400 hover:text-white'}`}
                  >
                    Player 1 ({p1.name})
                  </button>
                  <button
                    onClick={() => setHackTarget('p2')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${hackTarget === 'p2' ? 'bg-sky-600 text-white' : 'text-stone-400 hover:text-white'}`}
                  >
                    Player 2 ({p2.name})
                  </button>
                  {analyticsMode === 'pve' && (
                    <button
                      onClick={() => setHackTarget('mob')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${hackTarget === 'mob' ? 'bg-red-600 text-white' : 'text-stone-400 hover:text-white'}`}
                    >
                      PvE Mob
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsHackModalOpen(false)}
                className="text-stone-400 hover:text-white px-2 py-1 rounded bg-[#1e2f25] text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* HACKING PLAYER 1 OR PLAYER 2 */}
            {(hackTarget === 'p1' || hackTarget === 'p2') && (() => {
              const target = hackTarget === 'p1' ? p1 : p2;
              const setTarget = hackTarget === 'p1' ? setP1 : setP2;
              const targetDerived = hackTarget === 'p1' ? p1Derived : p2Derived;

              return (
                <div className="space-y-4 text-xs font-mono-nums">
                  {/* Archetype & Presets */}
                  <div className="p-3 rounded-xl bg-[#0d1410] border border-[#203025] space-y-2">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block font-sans">
                      Select Champion Archetype
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(CHAMPIONS) as (keyof typeof CHAMPIONS)[]).map(cKey => (
                        <button
                          key={cKey}
                          onClick={() => handleChangeChampionPreset(hackTarget, cKey)}
                          className={`py-1.5 px-2 rounded-lg font-bold text-xs capitalize transition-colors ${target.name === CHAMPIONS[cKey].name ? 'bg-amber-500 text-black' : 'bg-[#18261e] text-stone-300 hover:bg-[#22352b]'}`}
                        >
                          {CHAMPIONS[cKey].name} ({CHAMPIONS[cKey].cls})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Attributes (STR, AGI, VIT, INT, Level) */}
                  <div className="p-3 rounded-xl bg-[#0d1410] border border-[#203025] space-y-2">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block font-sans">
                      Attributes & Level Scaling
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      {(['STR', 'AGI', 'VIT', 'INT'] as const).map(k => (
                        <div key={k}>
                          <label className="text-stone-400 block mb-1">{k}</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={target.attrs[k]}
                            onChange={e => setTarget({ ...target, attrs: { ...target.attrs, [k]: +e.target.value } })}
                            className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-stone-400 block mb-1">Level</label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={target.level}
                          onChange={e => setTarget({ ...target, level: Math.max(1, +e.target.value) })}
                          className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vitals & Currency (HP, MP, Wallet SR, Lives) */}
                  <div className="p-3 rounded-xl bg-[#0d1410] border border-[#203025] space-y-2">
                    <div className="flex justify-between items-center font-sans">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                        Vitals & Currency
                      </span>
                      <button
                        onClick={() => setTarget({ ...target, hp: targetDerived.maxHp, mp: targetDerived.maxMp })}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                      >
                        ♥ Full Revive & Restore
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-stone-400 block mb-1">HP (Max: {targetDerived.maxHp})</label>
                        <input
                          type="number"
                          value={target.hp}
                          onChange={e => setTarget({ ...target, hp: +e.target.value })}
                          className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-stone-400 block mb-1">MP (Max: {targetDerived.maxMp})</label>
                        <input
                          type="number"
                          value={target.mp}
                          onChange={e => setTarget({ ...target, mp: +e.target.value })}
                          className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-stone-400 block mb-1">Wallet SR</label>
                        <input
                          type="number"
                          value={target.walletSR}
                          onChange={e => setTarget({ ...target, walletSR: +e.target.value })}
                          className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-stone-400 block mb-1">Campaign Lives</label>
                        <input
                          type="number"
                          value={target.lives}
                          onChange={e => setTarget({ ...target, lives: +e.target.value })}
                          className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Equipment Slots Management */}
                  <div className="p-3 rounded-xl bg-[#0d1410] border border-[#203025] space-y-2 font-sans">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block">
                      Equipped Items
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-[#18261e] border border-[#25392d] flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-stone-400 block uppercase">Weapon</span>
                          <span className="font-bold text-amber-300">
                            {target.equippedWeapon ? target.equippedWeapon.name : 'None'}
                          </span>
                        </div>
                        {target.equippedWeapon && (
                          <button
                            onClick={() => handleUnequipItem(hackTarget, 'weapon')}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-300 hover:bg-red-800"
                          >
                            Unequip
                          </button>
                        )}
                      </div>

                      <div className="p-2 rounded bg-[#18261e] border border-[#25392d] flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-stone-400 block uppercase">Armor</span>
                          <span className="font-bold text-emerald-300">
                            {target.equippedArmor ? target.equippedArmor.name : 'None'}
                          </span>
                        </div>
                        {target.equippedArmor && (
                          <button
                            onClick={() => handleUnequipItem(hackTarget, 'armor')}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-300 hover:bg-red-800"
                          >
                            Unequip
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Spawn Equipment Directly Into Inventory */}
                  <div className="p-3 rounded-xl bg-[#0d1410] border border-[#203025] space-y-2 font-sans">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block">
                      Spawn Equipment & Items into {target.name}'s Bag
                    </span>
                    <div className="flex gap-2">
                      <select
                        value={selectedItemToSpawn}
                        onChange={e => setSelectedItemToSpawn(e.target.value)}
                        className="flex-1 bg-[#1b2b22] border border-[#2e4235] rounded-lg p-2 text-xs text-stone-100"
                      >
                        {allItems.map(it => (
                          <option key={it.id} value={it.id}>
                            [{it.category.toUpperCase()}] {it.name} ({it.rarity})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSpawnItemIntoPlayer(hackTarget)}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                      >
                        + Spawn Item
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* HACKING PVE MOB */}
            {hackTarget === 'mob' && (
              <div className="space-y-4 text-xs font-mono-nums">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-stone-400 block mb-1">Mob HP</label>
                    <input
                      type="number"
                      value={mob.hp}
                      onChange={e => setMob({ ...mob, hp: +e.target.value })}
                      className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-2 text-stone-100"
                    />
                  </div>
                  <div>
                    <label className="text-stone-400 block mb-1">Mob Defense (DV)</label>
                    <input
                      type="number"
                      value={mob.defense}
                      onChange={e => setMob({ ...mob, defense: +e.target.value })}
                      className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-2 text-stone-100"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* 9-CARD DECK VIEWER MODAL */}
      {/* -------------------------------------------------------------------------- */}
      {isDeckViewerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121c16] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#233529]">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-mono-nums">
                  Deterministic Deck · {deckViewerTarget === 'p1' ? p1.name : p2.name}
                </span>
                <h2 className="text-base font-bold text-stone-100 font-display">
                  {deckViewerTarget === 'p1' ? p1.cls : p2.cls} Crucible Deck (9 Cards)
                </h2>
              </div>
              <button
                onClick={() => setIsDeckViewerOpen(false)}
                className="text-stone-400 hover:text-white px-2 py-1 rounded bg-[#1e2f25] text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(CLASS_PVP_DECKS[deckViewerTarget === 'p1' ? p1.cls : p2.cls] || []).map(card => (
                <div key={card.id} className="p-3 rounded-xl bg-[#0b120e] border border-[#203025] flex flex-col justify-between text-xs space-y-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase text-amber-400">{card.type}</span>
                      {card.range && <span className="text-[9px] text-sky-400 font-mono-nums">R: {card.range}</span>}
                    </div>
                    <h3 className="font-bold text-stone-200">{card.title}</h3>
                    <p className="text-[11px] text-stone-400 mt-1 leading-snug">{card.effect}</p>
                  </div>
                  {card.flavor && (
                    <span className="text-[9px] text-stone-500 italic block pt-1 border-t border-[#18261e]">
                      "{card.flavor}"
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* DEFEATED MODAL (PVE REVIVE) */}
      {/* -------------------------------------------------------------------------- */}
      {isDefeatedModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#1b1212] p-6 rounded-2xl border border-red-500 shadow-2xl max-w-md w-full text-center space-y-4">
            <h2 className="text-lg font-bold text-red-400 font-display">
              ☠ Champion Fallen
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              {p1.name} collapsed in battle. In Balance Analytics, defeat never permanently destroys your setup. You can revive or reset.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setP1(c => ({ ...c, hp: p1Derived.maxHp }));
                  setIsDefeatedModalOpen(false);
                  setIsPveOver(false);
                  addLog('system', `${p1.name} was revived by GM.`);
                }}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Revive Full HP
              </button>
              <button
                onClick={() => {
                  spawnMonster(selectedBiome, selectedTier, cr);
                  setIsDefeatedModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-[#241717] hover:bg-red-950 text-red-300 border border-red-800 text-xs"
              >
                Reset Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
