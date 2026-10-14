import React, { useState, useEffect } from 'react';
import { loadSavedState, saveState, exportStateToJson, importStateFromJson, resetToDefaults, SavedGameState } from './services/storageService';
import { ItemForge } from './components/ItemForge';
import { MapArchitect } from './components/MapArchitect';
import { PlaytestSimulator } from './components/PlaytestSimulator';
import { DiceChamber } from './components/DiceChamber';
import { BalanceAnalytics } from './components/BalanceAnalytics';
import { ItemEntity, HexTile, PlayerCharacter } from './types/game';

type TabType = 'forge' | 'map' | 'simulator' | 'dice' | 'analytics';

export default function App() {
  const [gameState, setGameState] = useState<SavedGameState>(() => loadSavedState());
  const [activeTab, setActiveTab] = useState<TabType>('simulator');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // Auto-save whenever gameState changes
  useEffect(() => {
    saveState(gameState);
  }, [gameState]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // State update handlers
  const handleUpdateItems = (newItems: ItemEntity[]) => {
    setGameState(prev => ({ ...prev, items: newItems }));
    showNotification('Catalog updated & saved.');
  };

  const handleUpdateMap = (newMap: Record<string, HexTile>) => {
    setGameState(prev => ({ ...prev, mapTiles: newMap }));
    showNotification('Hex map saved to instance.');
  };

  const handleUpdatePlayers = (newPlayers: PlayerCharacter[]) => {
    setGameState(prev => ({ ...prev, players: newPlayers }));
  };

  const handleAddLog = (msg: string) => {
    setGameState(prev => ({
      ...prev,
      combatLog: [...prev.combatLog.slice(-50), `[R${prev.currentRound}] ${msg}`]
    }));
  };

  const handleUpdateRound = (newRound: number) => {
    setGameState(prev => ({ ...prev, currentRound: newRound }));
  };

  const handleExport = () => {
    const json = exportStateToJson(gameState);
    setExportJson(json);
    setIsExportModalOpen(true);
  };

  const handleImport = () => {
    try {
      const imported = importStateFromJson(importJsonText);
      setGameState(imported);
      setIsExportModalOpen(false);
      setImportJsonText('');
      showNotification('Save state imported successfully!');
    } catch {
      alert('Failed to parse save JSON. Please verify the format.');
    }
  };

  const handleReset = () => {
    if (confirm('Reset everything (items, map, playtest progress) back to default canon state?')) {
      const def = resetToDefaults();
      setGameState(def);
      showNotification('State reset to canon defaults.');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090e0b] text-[#ece3c8] font-sans select-none overflow-hidden">
      {/* Top Bar (Follows Top Bar Contract) */}
      <header className="flex items-center justify-between gap-6 px-6 py-3.5 bg-[#121c16] border-b border-[#24352b] shrink-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="text-base font-extrabold tracking-wider text-amber-400 font-display">
            ARCANA RESONATIA
          </span>
          <span className="text-xs text-stone-400 font-sans">
            · GM Studio & Playtest Suite
          </span>
        </div>

        {/* Zone 2: Navigation Links / Segmented Tabs */}
        <nav className="flex items-center gap-1.5 p-1 bg-[#0b120e] rounded-xl border border-[#22332a]">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'simulator' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
          >
            Playtest Simulator
          </button>
          <button
            onClick={() => setActiveTab('forge')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'forge' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
          >
            Equipment & Weapon Forge
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'map' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
          >
            Hex Map Architect
          </button>
          <button
            onClick={() => setActiveTab('dice')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'dice' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
          >
            3D Dice Chamber
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'analytics' ? 'bg-amber-500 text-black shadow-md' : 'text-stone-300 hover:text-white'}`}
          >
            Balance Analytics
          </button>
        </nav>

        {/* Zone 3: Primary Action & Persistence Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-stone-400 font-mono-nums hidden lg:inline">
            Round {gameState.currentRound} · Auto-saved
          </span>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a2820] hover:bg-[#25392e] text-amber-300 border border-[#2f4437] transition-colors whitespace-nowrap shrink-0"
          >
            Save / Export JSON
          </button>
          <button
            onClick={handleReset}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#1a2820] hover:bg-red-950/60 text-stone-400 hover:text-red-300 border border-[#2f4437] transition-colors whitespace-nowrap shrink-0"
            title="Reset to canon defaults"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Main Tabbed Viewport */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'simulator' && (
          <PlaytestSimulator
            players={gameState.players}
            mapTiles={gameState.mapTiles}
            allItems={gameState.items}
            onUpdatePlayers={handleUpdatePlayers}
            onUpdateMap={handleUpdateMap}
            combatLog={gameState.combatLog}
            onAddLog={handleAddLog}
            currentRound={gameState.currentRound}
            onUpdateRound={handleUpdateRound}
          />
        )}

        {activeTab === 'forge' && (
          <ItemForge
            items={gameState.items}
            onUpdateItems={handleUpdateItems}
          />
        )}

        {activeTab === 'map' && (
          <MapArchitect
            mapTiles={gameState.mapTiles}
            onUpdateMap={handleUpdateMap}
          />
        )}

        {activeTab === 'dice' && (
          <DiceChamber />
        )}

        {activeTab === 'analytics' && (
          <BalanceAnalytics />
        )}
      </main>

      {/* Ephemeral Toast Notification */}
      {notification && (
        <div className="absolute bottom-4 right-4 bg-[#142019] text-amber-300 px-4 py-2 rounded-lg border border-amber-500/50 shadow-2xl text-xs z-50">
          ✓ {notification}
        </div>
      )}

      {/* Save & Load JSON Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141e18] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-xl w-full flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-amber-400 font-display">
                Instance Persistence (JSON Backup & Share)
              </h2>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-stone-400 hover:text-white text-xs px-2.5 py-1 rounded bg-[#22332a]"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-stone-300">
              All progress is already auto-saved to your browser storage and cookies. You can also export the full game balance data, custom weapons, and map state to share with your team:
            </p>

            <textarea
              readOnly
              rows={6}
              value={exportJson}
              className="w-full p-2.5 bg-[#090e0b] border border-[#2e4235] rounded-lg text-xs font-mono-nums text-stone-300 select-all"
            />

            <div className="pt-2 border-t border-[#2e4235]">
              <h3 className="text-xs font-bold text-stone-200 mb-1.5">Import State JSON:</h3>
              <textarea
                rows={3}
                placeholder="Paste game state JSON here to restore..."
                value={importJsonText}
                onChange={e => setImportJsonText(e.target.value)}
                className="w-full p-2 bg-[#090e0b] border border-[#2e4235] rounded-lg text-xs font-mono-nums text-stone-300 mb-2"
              />
              <button
                onClick={handleImport}
                disabled={!importJsonText.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs disabled:opacity-40"
              >
                Load & Replace State
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
