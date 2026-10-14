import React, { useState } from 'react';
import { ELEMENT_LIST } from '../data/defaultGameData';

export const BalanceAnalytics: React.FC = () => {
  const [calcLevel, setCalcLevel] = useState(1);
  const [calcStr, setCalcStr] = useState(15);
  const [calcAgi, setCalcAgi] = useState(20);
  const [calcVit, setCalcVit] = useState(15);
  const [calcInt, setCalcInt] = useState(15);

  // Formulas from GDD Page 9 & 10
  const pb = calcLevel < 5 ? 2 : calcLevel < 9 ? 3 : calcLevel < 13 ? 4 : calcLevel < 17 ? 5 : 6;
  const vitMod = Math.floor((calcVit - 10) / 2);
  const strMod = Math.floor((calcStr - 10) / 2);
  const intMod = Math.floor((calcInt - 10) / 2);

  const maxHp = 20 + (vitMod * (pb + 1)) + (strMod * 2);
  const maxMp = 10 + (intMod * 5);
  const physDefense = vitMod * 2;
  const magicDefense = intMod * 2;
  const speedTiles = 1 + Math.floor(calcAgi / 5);

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-amber-400 font-display">
            Olympian Game Balancing & Math Analytics
          </h1>
          <p className="text-xs text-stone-400">
            Official formulas, level curves, and danger thresholds from the Arcana Resonatia game design specifications.
          </p>
        </div>

        {/* Live Archetype Stat Calculator */}
        <div className="p-5 rounded-2xl bg-[#141e18] border border-amber-500/40 shadow-xl">
          <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider font-display mb-3">
            Archetype Derived Stat Balancer (GDD v0.2 Math)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-stone-400 text-xs block mb-1">Level (1–20)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={calcLevel}
                onChange={e => setCalcLevel(Math.max(1, Math.min(20, +e.target.value)))}
                className="w-full px-2.5 py-1.5 rounded bg-[#1b2b22] border border-[#2e4235] text-stone-100 font-mono-nums"
              />
            </div>
            <div>
              <label className="text-stone-400 text-xs block mb-1">Strength (STR)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={calcStr}
                onChange={e => setCalcStr(+e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#1b2b22] border border-[#2e4235] text-stone-100 font-mono-nums"
              />
            </div>
            <div>
              <label className="text-stone-400 text-xs block mb-1">Agility (AGI)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={calcAgi}
                onChange={e => setCalcAgi(+e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#1b2b22] border border-[#2e4235] text-stone-100 font-mono-nums"
              />
            </div>
            <div>
              <label className="text-stone-400 text-xs block mb-1">Vitality (VIT)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={calcVit}
                onChange={e => setCalcVit(+e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#1b2b22] border border-[#2e4235] text-stone-100 font-mono-nums"
              />
            </div>
            <div>
              <label className="text-stone-400 text-xs block mb-1">Intelligence (INT)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={calcInt}
                onChange={e => setCalcInt(+e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#1b2b22] border border-[#2e4235] text-stone-100 font-mono-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-[#0e1612] border border-[#22332a] font-mono-nums text-xs">
            <div>
              <span className="text-stone-400 block text-[11px]">Max HP</span>
              <b className="text-emerald-400 text-base">{maxHp} HP</b>
              <span className="text-[10px] text-stone-500 block">20 + (VIT×(PB+1)) + (STR×2)</span>
            </div>
            <div>
              <span className="text-stone-400 block text-[11px]">Max MP</span>
              <b className="text-sky-400 text-base">{maxMp} MP</b>
              <span className="text-[10px] text-stone-500 block">10 + (INT×5)</span>
            </div>
            <div>
              <span className="text-stone-400 block text-[11px]">Physical Defense</span>
              <b className="text-amber-400 text-base">{physDefense} Base Def</b>
              <span className="text-[10px] text-stone-500 block">VIT × 2</span>
            </div>
            <div>
              <span className="text-stone-400 block text-[11px]">Magic Defense</span>
              <b className="text-purple-400 text-base">{magicDefense} Base M.Def</b>
              <span className="text-[10px] text-stone-500 block">INT × 2</span>
            </div>
            <div>
              <span className="text-stone-400 block text-[11px]">Movement Range</span>
              <b className="text-teal-400 text-base">{speedTiles} Tiles</b>
              <span className="text-[10px] text-stone-500 block">1 + (AGI / 5)</span>
            </div>
          </div>
        </div>

        {/* Grid of Rules and Reference Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Leveling & Proficiency System */}
          <div className="p-5 rounded-2xl bg-[#141e18] border border-[#24362b]">
            <h3 className="text-sm font-bold text-amber-400 font-display mb-3">
              Soul Resonance (SR) Leveling Table
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono-nums">
                <thead>
                  <tr className="border-b border-[#24362b] text-stone-400">
                    <th className="py-1.5 text-left">Level</th>
                    <th className="py-1.5 text-left">Total SR</th>
                    <th className="py-1.5 text-left">Proficiency</th>
                    <th className="py-1.5 text-left">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/40 text-stone-300">
                  <tr><td className="py-1">Lv 1</td><td>0</td><td className="text-amber-300">+2</td><td>—</td></tr>
                  <tr><td className="py-1">Lv 2</td><td>10</td><td className="text-amber-300">+2</td><td>+10</td></tr>
                  <tr><td className="py-1">Lv 3</td><td>30</td><td className="text-amber-300">+2</td><td>+20</td></tr>
                  <tr><td className="py-1">Lv 4</td><td>60</td><td className="text-amber-300">+2</td><td>+30</td></tr>
                  <tr><td className="py-1">Lv 5</td><td>100</td><td className="text-amber-300">+3</td><td>+40</td></tr>
                  <tr><td className="py-1">Lv 6</td><td>150</td><td className="text-amber-300">+3</td><td>+50</td></tr>
                  <tr><td className="py-1">Lv 7</td><td>210</td><td className="text-amber-300">+3</td><td>+60</td></tr>
                  <tr><td className="py-1">Lv 8</td><td>280</td><td className="text-amber-300">+3</td><td>+70</td></tr>
                  <tr><td className="py-1">Lv 9</td><td>360</td><td className="text-amber-300">+4</td><td>+80</td></tr>
                  <tr><td className="py-1">Lv 10</td><td>450</td><td className="text-amber-300">+4</td><td>+90</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Elemental Circle Matrix */}
          <div className="p-5 rounded-2xl bg-[#141e18] border border-[#24362b]">
            <h3 className="text-sm font-bold text-amber-400 font-display mb-3">
              Primal Elemental Resonance Ring
            </h3>
            <p className="text-xs text-stone-400 mb-3">
              Advantage deals <b>1.5× Damage</b> and refunds 1 spent Counter. Disadvantage deals <b>0.5× Damage</b>.
            </p>

            <div className="space-y-2 text-xs">
              {ELEMENT_LIST.map(el => (
                <div key={el.id} className="p-2 rounded-lg bg-[#0e1612] border border-[#22332a] flex items-center justify-between">
                  <span className="font-semibold" style={{ color: el.color }}>
                    {el.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400">
                      Strong vs: {el.strongAgainst.join(', ')} (1.5x)
                    </span>
                    <span className="text-red-400">
                      Weak vs: {el.weakAgainst.join(', ')} (0.5x)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
