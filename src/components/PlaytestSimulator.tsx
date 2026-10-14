import React, { useState, useMemo, useCallback } from 'react';
import { PlayerCharacter, HexTile, ItemEntity, ElementType, MobEntity } from '../types/game';
import { ThreeDiceCanvas, DiceRequest, DiceResult } from './ThreeDiceCanvas';
import { ELEMENT_LIST, BIOME_CONFIGS } from '../data/defaultGameData';

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

  // Boss state
  const [isBossBreached, setIsBossBreached] = useState(false);
  const [bossHp, setBossHp] = useState(350);
  const [aggroPlayerId, setAggroPlayerId] = useState<number | null>(null);

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

  const activePlayer = players[activePlayerIndex] || players[0];

  // Initialize player positions to their spawns if 0,0
  React.useEffect(() => {
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
  const statMod = (val: number) => Math.floor((val - 10) / 2);
  const getProficiencyBonus = (lvl: number) => (lvl < 5 ? 2 : lvl < 9 ? 3 : lvl < 13 ? 4 : lvl < 17 ? 5 : 6);

  // Speed calculation: Base 1 + (DEX / 5) rounded down
  const getSpeedTiles = (dex: number) => Math.max(1, 1 + Math.floor(dex / 5));

  // Roll Move with 3D Dice
  const handleRollMove = () => {
    if (hasRolledMove) return;
    const dieType = activePlayer.archetype === 'Cana' ? 'd8' : 'd6';
    const targetRoll = 1 + Math.floor(Math.random() * (dieType === 'd8' ? 8 : 6));
    const speedBonus = getSpeedTiles(activePlayer.stats.DEX);

    setActiveRoll({
      title: `${activePlayer.name} — Rolling Movement (${dieType} + Speed ${speedBonus})`,
      dice: [{ id: 'move_die', type: dieType === 'd8' ? 'd8' : 'd6', targetValue: targetRoll, color: activePlayer.color }],
      onComplete: () => {
        const total = targetRoll + speedBonus;
        setMovementRemaining(total);
        setHasRolledMove(true);
        onAddLog(`${activePlayer.name} rolled ${targetRoll} (+${speedBonus} Speed) → ${total} movement tiles.`);
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

  // Handle Move Click
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
    const scaling = weapon?.scalingStat || (activePlayer.archetype === 'Bhana' ? 'STR' : activePlayer.archetype === 'Cana' ? 'DEX' : 'INT');
    const attMod = statMod(activePlayer.stats[scaling]);
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

          // Update player rewards
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

          // Remove mob from tile
          const updatedTiles = { ...mapTiles };
          delete updatedTiles[tileKey].mob;
          updatedTiles[tileKey].type = 'P';
          onUpdateMap(updatedTiles);
          setEngagedMob(null);
        } else {
          // Mob counter-attack
          const mobDmg = Math.max(1, 4 + targetMob.cr - statMod(activePlayer.stats.CON));
          const pNewHp = Math.max(0, activePlayer.currentHp - mobDmg);
          onAddLog(`${targetMob.name} strikes back for ${mobDmg} damage to ${activePlayer.name}!`);

          const updatedPlayers = players.map(p => {
            if (p.id === activePlayer.id) {
              if (pNewHp <= 0) {
                const newLives = p.lives - 1;
                onAddLog(`💔 ${p.name} drops to 0 HP! Lives remaining: ${newLives}`);
                return {
                  ...p,
                  lives: newLives,
                  currentHp: newLives > 0 ? Math.floor(p.maxHp * 0.5) : 0,
                  position: p.trail[0] || p.position
                };
              }
              return { ...p, currentHp: pNewHp };
            }
            return p;
          });
          onUpdatePlayers(updatedPlayers);
        }

        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  }, [activePlayer, hasActedThisTurn, players, mapTiles, onUpdatePlayers, onUpdateMap, onAddLog]);

  // Open Chest Action
  const handleOpenChest = () => {
    if (hasActedThisTurn) return;
    const tile = mapTiles[activePlayer.position];
    if (tile.type !== 'C') return;

    const roll = 1 + Math.floor(Math.random() * 20);
    setActiveRoll({
      title: `${activePlayer.name} opens Treasure Chest (d20 + Depth ${tile.depth})`,
      dice: [{ id: 'chest_die', type: 'd20', targetValue: roll, color: '#ffd166' }],
      onComplete: () => {
        const total = roll + 2 * tile.depth;
        let rewardText = '';
        const updatedPlayers = [...players];
        const p = updatedPlayers[activePlayerIndex];

        if (total <= 7) {
          const sr = 150 * (1 + tile.depth);
          p.walletSr += sr;
          p.totalSr += sr;
          rewardText = `SR Pouch: +${sr} SR`;
        } else if (total <= 12) {
          const el = ELEMENT_LIST[Math.floor(Math.random() * ELEMENT_LIST.length)].id;
          if (p.counters.length < 4) p.counters.push(el);
          rewardText = `Counter Cache: +1 ${el} Counter`;
        } else if (total <= 16) {
          const randomGear = allItems.filter(i => i.category === 'weapon' || i.category === 'armor')[Math.floor(Math.random() * allItems.length)];
          p.pack.push(randomGear);
          rewardText = `Found: ${randomGear.name} (${randomGear.rarity})`;
        } else {
          const relicGear = allItems.filter(i => i.rarity === 'Legendary')[0] || allItems[0];
          p.pack.push(relicGear);
          rewardText = `Legendary Relic: ${relicGear.name}!`;
        }

        onAddLog(`▣ Chest opened! Roll ${total}: ${rewardText}`);
        onUpdatePlayers(updatedPlayers);

        // Turn chest into Path
        const updatedTiles = { ...mapTiles };
        updatedTiles[activePlayer.position].type = 'P';
        delete updatedTiles[activePlayer.position].chestTier;
        onUpdateMap(updatedTiles);

        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  };

  // Channel Element Action
  const handleChannel = () => {
    if (hasActedThisTurn) return;
    const roll = 1 + Math.floor(Math.random() * 8);
    const chosenElement = roll === 8 ? activePlayer.affinity : ELEMENT_LIST[(roll - 1) % ELEMENT_LIST.length].id;

    setActiveRoll({
      title: `${activePlayer.name} channels Arcana (d8 Element Die)`,
      dice: [{ id: 'element_die', type: 'd8', targetValue: roll, color: '#4aa3e0' }],
      onComplete: () => {
        const updatedPlayers = [...players];
        const p = updatedPlayers[activePlayerIndex];
        if (p.counters.length < 4) {
          p.counters.push(chosenElement);
          onAddLog(`${p.name} channels and gains 1 ${chosenElement} Counter!`);
        } else {
          onAddLog(`${p.name} channels but counter capacity (4) is full!`);
        }
        onUpdatePlayers(updatedPlayers);
        setHasActedThisTurn(true);
        setActiveRoll(null);
      }
    });
  };

  // Rest Action
  const handleRest = () => {
    if (hasActedThisTurn || engagedMob) return;
    const healAmount = 6 + getProficiencyBonus(activePlayer.level);
    const updatedPlayers = [...players];
    const p = updatedPlayers[activePlayerIndex];
    p.currentHp = Math.min(p.maxHp, p.currentHp + healAmount);
    onUpdatePlayers(updatedPlayers);
    onAddLog(`${p.name} rests and recovers +${healAmount} HP (HP: ${p.currentHp}/${p.maxHp}).`);
    setMovementRemaining(0);
    setHasActedThisTurn(true);
  };

  // End Turn
  const handleEndTurn = () => {
    setMovementRemaining(0);
    setHasRolledMove(false);
    setHasActedThisTurn(false);
    setEngagedMob(null);

    const nextIndex = (activePlayerIndex + 1) % players.length;
    setActivePlayerIndex(nextIndex);

    if (nextIndex === 0) {
      onUpdateRound(currentRound + 1);
      onAddLog(`— Round ${currentRound + 1} begins —`);

      // Boss Mutiny check if breached
      if (isBossBreached) {
        const mutinyRoll = 1 + Math.floor(Math.random() * 6);
        const target = players.find(p => p.id === aggroPlayerId) || players[0];
        const bossDmg = 8 + mutinyRoll * 2;
        onAddLog(`☠ Aion Mutiny roll: ${mutinyRoll}! Boss unleashes ${bossDmg} damage onto ${target.name}!`);
        const updated = players.map(p => p.id === target.id ? { ...p, currentHp: Math.max(0, p.currentHp - bossDmg) } : p);
        onUpdatePlayers(updated);
      }
    }
  };

  // Unlock Boss (Global Breach)
  const handleUnlockBoss = () => {
    if (activePlayer.keys < 2) {
      alert('You need at least 2 Boss Keys from defeated Mini-Bosses to breach Pneuma\'s Tower!');
      return;
    }
    setIsBossBreached(true);
    setAggroPlayerId(activePlayer.id);
    onAddLog(`⚠ GLOBAL BREACH! ${activePlayer.name} uses 2 Keys to shatter the seals of Pneuma's Tower! Aion awakes!`);
  };

  // Attack Boss directly
  const handleAttackBoss = () => {
    if (!isBossBreached || hasActedThisTurn) return;
    const roll = 1 + Math.floor(Math.random() * 20);
    const dmg = (activePlayer.equippedWeapon?.baseAtk || 8) + roll;
    const newBossHp = Math.max(0, bossHp - dmg);
    setBossHp(newBossHp);
    setAggroPlayerId(activePlayer.id);
    onAddLog(`🔥 ${activePlayer.name} strikes Aion for ${dmg} damage! Boss HP: ${newBossHp}/350`);

    if (newBossHp <= 0) {
      onAddLog(`🏆 AION HAS FALLEN! ${activePlayer.name} delivers the final blow, claims Athanasia, and ascends as the new god of Olympus!`);
      alert(`VICTORY! ${activePlayer.name} has defeated Aion and won the game!`);
    }
    setHasActedThisTurn(true);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* 3D Rolling Dice Modal Overlay */}
      {activeRoll && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <ThreeDiceCanvas
            activeRoll={activeRoll}
            onCloseOverlay={() => setActiveRoll(null)}
          />
        </div>
      )}

      {/* Top Banner: Round and Status */}
      <div className="px-6 py-3 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-display font-bold text-base">
            Round {currentRound}
          </span>
          <span className="text-stone-400 text-xs">|</span>
          <span className="text-xs font-semibold" style={{ color: activePlayer.color }}>
            Current Turn: {activePlayer.name} ({activePlayer.archetype} Lv {activePlayer.level})
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
        {/* Left: Interactive Map Table */}
        <div className="flex-1 relative bg-[#090e0b] overflow-hidden select-none">
          <svg className="w-full h-full" viewBox="-450 -350 900 700">
            {Object.keys(mapTiles).map(key => {
              const tile = mapTiles[key];
              const [px, py] = hexToPixel(tile.q, tile.r);
              const isReachable = reachableTiles.has(key);
              const isOccupied = players.some(p => p.position === key);

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
                  {players.filter(p => p.position === key).map((p, idx) => (
                    <g key={p.id} transform={`translate(${idx * 4}, ${idx * -4})`}>
                      <circle cx={px} cy={py} r="9" fill={p.color} stroke="#ffffff" strokeWidth="2" />
                      <text x={px} y={py + 3.5} textAnchor="middle" fill="#000" fontSize="10" fontWeight="extrabold">
                        {p.name[0]}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>

          {/* Active Mob Encounter Floating Card */}
          {engagedMob && (
            <div className="absolute top-4 left-4 bg-[#141f19]/95 backdrop-blur-md p-4 rounded-xl border border-red-500/50 shadow-2xl w-80 z-20">
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
        <div className="w-[400px] bg-[#111a15] border-l border-[#2e3f36] flex flex-col overflow-y-auto p-4">
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

            {/* Counter Tokens */}
            <div className="flex items-center gap-1.5 text-xs mb-3">
              <span className="text-stone-400">Counters:</span>
              {activePlayer.counters.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1f3026] text-amber-300 border border-[#354f3e]">
                  ● {c}
                </span>
              ))}
              {activePlayer.counters.length === 0 && (
                <span className="text-stone-500 italic text-[11px]">None</span>
              )}
            </div>

            {/* Equipped Loadout */}
            <div className="text-xs text-stone-300 space-y-1 pt-2 border-t border-[#23352b]">
              <div>Weapon: <b className="text-amber-300">{activePlayer.equippedWeapon?.name || 'Unarmed'}</b> (ATK {activePlayer.equippedWeapon?.baseAtk || 5})</div>
              <div>Armor: <b className="text-emerald-300">{activePlayer.equippedArmor?.name || 'Unarmored'}</b> (AC +{activePlayer.equippedArmor?.baseAc || 0})</div>
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
              Party Status
            </h3>
            <div className="space-y-1.5 text-xs font-mono-nums">
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  onClick={() => setActivePlayerIndex(idx)}
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
          <div className="bg-[#141e18] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-amber-400 font-display">
                $ Soul Corridor — Stat & Power Shop
              </h2>
              <button
                onClick={() => setIsShopOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-stone-300 mb-4">
              Available Wallet SR: <b className="text-amber-400 font-mono-nums">{shopPlayer.walletSr} SR</b>
            </p>

            <div className="space-y-2 mb-4">
              {(['STR', 'DEX', 'INT', 'WIS', 'CON'] as const).map(st => {
                const curVal = shopPlayer.stats[st];
                const cost = curVal * 250;
                return (
                  <div key={st} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0e1612] border border-[#22332a] text-xs">
                    <div>
                      <span className="font-bold text-stone-200">{st}</span>: {curVal} (Mod: +{statMod(curVal)})
                    </div>
                    <button
                      disabled={shopPlayer.walletSr < cost}
                      onClick={() => {
                        const updated = players.map(p => {
                          if (p.id === shopPlayer.id) {
                            return {
                              ...p,
                              walletSr: p.walletSr - cost,
                              stats: { ...p.stats, [st]: p.stats[st] + 1 }
                            };
                          }
                          return p;
                        });
                        onUpdatePlayers(updated);
                        setShopPlayer(updated.find(p => p.id === shopPlayer.id) || null);
                        onAddLog(`${shopPlayer.name} upgrades ${st} to ${curVal + 1} for ${cost} SR.`);
                      }}
                      className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-40"
                    >
                      +1 {st} ({cost} SR)
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pack / Inventory Modal */}
      {isPackOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-stone-600 shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-amber-400 font-display">
                🎒 {activePlayer.name}'s Inventory
              </h2>
              <button
                onClick={() => setIsPackOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {activePlayer.pack.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#0e1612] border border-[#22332a] text-xs">
                  <div>
                    <span className="font-semibold text-stone-200">{item.name}</span>
                    <span className="text-[10px] text-stone-400 block">{item.category} · {item.rarity}</span>
                  </div>
                  <button
                    onClick={() => {
                      const updated = players.map(p => {
                        if (p.id === activePlayer.id) {
                          const newPack = [...p.pack];
                          newPack.splice(idx, 1);
                          if (item.category === 'weapon') {
                            if (p.equippedWeapon) newPack.push(p.equippedWeapon);
                            return { ...p, equippedWeapon: item, pack: newPack };
                          } else if (item.category === 'armor') {
                            if (p.equippedArmor) newPack.push(p.equippedArmor);
                            return { ...p, equippedArmor: item, pack: newPack };
                          }
                          return { ...p, pack: newPack };
                        }
                        return p;
                      });
                      onUpdatePlayers(updated);
                      onAddLog(`${activePlayer.name} equips ${item.name}.`);
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs"
                  >
                    Equip
                  </button>
                </div>
              ))}
              {activePlayer.pack.length === 0 && (
                <p className="text-xs text-stone-500 italic p-4 text-center">Pack is currently empty.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
