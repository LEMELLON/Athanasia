import React, { useState, useMemo } from 'react';
import { ItemEntity, ItemCategory, Rarity, BiomeType, CharacterClass, StatKey } from '../types/game';
import { BIOME_CONFIGS } from '../data/defaultGameData';

interface Props {
  items: ItemEntity[];
  onUpdateItems: (newItems: ItemEntity[]) => void;
  onEquipToPlayer?: (item: ItemEntity) => void;
}

const RARITY_COLORS: Record<Rarity, { border: string; text: string; bg: string }> = {
  'Common': { border: 'border-stone-500', text: 'text-stone-300', bg: 'bg-stone-800/40' },
  'Uncommon': { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-950/40' },
  'Rare': { border: 'border-sky-500', text: 'text-sky-400', bg: 'bg-sky-950/40' },
  'Epic': { border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-950/40' },
  'Legendary': { border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-950/40' }
};

export const ItemForge: React.FC<Props> = ({ items, onUpdateItems }) => {
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'all'>('all');
  const [selectedRarity, setSelectedRarity] = useState<Rarity | 'all'>('all');
  const [selectedBiome, setSelectedBiome] = useState<BiomeType | 'Universal' | 'all'>('all');
  const [selectedClass, setSelectedClass] = useState<CharacterClass | 'All' | 'all'>('all');

  // Edit / Creation modal state
  const [editingItem, setEditingItem] = useState<ItemEntity | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Balancing Test State
  const [testTargetCr, setTestTargetCr] = useState<number>(3);
  const [testTargetDefense, setTestTargetDefense] = useState<number>(8);
  const [testTargetHp, setTestTargetHp] = useState<number>(46);
  const [testAttackerStatMod, setTestAttackerStatMod] = useState<number>(2);
  const [testAttackerPb, setTestAttackerPb] = useState<number>(2);
  const [testElementalAdvantage, setTestElementalAdvantage] = useState<'neutral' | 'adv' | 'dis'>('neutral');

  const filteredItems = useMemo(() => {
    return items.filter(it => {
      const matchSearch = it.name.toLowerCase().includes(search.toLowerCase()) ||
        (it.effectDescription && it.effectDescription.toLowerCase().includes(search.toLowerCase())) ||
        (it.appearance && it.appearance.toLowerCase().includes(search.toLowerCase()));
      const matchCat = selectedCategory === 'all' || it.category === selectedCategory;
      const matchRarity = selectedRarity === 'all' || it.rarity === selectedRarity;
      const matchBiome = selectedBiome === 'all' || it.biome === selectedBiome;
      const matchClass = selectedClass === 'all' || it.classReq === selectedClass;
      return matchSearch && matchCat && matchRarity && matchBiome && matchClass;
    });
  }, [items, search, selectedCategory, selectedRarity, selectedBiome, selectedClass]);

  // Open Create Form
  const handleStartCreate = (category: ItemCategory = 'weapon') => {
    const newItem: ItemEntity = {
      id: `custom_${Date.now()}`,
      name: category === 'weapon' ? 'Olympian Glaive' : category === 'armor' ? 'Gilded Chiton' : category === 'shield' ? 'Aegis Buckler' : 'Nectar Draft',
      category,
      rarity: 'Uncommon',
      biome: 'Universal',
      classReq: 'All',
      baseAtk: category === 'weapon' ? 8 : undefined,
      rangeMin: category === 'weapon' ? 0 : undefined,
      rangeMax: category === 'weapon' ? 1 : undefined,
      scalingStat: category === 'weapon' ? 'STR' : undefined,
      baseAc: (category === 'armor' || category === 'shield') ? 2 : undefined,
      dexPenalty: (category === 'armor' || category === 'shield') ? 1 : undefined,
      healHpPct: category === 'consumable' ? 25 : undefined,
      description: 'Crafted in the sacred forges of Mount Olympus.',
      appearance: 'Etched with ancient Homeric Greek symbols that pulse with Anima.',
      effectDescription: 'Strikes release a concentrated burst of resonant energy.',
      isCustom: true
    };
    setEditingItem(newItem);
    setIsCreatingNew(true);
  };

  const handleSaveItem = () => {
    if (!editingItem) return;
    if (isCreatingNew) {
      onUpdateItems([editingItem, ...items]);
    } else {
      onUpdateItems(items.map(it => it.id === editingItem.id ? editingItem : it));
    }
    setEditingItem(null);
    setIsCreatingNew(false);
  };

  const handleDeleteItem = (id: string) => {
    if (confirm('Delete this item from the game catalog?')) {
      onUpdateItems(items.filter(it => it.id !== id));
      if (editingItem?.id === id) setEditingItem(null);
    }
  };

  const handleDuplicateItem = (item: ItemEntity) => {
    const cloned: ItemEntity = {
      ...item,
      id: `clone_${Date.now()}`,
      name: `${item.name} (Copy)`,
      isCustom: true
    };
    onUpdateItems([cloned, ...items]);
  };

  // Instant 100-Round Monte Carlo Combat Simulator for Game Balancing
  const balanceMetrics = useMemo(() => {
    const weapon = editingItem?.category === 'weapon' ? editingItem : filteredItems.find(i => i.category === 'weapon');
    if (!weapon || weapon.baseAtk == null) return null;

    let totalDamage = 0;
    let totalHits = 0;
    let totalCrits = 0;
    let roundsToKill = 0;
    const SIM_ROUNDS = 100;

    for (let i = 0; i < SIM_ROUNDS; i++) {
      // 2d6 hit resolution
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      const isCrit = d1 === 6 && d2 === 6;
      const isFumble = d1 === 1 && d2 === 1;
      const hitTotal = d1 + d2 + testAttackerStatMod + testAttackerPb;
      const hits = !isFumble && (isCrit || hitTotal >= testTargetDefense);

      if (hits) {
        totalHits++;
        if (isCrit) totalCrits++;
        // 1d20 damage roll
        const dDmg = 1 + Math.floor(Math.random() * 20);
        let rawDmg = weapon.baseAtk + dDmg + testAttackerStatMod;
        if (isCrit) rawDmg = Math.floor(rawDmg * 1.5);

        // Elemental modifier
        if (testElementalAdvantage === 'adv') rawDmg = Math.floor(rawDmg * 1.5);
        if (testElementalAdvantage === 'dis') rawDmg = Math.floor(rawDmg * 0.5);

        totalDamage += rawDmg;
      }
    }

    const hitRate = Math.round((totalHits / SIM_ROUNDS) * 100);
    const avgDamagePerAttack = Math.round((totalDamage / SIM_ROUNDS) * 10) / 10;
    roundsToKill = avgDamagePerAttack > 0 ? Math.ceil(testTargetHp / avgDamagePerAttack) : 99;

    return {
      weaponName: weapon.name,
      baseAtk: weapon.baseAtk,
      hitRate,
      critRate: Math.round((totalCrits / SIM_ROUNDS) * 100),
      avgDpt: avgDamagePerAttack,
      ttkRounds: roundsToKill,
      targetHp: testTargetHp,
      targetDefense: testTargetDefense
    };
  }, [editingItem, filteredItems, testTargetDefense, testTargetHp, testAttackerStatMod, testAttackerPb, testElementalAdvantage]);

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#141e18] border-b border-[#2e3f36] flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-amber-400 font-display">
            Equipment & Weapon Forge
          </h1>
          <p className="text-xs text-stone-400">
            Design, balance, and fine-tune weapons, armors, and consumables for your game masters and players.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleStartCreate('weapon')}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors shadow-md"
          >
            + Forge Weapon
          </button>
          <button
            onClick={() => handleStartCreate('armor')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] text-xs font-semibold"
          >
            + New Armor
          </button>
          <button
            onClick={() => handleStartCreate('consumable')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] text-xs font-semibold"
          >
            + Consumable
          </button>
        </div>
      </div>

      {/* Main Workspace Split: Catalog & Balance Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Filterable Catalog */}
        <div className="flex-1 flex flex-col border-r border-[#2e3f36] overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 bg-[#111a15] border-b border-[#2e3f36] flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search weapons, armor, passives..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[#192720] border border-[#35493e] rounded-lg text-stone-200 w-56 focus:border-amber-400 outline-none"
            />

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value as ItemCategory | 'all')}
              className="px-2.5 py-1.5 text-xs bg-[#192720] border border-[#35493e] rounded-lg text-stone-200"
            >
              <option value="all">All Categories</option>
              <option value="weapon">Weapons</option>
              <option value="armor">Armor</option>
              <option value="shield">Shields</option>
              <option value="consumable">Consumables</option>
            </select>

            <select
              value={selectedRarity}
              onChange={e => setSelectedRarity(e.target.value as Rarity | 'all')}
              className="px-2.5 py-1.5 text-xs bg-[#192720] border border-[#35493e] rounded-lg text-stone-200"
            >
              <option value="all">All Rarities</option>
              <option value="Common">Common</option>
              <option value="Uncommon">Uncommon</option>
              <option value="Rare">Rare</option>
              <option value="Epic">Epic</option>
              <option value="Legendary">Legendary</option>
            </select>

            <select
              value={selectedBiome}
              onChange={e => setSelectedBiome(e.target.value as BiomeType | 'Universal' | 'all')}
              className="px-2.5 py-1.5 text-xs bg-[#192720] border border-[#35493e] rounded-lg text-stone-200"
            >
              <option value="all">All Biomes</option>
              <option value="Pyria">Pyria (Fire)</option>
              <option value="Hydoria">Hydoria (Water)</option>
              <option value="Aeria">Aeria (Air)</option>
              <option value="Geia">Geia (Earth)</option>
              <option value="Phosia">Phosia (Light)</option>
              <option value="Skotosia">Skotosia (Dark)</option>
              <option value="Universal">Universal</option>
            </select>

            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value as CharacterClass | 'All' | 'all')}
              className="px-2.5 py-1.5 text-xs bg-[#192720] border border-[#35493e] rounded-lg text-stone-200"
            >
              <option value="all">All Classes</option>
              <option value="Cana">Cana (Ranger)</option>
              <option value="Bhana">Bhana (Warrior)</option>
              <option value="Prana">Prana (Mage)</option>
              <option value="Gana">Gana (Summoner)</option>
              <option value="All">Universal</option>
            </select>

            <span className="text-xs text-stone-400 ml-auto font-mono-nums">
              {filteredItems.length} items
            </span>
          </div>

          {/* Cards Grid */}
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredItems.map(item => {
              const rStyle = RARITY_COLORS[item.rarity];
              const isSelected = editingItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => { setEditingItem(item); setIsCreatingNew(false); }}
                  className={`relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${isSelected ? 'border-amber-400 bg-[#1e2f26] ring-1 ring-amber-400/50' : 'border-[#273830] bg-[#141e19] hover:border-[#3d5446] hover:bg-[#182620]'}`}
                >
                  <div>
                    {/* Header: Name and Category */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-sm text-stone-100 font-display">
                        {item.name}
                      </h3>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${rStyle.border} ${rStyle.text} ${rStyle.bg}`}>
                        {item.rarity}
                      </span>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex items-center gap-2 text-[11px] text-stone-400 mb-3 flex-wrap">
                      <span className="text-amber-300/90 font-medium">
                        {item.category.toUpperCase()}
                      </span>
                      <span>·</span>
                      <span>{item.classReq === 'All' ? 'Any Class' : item.classReq}</span>
                      <span>·</span>
                      <span>{item.biome}</span>
                    </div>

                    {/* Combat Stats summary */}
                    <div className="p-2 rounded-lg bg-[#0e1612] border border-[#1e2e25] mb-3 text-xs font-mono-nums flex items-center justify-between">
                      {item.category === 'weapon' && (
                        <>
                          <div>Base ATK: <b className="text-red-400">{item.baseAtk}</b></div>
                          <div>Range: <b className="text-sky-400">{item.rangeMin ?? 0}–{item.rangeMax ?? 1} tiles</b></div>
                          <div>Scale: <b className="text-amber-400">{item.scalingStat || 'STR'}</b></div>
                        </>
                      )}
                      {(item.category === 'armor' || item.category === 'shield') && (
                        <>
                          <div>Base AC: <b className="text-emerald-400">+{item.baseAc}</b></div>
                          <div>AGI Pen: <b className="text-amber-400">{item.dexPenalty ? `-${item.dexPenalty}` : '0'}</b></div>
                        </>
                      )}
                      {item.category === 'consumable' && (
                        <>
                          {item.healHpPct && <div>Heal: <b className="text-emerald-400">+{item.healHpPct}% HP</b></div>}
                          {item.restoreMpPct && <div>Mana: <b className="text-sky-400">+{item.restoreMpPct}% MP</b></div>}
                          {item.bonusStat && <div>Buff: <b className="text-amber-400">+{item.bonusStatValue} {item.bonusStat}</b></div>}
                        </>
                      )}
                    </div>

                    {/* Passive effect */}
                    {item.effectDescription && (
                      <p className="text-xs text-amber-200/90 mb-2 leading-relaxed">
                        <strong className="text-amber-400 font-semibold">Effect: </strong>
                        {item.effectDescription}
                      </p>
                    )}

                    {/* Appearance quote */}
                    {item.appearance && (
                      <p className="text-[11px] text-stone-400 italic mb-2 line-clamp-2">
                        "{item.appearance}"
                      </p>
                    )}
                  </div>

                  {/* Card footer actions */}
                  <div className="pt-2 border-t border-[#1e2e25] flex items-center justify-between text-xs mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicateItem(item); }}
                      className="text-stone-400 hover:text-amber-300"
                      title="Duplicate item"
                    >
                      Clone
                    </button>
                    {item.isCustom && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                        className="text-red-400 hover:text-red-300"
                        title="Delete item"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Live Item Editor & Balance Simulator Dock */}
        <div className="w-[420px] bg-[#111a15] flex flex-col overflow-y-auto p-5">
          {editingItem ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#2e3f36]">
                <h2 className="text-base font-bold text-amber-400 font-display">
                  {isCreatingNew ? 'Forging New Item' : 'Edit Equipment'}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingItem(null); setIsCreatingNew(false); }}
                    className="px-2.5 py-1 text-xs rounded bg-[#1e2f26] text-stone-300 border border-[#2e3f36]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveItem}
                    className="px-3.5 py-1 text-xs rounded bg-amber-500 hover:bg-amber-400 text-black font-bold"
                  >
                    Save Changes
                  </button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Item Name</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-100 outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 mb-1 font-semibold">Category</label>
                    <select
                      value={editingItem.category}
                      onChange={e => setEditingItem({ ...editingItem, category: e.target.value as ItemCategory })}
                      className="w-full px-2.5 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-200"
                    >
                      <option value="weapon">Weapon</option>
                      <option value="armor">Armor</option>
                      <option value="shield">Shield</option>
                      <option value="consumable">Consumable</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 mb-1 font-semibold">Rarity</label>
                    <select
                      value={editingItem.rarity}
                      onChange={e => setEditingItem({ ...editingItem, rarity: e.target.value as Rarity })}
                      className="w-full px-2.5 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-200"
                    >
                      <option value="Common">Common</option>
                      <option value="Uncommon">Uncommon</option>
                      <option value="Rare">Rare</option>
                      <option value="Epic">Epic</option>
                      <option value="Legendary">Legendary</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 mb-1 font-semibold">Biome Flavor</label>
                    <select
                      value={editingItem.biome}
                      onChange={e => setEditingItem({ ...editingItem, biome: e.target.value as BiomeType | 'Universal' })}
                      className="w-full px-2.5 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-200"
                    >
                      <option value="Universal">Universal</option>
                      <option value="Pyria">Pyria (Fire)</option>
                      <option value="Hydoria">Hydoria (Water)</option>
                      <option value="Aeria">Aeria (Air)</option>
                      <option value="Geia">Geia (Earth)</option>
                      <option value="Phosia">Phosia (Light)</option>
                      <option value="Skotosia">Skotosia (Dark)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 mb-1 font-semibold">Class Restriction</label>
                    <select
                      value={editingItem.classReq}
                      onChange={e => setEditingItem({ ...editingItem, classReq: e.target.value as CharacterClass | 'All' })}
                      className="w-full px-2.5 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-200"
                    >
                      <option value="All">All Classes</option>
                      <option value="Cana">Cana (Ranger)</option>
                      <option value="Bhana">Bhana (Warrior)</option>
                      <option value="Prana">Prana (Mage)</option>
                      <option value="Gana">Gana (Summoner)</option>
                    </select>
                  </div>
                </div>

                {/* Dynamic Fields for Weapon */}
                {editingItem.category === 'weapon' && (
                  <div className="p-3 bg-[#16241d] rounded-lg border border-[#2d4438] space-y-3">
                    <span className="text-amber-400 font-bold block text-xs">Weapon Combat Parameters</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-stone-400 text-[11px] mb-1">Base ATK</label>
                        <input
                          type="number"
                          min={1}
                          max={35}
                          value={editingItem.baseAtk ?? 6}
                          onChange={e => setEditingItem({ ...editingItem, baseAtk: Math.max(1, +e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-100 font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-stone-400 text-[11px] mb-1">Min Range</label>
                        <input
                          type="number"
                          min={0}
                          max={8}
                          value={editingItem.rangeMin ?? 0}
                          onChange={e => setEditingItem({ ...editingItem, rangeMin: Math.max(0, +e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-100 font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-stone-400 text-[11px] mb-1">Max Range</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={editingItem.rangeMax ?? 1}
                          onChange={e => setEditingItem({ ...editingItem, rangeMax: Math.max(1, +e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-100 font-mono-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-stone-400 text-[11px] mb-1">Scaling Attribute</label>
                      <select
                        value={editingItem.scalingStat || 'STR'}
                        onChange={e => setEditingItem({ ...editingItem, scalingStat: e.target.value as StatKey })}
                        className="w-full px-2.5 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-200"
                      >
                        <option value="STR">STR (Melee weapons, Cleavers, Clubs)</option>
                        <option value="AGI">AGI (Bows, Finesse, Daggers, Slingshots)</option>
                        <option value="INT">INT (Wands, Tomes, Elemental Arcana)</option>
                        <option value="WIS">WIS (Staves, Sacred Divinity)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Dynamic Fields for Armor/Shield */}
                {(editingItem.category === 'armor' || editingItem.category === 'shield') && (
                  <div className="p-3 bg-[#16241d] rounded-lg border border-[#2d4438] space-y-3">
                    <span className="text-emerald-400 font-bold block text-xs">Defensive Ratings</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-stone-400 text-[11px] mb-1">Base AC</label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={editingItem.baseAc ?? 2}
                          onChange={e => setEditingItem({ ...editingItem, baseAc: Math.max(1, +e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-100 font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-stone-400 text-[11px] mb-1">DEX Penalty</label>
                        <input
                          type="number"
                          min={0}
                          max={3}
                          value={editingItem.dexPenalty ?? 0}
                          onChange={e => setEditingItem({ ...editingItem, dexPenalty: Math.max(0, +e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-[#192720] border border-[#35493e] text-stone-100 font-mono-nums"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Effect and Lore */}
                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Special Ability / Passive Effect</label>
                  <textarea
                    rows={2}
                    value={editingItem.effectDescription ?? ''}
                    onChange={e => setEditingItem({ ...editingItem, effectDescription: e.target.value })}
                    placeholder="e.g. Hits apply burn damage of 2 for 2 rounds..."
                    className="w-full px-3 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-100 outline-none focus:border-amber-400 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 mb-1 font-semibold">Visual Description / Flavor Text</label>
                  <textarea
                    rows={2}
                    value={editingItem.appearance ?? ''}
                    onChange={e => setEditingItem({ ...editingItem, appearance: e.target.value })}
                    placeholder="What the item looks like to the players..."
                    className="w-full px-3 py-1.5 rounded bg-[#192720] border border-[#35493e] text-stone-100 outline-none focus:border-amber-400 resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#141e19] border border-[#273830] text-center text-stone-400 text-xs mb-4">
              Select an item on the left to edit its statistics or click <b>+ Forge Weapon</b> to create a new game feature.
            </div>
          )}

          {/* Real-time Balancing Combat Simulation Widget */}
          <div className="mt-6 pt-5 border-t border-[#2e3f36]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-display">
                Live Balance Simulator (100-Round Monte Carlo)
              </h3>
            </div>

            <div className="space-y-3 p-3.5 rounded-xl bg-[#0f1713] border border-[#23352b] text-xs">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <label className="text-stone-400 block mb-0.5">Target Mob HP</label>
                  <input
                    type="number"
                    value={testTargetHp}
                    onChange={e => setTestTargetHp(Math.max(1, +e.target.value))}
                    className="w-full px-2 py-1 rounded bg-[#16221c] border border-[#2e3f36] text-stone-200 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-0.5">Target Defense (DV)</label>
                  <input
                    type="number"
                    value={testTargetDefense}
                    onChange={e => setTestTargetDefense(Math.max(1, +e.target.value))}
                    className="w-full px-2 py-1 rounded bg-[#16221c] border border-[#2e3f36] text-stone-200 font-mono-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <label className="text-stone-400 block mb-0.5">Attacker Stat Mod</label>
                  <input
                    type="number"
                    value={testAttackerStatMod}
                    onChange={e => setTestAttackerStatMod(+e.target.value)}
                    className="w-full px-2 py-1 rounded bg-[#16221c] border border-[#2e3f36] text-stone-200 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-0.5">Element Matchup</label>
                  <select
                    value={testElementalAdvantage}
                    onChange={e => setTestElementalAdvantage(e.target.value as 'neutral' | 'adv' | 'dis')}
                    className="w-full px-1.5 py-1 rounded bg-[#16221c] border border-[#2e3f36] text-stone-200"
                  >
                    <option value="neutral">Neutral (1.0x)</option>
                    <option value="adv">Advantage (1.5x)</option>
                    <option value="dis">Disadvantage (0.5x)</option>
                  </select>
                </div>
              </div>

              {/* Simulation Result Output */}
              {balanceMetrics && (
                <div className="mt-3 pt-3 border-t border-[#23352b] space-y-1.5 font-mono-nums">
                  <div className="flex justify-between">
                    <span className="text-stone-400">Testing:</span>
                    <span className="text-stone-200 font-semibold">{balanceMetrics.weaponName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Hit Rate (2d6 ≥ DV):</span>
                    <span className="text-emerald-400 font-bold">{balanceMetrics.hitRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Average DPT:</span>
                    <span className="text-amber-300 font-bold">{balanceMetrics.avgDpt} dmg/turn</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Time-to-Kill (TTK):</span>
                    <span className="text-sky-300 font-bold">{balanceMetrics.ttkRounds} turn(s)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
