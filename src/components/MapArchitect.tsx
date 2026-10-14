import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { HexTile, BiomeType, TileType, MobEntity } from '../types/game';
import { BIOME_CONFIGS, DEFAULT_MOBS_BY_BIOME } from '../data/defaultGameData';

interface Props {
  mapTiles: Record<string, HexTile>;
  onUpdateMap: (newTiles: Record<string, HexTile>) => void;
  onTileSelect?: (tileKey: string) => void;
}

type EditorMode = 'chunk' | 'tile';
type ChunkTool = 'toggle' | 'boss' | 'biome' | 'spawn';
type BrushTool = 'P' | 'W' | 'O' | 'C' | 'M' | 'Portal' | 'Shop' | 'Shrine' | 'Spawn' | 'Erase' | 'Biome';

interface ChunkNode {
  key: string; // "q,r"
  q: number;
  r: number;
  biome: BiomeType | 'Random';
  isBoss: boolean;
  spawnIndex?: number; // 1 to 6
}

const BIOME_BACKGROUNDS: Record<BiomeType, string> = {
  'Pyria': '#451a14',
  'Hydoria': '#122e47',
  'Aeria': '#183b32',
  'Geia': '#3b2f1c',
  'Phosia': '#4a441e',
  'Skotosia': '#2a1b3d',
  'Boss Sanctum': '#1f2420'
};

const SPAWN_COLORS = ['#ff4d4d', '#ff9f1a', '#ffe14d', '#35e08a', '#3bc9ff', '#e07bff'];
const S3 = Math.sqrt(3);
const TILE_RADIUS = 26;
const CHUNK_SPACING = 68;

function hexToPixel(q: number, r: number, radius: number = TILE_RADIUS): [number, number] {
  return [radius * (S3 * q + (S3 / 2) * r), radius * (1.5 * r)];
}

function hexPoints(cx: number, cy: number, r: number = TILE_RADIUS): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Compute tiles offsets inside a chunk of radius kr (kr=0: 1 tile, kr=1: 7 tiles, kr=2: 19 tiles)
function getChunkTileOffsets(kr: number): [number, number][] {
  const offsets: [number, number][] = [];
  for (let a = -kr; a <= kr; a++) {
    for (let b = Math.max(-kr, -a - kr); b <= Math.min(kr, -a + kr); b++) {
      offsets.push([a, b]);
    }
  }
  return offsets;
}

export const MapArchitect: React.FC<Props> = ({ mapTiles, onUpdateMap }) => {
  const [editorMode, setEditorMode] = useState<EditorMode>('chunk');

  // Chunk Size (kr): 0 = 1 tile, 1 = 7 tiles (flower), 2 = 19 tiles
  const [chunkK, setChunkK] = useState<number>(1);
  // Max Chunk Capacity: 7, 19, 37, 61, 91
  const [maxChunks, setMaxChunks] = useState<number>(37);
  const [autoSpawns, setAutoSpawns] = useState<boolean>(true);

  // Chunk Editor State
  const [chunkTool, setChunkTool] = useState<ChunkTool>('biome');
  const [chunkBiomeBrush, setChunkBiomeBrush] = useState<BiomeType | 'Random'>('Pyria');
  const [chunkNodes, setChunkNodes] = useState<Record<string, ChunkNode>>(() => {
    // Initial 19 chunks
    const initial: Record<string, ChunkNode> = {};
    const biomesList: BiomeType[] = ['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia'];

    initial['0,0'] = { key: '0,0', q: 0, r: 0, biome: 'Boss Sanctum', isBoss: true };

    let spawnCount = 1;
    for (let ring = 1; ring <= 2; ring++) {
      let q = -ring;
      let s = ring;
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

      for (let side = 0; side < 6; side++) {
        for (let step = 0; step < ring; step++) {
          const k = `${q},${s}`;
          const isCorner = step === 0 && ring === 2;
          const assignedBiome = biomesList[(side + ring) % biomesList.length];

          initial[k] = {
            key: k,
            q,
            r: s,
            biome: assignedBiome,
            isBoss: false,
            spawnIndex: isCorner ? spawnCount++ : undefined
          };

          q += dirs[side][0];
          s += dirs[side][1];
        }
      }
    }
    return initial;
  });

  // Tile Brush State
  const [activeBrush, setActiveBrush] = useState<BrushTool>('W');
  const [paintBiome, setPaintBiome] = useState<BiomeType>('Pyria');
  const [chestTier, setChestTier] = useState<number>(0);
  const [mobCr, setMobCr] = useState<number>(3);
  const [isLair, setIsLair] = useState<boolean>(false);
  const [portalBehavior, setPortalBehavior] = useState<'Stable' | 'Flickering' | 'Volatile'>('Stable');
  const [spawnPlayerId, setSpawnPlayerId] = useState<number>(1);

  // Pan & Zoom
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate maximum chunk radius M for the concentric grid
  const maxChunkRadius = useMemo(() => {
    let M = 1;
    while (1 + 3 * M * (M + 1) < maxChunks) M++;
    return M;
  }, [maxChunks]);

  const tilesPerChunk = useMemo(() => 3 * chunkK * (chunkK + 1) + 1, [chunkK]);

  // Rebuild tiles from chunk layout and kr
  const rebuildTilesFromChunks = useCallback((chunks: Record<string, ChunkNode>, kr: number = chunkK) => {
    const newTiles: Record<string, HexTile> = {};
    const A0 = kr + 1;
    const A1 = kr;
    const B0 = -kr;
    const B1 = 2 * kr + 1;

    const biomesList: BiomeType[] = ['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia'];
    const offsets = getChunkTileOffsets(kr);

    Object.values(chunks).forEach((ch, chIdx) => {
      const cq = ch.q * A0 + ch.r * B0;
      const cr = ch.q * A1 + ch.r * B1;

      let finalBiome: BiomeType = ch.biome === 'Random' ? biomesList[chIdx % biomesList.length] : ch.biome;
      if (ch.isBoss) finalBiome = 'Boss Sanctum';

      offsets.forEach((offset, idx) => {
        const tq = cq + offset[0];
        const tr = cr + offset[1];
        const key = `${tq},${tr}`;
        const ringDist = Math.max(Math.abs(tq), Math.abs(tr), Math.abs(tq + tr));
        const depth = Math.min(5, Math.max(0, Math.floor(6 * (ringDist / 12))));

        const existing = mapTiles[key];

        if (ch.isBoss) {
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

        if (ch.spawnIndex && idx === 0) {
          newTiles[key] = {
            q: tq,
            r: tr,
            ring: ringDist,
            depth,
            biome: finalBiome,
            type: 'Spawn',
            spawnPlayerIndex: ch.spawnIndex,
            isShop: true
          };
          return;
        }

        if (existing && existing.type !== 'B') {
          newTiles[key] = {
            ...existing,
            biome: finalBiome,
            depth
          };
        } else {
          const isCenter = idx === 0;
          const mobList = DEFAULT_MOBS_BY_BIOME[finalBiome] || DEFAULT_MOBS_BY_BIOME['Pyria'];
          const baseMob = mobList[0];

          let type: TileType = 'P';
          let mob: MobEntity | undefined;
          let chestTierVal: number | undefined;

          if (isCenter && chIdx % 4 === 1) {
            type = 'C';
            chestTierVal = 1;
          } else if (idx === 1 || (kr > 1 && idx === 4)) {
            type = 'M';
            mob = {
              id: `mob_${key}`,
              name: baseMob.name,
              cr: Math.max(1, depth),
              element: baseMob.element,
              hp: 19 + 9 * Math.max(1, depth),
              maxHp: 19 + 9 * Math.max(1, depth),
              biome: finalBiome,
              rewardSr: 300 * Math.max(1, depth)
            };
          } else if (idx === 2 && depth > 1) {
            type = 'W';
          }

          newTiles[key] = {
            q: tq,
            r: tr,
            ring: ringDist,
            depth,
            biome: finalBiome,
            type,
            mob,
            chestTier: chestTierVal
          };
        }
      });
    });

    onUpdateMap(newTiles);
  }, [chunkK, mapTiles, onUpdateMap]);

  // Initial load check
  useEffect(() => {
    if (!mapTiles || Object.keys(mapTiles).length === 0) {
      rebuildTilesFromChunks(chunkNodes, chunkK);
    }
  }, [mapTiles, chunkNodes, chunkK, rebuildTilesFromChunks]);

  // Handle Chunk Macro Slot Click
  const handleChunkClick = (k: string) => {
    const existing = chunkNodes[k];
    const updated = { ...chunkNodes };

    if (chunkTool === 'toggle') {
      if (existing) {
        if (existing.isBoss) {
          alert('Cannot remove the Boss Sanctum chunk!');
          return;
        }
        delete updated[k];
      } else {
        const [q, r] = k.split(',').map(Number);
        updated[k] = {
          key: k,
          q,
          r,
          biome: chunkBiomeBrush,
          isBoss: false
        };
      }
      setChunkNodes(updated);
      rebuildTilesFromChunks(updated, chunkK);
      return;
    }

    if (!existing) return;

    if (chunkTool === 'boss') {
      Object.keys(updated).forEach(id => { updated[id].isBoss = false; });
      existing.isBoss = true;
      existing.biome = 'Boss Sanctum';
      delete existing.spawnIndex;
      setChunkNodes(updated);
      rebuildTilesFromChunks(updated, chunkK);
      return;
    }

    if (chunkTool === 'biome') {
      if (existing.isBoss) return;
      existing.biome = chunkBiomeBrush;
      setChunkNodes(updated);
      rebuildTilesFromChunks(updated, chunkK);
      return;
    }

    if (chunkTool === 'spawn') {
      if (existing.isBoss) return;
      if (existing.spawnIndex) {
        delete existing.spawnIndex;
      } else {
        const used = Object.values(updated).map(c => c.spawnIndex).filter(Boolean) as number[];
        const next = [1, 2, 3, 4, 5, 6].find(s => !used.includes(s)) || 1;
        existing.spawnIndex = next;
      }
      setChunkNodes(updated);
      rebuildTilesFromChunks(updated, chunkK);
      return;
    }
  };

  // Handle Tile Click (Tile Brush Mode)
  const handleTileClick = (key: string) => {
    const tile = mapTiles[key];
    if (!tile || tile.type === 'B') return;

    const updated = { ...mapTiles };
    const current = { ...tile };

    if (activeBrush === 'Biome') {
      current.biome = paintBiome;
      updated[key] = current;
      onUpdateMap(updated);
      return;
    }

    if (activeBrush === 'Erase') {
      current.type = 'P';
      delete current.mob;
      delete current.chestTier;
      delete current.isShop;
      delete current.isShrine;
      delete current.portalBehavior;
      delete current.spawnPlayerIndex;
    } else if (activeBrush === 'W') {
      current.type = 'W';
      delete current.mob;
    } else if (activeBrush === 'O') {
      current.type = 'O';
      delete current.mob;
    } else if (activeBrush === 'P') {
      current.type = 'P';
      delete current.mob;
    } else if (activeBrush === 'C') {
      current.type = 'C';
      current.chestTier = chestTier;
      delete current.mob;
    } else if (activeBrush === 'M') {
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
    } else if (activeBrush === 'Portal') {
      current.type = 'Portal';
      current.portalBehavior = portalBehavior;
    } else if (activeBrush === 'Shop') {
      current.type = 'Shop';
      current.isShop = true;
    } else if (activeBrush === 'Shrine') {
      current.type = 'Shrine';
      current.isShrine = true;
    } else if (activeBrush === 'Spawn') {
      current.type = 'Spawn';
      current.spawnPlayerIndex = spawnPlayerId;
      current.isShop = true;
    }

    updated[key] = current;
    onUpdateMap(updated);
  };

  // Connectivity Repair
  const repairConnectivity = () => {
    const tiles = { ...mapTiles };
    const visited = new Set<string>();
    const queue: string[] = [];

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

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const nk of getNeighbors(curr)) {
        if (!visited.has(nk) && tiles[nk].type !== 'W') {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }

    let carved = 0;
    Object.keys(tiles).forEach(k => {
      if (!visited.has(k) && tiles[k].type !== 'W' && tiles[k].type !== 'B') {
        const adjacentWalls = getNeighbors(k).filter(nk => tiles[nk].type === 'W');
        if (adjacentWalls.length > 0) {
          tiles[adjacentWalls[0]].type = 'P';
          visited.add(adjacentWalls[0]);
          visited.add(k);
          carved++;
        }
      }
    });

    onUpdateMap(tiles);
    alert(`Auto-repair complete! Carved ${carved} wall(s) to guarantee connectivity.`);
  };

  // Preset Layouts
  const handleMinimalChunks = () => {
    const minChunks: Record<string, ChunkNode> = {
      '0,0': { key: '0,0', q: 0, r: 0, biome: 'Boss Sanctum', isBoss: true },
      '1,0': { key: '1,0', q: 1, r: 0, biome: 'Pyria', isBoss: false, spawnIndex: 1 },
      '1,-1': { key: '1,-1', q: 1, r: -1, biome: 'Hydoria', isBoss: false, spawnIndex: 2 },
      '0,-1': { key: '0,-1', q: 0, r: -1, biome: 'Aeria', isBoss: false, spawnIndex: 3 },
      '-1,0': { key: '-1,0', q: -1, r: 0, biome: 'Geia', isBoss: false, spawnIndex: 4 },
      '-1,1': { key: '-1,1', q: -1, r: 1, biome: 'Phosia', isBoss: false, spawnIndex: 5 },
      '0,1': { key: '0,1', q: 0, r: 1, biome: 'Skotosia', isBoss: false, spawnIndex: 6 },
    };
    setMaxChunks(7);
    setChunkNodes(minChunks);
    rebuildTilesFromChunks(minChunks, chunkK);
  };

  const chunkList = Object.values(chunkNodes);
  const totalChunks = chunkList.length;
  const hexLoaderDice = Math.max(0, totalChunks - 1 - (chunkList.filter(c => c.spawnIndex).length));

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* Top Header & Dual Mode Switcher */}
      <div className="px-6 py-3 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-amber-400 font-display">
              Hex Map Architect
            </h1>
            <p className="text-xs text-stone-400">
              {editorMode === 'chunk'
                ? `Macro Chunk Editor (${totalChunks} chunks × ${tilesPerChunk} tiles = ${totalChunks * tilesPerChunk} total tiles)`
                : 'Micro Tile Painter: Paint individual hex features, monsters, and treasures.'}
            </p>
          </div>

          <div className="flex items-center p-1 bg-[#0b120e] rounded-xl border border-[#23352b]">
            <button
              onClick={() => setEditorMode('chunk')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${editorMode === 'chunk' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
            >
              1. Chunk Macro Editor
            </button>
            <button
              onClick={() => setEditorMode('tile')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${editorMode === 'tile' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
            >
              2. Tile Brush Painter
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {editorMode === 'chunk' ? (
            <>
              <button
                onClick={handleMinimalChunks}
                className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] text-xs font-semibold"
              >
                Minimal (7 Chunks)
              </button>
              <button
                onClick={() => rebuildTilesFromChunks(chunkNodes, chunkK)}
                className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-teal-300 border border-[#3d5446] text-xs font-semibold"
              >
                Rebuild Grid
              </button>
            </>
          ) : (
            <button
              onClick={repairConnectivity}
              className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2e4438] text-teal-300 border border-[#3d5446] text-xs font-semibold"
            >
              ⚡ Auto-Repair Paths
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Viewport */}
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
          {/* Zoom & Pan Controls */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 bg-[#142019]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#2a3c33] shadow-lg">
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.min(4.0, prev.zoom * 1.25) }))}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-sm font-bold flex items-center justify-center"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.max(0.15, prev.zoom * 0.8) }))}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-amber-300 text-sm font-bold flex items-center justify-center"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
              className="w-8 h-8 rounded bg-[#1f3026] hover:bg-[#2b4234] text-stone-300 text-xs font-bold flex items-center justify-center"
              title="Reset View"
            >
              ⟲
            </button>
          </div>

          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox="-750 -550 1500 1100"
          >
            <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
              {editorMode === 'chunk' ? (
                // CHUNK MACRO VIEW: Dynamic concentric slots up to maxChunkRadius
                <g>
                  {Array.from({ length: 2 * maxChunkRadius + 1 }, (_, i) => i - maxChunkRadius).map(cq =>
                    Array.from({ length: 2 * maxChunkRadius + 1 }, (_, j) => j - maxChunkRadius).map(cr => {
                      if (Math.abs(cq + cr) > maxChunkRadius) return null;
                      const k = `${cq},${cr}`;
                      const ch = chunkNodes[k];
                      const [cx, cy] = hexToPixel(cq, cr, CHUNK_SPACING);

                      if (!ch) {
                        return (
                          <polygon
                            key={`empty_${k}`}
                            points={hexPoints(cx, cy, CHUNK_SPACING * 0.92)}
                            fill="#161d19"
                            stroke="#233128"
                            strokeDasharray="4,4"
                            strokeWidth="1"
                            onClick={() => handleChunkClick(k)}
                            className="hover:fill-[#203026] cursor-pointer transition-colors"
                          >
                            <title>{`Empty slot (${k}) - Click with Toggle tool to add chunk`}</title>
                          </polygon>
                        );
                      }

                      const fill = ch.isBoss ? '#d4a94a' : ch.biome === 'Random' ? '#3d4b42' : BIOME_BACKGROUNDS[ch.biome];
                      const strokeColor = ch.spawnIndex ? SPAWN_COLORS[(ch.spawnIndex - 1) % 6] : '#000';

                      return (
                        <g key={k} onClick={() => handleChunkClick(k)} className="cursor-pointer group">
                          <polygon
                            points={hexPoints(cx, cy, CHUNK_SPACING * 0.92)}
                            fill={fill}
                            stroke={strokeColor}
                            strokeWidth={ch.spawnIndex ? 4 : 1.5}
                            className="transition-all group-hover:brightness-125"
                          />
                          <text
                            x={cx}
                            y={cy - 6}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize="14"
                            fontWeight="bold"
                            pointerEvents="none"
                          >
                            {ch.isBoss ? '☠ BOSS' : ch.spawnIndex ? `S${ch.spawnIndex}` : ch.biome[0]}
                          </text>
                          <text
                            x={cx}
                            y={cy + 12}
                            textAnchor="middle"
                            fill="#ddd"
                            fontSize="10"
                            pointerEvents="none"
                          >
                            {ch.isBoss ? 'Sanctum' : ch.biome}
                          </text>
                          <title>{`${ch.isBoss ? 'Boss Sanctum' : `Chunk ${k} (${ch.biome})`}${ch.spawnIndex ? ` - Spawn S${ch.spawnIndex}` : ''}`}</title>
                        </g>
                      );
                    })
                  )}
                </g>
              ) : (
                // TILE BRUSH VIEW: Render individual tiles based on chunk size
                <g>
                  {Object.keys(mapTiles).map(key => {
                    const tile = mapTiles[key];
                    const [px, py] = hexToPixel(tile.q, tile.r);
                    const bg = BIOME_BACKGROUNDS[tile.biome] || '#1c2822';
                    const fillColor = tile.type === 'W' ? '#181f1b' : tile.type === 'O' ? '#383b39' : bg;

                    return (
                      <g key={key} onClick={() => handleTileClick(key)} className="group cursor-pointer">
                        <polygon
                          points={hexPoints(px, py)}
                          fill={fillColor}
                          stroke={tile.type === 'W' ? '#0f1411' : '#2d4236'}
                          strokeWidth="1.5"
                          className="transition-colors group-hover:stroke-amber-400 group-hover:stroke-2"
                        />
                        {tile.type === 'B' && <text x={px} y={py + 5} textAnchor="middle" fill="#d4a94a" fontSize="16" fontWeight="bold">☠</text>}
                        {tile.type === 'W' && <text x={px} y={py + 4} textAnchor="middle" fill="#525d57" fontSize="11">▲</text>}
                        {tile.type === 'O' && <text x={px} y={py + 4} textAnchor="middle" fill="#a8a29e" fontSize="11">✕</text>}
                        {tile.type === 'C' && <text x={px} y={py + 5} textAnchor="middle" fill="#ffd166" fontSize="13">▣</text>}
                        {tile.type === 'Portal' && <text x={px} y={py + 5} textAnchor="middle" fill="#38bdf8" fontSize="13">◎</text>}
                        {tile.type === 'Shop' && <text x={px} y={py + 5} textAnchor="middle" fill="#f59e0b" fontSize="13">$</text>}
                        {tile.type === 'Shrine' && <text x={px} y={py + 5} textAnchor="middle" fill="#10b981" fontSize="13">✚</text>}
                        {tile.type === 'Spawn' && <text x={px} y={py + 5} textAnchor="middle" fill="#c084fc" fontSize="13" fontWeight="bold">⌂{tile.spawnPlayerIndex}</text>}
                        {tile.mob && tile.type === 'M' && (
                          <g>
                            <circle cx={px} cy={py} r="10" fill="#0c120e" stroke="#e0553a" strokeWidth="2.5" />
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
              )}
            </g>
          </svg>
        </div>

        {/* Right Sidebar: Dynamic Tools based on Mode */}
        <div className="w-[370px] bg-[#111a15] border-l border-[#2e3f36] flex flex-col overflow-y-auto p-5">
          {editorMode === 'chunk' ? (
            <div className="space-y-4">
              {/* Scalable Chunks & Chunk Size Selectors */}
              <div className="p-3.5 rounded-xl bg-[#141f19] border border-amber-500/40 space-y-3 text-xs">
                <span className="text-amber-400 font-bold uppercase tracking-wider block font-display">
                  Scalable Chunk Geometry
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-stone-400 block mb-1">Chunk Radius (kr ≥ 0)</label>
                    <input
                      type="number"
                      min={0}
                      value={chunkK}
                      onChange={e => {
                        const newKr = Math.max(0, Math.floor(+e.target.value) || 0);
                        setChunkK(newKr);
                        rebuildTilesFromChunks(chunkNodes, newKr);
                      }}
                      className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-mono-nums"
                    />
                    <span className="text-[10px] text-stone-500 block mt-0.5">
                      {chunkK === 0 ? '1 tile' : chunkK === 1 ? '7-hex flower' : `${tilesPerChunk} tiles / chunk`}
                    </span>
                  </div>

                  <div>
                    <label className="text-stone-400 block mb-1">Max Capacity (Chunks)</label>
                    <input
                      type="number"
                      min={1}
                      value={maxChunks}
                      onChange={e => {
                        const newMax = Math.max(1, Math.floor(+e.target.value) || 1);
                        setMaxChunks(newMax);
                      }}
                      className="w-full bg-[#1b2b22] border border-[#2e4235] rounded p-1.5 text-stone-100 font-mono-nums"
                    />
                    <span className="text-[10px] text-stone-500 block mt-0.5">
                      No upper limit (e.g. 37, 61, 127)
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-stone-400">
                  Grid bounds: <b>Ring {maxChunkRadius}</b> (up to {maxChunks} chunk nodes).
                </div>
              </div>

              {/* Chunk Tools Palette */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'toggle', label: 'Toggle Chunk', icon: '⬡', desc: 'Add or remove chunk' },
                  { id: 'boss', label: 'Move Boss', icon: '☠', desc: 'Set Pneuma\'s Tower center' },
                  { id: 'biome', label: 'Set Biome', icon: '🎨', desc: 'Assign biome to chunk' },
                  { id: 'spawn', label: 'Mark Spawn', icon: '⌂', desc: 'Designate S1..S6 spawn' },
                ].map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setChunkTool(tool.id as ChunkTool)}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${chunkTool === tool.id ? 'bg-[#22352b] border-amber-400 text-amber-300' : 'bg-[#16221c] border-[#293d31] text-stone-300 hover:bg-[#1d2d25]'}`}
                  >
                    <span className="text-base font-bold w-5 text-center font-mono-nums">{tool.icon}</span>
                    <div>
                      <div className="text-xs font-semibold">{tool.label}</div>
                      <div className="text-[10px] text-stone-400">{tool.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {chunkTool === 'biome' && (
                <div className="p-3.5 rounded-xl bg-[#141f19] border border-[#26382e] space-y-2">
                  <span className="text-xs font-bold text-amber-300 block">Select Biome Brush</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia', 'Random'] as const).map(b => (
                      <button
                        key={b}
                        onClick={() => setChunkBiomeBrush(b)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${chunkBiomeBrush === b ? 'bg-amber-500 text-black font-bold border-amber-400' : 'bg-[#192720] border-[#304437] text-stone-300 hover:bg-[#203328]'}`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-stone-400 pt-1">
                    Click any chunk in the diagram to paint it with {chunkBiomeBrush}.
                  </p>
                </div>
              )}

              {/* Chunk Macro Stats */}
              <div className="p-3.5 rounded-xl bg-[#141f19] border border-[#26382e] space-y-1.5 text-xs font-mono-nums">
                <span className="text-stone-300 font-bold block mb-1">Layout Statistics</span>
                <div className="flex justify-between text-stone-400">
                  <span>Active Chunks:</span> <b className="text-stone-100">{totalChunks}</b>
                </div>
                <div className="flex justify-between text-stone-400">
                  <span>Tiles (×{tilesPerChunk}):</span> <b className="text-emerald-400">{totalChunks * tilesPerChunk}</b>
                </div>
                <div className="flex justify-between text-stone-400">
                  <span>Hex Loader Dice:</span> <b className="text-amber-400">{hexLoaderDice}</b>
                </div>
                <div className="flex justify-between text-stone-400">
                  <span>Spawn Chunks:</span> <b className="text-purple-400">{chunkList.filter(c => c.spawnIndex).length}</b>
                </div>
              </div>
            </div>
          ) : (
            // TILE BRUSH CONTROLS
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider font-display">
                Tile Brush Palette
              </h2>

              <div className="grid grid-cols-2 gap-2">
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
                  { id: 'Biome', label: 'Paint Biome', icon: '🎨', desc: 'Change tile element' },
                  { id: 'Erase', label: 'Erase Tile', icon: '⌫', desc: 'Reset to plain path' },
                ].map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveBrush(tool.id as BrushTool)}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${activeBrush === tool.id ? 'bg-[#22352b] border-amber-400 text-amber-300' : 'bg-[#16221c] border-[#293d31] text-stone-300 hover:bg-[#1d2d25]'}`}
                  >
                    <span className="text-base font-bold w-5 text-center font-mono-nums">{tool.icon}</span>
                    <div>
                      <div className="text-xs font-semibold">{tool.label}</div>
                      <div className="text-[10px] text-stone-400">{tool.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-[#141f19] border border-[#26382e] space-y-2 text-xs">
                <span className="font-bold text-amber-300 block">Brush Settings: {activeBrush}</span>
                {activeBrush === 'Biome' && (
                  <select
                    value={paintBiome}
                    onChange={e => setPaintBiome(e.target.value as BiomeType)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#1a2821] border border-[#32473a] text-stone-100"
                  >
                    {Object.keys(BIOME_CONFIGS).map(b => (
                      <option key={b} value={b}>{BIOME_CONFIGS[b as BiomeType].name}</option>
                    ))}
                  </select>
                )}
                {activeBrush === 'C' && (
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
                )}
                {activeBrush === 'M' && (
                  <div className="space-y-2">
                    <label className="block text-stone-300">Monster Danger Level (CR: {mobCr})</label>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={mobCr}
                      onChange={e => setMobCr(+e.target.value)}
                      className="w-full accent-amber-400"
                    />
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={isLair}
                        onChange={e => setIsLair(e.target.checked)}
                        className="rounded border-[#32473a]"
                      />
                      <span>Mini-Boss Lair (carries Boss Key)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
