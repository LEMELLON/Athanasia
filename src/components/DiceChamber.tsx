import React, { useState } from 'react';
import { ThreeDiceCanvas, DiceRequest } from './ThreeDiceCanvas';

export const DiceChamber: React.FC = () => {
  const [history, setHistory] = useState<{ id: number; diceType: string; values: number[]; total: number; timestamp: string }[]>([]);
  const [activeRoll, setActiveRoll] = useState<{
    dice: DiceRequest[];
    title: string;
    onComplete: (results: { id: string; type: 'd6' | 'd20' | 'd8'; value: number }[]) => void;
  } | null>(null);

  const rollCustom = (type: '2d6' | '1d20' | 'd8' | '3d6' | '4d6' | '1d6') => {
    let requests: DiceRequest[] = [];
    if (type === '2d6') {
      const v1 = 1 + Math.floor(Math.random() * 6);
      const v2 = 1 + Math.floor(Math.random() * 6);
      requests = [
        { id: 'd6_1', type: 'd6', targetValue: v1, label: 'Die A', color: '#1c2822' },
        { id: 'd6_2', type: 'd6', targetValue: v2, label: 'Die B', color: '#2a1a14' }
      ];
    } else if (type === '1d20') {
      const v = 1 + Math.floor(Math.random() * 20);
      requests = [{ id: 'd20_1', type: 'd20', targetValue: v, label: 'd20 Check', color: '#2e183b' }];
    } else if (type === 'd8') {
      const v = 1 + Math.floor(Math.random() * 8);
      requests = [{ id: 'd8_1', type: 'd8', targetValue: v, label: 'Element Die', color: '#163326' }];
    } else if (type === '1d6') {
      const v = 1 + Math.floor(Math.random() * 6);
      requests = [{ id: 'd6_single', type: 'd6', targetValue: v, label: 'd6', color: '#1c2822' }];
    } else if (type === '3d6') {
      requests = [1, 2, 3].map(n => ({
        id: `d6_${n}`,
        type: 'd6' as const,
        targetValue: 1 + Math.floor(Math.random() * 6),
        label: `d6 #${n}`,
        color: '#1c2822'
      }));
    } else if (type === '4d6') {
      requests = [1, 2, 3, 4].map(n => ({
        id: `d6_${n}`,
        type: 'd6' as const,
        targetValue: 1 + Math.floor(Math.random() * 6),
        label: `d6 #${n}`,
        color: '#1c2822'
      }));
    }

    setActiveRoll({
      title: `Chamber Roll: ${type.toUpperCase()}`,
      dice: requests,
      onComplete: results => {
        const vals = results.map(r => r.value);
        const sum = vals.reduce((a, b) => a + b, 0);
        setHistory(prev => [
          {
            id: Date.now(),
            diceType: type,
            values: vals,
            total: sum,
            timestamp: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 19)
        ]);
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0c100e] text-[#ece3c8] overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-4 bg-[#141e18] border-b border-[#2e3f36] flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-amber-400 font-display">
            3D Physical Dice Chamber
          </h1>
          <p className="text-xs text-stone-400">
            Real-time WebGL physics dice simulation with procedural decals and tactile clatter audio.
          </p>
        </div>

        {/* Quick Throw Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => rollCustom('2d6')}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
          >
            Roll 2d6 (Combat/Move)
          </button>
          <button
            onClick={() => rollCustom('1d20')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-amber-300 border border-[#3d5446] font-semibold text-xs"
          >
            Roll 1d20 (Damage)
          </button>
          <button
            onClick={() => rollCustom('d8')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-teal-300 border border-[#3d5446] font-semibold text-xs"
          >
            Roll d8 (Element)
          </button>
          <button
            onClick={() => rollCustom('3d6')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] text-xs"
          >
            Roll 3d6
          </button>
          <button
            onClick={() => rollCustom('4d6')}
            className="px-3 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2d4438] text-stone-200 border border-[#3d5446] text-xs"
          >
            Roll 4d6 (Stats)
          </button>
        </div>
      </div>

      {/* Main Chamber Split: 3D Viewport & Roll Audit Log */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Full 3D Physics Viewport */}
        <div className="flex-1 relative bg-[#090e0b]">
          <ThreeDiceCanvas
            activeRoll={activeRoll}
            isStandalone={true}
          />
        </div>

        {/* Right: Roll History & Probability Inspector */}
        <div className="w-80 bg-[#111a15] border-l border-[#2e3f36] flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#22332a]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-display">
              Roll Audit History
            </h2>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-[11px] text-stone-400 hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 font-mono-nums">
            {history.map(item => (
              <div key={item.id} className="p-2.5 rounded-lg bg-[#141f19] border border-[#24362b] text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-amber-300 uppercase">{item.diceType}</span>
                  <span className="text-[10px] text-stone-500 ml-2">{item.timestamp}</span>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    Faces: [{item.values.join(', ')}]
                  </div>
                </div>
                <div className="text-base font-extrabold text-amber-400">
                  {item.total}
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-xs text-stone-500 italic text-center p-6">
                No rolls yet. Click any button above to roll 3D physics dice into the chamber.
              </p>
            )}
          </div>

          {/* Quick Probability Reference */}
          <div className="mt-4 pt-3 border-t border-[#22332a] text-xs text-stone-400 space-y-1">
            <span className="text-amber-400 font-bold block text-[11px] uppercase tracking-wide">
              v7 GDD Dice Math
            </span>
            <div className="flex justify-between"><span>2d6 Hit Target:</span> <b className="text-stone-200">7+ (58.3%)</b></div>
            <div className="flex justify-between"><span>Natural 12 Crit:</span> <b className="text-emerald-400">2.78% (Double Dmg)</b></div>
            <div className="flex justify-between"><span>Natural 2 Miss:</span> <b className="text-red-400">2.78% (Auto Fumble)</b></div>
          </div>
        </div>
      </div>
    </div>
  );
};
