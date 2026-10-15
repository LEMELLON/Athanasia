import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PlayerCharacter, HexTile, ItemEntity, ElementType, MobEntity } from '../types/game';
import { ThreeDiceCanvas, DiceRequest, DiceResult } from './ThreeDiceCanvas';
import { ELEMENT_LIST, BIOME_CONFIGS } from '../data/defaultGameData';
import { CLASS_PVP_DECKS, PvPCard } from '../data/pvpCards';

interface Props {
  players: PlayerCharacter[];
  mapTiles: Record<string, HexTile>;
  allItems: ItemEntity[];
  onUpdatePlayers: (players: PlayerCharacter[]) => void;
  onUpdateMap: (map: Record<string, HexTile>) => void;
  combatLog: string[];
  onAddLog: (msg: string) => void;
  currentRound: number;
  onUpdateRound: (r: number) => void;
}

const S3 = Math.sqrt(3);
const TILE_RADIUS = 26;

function hexToPixel(q: number, r: number): [number, number] {
  return [TILE_RADIUS * (S3 * q + (S3 / 2) * r), TILE_RADIUS * (1.5 * r)];
}

function hexPoints(cx: number, cy: number, r: number = TILE_RADIUS): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Calculate distance in hexes
function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs((q1 + r1) - (q2 + r2))) / 2;
}

export const PlaytestSimulator: React.FC<Props> = ({
  players,
  mapTiles,
  allItems,
  onUpdatePlayers,
  onUpdateMap,
  combatLog,
  onAddLog,
  currentRound,
  onUpdateRound
}) => {
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [movementRemaining, setMovementRemaining] = useState(0);
  const [hasRolledMove, setHasRolledMove] = useState(false);
  const [hasActedThisTurn, setHasActedThisTurn] = useState(false);
  const [engagedMob, setEngagedMob] = useState<{ tileKey: string; mob: MobEntity } | null>(null);

  // Dynamic Camera & Game-Feel State
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isCameraAutoPan, setIsCameraAutoPan] = useState(true);

  // Boss state
  const [isBossBreached, setIsBossBreached] = useState(false);
  const [bossHp, setBossHp] = useState(350);

  // Active 3D Dice Modal State
  const [activeRoll, setActiveRoll] = useState<{
    dice: DiceRequest[];
    title: string;
    onComplete: (results: DiceResult[]) => void;
  } | null>(null);

  // Shop modal
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopPlayer, setShopPlayer] = useState<PlayerCharacter | null>(null);

  // Inventory modal
  const [isPackOpen, setIsPackOpen] = useState(false);

  // Crucible PvP Duel Modal & Engine State
  const [isPvpModalOpen, setIsPvpModalOpen] = useState(false);
  const [pvpTargetPlayerId, setPvpTargetPlayerId] = useState<number>(2);
  const [pvpWagerAmount, setPvpWagerAmount] = useState<number>(50);
  const [pvpWagerItemA, setPvpWagerItemA] = useState<string>('');
  const [pvpWagerItemB, setPvpWagerItemB] = useState<string>('');

  const [pvpDuel, setPvpDuel] = useState<{
    isActive: boolean;
    duelistA: PlayerCharacter;
    duelistB: PlayerCharacter;
    wagerPot: number;
    wagerItemA: string;
    wagerItemB: string;
    handA: PvPCard[];
    handB: PvPCard[];
    deckA: PvPCard[];
    deckB: PvPCard[];
    trapsA: { card: PvPCard; isRevealed: boolean }[];
    trapsB: { card: PvPCard; isRevealed: boolean }[];
    hpA: number;
    hpB: number;
    summonA: { name: string; hp: number } | null;
    summonB: { name: string; hp: number } | null;
    activeDuelistId: number;
    duelLog: string[];
    winnerName: string | null;
  } | null>(null);

  const activePlayer = players[activePlayerIndex] || players[0];

  // Camera smooth pan to player helper
  const panToPlayer = useCallback((p: PlayerCharacter) => {
    if (!p || !p.position) return;
    const [pq, pr] = p.position.split(',').map(Number);
    if (isNaN(pq) || isNaN(pr)) return;
    const [px, py] = hexToPixel(pq, pr);
    setCamera(prev => ({ ...prev, x: -px, y: -py }));
  }, []);

  // Auto-pan camera whenever active player or round changes
  useEffect(() => {
    if (activePlayer && isCameraAutoPan) {
      panToPlayer(activePlayer);
    }
  }, [activePlayerIndex, currentRound, activePlayer, isCameraAutoPan, panToPlayer]);

  // Initialize player positions to their spawns if 0,0
  useEffect(() => {
    let changed = false;
    const updated = players.map(p => {
      if (p.position === '0,0') {
        const spawnTileKey = Object.keys(mapTiles).find(k => mapTiles[k].type === 'Spawn' && mapTiles[k].spawnPlayerIndex === p.id);
        if (spawnTileKey) {
          changed = true;
          return { ...p, position: spawnTileKey, trail: [spawnTileKey] };
        }
      }
      return p;
    });
    if (changed) {
      onUpdatePlayers(updated);
    }
  }, [players, mapTiles, onUpdatePlayers]);

  // Derived stats
  const statMod = (val: number = 10) => Math.floor((val - 10) / 2);
  const getProficiencyBonus = (lvl: number) => (lvl < 5 ? 2 : lvl < 9 ? 3 : lvl < 13 ? 4 : lvl < 17 ? 5 : 6);

  // Speed calculation: Base 1 + floor(AGI / 5) tiles per action (aligned with GDD)
  const getSpeedTiles = (agi: number = 0) => Math.max(1, 1 + Math.floor(agi / 5));

  // Roll Move with 3D Dice
  const handleRollMove = () => {
    if (hasRolledMove) return;
    const dieType = activePlayer.archetype === 'Cana' ? 'd8' : 'd6';
    const targetRoll = 1 + Math.floor(Math.random() * (dieType === 'd8' ? 8 : 6));
    const agiStat = activePlayer.stats.AGI ?? activePlayer.stats.DEX ?? 0;
    const speedBonus = getSpeedTiles(agiStat);

    setActiveRoll({
      title: `${activePlayer.name} — Rolling Movement (${dieType} + Speed ${speedBonus})`,
      dice: [{ id: 'move_die', type: dieType === 'd8' ? 'd8' : 'd6', targetValue: targetRoll, color: activePlayer.color }],
      onComplete: () => {
        const total = targetRoll + speedBonus;
        setMovementRemaining(total);
        setHasRolledMove(true);
        onAddLog(`${activePlayer.name} rolled ${targetRoll} (+${speedBonus} Speed from AGI) → ${total} movement tiles.`);
        setActiveRoll(null);
      }
    });
  };

  // Movement reach calculation
  const reachableTiles = useMemo(() => {
    if (!hasRolledMove || movementRemaining <= 0 || !activePlayer || engagedMob) return new Set<string>();
    const [pq, pr] = activePlayer.position.split(',').map(Number);
    const reachable = new Set<string>();

    Object.keys(mapTiles).forEach(k => {
      const tile = mapTiles[k];
      if (tile.type === 'W' || (tile.type === 'B' && !isBossBreached)) return;
      const dist = hexDistance(pq, pr, tile.q, tile.r);
      const cost = tile.type === 'O' ? 2 : 1;
      if (dist > 0 && dist * cost <= movementRemaining) {
        reachable.add(k);
      }
    });

    return reachable;
  }, [hasRolledMove, movementRemaining, activePlayer, mapTiles, isBossBreached, engagedMob]);

  // Handle Move Click (Pans Camera Dynamically with Player)
  const handleTileClick = (targetKey: string) => {
    if (!reachableTiles.has(targetKey)) return;
    const tile = mapTiles[targetKey];
    const [pq, pr] = activePlayer.position.split(',').map(Number);
    const dist = hexDistance(pq, pr, tile.q, tile.r);
    const cost = (tile.type === 'O' ? 2 : 1) * dist;

    const newRemaining = Math.max(0, movementRemaining - cost);
    setMovementRemaining(newRemaining);

    const updatedPlayers = players.map(p => {
      if (p.id === activePlayer.id) {
        return {
          ...p,
          position: targetKey,
          trail: [...p.trail.slice(-5), targetKey]
        };
      }
      return p;
    });
    onUpdatePlayers(updatedPlayers);
    onAddLog(`${activePlayer.name} moves to ${targetKey} (${tile.biome} ${tile.type}).`);

    // Dynamic Camera Pan Follow
    if (isCameraAutoPan) {
      const [tq, tr] = targetKey.split(',').map(Number);
      const [tx, ty] = hexToPixel(tq, tr);
      setCamera(prev => ({ ...prev, x: -tx, y: -ty }));
    }

    // Check Tile Encounters
    if (tile.mob && tile.type === 'M') {
      setEngagedMob({ tileKey: targetKey, mob: tile.mob });
      onAddLog(`⚔ ${activePlayer.name} encounters ${tile.mob.name} (CR ${tile.mob.cr})!`);
    } else if (tile.type === 'C') {
      onAddLog(`▣ ${activePlayer.name} discovers a Treasure Chest! Use 'Open Chest' action.`);
    } else if (tile.type === 'Shop' || tile.type === 'Spawn') {
      onAddLog(`$ ${activePlayer.name} reaches a Soul Corridor / Sanctuary.`);
    }
  };

  // Combat Attack Action
  const handleAttack = useCallback((targetMob: MobEntity, tileKey: string) => {
    if (hasActedThisTurn) return;
    const weapon = activePlayer.equippedWeapon;
    const baseAtk = weapon?.baseAtk || 5;
    const scaling = weapon?.scalingStat || (activePlayer.archetype === 'Bhana' ? 'STR' : activePlayer.archetype === 'Cana' ? 'AGI' : 'INT');
    const statVal = activePlayer.stats[scaling] ?? (scaling === 'AGI' ? (activePlayer.stats.DEX ?? 10) : 10);
    const attMod = statMod(statVal);
    const pb = getProficiencyBonus(activePlayer.level);

    // Roll 2d6 hit resolution
    const roll1 = 1 + Math.floor(Math.random() * 6);
    const roll2 = 1 + Math.floor(Math.random() * 6);
    const isCrit = roll1 === 6 && roll2 === 6;
    const isFumble = roll1 === 1 && roll2 === 1;

    setActiveRoll({
      title: `${activePlayer.name} attacks ${targetMob.name} with ${weapon?.name || 'Unarmed Strike'}!`,
      dice: [
        { id: 'd6_hit_1', type: 'd6', targetValue: roll1, label: 'Hit 1' },
        { id: 'd6_hit_2', type: 'd6', targetValue: roll2, label: 'Hit 2' }
      ],
      onComplete: () => {
        const hitTotal = roll1 + roll2 + attMod + pb;
        const enemyDefense = 8 + Math.floor(targetMob.cr / 2);
        const hits = !isFumble && (isCrit || hitTotal >= enemyDefense);

        if (!hits) {
          onAddLog(`${activePlayer.name} rolls ${roll1}+${roll2}+${attMod}+${pb} = ${hitTotal} vs Defense ${enemyDefense}: MISS!`);
          setHasActedThisTurn(true);
          setActiveRoll(null);
          return;
        }

        // Hit lands! Roll 1d20 for damage
        const dDmg = 1 + Math.floor(Math.random() * 20);
        let finalDamage = baseAtk + dDmg + attMod;
        if (isCrit) finalDamage = Math.floor(finalDamage * 1.5);

        // Elemental ring calculation
        const strongAgainst = ELEMENT_LIST.find(e => e.id === activePlayer.affinity)?.strongAgainst || [];
        const isAdvantage = strongAgainst.includes(targetMob.element);
        if (isAdvantage) {
          finalDamage = Math.floor(finalDamage * 1.5);
          onAddLog(`⚡ Elemental Advantage! ${activePlayer.affinity} strikes ${targetMob.element} for 1.5x damage!`);
        }

        const newHp = Math.max(0, targetMob.hp - finalDamage);
        onAddLog(`${activePlayer.name} deals ${finalDamage} damage to ${targetMob.name} (HP: ${newHp}/${targetMob.maxHp})${isCrit ? ' [CRITICAL HIT!]' : ''}.`);

        // Check Mob Defeated
        if (newHp <= 0) {
          const reward = targetMob.rewardSr || 300;
          onAddLog(`☠ ${targetMob.name} is defeated! ${activePlayer.name} earns +${reward} SR and absorbs ${targetMob.element} Counter.`);

          const updatedPlayers = players.map(p => {
            if (p.id === activePlayer.id) {
              const newTotal = p.totalSr + reward;
              const newWallet = p.walletSr + reward;
              const newLvl = newTotal >= 300 && p.level === 1 ? 2 : newTotal >= 900 && p.level === 2 ? 3 : p.level;
              return {
                ...p,
                totalSr: newTotal,
                walletSr: newWallet,
                level: newLvl,
                counters: p.counters.length < 4 ? [...p.counters, targetMob.element] : p.counters,
                keys: targetMob.isMiniBoss ? p.keys + 1 : p.keys
              };
            }
            return p;
          });
          onUpdatePlayers(updatedPlayers);

          const updatedTiles = { ...mapTiles };
          delete updatedTiles[tileKey].mob;
          updatedTiles[tileKey].type = 'P';
          onUpdateMap(updatedTiles);
          setEngagedMob(null);
        } else {
          // Mob counter-attack
          const vitStat = activePlayer.stats.VIT ?? activePlayer.stats.CON ?? 10;
          const mobDmg = Math.max(1, 4 + targetMob.cr - statMod(vitStat));
          const pNewHp = Math.max(0, activePlayer.currentHp - mobDmg);
          onAddLog(`${targetMob.name} strikes back for ${mobDmg} damage to ${activePlayer.name}!`);

          const updatedPlayers = players.map(p => {
            if (p.id === activePlayer.id) {
              const isDead = pNewHp <= 0;
              return {
                ...p,
                currentHp: isDead ? p.maxHp : pNewHp,
                lives: isDead ? Math.max(0, p.lives - 1) : p.lives,
                walletSr: isDead ? Math.floor(p.walletSr * 0.75) : p.walletSr
              };
            }
            return p;
          });
          onUpdatePlayers(updatedPlayers);
        }

        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  }, [activePlayer, hasActedThisTurn, players, onUpdatePlayers, mapTiles, onUpdateMap, onAddLog]);

  // Open Chest Action
  const handleOpenChest = () => {
    if (hasActedThisTurn) return;
    const currentTile = mapTiles[activePlayer.position];
    if (!currentTile || currentTile.type !== 'C') return;

    const chestRoll = 1 + Math.floor(Math.random() * 20);

    setActiveRoll({
      title: `${activePlayer.name} opens Treasure Chest (Rolling d20 Loot Table)...`,
      dice: [{ id: 'chest_d20', type: 'd20', targetValue: chestRoll }],
      onComplete: () => {
        let lootItem: ItemEntity | undefined;
        let srGain = 50;

        if (chestRoll === 20) {
          lootItem = allItems.find(i => i.rarity === 'Legendary') || allItems[0];
          srGain = 300;
        } else if (chestRoll >= 15) {
          lootItem = allItems.find(i => i.rarity === 'Rare') || allItems[0];
          srGain = 150;
        } else if (chestRoll >= 10) {
          lootItem = allItems.find(i => i.rarity === 'Uncommon') || allItems[0];
          srGain = 100;
        } else {
          lootItem = allItems.find(i => i.category === 'consumable') || allItems[0];
          srGain = 50;
        }

        onAddLog(`${activePlayer.name} rolled a natural ${chestRoll} on chest loot table! Found ${lootItem.name} and +${srGain} SR.`);

        const updatedPlayers = players.map(p => {
          if (p.id === activePlayer.id) {
            return {
              ...p,
              walletSr: p.walletSr + srGain,
              totalSr: p.totalSr + srGain,
              pack: [...p.pack, lootItem!]
            };
          }
          return p;
        });
        onUpdatePlayers(updatedPlayers);

        // Turn chest into standard path
        const updatedTiles = { ...mapTiles };
        updatedTiles[activePlayer.position] = { ...currentTile, type: 'P' };
        onUpdateMap(updatedTiles);

        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  };

  // Channel Action
  const handleChannel = () => {
    if (hasActedThisTurn) return;
    const mpRoll = 1 + Math.floor(Math.random() * 8);

    setActiveRoll({
      title: `${activePlayer.name} channels Anima (Rolling 1d8 MP Recovery)...`,
      dice: [{ id: 'd8_mp', type: 'd8', targetValue: mpRoll, color: '#38bdf8' }],
      onComplete: () => {
        const newMp = Math.min(activePlayer.maxMp, activePlayer.currentMp + mpRoll);
        onAddLog(`${activePlayer.name} channels Anima and restores +${mpRoll} MP (${newMp}/${activePlayer.maxMp}).`);

        const updatedPlayers = players.map(p => p.id === activePlayer.id ? { ...p, currentMp: newMp } : p);
        onUpdatePlayers(updatedPlayers);
        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  };

  // Rest Action
  const handleRest = () => {
    if (hasActedThisTurn || engagedMob) return;
    const vitVal = activePlayer.stats.VIT ?? activePlayer.stats.CON ?? 10;
    const healAmt = 5 + statMod(vitVal) * 2;
    const newHp = Math.min(activePlayer.maxHp, activePlayer.currentHp + healAmt);
    onAddLog(`${activePlayer.name} takes a short rest and recovers +${healAmt} HP (${newHp}/${activePlayer.maxHp}).`);

    const updatedPlayers = players.map(p => p.id === activePlayer.id ? { ...p, currentHp: newHp } : p);
    onUpdatePlayers(updatedPlayers);
    setHasActedThisTurn(true);
  };

  // End Turn Action
  const handleEndTurn = () => {
    const nextIndex = (activePlayerIndex + 1) % players.length;
    setActivePlayerIndex(nextIndex);
    setMovementRemaining(0);
    setHasRolledMove(false);
    setHasActedThisTurn(false);
    setEngagedMob(null);

    if (nextIndex === 0) {
      onUpdateRound(currentRound + 1);
      onAddLog(`── Round ${currentRound + 1} commences ──`);
    }

    const nextP = players[nextIndex];
    onAddLog(`${nextP.name}'s turn begins.`);
  };

  // Boss Breach
  const handleUnlockBoss = () => {
    setIsBossBreached(true);
    onAddLog('⚡ THE TOWER OF SOULS HAS BREACHED! Aion emerges from the Boss Sanctum to judge the Champions!');
  };

  const handleAttackBoss = () => {
    if (hasActedThisTurn) return;
    const dmg = 25;
    const newHp = Math.max(0, bossHp - dmg);
    setBossHp(newHp);
    onAddLog(`⚔ ${activePlayer.name} unleashes an ultimate blow on AION dealing ${dmg} damage! (${newHp}/350 HP remaining)`);
    if (newHp <= 0) {
      onAddLog('👑 VICTORY! AION IS SLAIN! The champions transcend mortality and claim immortality in Arcana Resonatia!');
    }
    setHasActedThisTurn(true);
  };

  // --------------------------------------------------------------------------
  // Crucible PvP Duel Engine (9-Card Format per GDD Pages 17-22)
  // --------------------------------------------------------------------------
  const shuffleDeck = (deck: PvPCard[]): PvPCard[] => {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const handleStartCrucibleDuel = () => {
    const targetPlayer = players.find(p => p.id === pvpTargetPlayerId);
    if (!targetPlayer || targetPlayer.id === activePlayer.id) return;

    const deckA = shuffleDeck(CLASS_PVP_DECKS[activePlayer.archetype] || CLASS_PVP_DECKS.Cana);
    const deckB = shuffleDeck(CLASS_PVP_DECKS[targetPlayer.archetype] || CLASS_PVP_DECKS.Bhana);

    const actualWagerA = Math.min(pvpWagerAmount, activePlayer.walletSr);
    const actualWagerB = Math.min(pvpWagerAmount, targetPlayer.walletSr);
    const totalPot = actualWagerA + actualWagerB;

    setPvpDuel({
      isActive: true,
      duelistA: activePlayer,
      duelistB: targetPlayer,
      wagerPot: totalPot,
      wagerItemA: pvpWagerItemA || activePlayer.equippedWeapon?.name || 'Honor Stake',
      wagerItemB: pvpWagerItemB || targetPlayer.equippedWeapon?.name || 'Honor Stake',
      handA: deckA.slice(0, 3),
      handB: deckB.slice(0, 3),
      deckA: deckA.slice(3),
      deckB: deckB.slice(3),
      trapsA: [],
      trapsB: [],
      hpA: activePlayer.currentHp,
      hpB: targetPlayer.currentHp,
      summonA: null,
      summonB: null,
      activeDuelistId: activePlayer.id,
      duelLog: [
        `⚔ Crucible Duel commenced between ${activePlayer.name} and ${targetPlayer.name}!`,
        `💰 Wager Pot: ${totalPot} Wallet SR (Total SR locked). Zero campaign lives at risk.`,
        `Both champions drew 3 cards from their deterministic 9-card decks.`
      ],
      winnerName: null
    });
  };

  const handlePlayPvpCard = (card: PvPCard) => {
    if (!pvpDuel || pvpDuel.winnerName) return;

    const isA = pvpDuel.activeDuelistId === pvpDuel.duelistA.id;
    const actorName = isA ? pvpDuel.duelistA.name : pvpDuel.duelistB.name;
    const targetName = isA ? pvpDuel.duelistB.name : pvpDuel.duelistA.name;

    // Trap Setting
    if (card.type === 'Trap') {
      const updated = { ...pvpDuel };
      if (isA) {
        updated.handA = updated.handA.filter(c => c.id !== card.id);
        updated.trapsA = [...updated.trapsA, { card, isRevealed: false }];
      } else {
        updated.handB = updated.handB.filter(c => c.id !== card.id);
        updated.trapsB = [...updated.trapsB, { card, isRevealed: false }];
      }
      updated.duelLog.push(`🂠 ${actorName} sets 1 card face-down into their Trap Zone.`);
      setPvpDuel(updated);
      return;
    }

    // Spell Resolution
    if (card.type === 'Spell') {
      const updated = { ...pvpDuel };
      let negated = false;

      // Check opponent traps
      const opponentTraps = isA ? updated.trapsB : updated.trapsA;
      const filteredTraps = opponentTraps.filter(t => {
        if (!negated && (t.card.title === 'Spellbind' || t.card.title === 'Iron Wall')) {
          negated = true;
          updated.duelLog.push(`💥 TRAP TRIGGERED! ${targetName}'s face-down [${t.card.title}] activates! ${actorName}'s [${card.title}] is negated!`);
          return false;
        }
        return true;
      });

      if (isA) updated.trapsB = filteredTraps; else updated.trapsA = filteredTraps;

      if (isA) updated.handA = updated.handA.filter(c => c.id !== card.id);
      else updated.handB = updated.handB.filter(c => c.id !== card.id);

      if (!negated) {
        if (card.title === 'Pot of Gods' || card.title === 'Quickstep' || card.title === 'Dark Contract with the Entity') {
          const deck = isA ? updated.deckA : updated.deckB;
          if (deck.length > 0) {
            if (isA) { updated.handA.push(deck[0]); updated.deckA = deck.slice(1); }
            else { updated.handB.push(deck[0]); updated.deckB = deck.slice(1); }
          }
          updated.duelLog.push(`✨ ${actorName} casts [${card.title}]: drew 1 card.`);
        } else if (card.title === 'Second Wind') {
          if (isA) updated.hpA = Math.min(updated.duelistA.maxHp, updated.hpA + 10);
          else updated.hpB = Math.min(updated.duelistB.maxHp, updated.hpB + 10);
          updated.duelLog.push(`✨ ${actorName} casts [${card.title}]: healed +10 HP.`);
        } else if (card.title === 'Awaken Soul Token' || card.title === 'Elemental Familiar') {
          if (isA) updated.summonA = { name: 'Soul Token', hp: 1 };
          else updated.summonB = { name: 'Soul Token', hp: 1 };
          updated.duelLog.push(`✨ ${actorName} summons a [Soul Token] with 1 HP (1-HP Shatter Rule applies)!`);
        } else {
          updated.duelLog.push(`✨ ${actorName} casts [${card.title}]: ${card.effect}`);
        }
      }

      setPvpDuel(updated);
      return;
    }

    // Attack Resolution
    if (card.type === 'Attack') {
      const updated = { ...pvpDuel };
      let attackNegated = false;
      let counterDamage = 0;

      // Opponent trap triggers on attack
      const opponentTraps = isA ? updated.trapsB : updated.trapsA;
      const filteredTraps = opponentTraps.filter(t => {
        if (!attackNegated && t.card.title === 'Decoy') {
          attackNegated = true;
          updated.duelLog.push(`💥 TRAP TRIGGERED! ${targetName}'s face-down [Decoy] triggers! Attack misses completely!`);
          return false;
        }
        if (!attackNegated && t.card.title === 'Counterstance') {
          attackNegated = true;
          counterDamage = 8;
          updated.duelLog.push(`💥 TRAP TRIGGERED! ${targetName}'s face-down [Counterstance] triggers! Attack negated and reflected back for ${counterDamage} damage!`);
          return false;
        }
        if (t.card.title === 'Feedback Ward') {
          counterDamage += 10;
          updated.duelLog.push(`💥 TRAP TRIGGERED! ${targetName}'s face-down [Feedback Ward] deals 10 feedback damage!`);
          return false;
        }
        return true;
      });

      if (isA) updated.trapsB = filteredTraps; else updated.trapsA = filteredTraps;
      if (isA) updated.handA = updated.handA.filter(c => c.id !== card.id);
      else updated.handB = updated.handB.filter(c => c.id !== card.id);

      if (counterDamage > 0) {
        if (isA) updated.hpA = Math.max(0, updated.hpA - counterDamage);
        else updated.hpB = Math.max(0, updated.hpB - counterDamage);
      }

      if (!attackNegated) {
        const damage = 9;
        const opponentSummon = isA ? updated.summonB : updated.summonA;

        // 1-HP Shatter Rule
        if (opponentSummon) {
          updated.duelLog.push(`🛡 1-HP SHATTER RULE: ${targetName}'s [${opponentSummon.name}] absorbs the full ${damage} damage and shatters completely! Zero bleed-through.`);
          if (isA) updated.summonB = null; else updated.summonA = null;
        } else {
          if (isA) updated.hpB = Math.max(0, updated.hpB - damage);
          else updated.hpA = Math.max(0, updated.hpA - damage);
          updated.duelLog.push(`⚔ ${actorName} plays [${card.title}] dealing ${damage} damage to ${targetName}!`);
        }
      }

      // Check Victory
      if (updated.hpB <= 0) {
        updated.winnerName = updated.duelistA.name;
        updated.duelLog.push(`👑 ${updated.duelistA.name} wins the Crucible Duel! Wager pot claimed: +${updated.wagerPot} Wallet SR.`);
        onAddLog(`👑 [Crucible PvP] ${updated.duelistA.name} defeated ${updated.duelistB.name} in a 9-Card Crucible Duel, winning +${updated.wagerPot} Wallet SR!`);

        // Transfer Wallet SR
        const updatedPlayers = players.map(p => {
          if (p.id === updated.duelistA.id) return { ...p, walletSr: p.walletSr + updated.wagerPot };
          if (p.id === updated.duelistB.id) return { ...p, walletSr: Math.max(0, p.walletSr - Math.floor(updated.wagerPot / 2)) };
          return p;
        });
        onUpdatePlayers(updatedPlayers);
      } else if (updated.hpA <= 0) {
        updated.winnerName = updated.duelistB.name;
        updated.duelLog.push(`👑 ${updated.duelistB.name} wins the Crucible Duel! Wager pot claimed: +${updated.wagerPot} Wallet SR.`);
        onAddLog(`👑 [Crucible PvP] ${updated.duelistB.name} defeated ${updated.duelistA.name} in a 9-Card Crucible Duel, winning +${updated.wagerPot} Wallet SR!`);

        const updatedPlayers = players.map(p => {
          if (p.id === updated.duelistB.id) return { ...p, walletSr: p.walletSr + updated.wagerPot };
          if (p.id === updated.duelistA.id) return { ...p, walletSr: Math.max(0, p.walletSr - Math.floor(updated.wagerPot / 2)) };
          return p;
        });
        onUpdatePlayers(updatedPlayers);
      }

      setPvpDuel(updated);
    }
  };

  const handleEndPvpTurn = () => {
    if (!pvpDuel || pvpDuel.winnerName) return;
    const nextId = pvpDuel.activeDuelistId === pvpDuel.duelistA.id ? pvpDuel.duelistB.id : pvpDuel.duelistA.id;
    const isNextA = nextId === pvpDuel.duelistA.id;
    const updated = { ...pvpDuel, activeDuelistId: nextId };

    // Draw card for next player
    const deck = isNextA ? updated.deckA : updated.deckB;
    if (deck.length > 0) {
      if (isNextA) { updated.handA.push(deck[0]); updated.deckA = deck.slice(1); }
      else { updated.handB.push(deck[0]); updated.deckB = deck.slice(1); }
    }
    const nextName = isNextA ? updated.duelistA.name : updated.duelistB.name;
    updated.duelLog.push(`➔ ${nextName}'s turn to play.`);
    setPvpDuel(updated);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden select-none">
      {/* Top Banner Bar */}
      <div className="px-6 py-2.5 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full ring-2 ring-white/50" style={{ backgroundColor: activePlayer.color }} />
            <span className="text-sm font-bold text-stone-100 font-display">
              {activePlayer.name} ({activePlayer.archetype})
            </span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1b2b22] text-amber-300 border border-[#2e4235] font-mono-nums">
            Round {currentRound} · Turn {activePlayerIndex + 1}/{players.length}
          </span>
        </div>

        {/* Global Breach / Boss Banner */}
        {isBossBreached && (
          <div className="flex items-center gap-3 px-3 py-1 bg-red-950/60 border border-red-500/60 rounded-lg">
            <span className="text-xs font-bold text-red-400 animate-pulse">
              ☠ AION (BOSS): {bossHp}/350 HP
            </span>
            <div className="w-24 h-2 bg-stone-800 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full transition-all" style={{ width: `${(bossHp / 350) * 100}%` }} />
            </div>
            <button
              onClick={handleAttackBoss}
              disabled={hasActedThisTurn}
              className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
            >
              Strike Aion
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {activePlayer.keys >= 2 && !isBossBreached && (
            <button
              onClick={handleUnlockBoss}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg shadow-md animate-bounce"
            >
              🔓 Shatter Seals (Unlock Boss)
            </button>
          )}
          <button
            onClick={() => { setShopPlayer(activePlayer); setIsShopOpen(true); }}
            className="px-3 py-1 bg-[#22332a] hover:bg-[#2d4438] text-amber-300 border border-[#3d5446] text-xs font-semibold rounded-lg"
          >
            $ Soul Corridor Shop
          </button>
          <button
            onClick={() => setIsPackOpen(true)}
            className="px-3 py-1 bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] text-xs font-semibold rounded-lg"
          >
            🎒 Inventory ({activePlayer.pack.length})
          </button>
        </div>
      </div>

      {/* Main Playtest Table Split: Map & Side GM Terminal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Interactive Map Table with Game-Feel Camera */}
        <div className="flex-1 relative bg-[#090e0b] overflow-hidden select-none">
          {/* Turn Splash Banner Overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#121c16]/90 backdrop-blur-md px-5 py-2 rounded-2xl border border-amber-500/60 shadow-2xl flex items-center gap-3 z-20 pointer-events-none">
            <div className="w-3 h-3 rounded-full animate-ping" style={{ backgroundColor: activePlayer.color }} />
            <span className="text-xs font-bold text-amber-300 tracking-wider uppercase font-display">
              {activePlayer.name}'s Turn
            </span>
            <span className="text-[11px] text-stone-300">
              {!hasRolledMove
                ? '🎲 Roll Move to begin'
                : movementRemaining > 0
                ? `🏃 ${movementRemaining} move tiles remaining`
                : '⚔ Choose an action or End Turn'}
            </span>
          </div>

          {/* Camera Viewport HUD Controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-[#142019]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#2a3c33] shadow-lg">
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.min(3.0, prev.zoom * 1.25) }))}
              className="w-7 h-7 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-xs font-bold flex items-center justify-center"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.max(0.3, prev.zoom * 0.8) }))}
              className="w-7 h-7 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-xs font-bold flex items-center justify-center"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => panToPlayer(activePlayer)}
              className="px-2.5 h-7 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-400 text-[11px] font-bold flex items-center justify-center gap-1"
              title="Center on Active Champion"
            >
              🎯 Pan to {activePlayer.name}
            </button>
            <button
              onClick={() => setIsCameraAutoPan(!isCameraAutoPan)}
              className={`px-2 h-7 rounded text-[11px] font-semibold border ${isCameraAutoPan ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-[#1f3026] text-stone-400 border-transparent'}`}
              title="Toggle Auto Camera Tracking"
            >
              Auto-Pan: {isCameraAutoPan ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
              className="w-7 h-7 rounded bg-[#1f3026] hover:bg-[#2b4234] text-stone-300 text-xs font-bold flex items-center justify-center"
              title="Reset View"
            >
              ⟲
            </button>
          </div>

          <svg className="w-full h-full" viewBox="-450 -350 900 700">
            {/* Camera Smooth Viewport Group */}
            <g
              transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}
              style={{ transition: 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
            >
              {/* Active Player Glowing Beacon / Spotlight on Map */}
              {(() => {
                if (!activePlayer || !activePlayer.position) return null;
                const [aq, ar] = activePlayer.position.split(',').map(Number);
                if (isNaN(aq) || isNaN(ar)) return null;
                const [ax, ay] = hexToPixel(aq, ar);
                return (
                  <g pointerEvents="none">
                    <circle cx={ax} cy={ay} r="28" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5 3" className="animate-spin" style={{ animationDuration: '8s' }} />
                    <circle cx={ax} cy={ay} r="34" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" className="animate-ping" style={{ animationDuration: '2.5s' }} />
                  </g>
                );
              })()}

              {Object.keys(mapTiles).map(key => {
                const tile = mapTiles[key];
                const [px, py] = hexToPixel(tile.q, tile.r);
                const isReachable = reachableTiles.has(key);

                let fillColor = tile.type === 'W' ? '#181f1b' : tile.type === 'O' ? '#383b39' : '#22332a';
                if (tile.type === 'B') fillColor = '#0e0e0e';

                return (
                  <g
                    key={key}
                    onClick={() => handleTileClick(key)}
                    className={`transition-all ${isReachable ? 'cursor-pointer' : ''}`}
                  >
                    <polygon
                      points={hexPoints(px, py)}
                      fill={fillColor}
                      stroke={isReachable ? '#38bdf8' : tile.type === 'W' ? '#121714' : '#2e4236'}
                      strokeWidth={isReachable ? 2.5 : 1.2}
                      className={isReachable ? 'filter drop-shadow-md' : ''}
                    />

                    {tile.type === 'B' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#d4a94a" fontSize="15" fontWeight="bold">☠</text>
                    )}
                    {tile.type === 'C' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#ffd166" fontSize="13">▣</text>
                    )}
                    {tile.type === 'Shop' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#f59e0b" fontSize="13">$</text>
                    )}
                    {tile.type === 'Shrine' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#10b981" fontSize="13">✚</text>
                    )}

                    {/* Mob Icon */}
                    {tile.mob && (
                      <g>
                        <circle cx={px} cy={py} r="10" fill="#2d1512" stroke="#e0553a" strokeWidth="2" />
                        <text x={px} y={py + 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
                          {tile.mob.isMiniBoss ? '★' : ''}{tile.mob.cr}
                        </text>
                      </g>
                    )}

                    {/* Player Tokens */}
                    {players.filter(p => p.position === key).map((p, idx) => {
                      const isActive = p.id === activePlayer.id;
                      return (
                        <g key={p.id} transform={`translate(${idx * 4}, ${idx * -4})`}>
                          <circle cx={px} cy={py} r={isActive ? 11 : 9} fill={p.color} stroke={isActive ? '#fbbf24' : '#ffffff'} strokeWidth={isActive ? 3 : 2} />
                          <text x={px} y={py + 3.5} textAnchor="middle" fill="#000" fontSize="10" fontWeight="extrabold">
                            {p.name[0]}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Active Mob Encounter Floating Card */}
          {engagedMob && (
            <div className="absolute top-16 left-4 bg-[#141f19]/95 backdrop-blur-md p-4 rounded-xl border border-red-500/50 shadow-2xl w-80 z-20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-red-400 font-bold text-sm font-display">
                  ⚔ {engagedMob.mob.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                  CR {engagedMob.mob.cr}
                </span>
              </div>
              <p className="text-xs text-stone-300 mb-2">
                Element: <b className="text-amber-300">{engagedMob.mob.element}</b> | HP: <b className="text-emerald-400">{engagedMob.mob.hp}/{engagedMob.mob.maxHp}</b>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAttack(engagedMob.mob, engagedMob.tileKey)}
                  disabled={hasActedThisTurn}
                  className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-50"
                >
                  Attack (2d6 + ATK)
                </button>
                <button
                  onClick={() => setEngagedMob(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-stone-300 text-xs"
                >
                  Retreat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: GM Action Terminal & Party HUD */}
        <div className="w-[410px] bg-[#111a15] border-l border-[#2e3f36] flex flex-col overflow-y-auto p-4 shrink-0">
          {/* Active Player Card */}
          <div className="p-4 rounded-xl bg-[#16231c] border border-amber-500/40 mb-4 shadow-lg">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-base font-bold text-stone-100 font-display" style={{ color: activePlayer.color }}>
                  {activePlayer.name}
                </h2>
                <span className="text-xs text-stone-400">
                  {activePlayer.archetype} · Level {activePlayer.level} (PB +{getProficiencyBonus(activePlayer.level)})
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm font-mono-nums">
                {Array.from({ length: activePlayer.lives }).map((_, i) => (
                  <span key={i} className="text-red-400 text-base" title="Soul Spark / Life">♥</span>
                ))}
              </div>
            </div>

            {/* Health & Mana Bars */}
            <div className="space-y-1.5 mb-3 text-xs font-mono-nums">
              <div className="flex justify-between text-[11px]">
                <span className="text-stone-400">HP: {activePlayer.currentHp} / {activePlayer.maxHp}</span>
                <span className="text-stone-400">MP: {activePlayer.currentMp} / {activePlayer.maxMp}</span>
              </div>
              <div className="w-full h-2.5 bg-stone-900 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${(activePlayer.currentHp / activePlayer.maxHp) * 100}%` }}
                />
              </div>
            </div>

            {/* SR Currency & Keys */}
            <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-[#0e1612] text-xs font-mono-nums mb-3">
              <div>
                <span className="text-stone-400 text-[10px] block">Wallet SR</span>
                <b className="text-amber-400">{activePlayer.walletSr}</b>
              </div>
              <div>
                <span className="text-stone-400 text-[10px] block">Total SR</span>
                <b className="text-stone-300">{activePlayer.totalSr}</b>
              </div>
              <div>
                <span className="text-stone-400 text-[10px] block">Boss Keys</span>
                <b className="text-teal-400">🔑 {activePlayer.keys}/2</b>
              </div>
            </div>

            {/* Equipped Loadout with AGI / STR Stats */}
            <div className="text-xs text-stone-300 space-y-1 pt-2 border-t border-[#23352b]">
              <div>
                Weapon: <b className="text-amber-300">{activePlayer.equippedWeapon?.name || 'Unarmed'}</b> (ATK {activePlayer.equippedWeapon?.baseAtk || 5}, Scale: {activePlayer.equippedWeapon?.scalingStat || 'STR/AGI'})
              </div>
              <div>
                Armor: <b className="text-emerald-300">{activePlayer.equippedArmor?.name || 'Unarmored'}</b> (AC +{activePlayer.equippedArmor?.baseAc || 0})
              </div>
            </div>
          </div>

          {/* Turn Action Buttons */}
          <div className="space-y-2 mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-display">
              Turn Actions
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleRollMove}
                disabled={hasRolledMove}
                className="py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs disabled:opacity-40 transition-colors"
              >
                🎲 Roll Move ({hasRolledMove ? `${movementRemaining} left` : '3D Die'})
              </button>

              <button
                onClick={handleChannel}
                disabled={hasActedThisTurn}
                className="py-2 px-3 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-teal-300 border border-[#3d5446] font-semibold text-xs disabled:opacity-40"
              >
                ✨ Channel (d8)
              </button>

              <button
                onClick={handleRest}
                disabled={hasActedThisTurn || !!engagedMob}
                className="py-2 px-3 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-emerald-300 border border-[#3d5446] font-semibold text-xs disabled:opacity-40"
              >
                ✚ Rest (+HP)
              </button>

              <button
                onClick={handleOpenChest}
                disabled={hasActedThisTurn || mapTiles[activePlayer.position]?.type !== 'C'}
                className="py-2 px-3 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-amber-300 border border-[#3d5446] font-semibold text-xs disabled:opacity-40"
              >
                ▣ Open Chest
              </button>
            </div>

            {/* Dedicated Crucible PvP Challenge Button */}
            <button
              onClick={() => {
                const rival = players.find(p => p.id !== activePlayer.id);
                if (rival) setPvpTargetPlayerId(rival.id);
                setIsPvpModalOpen(true);
              }}
              className="w-full py-2 bg-gradient-to-r from-amber-600/30 to-red-600/30 hover:from-amber-600/45 hover:to-red-600/45 text-amber-300 border border-amber-500/50 rounded-lg text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
            >
              ⚔️ Challenge Rival to Crucible Duel (9-Card Format)
            </button>

            <button
              onClick={handleEndTurn}
              className="w-full py-2.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] font-bold text-xs transition-colors mt-2"
            >
              Finish Turn ➔
            </button>
          </div>

          {/* Party Overview Strip */}
          <div className="p-3 rounded-xl bg-[#141f19] border border-[#24362b] mb-4">
            <h3 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
              Party Status (Click to inspect / pan)
            </h3>
            <div className="space-y-1.5 text-xs font-mono-nums">
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setActivePlayerIndex(idx);
                    panToPlayer(p);
                  }}
                  className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${idx === activePlayerIndex ? 'bg-[#22352b] text-amber-300' : 'text-stone-400 hover:bg-[#1a2820]'}`}
                >
                  <span className="font-semibold" style={{ color: p.color }}>{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span>HP {p.currentHp}/{p.maxHp}</span>
                    <span>♥{p.lives}</span>
                    <span>{p.walletSr} SR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Action & Combat Log */}
          <div className="flex-1 flex flex-col p-3 rounded-xl bg-[#090e0b] border border-[#22332a] overflow-hidden min-h-[160px]">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
              Event & Battle Log
            </span>
            <div className="flex-1 overflow-y-auto space-y-1 text-[11px] text-stone-300 font-mono-nums pr-1">
              {combatLog.slice(-30).map((log, i) => (
                <div key={i} className="leading-snug border-b border-stone-800/40 pb-0.5">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Soul Corridor Shop Modal */}
      {isShopOpen && shopPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141f19] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-amber-400 font-display">
                Soul Corridor — Attribute Apotheosis
              </h2>
              <button
                onClick={() => setIsShopOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-stone-300">
              Spend spendable <strong>Wallet SR</strong> (Balance: <b className="text-amber-300">{shopPlayer.walletSr} SR</b>) to augment your champion's base attributes:
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {(['STR', 'AGI', 'VIT', 'INT'] as const).map(stat => {
                const cur = shopPlayer.stats[stat] || 1;
                const cost = cur * 10;
                return (
                  <div key={stat} className="p-3 bg-[#0d1611] rounded-xl border border-[#203226] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-stone-200 block">{stat} ({cur})</span>
                      <span className="text-[10px] text-stone-400">Cost: {cost} SR</span>
                    </div>
                    <button
                      disabled={shopPlayer.walletSr < cost}
                      onClick={() => {
                        const updated = players.map(p => {
                          if (p.id === shopPlayer.id) {
                            return {
                              ...p,
                              walletSr: p.walletSr - cost,
                              stats: { ...p.stats, [stat]: cur + 1 }
                            };
                          }
                          return p;
                        });
                        onUpdatePlayers(updated);
                        setShopPlayer(updated.find(p => p.id === shopPlayer.id) || null);
                        onAddLog(`${shopPlayer.name} upgraded ${stat} to ${cur + 1} at the Soul Corridor!`);
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-40"
                    >
                      +1 {stat}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Inventory & Equipment Modal */}
      {isPackOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141f19] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-xl w-full space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-amber-400 font-display">
                {activePlayer.name}'s Pack & Loadout
              </h2>
              <button
                onClick={() => setIsPackOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            <div className="p-3 bg-[#0d1611] rounded-xl border border-[#203226] text-xs space-y-2">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide block">Currently Equipped</span>
              <div className="grid grid-cols-2 gap-2 text-stone-200">
                <div>Weapon: <b className="text-amber-300">{activePlayer.equippedWeapon?.name || 'None'}</b></div>
                <div>Armor: <b className="text-emerald-300">{activePlayer.equippedArmor?.name || 'None'}</b></div>
              </div>
            </div>

            <span className="text-xs font-bold text-stone-300 block">Inventory Items ({activePlayer.pack.length})</span>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {activePlayer.pack.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-500 italic bg-[#0d1611] rounded-xl">
                  Pack is empty. Defeat monsters and open chests to loot equipment!
                </div>
              ) : (
                activePlayer.pack.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-[#0d1611] rounded-xl border border-[#203226] flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-100">{item.name}</span>
                        <span className="text-[10px] text-amber-400 uppercase font-mono-nums">[{item.category}]</span>
                      </div>
                      <p className="text-[11px] text-stone-400 line-clamp-1">{item.effectDescription || item.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.category === 'weapon' && (
                        <button
                          onClick={() => {
                            const updated = players.map(p => p.id === activePlayer.id ? { ...p, equippedWeapon: item } : p);
                            onUpdatePlayers(updated);
                            onAddLog(`${activePlayer.name} equipped ${item.name}!`);
                          }}
                          className="px-2.5 py-1 rounded bg-[#1f3226] hover:bg-[#2b4434] text-amber-300 font-bold text-[11px] border border-[#354f3e]"
                        >
                          Equip
                        </button>
                      )}
                      {item.category === 'armor' && (
                        <button
                          onClick={() => {
                            const updated = players.map(p => p.id === activePlayer.id ? { ...p, equippedArmor: item } : p);
                            onUpdatePlayers(updated);
                            onAddLog(`${activePlayer.name} donned ${item.name}!`);
                          }}
                          className="px-2.5 py-1 rounded bg-[#1f3226] hover:bg-[#2b4434] text-emerald-300 font-bold text-[11px] border border-[#354f3e]"
                        >
                          Equip
                        </button>
                      )}
                      {item.category === 'consumable' && (
                        <button
                          onClick={() => {
                            const newHp = Math.min(activePlayer.maxHp, activePlayer.currentHp + Math.floor(activePlayer.maxHp * ((item.healHpPct || 25) / 100)));
                            const updated = players.map(p => p.id === activePlayer.id ? {
                              ...p,
                              currentHp: newHp,
                              pack: p.pack.filter((_, i) => i !== idx)
                            } : p);
                            onUpdatePlayers(updated);
                            onAddLog(`${activePlayer.name} consumed ${item.name} restoring HP (${newHp}/${activePlayer.maxHp})!`);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px]"
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Crucible PvP Duel Modal (9-Card Format & Wager Engine) */}
      {isPvpModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141f19] p-6 rounded-2xl border border-amber-500/60 shadow-2xl max-w-4xl w-full flex flex-col gap-4 max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center pb-2 border-b border-[#24352b]">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono-nums">
                  The Crucible · 9-Card Format
                </span>
                <h2 className="text-lg font-bold text-stone-100 font-display">
                  Honor Duel & Wager Formulation
                </h2>
              </div>
              <button
                onClick={() => { setIsPvpModalOpen(false); setPvpDuel(null); }}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close Arena
              </button>
            </div>

            {!pvpDuel ? (
              /* Wager Formulation Screen */
              <div className="space-y-4 text-xs">
                <p className="text-stone-300 leading-relaxed">
                  Formulate a mutual Crucible challenge. Both duelists wager spendable <strong>Wallet SR</strong> (Total SR is locked) and optional equipment.
                  Zero campaign lives are lost in Crucible duels.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#0d1611] border border-[#223328] space-y-3">
                    <span className="text-amber-400 font-bold block">Challenger: {activePlayer.name}</span>
                    <div>
                      <label className="text-stone-400 block mb-1">Wallet SR Available: {activePlayer.walletSr} SR</label>
                      <input
                        type="number"
                        min={10}
                        max={activePlayer.walletSr}
                        value={pvpWagerAmount}
                        onChange={e => setPvpWagerAmount(Math.max(10, Math.min(activePlayer.walletSr, +e.target.value)))}
                        className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-mono-nums"
                      />
                    </div>
                    <div>
                      <label className="text-stone-400 block mb-1">Wager Item (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Ember Shortbow or None"
                        value={pvpWagerItemA}
                        onChange={e => setPvpWagerItemA(e.target.value)}
                        className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0d1611] border border-[#223328] space-y-3">
                    <span className="text-amber-400 font-bold block">Choose Rival Opponent:</span>
                    <select
                      value={pvpTargetPlayerId}
                      onChange={e => setPvpTargetPlayerId(+e.target.value)}
                      className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100"
                    >
                      {players.filter(p => p.id !== activePlayer.id).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.archetype}) · {p.walletSr} Wallet SR
                        </option>
                      ))}
                    </select>
                    <div>
                      <label className="text-stone-400 block mb-1">Rival Staked Item (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Spark Cleaver or None"
                        value={pvpWagerItemB}
                        onChange={e => setPvpWagerItemB(e.target.value)}
                        className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleStartCrucibleDuel}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  ⚔ Commence Crucible Duel (Draw 3-Card Hands)
                </button>
              </div>
            ) : (
              /* Live 9-Card Crucible Duel Arena */
              <div className="flex-1 flex flex-col gap-3 overflow-hidden text-xs">
                {/* Pot Banner */}
                <div className="p-2.5 rounded-xl bg-[#0d1611] border border-[#223328] flex items-center justify-between font-mono-nums">
                  <div>
                    <span className="text-amber-400 font-bold">Total Pot: </span>
                    <span className="text-stone-100 font-bold text-sm">{pvpDuel.wagerPot} Wallet SR</span>
                  </div>
                  <div className="text-stone-400">
                    Stakes: [{pvpDuel.wagerItemA}] vs [{pvpDuel.wagerItemB}]
                  </div>
                  <div>
                    <span className="text-stone-400">Active Turn: </span>
                    <span className="text-amber-300 font-bold">
                      {pvpDuel.activeDuelistId === pvpDuel.duelistA.id ? pvpDuel.duelistA.name : pvpDuel.duelistB.name}
                    </span>
                  </div>
                </div>

                {pvpDuel.winnerName && (
                  <div className="p-3 bg-amber-500/20 border border-amber-400 rounded-xl text-center">
                    <span className="text-base font-bold text-amber-300 font-display block">
                      👑 {pvpDuel.winnerName} Claims Victory!
                    </span>
                    <span className="text-[11px] text-stone-300">
                      Pot of {pvpDuel.wagerPot} Wallet SR awarded. Defeated duelist retains all campaign lives.
                    </span>
                  </div>
                )}

                {/* 2 Duelists Split */}
                <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
                  {/* Duelist A */}
                  <div className={`p-3 rounded-xl border flex flex-col justify-between overflow-hidden ${pvpDuel.activeDuelistId === pvpDuel.duelistA.id ? 'border-amber-400/80 bg-[#16231c]' : 'border-[#223328] bg-[#0d1611]'}`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-stone-100 font-display">{pvpDuel.duelistA.name} ({pvpDuel.duelistA.archetype})</span>
                        <span className="text-emerald-400 font-mono-nums font-bold">{pvpDuel.hpA} / {pvpDuel.duelistA.maxHp} HP</span>
                      </div>
                      <div className="w-full h-2 bg-stone-900 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(pvpDuel.hpA / pvpDuel.duelistA.maxHp) * 100}%` }} />
                      </div>

                      {pvpDuel.summonA && (
                        <div className="p-1.5 bg-purple-950/60 border border-purple-500/50 rounded text-[11px] text-purple-300 mb-2">
                          Summon Token (1 HP) absorbs next attack fully
                        </div>
                      )}

                      <div className="mb-2">
                        <span className="text-[10px] text-stone-400 font-semibold block mb-1">Face-Down Trap Zone:</span>
                        <div className="flex gap-1.5">
                          {pvpDuel.trapsA.length === 0 ? (
                            <span className="text-[11px] text-stone-600 italic">No traps set</span>
                          ) : (
                            pvpDuel.trapsA.map((t, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/60 text-purple-300 text-[10px]">
                                🂠 Trap Set
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Hand */}
                      <span className="text-[11px] text-stone-400 font-semibold block mb-1.5">Hand Cards ({pvpDuel.handA.length}):</span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {pvpDuel.handA.map(card => (
                          <div key={card.id} className="p-2 rounded bg-[#0a0f0c] border border-[#202e26] flex items-center justify-between">
                            <div>
                              <span className="font-bold text-stone-200 block">{card.title} [{card.type}]</span>
                              <span className="text-[10px] text-stone-400 line-clamp-1">{card.effect}</span>
                            </div>
                            {pvpDuel.activeDuelistId === pvpDuel.duelistA.id && !pvpDuel.winnerName && (
                              <button
                                onClick={() => handlePlayPvpCard(card)}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] rounded whitespace-nowrap ml-2"
                              >
                                {card.type === 'Trap' ? 'Set Face-Down' : 'Play'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Duelist B */}
                  <div className={`p-3 rounded-xl border flex flex-col justify-between overflow-hidden ${pvpDuel.activeDuelistId === pvpDuel.duelistB.id ? 'border-amber-400/80 bg-[#16231c]' : 'border-[#223328] bg-[#0d1611]'}`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-stone-100 font-display">{pvpDuel.duelistB.name} ({pvpDuel.duelistB.archetype})</span>
                        <span className="text-emerald-400 font-mono-nums font-bold">{pvpDuel.hpB} / {pvpDuel.duelistB.maxHp} HP</span>
                      </div>
                      <div className="w-full h-2 bg-stone-900 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(pvpDuel.hpB / pvpDuel.duelistB.maxHp) * 100}%` }} />
                      </div>

                      {pvpDuel.summonB && (
                        <div className="p-1.5 bg-purple-950/60 border border-purple-500/50 rounded text-[11px] text-purple-300 mb-2">
                          Summon Token (1 HP) absorbs next attack fully
                        </div>
                      )}

                      <div className="mb-2">
                        <span className="text-[10px] text-stone-400 font-semibold block mb-1">Face-Down Trap Zone:</span>
                        <div className="flex gap-1.5">
                          {pvpDuel.trapsB.length === 0 ? (
                            <span className="text-[11px] text-stone-600 italic">No traps set</span>
                          ) : (
                            pvpDuel.trapsB.map((t, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/60 text-purple-300 text-[10px]">
                                🂠 Trap Set
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Hand */}
                      <span className="text-[11px] text-stone-400 font-semibold block mb-1.5">Hand Cards ({pvpDuel.handB.length}):</span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {pvpDuel.handB.map(card => (
                          <div key={card.id} className="p-2 rounded bg-[#0a0f0c] border border-[#202e26] flex items-center justify-between">
                            <div>
                              <span className="font-bold text-stone-200 block">{card.title} [{card.type}]</span>
                              <span className="text-[10px] text-stone-400 line-clamp-1">{card.effect}</span>
                            </div>
                            {pvpDuel.activeDuelistId === pvpDuel.duelistB.id && !pvpDuel.winnerName && (
                              <button
                                onClick={() => handlePlayPvpCard(card)}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] rounded whitespace-nowrap ml-2"
                              >
                                {card.type === 'Trap' ? 'Set Face-Down' : 'Play'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Log & Pass Turn */}
                <div className="p-2.5 rounded-xl bg-[#0d1611] border border-[#223328] flex items-center justify-between">
                  <div className="text-[11px] text-stone-400 font-mono-nums max-w-lg truncate">
                    {pvpDuel.duelLog[pvpDuel.duelLog.length - 1]}
                  </div>
                  {!pvpDuel.winnerName && (
                    <button
                      onClick={handleEndPvpTurn}
                      className="px-3 py-1 bg-[#1f3026] hover:bg-[#2b4434] text-amber-300 border border-[#354f3e] rounded font-bold text-xs"
                    >
                      Pass Turn ➔
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3D Physics Dice Modal Overlay */}
      {activeRoll && (
        <ThreeDiceCanvas
          activeRoll={activeRoll}
          onCloseOverlay={() => setActiveRoll(null)}
        />
      )}
    </div>
  );
};
