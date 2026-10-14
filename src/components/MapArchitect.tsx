import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { HexTile, BiomeType, TileType, MobEntity } from '../types/game';
import { BIOME_CONFIGS, DEFAULT_MOBS_BY_BIOME } from '../data/defaultGameData';

interface Props {
  mapTiles: Record<string, HexTile>;
  onUpdateMap: (newTiles: Record<string, HexTile>) => void;
  onTileSelect?: (tileKey: string) => void;
}

type BrushTool = 'P' | 'W' | 'O' | 'C' | 'M' | 'Portal' | 'Shop' | 'Shrine' | 'Spawn' | 'Erase' | 'Biome';

const TILE_COLORS: Record<string, string> = {
  P: '#22332a',
  W: '#1a1f1c',
  O: '#3c3f3d',
  C: '#d4a94a',
  M: '#e0553a',
  B: '#0b0b0b',
  Portal: '#38bdf8',
  Shop: '#f59e0b',
  Shrine: '#10b981',
  Spawn: '#a855f7'
};

const BIOME_BACKGROUNDS: Record<BiomeType, string> = {
  'Pyria': '#451a14',
  'Hydoria': '#122e47',
  'Aeria': '#183b32',
  'Geia': '#3b2f1c',
  'Phosia': '#4a441e',
  'Skotosia': '#2a1b3d',
  'Boss Sanctum': '#1f2420'
};

// Axial coordinates helpers
const S3 = Math.sqrt(3);
const TILE_RADIUS = 26;

function hexToPixel(q: number, r: number): [number, number] {
  const x = TILE_RADIUS * (S3 * q + (S3 / 2) * r);
  const y = TILE_RADIUS * (1.5 * r);
  return [x, y];
}

function hexPoints(cx: number, cy: number, r: number = TILE_RADIUS): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export const MapArchitect: React.FC<Props> = ({ mapTiles, onUpdateMap }) => {
  const [activeTool, setActiveTool] = useState<BrushTool>('W');
  const [paintBiome, setPaintBiome] = useState<BiomeType>('Pyria');
  const [chestTier, setChestTier] = useState<number>(0);
  const [mobCr, setMobCr] = useState<number>(3);
  const [isLair, setIsLair] = useState<boolean>(false);
  const [portalBehavior, setPortalBehavior] = useState<'Stable' | 'Flickering' | 'Volatile'>('Stable');
  const [spawnPlayerId, setSpawnPlayerId] = useState<number>(1);

  // Pan and Zoom
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Procedural Generator Controls
  const [rings, setRings] = useState<number>(2); // 1 = 7 chunks, 2 = 19 chunks, 3 = 37 chunks
  const [generatorSeed, setGeneratorSeed] = useState<number>(7);

  // Initialize or generate map if empty
  const generateProceduralMap = useCallback((numRings: number = 2, seedVal: number = 7) => {
    const newTiles: Record<string, HexTile> = {};
    let rngVal = seedVal;
    const rnd = () => {
      rngVal = (rngVal * 9301 + 49297) % 233280;
      return rngVal / 233280;
    };

    // 7-hex flower chunk offset
    const chunkOffsets = [
      [0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
    ];

    // Axial directions for chunk flowers
    const kr = 1;
    const A0 = kr + 1; // 2
    const A1 = kr;     // 1
    const B0 = -kr;    // -1
    const B1 = 2 * kr + 1; // 3

    // Generate chunk centers
    const chunkCenters: { o: [number, number]; biome: BiomeType; isSpawn?: boolean; spawnIndex?: number }[] = [];
    chunkCenters.push({ o: [0, 0], biome: 'Boss Sanctum' });

    const biomesList: BiomeType[] = ['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia'];

    // Rings of chunks
    let spawnCounter = 1;
    for (let r = 1; r <= numRings; r++) {
      let q = -r;
      let s = r;
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

      for (let side = 0; side < 6; side++) {
        for (let step = 0; step < r; step++) {
          const isCorner = step === 0 && r === numRings;
          const assignedBiome = biomesList[(side + r) % biomesList.length];

          chunkCenters.push({
            o: [q, s],
            biome: assignedBiome,
            isSpawn: isCorner,
            spawnIndex: isCorner ? spawnCounter++ : undefined
          });

          q += dirs[side][0];
          s += dirs[side][1];
        }
      }
    }

    // Populate tiles inside each chunk
    chunkCenters.forEach(ch => {
      const cq = ch.o[0] * A0 + ch.o[1] * B0;
      const cr = ch.o[0] * A1 + ch.o[1] * B1;

      chunkOffsets.forEach((offset, idx) => {
        const tq = cq + offset[0];
        const tr = cr + offset[1];
        const key = `${tq},${tr}`;
        const ringDist = Math.max(Math.abs(tq), Math.abs(tr), Math.abs(tq + tr));
        const depth = Math.min(5, Math.max(0, Math.floor(6 * (ringDist / 12))));

        // Center of chunk rules
        if (ch.o[0] === 0 && ch.o[1] === 0) {
          // Boss center
          newTiles[key] = {
            q: tq,
            r: tr,
            ring: ringDist,
            depth: 0,
            biome: 'Boss Sanctum',
            type: idx === 0 ? 'B' : 'P'
          };
          return;
        }

        // Spawn chunk center
        if (ch.isSpawn && idx === 0) {
          newTiles[key] = {
            q: tq,
            r: tr,
            ring: ringDist,
            depth,
            biome: ch.biome,
            type: 'Spawn',
            spawnPlayerIndex: ch.spawnIndex,
            isShop: true
          };
          return;
        }

        // Random roll for tile type
        const roll = rnd();
        let tileType: TileType = 'P';
        let mob: MobEntity | undefined;
        let chestTierVal: number | undefined;

        if (roll < 0.48) {
          tileType = 'P';
        } else if (roll < 0.68) {
          tileType = 'M';
          const crVal = Math.max(1, Math.min(10, Math.floor(rnd() * 4 + depth)));
          const mobList = DEFAULT_MOBS_BY_BIOME[ch.biome] || DEFAULT_MOBS_BY_BIOME['Pyria'];
          const baseMob = mobList[Math.min(mobList.length - 1, Math.floor(rnd() * mobList.length))];
          mob = {
            id: `mob_${key}`,
            name: baseMob.name,
            cr: crVal,
            element: baseMob.element,
            hp: 19 + 9 * crVal,
            maxHp: 19 + 9 * crVal,
            biome: ch.biome,
            rewardSr: 300 * crVal
          };
        } else if (roll < 0.82) {
          tileType = 'W'; // Wall
        } else if (roll < 0.92) {
          tileType = 'O'; // Obstacle
        } else {
          tileType = 'C'; // Chest
          chestTierVal = Math.min(4, Math.floor(rnd() * 3));
        }

        newTiles[key] = {
          q: tq,
          r: tr,
          ring: ringDist,
          depth,
          biome: ch.biome,
          type: tileType,
          mob,
          chestTier: chestTierVal
        };
      });
    });

    onUpdateMap(newTiles);
  }, [onUpdateMap]);

  // Initial load check
  useEffect(() => {
    if (!mapTiles || Object.keys(mapTiles).length === 0) {
      generateProceduralMap(rings, generatorSeed);
    }
  }, [mapTiles, rings, generatorSeed, generateProceduralMap]);

  // Painting handler
  const handleTileClick = (key: string) => {
    const tile = mapTiles[key];
    if (!tile) return;
    if (tile.type === 'B') return; // Protect boss tile

    const updated = { ...mapTiles };
    const current = { ...tile };

    if (activeTool === 'Biome') {
      current.biome = paintBiome;
      updated[key] = current;
      onUpdateMap(updated);
      return;
    }

    if (activeTool === 'Erase') {
      current.type = 'P';
      delete current.mob;
      delete current.chestTier;
      delete current.isShop;
      delete current.isShrine;
      delete current.portalBehavior;
      delete current.spawnPlayerIndex;
    } else if (activeTool === 'W') {
      current.type = 'W';
      delete current.mob;
    } else if (activeTool === 'O') {
      current.type = 'O';
      delete current.mob;
    } else if (activeTool === 'P') {
      current.type = 'P';
      delete current.mob;
    } else if (activeTool === 'C') {
      current.type = 'C';
      current.chestTier = chestTier;
      delete current.mob;
    } else if (activeTool === 'M') {
      current.type = 'M';
      const mobList = DEFAULT_MOBS_BY_BIOME[current.biome] || DEFAULT_MOBS_BY_BIOME['Pyria'];
      const template = mobList.find(m => isLair ? m.isMiniBoss : !m.isMiniBoss) || mobList[0];
      current.mob = {
        id: `mob_${key}_${Date.now()}`,
        name: isLair ? `${template.name} (Lair)` : template.name,
        cr: mobCr,
        element: template.element,
        hp: 19 + 9 * mobCr,
        maxHp: 19 + 9 * mobCr,
        isMiniBoss: isLair,
        biome: current.biome,
        rewardSr: 300 * mobCr
      };
    } else if (activeTool === 'Portal') {
      current.type = 'Portal';
      current.portalBehavior = portalBehavior;
    } else if (activeTool === 'Shop') {
      current.type = 'Shop';
      current.isShop = true;
    } else if (activeTool === 'Shrine') {
      current.type = 'Shrine';
      current.isShrine = true;
    } else if (activeTool === 'Spawn') {
      current.type = 'Spawn';
      current.spawnPlayerIndex = spawnPlayerId;
      current.isShop = true;
    }

    updated[key] = current;
    onUpdateMap(updated);
  };

  // Connectivity Repair Algorithm (v7 guide Section 10.9)
  const repairConnectivity = () => {
    const tiles = { ...mapTiles };
    const visited = new Set<string>();
    const queue: string[] = [];

    // Find Boss and Antechamber tiles
    Object.keys(tiles).forEach(k => {
      if (tiles[k].ring <= 1 && tiles[k].type !== 'W') {
        visited.add(k);
        queue.push(k);
      }
    });

    const getNeighbors = (k: string) => {
      const [q, r] = k.split(',').map(Number);
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      return dirs.map(([dq, dr]) => `${q + dq},${r + dr}`).filter(nk => tiles[nk]);
    };

    // Breadth-first reachability search
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const nk of getNeighbors(curr)) {
        if (!visited.has(nk) && tiles[nk].type !== 'W') {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }

    // Identify unreachable walkable tiles
    let wallsCarved = 0;
    Object.keys(tiles).forEach(k => {
      if (!visited.has(k) && tiles[k].type !== 'W' && tiles[k].type !== 'B') {
        // Carve adjacent wall
        const adjacentWalls = getNeighbors(k).filter(nk => tiles[nk].type === 'W');
        if (adjacentWalls.length > 0) {
          tiles[adjacentWalls[0]].type = 'P';
          visited.add(adjacentWalls[0]);
          visited.add(k);
          wallsCarved++;
        }
      }
    });

    onUpdateMap(tiles);
    alert(`Connectivity Repair complete: Carved ${wallsCarved} wall(s) to guarantee reachability from Pneuma's Tower!`);
  };

  // Turn all non-boss tiles into plain path
  const clearToPath = () => {
    if (!confirm('Turn all non-boss tiles into open Path tiles?')) return;
    const tiles = { ...mapTiles };
    Object.keys(tiles).forEach(k => {
      if (tiles[k].type !== 'B' && tiles[k].type !== 'Spawn') {
        tiles[k].type = 'P';
        delete tiles[k].mob;
        delete tiles[k].chestTier;
      }
    });
    onUpdateMap(tiles);
  };

  // Zoom handlers
  const handleZoom = (factor: number) => {
    setCamera(prev => ({
      ...prev,
      zoom: Math.min(3.5, Math.max(0.3, prev.zoom * factor))
    }));
  };

  const handleResetCamera = () => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  };

  const tileStats = useMemo(() => {
    const list = Object.values(mapTiles);
    return {
      total: list.length,
      paths: list.filter(t => t.type === 'P').length,
      walls: list.filter(t => t.type === 'W').length,
      obstacles: list.filter(t => t.type === 'O').length,
      mobs: list.filter(t => t.type === 'M').length,
      chests: list.filter(t => t.type === 'C').length,
      spawns: list.filter(t => t.type === 'Spawn').length,
    };
  }, [mapTiles]);

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* Top Controls Bar */}
      <div className="px-6 py-3.5 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-amber-400 font-display">
            Hex Map Architect & Brush Painter
          </h1>
          <p className="text-xs text-stone-400">
            Design 7-hex flower chunks, paint terrain brushes, and sculpt the Olympian arenas.
          </p>
        </div>

        {/* Quick Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => generateProceduralMap(rings, Math.floor(Math.random() * 99999))}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] text-xs font-semibold"
          >
            🎲 Regenerate Chunks
          </button>
          <button
            onClick={repairConnectivity}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-teal-300 border border-[#3d5446] text-xs font-semibold"
          >
            ⚡ Auto-Repair Paths
          </button>
          <button
            onClick={clearToPath}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-stone-300 border border-[#3d5446] text-xs"
          >
            Clear to Path
          </button>
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Interactive Canvas */}
        <div
          className="flex-1 relative bg-[#090e0b] overflow-hidden select-none cursor-crosshair"
          onMouseDown={e => {
            if (e.button === 0 && e.target === svgRef.current) {
              setIsDragging(true);
              dragStart.current = { x: e.clientX - camera.x, y: e.clientY - camera.y };
            }
          }}
          onMouseMove={e => {
            if (isDragging) {
              setCamera(prev => ({
                ...prev,
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
              }));
            }
          }}
          onMouseUp={() => setIsDragging(false)}
        >
          {/* Zoom Buttons Floating overlay */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 bg-[#142019]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#2a3c33] shadow-lg">
            <button
              onClick={() => handleZoom(1.25)}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-sm font-bold flex items-center justify-center"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => handleZoom(0.8)}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-sm font-bold flex items-center justify-center"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleResetCamera}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-stone-300 text-xs font-bold flex items-center justify-center"
              title="Reset View"
            >
              ⟲
            </button>
          </div>

          {/* SVG Map Canvas */}
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox="-600 -450 1200 900"
          >
            <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
              {Object.keys(mapTiles).map(key => {
                const tile = mapTiles[key];
                const [px, py] = hexToPixel(tile.q, tile.r);
                const bg = BIOME_BACKGROUNDS[tile.biome] || '#1c2822';
                const fillColor = tile.type === 'W' ? '#181f1b' : tile.type === 'O' ? '#383b39' : bg;

                return (
                  <g key={key} onClick={() => handleTileClick(key)} className="group cursor-pointer">
                    {/* Hexagon Polygon */}
                    <polygon
                      points={hexPoints(px, py)}
                      fill={fillColor}
                      stroke={tile.type === 'W' ? '#0f1411' : '#2d4236'}
                      strokeWidth="1.5"
                      className="transition-colors group-hover:stroke-amber-400 group-hover:stroke-2"
                    />

                    {/* Icon or Marker */}
                    {tile.type === 'B' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#d4a94a" fontSize="16" fontWeight="bold">
                        ☠
                      </text>
                    )}
                    {tile.type === 'W' && (
                      <text x={px} y={py + 4} textAnchor="middle" fill="#525d57" fontSize="11">
                        ▲
                      </text>
                    )}
                    {tile.type === 'O' && (
                      <text x={px} y={py + 4} textAnchor="middle" fill="#a8a29e" fontSize="11">
                        ✕
                      </text>
                    )}
                    {tile.type === 'C' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#ffd166" fontSize="13">
                        ▣
                      </text>
                    )}
                    {tile.type === 'Portal' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#38bdf8" fontSize="13">
                        ◎
                      </text>
                    )}
                    {tile.type === 'Shop' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#f59e0b" fontSize="13">
                        $
                      </text>
                    )}
                    {tile.type === 'Shrine' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#10b981" fontSize="13">
                        ✚
                      </text>
                    )}
                    {tile.type === 'Spawn' && (
                      <text x={px} y={py + 5} textAnchor="middle" fill="#c084fc" fontSize="13" fontWeight="bold">
                        ⌂{tile.spawnPlayerIndex}
                      </text>
                    )}

                    {/* Mob Token */}
                    {tile.mob && tile.type === 'M' && (
                      <g>
                        <circle cx={px} cy={py} r="10" fill="#0c120e" stroke={TILE_COLORS.M} strokeWidth="2.5" />
                        <text x={px} y={py + 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
                          {tile.mob.isMiniBoss ? '★' : ''}{tile.mob.cr}
                        </text>
                      </g>
                    )}

                    <title>{`${tile.biome} (${tile.q},${tile.r}) - ${tile.type}${tile.mob ? ` - ${tile.mob.name} CR ${tile.mob.cr}` : ''}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Right: Brush Palette & Generator Config */}
        <div className="w-[360px] bg-[#111a15] border-l border-[#2e3f36] flex flex-col overflow-y-auto p-5">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider font-display mb-3">
            Brush Tools Palette
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-5">
            {[
              { id: 'P', label: 'Path', icon: '·', desc: 'Walkable floor' },
              { id: 'W', label: 'Wall', icon: '▲', desc: 'Blocks move & vision' },
              { id: 'O', label: 'Obstacle', icon: '✕', desc: 'Costs 2 move / test' },
              { id: 'C', label: 'Chest', icon: '▣', desc: 'Loot containers' },
              { id: 'M', label: 'Mob / Lair', icon: '👾', desc: 'Combat encounter' },
              { id: 'Portal', label: 'Portal', icon: '◎', desc: 'Dungeon travel' },
              { id: 'Shop', label: 'Soul Corridor', icon: '$', desc: 'Stat & gear shop' },
              { id: 'Shrine', label: 'Shrine', icon: '✚', desc: 'Divine healing' },
              { id: 'Spawn', label: 'Spawn Tile', icon: '⌂', desc: 'Player sanctuary' },
              { id: 'Biome', label: 'Paint Biome', icon: '🎨', desc: 'Change sector element' },
              { id: 'Erase', label: 'Erase Tile', icon: '⌫', desc: 'Reset to plain path' },
            ].map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as BrushTool)}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${activeTool === tool.id ? 'bg-[#22352b] border-amber-400 text-amber-300' : 'bg-[#16221c] border-[#293d31] text-stone-300 hover:bg-[#1d2d25]'}`}
              >
                <span className="text-base font-bold w-5 text-center font-mono-nums">
                  {tool.icon}
                </span>
                <div>
                  <div className="text-xs font-semibold">{tool.label}</div>
                  <div className="text-[10px] text-stone-400">{tool.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Contextual Brush Controls */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] mb-5 space-y-3 text-xs">
            <h3 className="font-semibold text-amber-300 text-xs uppercase tracking-wide">
              Selected Brush Settings: {activeTool}
            </h3>

            {activeTool === 'Biome' && (
              <div>
                <label className="block text-stone-300 mb-1">Target Biome to Paint</label>
                <select
                  value={paintBiome}
                  onChange={e => setPaintBiome(e.target.value as BiomeType)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100"
                >
                  {Object.keys(BIOME_CONFIGS).map(b => (
                    <option key={b} value={b}>{BIOME_CONFIGS[b as BiomeType].name}</option>
                  ))}
                </select>
              </div>
            )}

            {activeTool === 'C' && (
              <div>
                <label className="block text-stone-300 mb-1">Chest Rarity Tier</label>
                <select
                  value={chestTier}
                  onChange={e => setChestTier(+e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100"
                >
                  <option value={0}>Common Chest (0)</option>
                  <option value={1}>Uncommon Chest (1)</option>
                  <option value={2}>Rare Chest (2)</option>
                  <option value={3}>Epic Chest (3)</option>
                  <option value={4}>Legendary Chest (4)</option>
                </select>
              </div>
            )}

            {activeTool === 'M' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-stone-300 mb-1">Monster Danger Level (CR)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={mobCr}
                    onChange={e => setMobCr(Math.max(1, Math.min(20, +e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100 font-mono-nums"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isLair}
                    onChange={e => setIsLair(e.target.checked)}
                    className="rounded border-[#32473a]"
                  />
                  <span>Mini-Boss Lair (carries a Boss Key)</span>
                </label>
              </div>
            )}

            {activeTool === 'Portal' && (
              <div>
                <label className="block text-stone-300 mb-1">Portal Behavior</label>
                <select
                  value={portalBehavior}
                  onChange={e => setPortalBehavior(e.target.value as 'Stable' | 'Flickering' | 'Volatile')}
                  className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100"
                >
                  <option value="Stable">Stable (100% reliable entry/exit)</option>
                  <option value="Flickering">Flickering (Collapses after 1d4 turns)</option>
                  <option value="Volatile">Volatile (Random Gate destination)</option>
                </select>
              </div>
            )}

            {activeTool === 'Spawn' && (
              <div>
                <label className="block text-stone-300 mb-1">Assign to Player</label>
                <select
                  value={spawnPlayerId}
                  onChange={e => setSpawnPlayerId(+e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100"
                >
                  <option value={1}>Player 1 (Atalanta / Cana)</option>
                  <option value={2}>Player 2 (Achilles / Bhana)</option>
                  <option value={3}>Player 3 (Medea / Prana)</option>
                  <option value={4}>Player 4 (Orpheus / Gana)</option>
                </select>
              </div>
            )}
          </div>

          {/* Map Statistics */}
          <div className="p-4 rounded-xl bg-[#141f19] border border-[#26382e] space-y-1.5 text-xs font-mono-nums">
            <h3 className="font-semibold text-stone-300 text-xs mb-2">Map Tile Audit</h3>
            <div className="flex justify-between text-stone-400">
              <span>Total Tiles:</span> <span className="text-stone-100">{tileStats.total}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Pathways:</span> <span className="text-emerald-400">{tileStats.paths}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Walls:</span> <span className="text-stone-300">{tileStats.walls}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Obstacles:</span> <span className="text-amber-400">{tileStats.obstacles}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Monsters:</span> <span className="text-red-400">{tileStats.mobs}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Chests:</span> <span className="text-amber-300">{tileStats.chests}</span>
            </div>
            <div className="flex justify-between text-stone-400">
              <span>Spawn Points:</span> <span className="text-purple-400">{tileStats.spawns}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
