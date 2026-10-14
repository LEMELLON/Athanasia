# Arcana Resonatia — GM Studio & Playtest Suite (Revision 3)

Comprehensive architectural analysis and plan for the new features: Scalable Chunks & Chunk Size, Balance Analytics GM Match Hacker & Inventory Controls, and 3D Dice Performance Optimizations.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following 5 major enhancements have been analyzed in detail:
>
> 1. **Scalable Chunks & Chunk Size Editor**:
>    - **Chunk Size ($k_r$)**: Variable tiles-per-chunk: $k_r = 0$ (1 tile), $k_r = 1$ (7-hex flower), $k_r = 2$ (19-tile giant flower), $k_r = 3$ (37 tiles).
>    - **Scalable Map Capacity**: Stepper / slider to increase total chunks ($7, 19, 37, 61, 91, 127\dots$). Dynamic concentric coordinate generation allowing GMs to build and pan across massive multi-biome worlds.
>
> 2. **Balance Analytics: Equip/Unequip & Consumable Modes**:
>    - Full equip & unequip mechanics (click equipped item to remove and return to unarmed/unarmored defaults).
>    - Dual consumable usage: **Turn-Consuming Mode** (standard combat action) vs **Free Test Mode** (instantly apply without burning the turn or triggering enemy retaliation).
>
> 3. **Defeat Handling: No Auto-Reset**:
>    - Reaching 0 HP no longer wipes the character. A **Defeat Resolution Modal** gives the GM 3 options:
>      - **Revive Here**: Instant restore to full HP/MP to continue the test fight.
>      - **Respawn at Start**: Apply standard 3-life rule (-1 life, 25% wallet penalty, reset monster).
>      - **Reset to Lv 1**: Manual restart only when desired.
>
> 4. **GM Match Hack / Sandbox Override Popup**:
>    - Live modal to directly edit/hack the active test encounter:
>      - Override Player HP, MP, Lives, Total SR, and Wallet SR.
>      - Add/remove 1-HP summon tokens.
>      - Manually afflict statuses (Ignited, Drenched, Splintered, Staggered, Shielded).
>      - Override active Mob HP, Defense, and CR mid-combat.
>
> 5. **3D Dice Performance & Frame-Rate Optimization**:
>    - Fix lag and stuttering by:
>      - **Texture Caching**: Pre-generate and cache face decals once in memory (zero dynamic canvas recreation per roll).
>      - **Zero Garbage Collection (GC)**: Pre-allocate vectors (`_v3`, `_quat`) outside the render tick.
>      - **Capped Pixel Ratio**: Limit WebGL canvas pixel ratio to `Math.min(devicePixelRatio, 1.5)`.
>      - **Static Render Idle**: Stop rendering when dice are settled to conserve CPU/GPU.

---

## 1. Detailed Analysis of Changes

### A. Scalable Chunks in Chunk Map Editor
- **Chunk Radius ($k_r$)**:
  - In the v7 rules:
    - $k_r = 0 \implies 1$ tile per chunk.
    - $k_r = 1 \implies 7$ tiles per chunk (standard flower).
    - $k_r = 2 \implies 19$ tiles per chunk.
  - Formula: $\text{tiles} = 3 k_r (k_r + 1) + 1$.
- **Max Chunks & Board Expansion**:
  - The map will allow selecting max chunk capacity: 7 (minimal), 19 (standard), 37 (classic 30 Hex Loader dice), 61, 91, or custom.
  - The SVG canvas dynamically renders the concentric slot rings, allowing the GM to toggle any chunk in the expanded radius and pan/zoom freely.

### B. Balance Analytics Player Mechanics & GM Match Hacker
- **Equip / Unequip**:
  - Clicking any weapon or armor in the bag equips it immediately.
  - Clicking an equipped item gives an "Unequip" option, safely reverting to basic unarmed (d6) or unarmored (base AC 0).
- **Consumable Execution**:
  - Standard action button: drinks potion and triggers enemy counter-action.
  - Test action button (and in Hack popup): drinks potion as a free test action without advancing the turn or triggering enemy attack.
- **Defeat Resolution**:
  - When HP hits 0, the game pauses and prompts the GM instead of auto-resetting.
- **GM Match Hacker UI**:
  - A dedicated "⚙ Hack Current Match" floating button in the toolbar opening a full GM control panel for mid-combat overrides.

### C. 3D Dice Engine Optimization
- Replace on-the-fly canvas texture creation with a global memoized `TextureCache`.
- Reuse `BoxGeometry` and `IcosahedronGeometry` meshes rather than destroying and recreating Three.js geometries each roll.
- Reduce directional shadow map resolution from 1024 to 512 with `shadow.autoUpdate = isRolling` so GPU load drops to 0 when idle.
- Maintain pre-allocated Vector3 math pools to eliminate garbage collection micro-stutters.
