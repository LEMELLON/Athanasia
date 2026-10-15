import React, { useState, useMemo } from 'react';
import { CharacterClass } from '../types/game';
import { CLASS_PVP_DECKS, PvPCard, CardType } from '../data/pvpCards';

export const CrucibleCards: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'rules'>('catalog');

  // Catalog Filters
  const [selectedClass, setSelectedClass] = useState<CharacterClass | 'All'>('All');
  const [selectedType, setSelectedType] = useState<CardType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectCard, setInspectCard] = useState<PvPCard | null>(null);

  // All 36 cards aggregated
  const allCards = useMemo(() => {
    return [
      ...CLASS_PVP_DECKS.Cana,
      ...CLASS_PVP_DECKS.Bhana,
      ...CLASS_PVP_DECKS.Prana,
      ...CLASS_PVP_DECKS.Gana
    ];
  }, []);

  const filteredCards = useMemo(() => {
    return allCards.filter(card => {
      const matchClass = selectedClass === 'All' || card.className === selectedClass;
      const matchType = selectedType === 'All' || card.type === selectedType;
      const matchSearch = searchQuery === '' ||
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.effect.toLowerCase().includes(searchQuery.toLowerCase());
      return matchClass && matchType && matchSearch;
    });
  }, [allCards, selectedClass, selectedType, searchQuery]);

  return (
    <div className="h-full flex flex-col bg-[#0b100d] text-stone-200 overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 bg-[#111a14] border-b border-[#233529] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-amber-400 font-display">
              🎴 Crucible Cards Codex
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono-nums font-bold">
              36 Canon Cards
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            Deterministic 9-card archetype decks (3 Attacks, 3 Spells, 3 Traps) engineered for tactical PvP Crucible wagers.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === 'catalog' ? 'bg-amber-500 text-black font-bold shadow-md' : 'bg-[#192720] text-stone-300 hover:text-white border border-[#2f4437]'}`}
          >
            🎴 Card Codex ({filteredCards.length})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === 'rules' ? 'bg-amber-500 text-black font-bold shadow-md' : 'bg-[#192720] text-stone-300 hover:text-white border border-[#2f4437]'}`}
          >
            📖 Crucible GDD Rules
          </button>
        </div>
      </div>

      {/* Main Tab Views */}
      <div className="flex-1 overflow-hidden relative">
        {/* TAB 1: CARD CODEX */}
        {activeTab === 'catalog' && (
          <div className="h-full flex flex-col p-6 overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-[#142019] rounded-xl border border-[#273a30] mb-4 shrink-0">
              <input
                type="text"
                placeholder="Search card by name, keyword, or rule effect..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-[#0d1611] border border-[#2f4437] text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 font-semibold">Class:</span>
                {(['All', 'Cana', 'Bhana', 'Prana', 'Gana'] as const).map(cls => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${selectedClass === cls ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold' : 'bg-[#1a2820] text-stone-400 hover:text-stone-200'}`}
                  >
                    {cls}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 font-semibold">Type:</span>
                {(['All', 'Attack', 'Spell', 'Trap'] as const).map(typ => (
                  <button
                    key={typ}
                    onClick={() => setSelectedType(typ)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${selectedType === typ ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold' : 'bg-[#1a2820] text-stone-400 hover:text-stone-200'}`}
                  >
                    {typ}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-1 pb-6">
              {filteredCards.map(card => {
                const isAttack = card.type === 'Attack';
                const isSpell = card.type === 'Spell';

                const borderCol = isAttack ? 'border-red-500/40 hover:border-red-400' : isSpell ? 'border-sky-500/40 hover:border-sky-400' : 'border-purple-500/40 hover:border-purple-400';
                const badgeBg = isAttack ? 'bg-red-950/60 text-red-300 border-red-500/40' : isSpell ? 'bg-sky-950/60 text-sky-300 border-sky-500/40' : 'bg-purple-950/60 text-purple-300 border-purple-500/40';

                return (
                  <div
                    key={card.id}
                    onClick={() => setInspectCard(card)}
                    className={`p-4 rounded-xl bg-[#121c16] border ${borderCol} hover:bg-[#16241c] transition-all flex flex-col justify-between cursor-pointer group shadow-lg`}
                  >
                    <div>
                      {/* Top Row: Class & Type Badge */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase font-mono-nums">
                          {card.className} · {card.className === 'Cana' ? 'Huntress' : card.className === 'Bhana' ? 'Warrior' : card.className === 'Prana' ? 'Sorceress' : 'Lyrist'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badgeBg}`}>
                          {card.type === 'Attack' ? '⚔ Attack' : card.type === 'Spell' ? '✦ Spell' : '🂠 Trap'}
                        </span>
                      </div>

                      {/* Card Title */}
                      <h3 className="text-base font-bold text-stone-100 group-hover:text-amber-300 font-display transition-colors mb-2">
                        {card.title}
                      </h3>

                      {/* Range / Cost Tags */}
                      <div className="flex items-center gap-2 mb-3">
                        {card.range !== undefined && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-[#1c2b21] text-sky-300 border border-[#2f4437] font-mono-nums">
                            Range: {card.range} tile{card.range > 1 ? 's' : ''}
                          </span>
                        )}
                        {card.type === 'Trap' && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-700/40 font-mono-nums">
                            Face-Down Set
                          </span>
                        )}
                      </div>

                      {/* Card Effect */}
                      <p className="text-xs text-stone-300 leading-relaxed bg-[#0b120e] p-3 rounded-lg border border-[#1e2f25]">
                        {card.effect}
                      </p>
                    </div>

                    {/* Bottom Flavor Text */}
                    <div className="mt-4 pt-3 border-t border-[#1b2b21] flex justify-between items-center text-[11px] text-stone-500 italic">
                      <span>"{card.flavor || 'Wielded in the Crucible of Resonatia.'}"</span>
                      <span className="text-amber-400 group-hover:translate-x-1 transition-transform">🔍</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CRUCIBLE GDD RULES */}
        {activeTab === 'rules' && (
          <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl bg-[#142019] border border-amber-500/40 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📜</span>
                <div>
                  <h2 className="text-lg font-bold text-amber-300 font-display">
                    The Crucible Duel System (GDD Pages 17, 18, 20–22)
                  </h2>
                  <p className="text-xs text-stone-400">
                    High-stakes tactical card duels executed during player-versus-player challenges on shared hex tiles or arenas.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#0e1612] border border-[#233529] space-y-2">
                  <h3 className="font-bold text-amber-400 uppercase tracking-wide">1. Deterministic 9-Card Deck</h3>
                  <p className="text-stone-300 leading-relaxed">
                    Every champion enters the Crucible with an unchangeable 9-card deck defined by their archetype: <b>3 Attacks</b>, <b>3 Spells</b>, and <b>3 Traps</b>.
                  </p>
                  <ul className="list-disc pl-4 text-stone-400 space-y-1">
                    <li>Start with a <b>3-card hand</b> drawn from the top.</li>
                    <li>Draw 1 card per round at turn start.</li>
                    <li><b>No reshuffle:</b> When the deck empties, combatants must rely on hand and basic weapon strikes.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1612] border border-[#233529] space-y-2">
                  <h3 className="font-bold text-amber-400 uppercase tracking-wide">2. The Wager (High Stakes)</h3>
                  <p className="text-stone-300 leading-relaxed">
                    Crucible duels require mutual wagers formulated before the opening hand is revealed.
                  </p>
                  <ul className="list-disc pl-4 text-stone-400 space-y-1">
                    <li><b>Wallet SR:</b> Only unbanked Wallet SR may be wagered; Total SR remains locked to prevent de-leveling.</li>
                    <li><b>Item Stakes:</b> Players may stake equipped weapons, armor, or relics.</li>
                    <li><b>Victor Takes All:</b> Winner collects the entire pot automatically upon opponent defeat.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1612] border border-[#233529] space-y-2">
                  <h3 className="font-bold text-amber-400 uppercase tracking-wide">3. Traps & Hidden Information</h3>
                  <p className="text-stone-300 leading-relaxed">
                    Trap cards are played face-down onto the field. They remain hidden until their specific trigger condition is met by the opponent.
                  </p>
                  <ul className="list-disc pl-4 text-stone-400 space-y-1">
                    <li><b>Counterstep:</b> Triggers on incoming melee strike to negate damage and retaliate.</li>
                    <li><b>Aegis Barrier:</b> Triggers on lethal spell to deploy shield.</li>
                    <li><b>Snare Trap:</b> Triggers on movement to lock the foe in place.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1612] border border-[#233529] space-y-2">
                  <h3 className="font-bold text-amber-400 uppercase tracking-wide">4. 1-HP Shatter & Death Resolution</h3>
                  <p className="text-stone-300 leading-relaxed">
                    Specialized rules govern token summons and fatal damage in the Crucible arena:
                  </p>
                  <ul className="list-disc pl-4 text-stone-400 space-y-1">
                    <li><b>1-HP Token Shatter:</b> Summons and familiars possess exactly 1 HP and absorb the entire damage instance with zero bleed-through.</li>
                    <li><b>Zero Campaign Lives Lost:</b> Defeat in a Crucible Duel never consumes campaign life tokens; the defeated player respawns at their nearest Sanctuary.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Card Inspector Modal */}
      {inspectCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131e17] p-6 rounded-2xl border border-amber-500/50 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest font-mono-nums">
                  {inspectCard.className} · {inspectCard.type}
                </span>
                <h2 className="text-xl font-bold text-stone-100 font-display">
                  {inspectCard.title}
                </h2>
              </div>
              <button
                onClick={() => setInspectCard(null)}
                className="text-stone-400 hover:text-white px-2 py-1 rounded bg-[#203227] text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex items-center gap-2">
              {inspectCard.range !== undefined && (
                <span className="px-2.5 py-1 rounded bg-[#1c2d22] text-sky-300 border border-[#2f4437] text-xs font-mono-nums">
                  Target Range: {inspectCard.range} hex{inspectCard.range > 1 ? 'es' : ''}
                </span>
              )}
              {inspectCard.type === 'Trap' && (
                <span className="px-2.5 py-1 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50 text-xs font-mono-nums">
                  🂠 Secret Face-Down
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-[#09100c] border border-[#1e2f25] space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block font-mono-nums">
                Rule Effect
              </span>
              <p className="text-sm text-stone-200 leading-relaxed">
                {inspectCard.effect}
              </p>
            </div>

            {inspectCard.flavor && (
              <p className="text-xs text-stone-400 italic bg-[#0c1410] p-3 rounded-lg border border-[#18261e]">
                "{inspectCard.flavor}"
              </p>
            )}

            <button
              onClick={() => setInspectCard(null)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
