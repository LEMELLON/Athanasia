# Arcana Resonatia — Game Master Studio & Playtest Suite

A specialized tabletop and digital hybrid Game Master (GM) workstation, game balancing suite, and playtest sandbox for **Arcana Resonatia** (inspired by Greek mythology and the v7 GDD). Built for rapid balance iteration, custom item and weapon creation, interactive hex-chunk map building, realistic 3D dice rolling, and turn-based simulation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural direction below is aligned with your confirmed design preferences:
> - **Unified GM Studio**: Multi-tab interface featuring **Item Forge**, **Map Architect**, **3D Dice Chamber**, **Match Simulator**, and **Balance Analytics**.
> - **Interactive 3D Physics Dice**: A responsive Three.js canvas overlay providing physical tumbling animations for 2d6, d20, d8, and d6 across gameplay events (movement, hit rolls, damage, boss mutiny) plus GM freeform rolls.
> - **Hex Chunk Generator & Brush Painter**: Procedural generation following the 7-hex flower chunk rules (depth bands, spawn penalty, connectivity check) paired with an interactive brush painter for rapid custom tile and biome editing.
> - **Persistent Instance Storage**: Real-time auto-saving to `localStorage` with JSON export/import and cookie backup, guaranteeing no work or playtest progress is lost on reload.

---

## 1. Overview & Core Concept

### What It Does
1. **Item, Weapon & Gear Forge**: Create, edit, duplicate, and balance weapons, armor, shields, and consumables. Features an instant TTK (Time-to-Kill) and Damage-per-Turn (DPT) calculator against target Defense and HP thresholds across all 6 biomes and 4 champion classes.
2. **Hex Map Architect**: Procedural 7-hex flower chunk generator adhering to the Guide Book v7 rules (Boss sanctum, 6 spawn chunks, Hex Loader dice, Depth bands 0–5) plus a freehand click-to-paint tile brush (Path, Wall, Obstacle, Mob, Chest, Portal, Soul Corridor, Shrine, Spawn).
3. **3D Physics Dice Roller (Three.js)**: Physically simulated polyhedral dice (d20, d6, 2d6, d8) rendered with studio PBR materials, procedural numerals, ambient shadows, and authentic tumble/bounce kinematics. Triggers automatically on game actions and is accessible on demand.
4. **Live Playtest Simulator**: 2–6 player match engine supporting Cana (Ranger), Bhana (Warrior), Prana (Mage), and Gana (Summoner), complete with 3-Life / Soul Spark permadeath rules, 2d6 resolution combat, elemental advantage multipliers (1.5× / 0.5×), Soul Corridor shops, and Aion boss fight.
5. **Persistence & Portability**: Live browser storage syncing with one-click export/import of custom balance packages (compatible with team collaboration).

---

## 2. User Experience & Visual Design

### Key User Flows
- **Flow 1: Balancing & Weapon Tuning**: The GM selects or creates a weapon (e.g. *Forgefire Longbow* or *Anvil of Hephaestus*), tweaks base damage, range, and passive effects, and watches real-time winrate and damage curves against CR 1–20 monsters.
- **Flow 2: Map Crafting & Inspection**: The GM configures chunk count and biomes or paints custom tiles using the brush tool, runs the automatic connectivity repair algorithm, and inspects spawn advantage scores.
- **Flow 3: Playtesting a Match**: The GM starts a session with 2–4 players, rolls initiative via 3D tumbling dice, moves tokens across hexes, resolves mob encounters and PvP duels, buys stat upgrades at Soul Corridors, and triggers the Global Breach on Aion.
- **Flow 4: Freeform 3D Dice Rolling**: The GM clicks the floating Dice HUD anytime to roll custom combinations (2d6, 1d20, d8 Element Die) with tactile visual tumbling.

### Visual Identity & Theme
- **Aesthetic Direction**: Celestial Greek Mythological Dark Fantasy meets High-Precision GM Terminal. Inspired by Olympian bronze, marble, and deep abyss tones.
- **Color Palette**:
  - Dominant Canvas (60%): Void Black `#0c100e` and Deep Laurel `#141e18`.
  - Structural Surfaces (30%): Obsidian Slate `#1c2822` with hairline borders in `#2e3f36`.
  - Focal Accents (10%): Olympian Gold `#d4a94a` (actions, crits), Radiant Sun `#ffd166`, and Celestial Cyan `#4aa3e0`.
  - Elemental Hues: Aquis Blue `#2f6fa8`, Pyria Crimson `#e0553a`, Aeria Mint `#4f9c88`, Geia Umber `#85663a`, Phosia Amber `#ffd166`, Skotosia Violet `#9a66d6`.
- **Typography & Hierarchy**:
  - Display & Headings: `Cinzel` / `Fraunces` / `Plus Jakarta Sans` for grand mythic presence.
  - Body & Form Controls: Clean, highly legible `Plus Jakarta Sans` or `DM Sans`.
  - Stat Tables & Dice Math: `font-mono tabular-nums` for precise arithmetic alignment.

---

## 3. Key Product Decisions & Trade-Offs

- **Integrated Tabbed Studio vs Separate Windows**:
  - *Decision*: A unified single-page application with top-level tabs (`[Forge] [Map Architect] [Playtest Match] [Dice Chamber] [Balance Analytics]`).
  - *Why*: Allows instant back-and-forth testing: tweak a weapon in the Forge, jump straight into the active playtest session, and verify the effect immediately without resetting state.
- **Three.js WebGL Dice Canvas Overlay**:
  - *Decision*: A lightweight, high-performance Three.js WebGL canvas embedded directly into the DOM that can pop in as an active rolling overlay during combat/movement or be toggled into a persistent side dock.
  - *Why*: Fulfills the explicit user request for physical rolling dice while maintaining zero lag on lower-spec hardware via procedural textures and minimal polygon overhead.
- **Local Persistence Architecture**:
  - *Decision*: Dual-layer persistence using `localStorage` as primary storage with automatic change debouncing, JSON export/download, and cookie fallback for metadata.
  - *Why*: Instant offline reliability; reloads retain all customized weapons, painted maps, and ongoing combat HP bars.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Arcana Resonatia GM Studio Hub                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────┬───────────┴───────────┬────────────────────┐
    ▼                   ▼                       ▼                    ▼
┌──────────────┐ ┌───────────────┐     ┌─────────────────┐ ┌────────────────┐
│  Item Forge  │ │ Map Architect │     │ 3D Dice Engine  │ │ Playtest Match │
│  & Balancer  │ │ & Hex Painter │     │ (Three.js WebGL)│ │ Table & Rules  │
└──────┬───────┘ └──────┬────────┘     └────────┬────────┘ └───────┬────────┘
       │                │                       │                  │
       └────────────────┴───────────┬───────────┴──────────────────┘
                                    │
                                    ▼
                ┌──────────────────────────────────────┐
                │ Central Game State & Storage Manager │
                │   (Local Storage + JSON Import/Export)│
                └──────────────────────────────────────┘
```

### Core Entities & State Models
1. **Equipment & Items (`ItemEntity`)**:
   - `id`, `name`, `type` (`weapon`, `armor`, `shield`, `consumable`), `classReq` (`Cana`, `Bhana`, `Prana`, `Gana`, `All`).
   - `biome` (`Pyria`, `Geia`, `Hydoria`, `Aeria`, `Phosia`, `Skotosia`, `Universal`).
   - `rarity` (`Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`).
   - `stats`: Base ATK / AC, Range min/max, Stat scaling (STR, DEX, INT, WIS), DEX/CON penalties, passive effect description and programmatic trigger tag.
2. **Map & Tile Grid (`HexTile`, `Chunk`)**:
   - Hex axial coordinates `(q, r)`, `ring`, `depth` (0–5).
   - Tile Type: `Path`, `Wall`, `Obstacle`, `Chest`, `Mob`, `Boss`, `Portal`, `Shop`, `Shrine`, `Spawn`.
   - Biome metadata, Spawn ownership, and Mob placement data.
3. **Player Session (`PlayerState`)**:
   - Name, Class archetype, Affinity element, Core Stats (STR, CON, DEX, INT, WIS, CHAR), Derived stats (HP, MP, DV, Speed, PB).
   - Inventory, Equipped loadout, Soul Resonance (SR Held vs Total SR), Lives (3 max), Key count.
4. **3D Dice Controller (`DiceRollEvent`)**:
   - Type (`d20`, `2d6`, `d8`, `d6`), angular impulse, physical settling vector, roll result callback.

---

## 5. Implementation Steps & Verification Plan

1. **Step 1: Install Three.js & Setup Core Libraries**:
   - Add `three` and `@types/three` via `install_applet_package`.
2. **Step 2: Pre-populated Game Data & Rules Engine**:
   - Embed all weapons, armor, consumables, enemies, and bosses directly transcribed from the provided GDD pages (6–71).
3. **Step 3: Item, Weapon & Equipment Forge Component**:
   - Interactive CRUD editor with stat inputs, elemental modifiers, rarity badges, filterable catalog, and instant combat simulator widget.
4. **Step 4: Map Architect & Brush Painter**:
   - Interactive SVG hex grid renderer supporting zoom/pan, procedural flower chunk generation, brush tile tools, and connectivity checking.
5. **Step 5: 3D Rolling Dice Engine (Three.js)**:
   - Procedural 3D dice meshes with authentic tumbling kinematics, studio lighting, shadow planes, and sound/visual impact effects.
6. **Step 6: Unified Playtest Match Table**:
   - Full gameplay simulator supporting 2–6 players, initiative tracking, movement calculations, combat resolution (PvE and PvP), and boss mutiny mechanics.
7. **Step 7: Instance Saving & Export**:
   - Real-time `localStorage` autosave, JSON export/import modal, and reset controls.
8. **Step 8: Verification**:
   - Run `compile_applet` and test all interactive features for zero errors and responsive interactions.
