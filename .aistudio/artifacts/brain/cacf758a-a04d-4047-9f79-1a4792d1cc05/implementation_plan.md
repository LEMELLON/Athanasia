# Arcana Resonatia — PvP Duel Arena Integration & Balance Analytics Overhaul (Revision 5)

Comprehensive analysis and implementation blueprint for:
1. **Removing the PvP Duel Arena from `CrucibleCards`**, dedicating that section entirely to the 36-card Codex and Crucible GDD rules.
2. **Integrating the PvP Duel Arena into `BalanceAnalytics`** as a first-class mode alongside PvE Monster Encounters.
3. **Dual Controllable Players**: Full turn-based manual and automated control for both Player 1 and Player 2 in PvP.
4. **Universal "Hack Current Match" for Both Players**: Complete GM control over stats, scaling, equipment, inventory, consumables (with/without turn consumption), and revival for both combatants.
5. **Seamless Mode Switching**: Instant toggling between PvE Monster Encounters and PvP Crucible Duels without losing GM setup data.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions have been designed to fulfill your exact specifications:
>
> 1. **Removal of Duel Arena from `CrucibleCards`**:
>    - `CrucibleCards` now serves purely as the definitive **Crucible Codex**:
>      - Browsing all 36 cards across the 4 archetypes (**Cana / Huntress**, **Bhana / Warrior**, **Prana / Sorceress**, **Gana / Lyrist**).
>      - Class and card-type filtering (Attack, Spell, Trap), text search, and full card inspector modal.
>      - Comprehensive reference guide for the 9-card deterministic deck format, wager rules, and 1-HP summon shatter mechanic.
>
> 2. **PvP Duel Arena in `BalanceAnalytics` (PvE ⟷ PvP Switching)**:
>    - A prominent header segmented toggle in Balance Analytics switches between:
>      - **`⚔ PvE Monster Encounter`**: Champion vs Bestiary Monsters (biomes, CR tiers, loot drops, SR rewards).
>      - **`🤺 PvP Crucible Duel Arena`**: Dual-champion crucible testbed with 9-card hands, face-down traps, and wager resolution.
>
> 3. **Both Duelists Fully Controllable**:
>    - **Turn Parity**: Clear initiative and turn indicator tracking Player 1 vs Player 2.
>    - **Active Controls for Current Player**:
>      - Play Attack, Spell, or Trap card from hand.
>      - Standard Weapon Attack (2d6 + weapon scaling stat vs target Defense).
>      - Use Consumables from inventory.
>      - Class unique actions (e.g. Call 1-HP Familiar token).
>      - Pass / End Turn (draws next card from remaining deck).
>      - **GM Auto-Play Turn**: A quick test button allowing the GM to auto-simulate the active player's turn to test AI/balance flow.
>    - **Dynamic Traps**: Face-down traps trigger automatically when trigger conditions occur (e.g. when attacked, when target casts spell).
>    - **1-HP Token Shatter**: Summons absorb damage instances cleanly.
>
> 4. **"Hack Current Match" Equipped for Both Players**:
>    - The Hack Modal provides dedicated tabs/selectors for **Player 1 (Challenger)** and **Player 2 (Defender / Rival)**:
>      - **Archetype & Identity**: Switch class (Cana, Bhana, Prana, Gana) and element.
>      - **Attributes & Scaling**: Direct GM sliders/inputs for STR, AGI, VIT, INT, Level.
>      - **Vitals & Currency**: HP, Max HP, MP, Max MP, Lives, Total SR, Wallet SR.
>      - **Equipment**: Equip / Unequip weapons and armor with instant stat recalculation (AC, AGI penalty, scaling).
>      - **Inventory Management**: Direct item spawner from `allItems` into either player's inventory.
>      - **Consumable Usage**: Test consumables directly inside the Hack UI either **with turn consumption** (normal rules) or **without consuming turn** (sandbox testing).
>      - **Revive & Reset**: One-click revive to full HP or reset without destroying the duel state.

---

## 1. Technical Architecture & Component Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│                          App Master Navigation                         │
│  [Playtest Simulator] [Equipment Forge] [Map Architect]               │
│  [3D Dice Chamber]    [Balance Analytics] [Crucible Cards]             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│      CrucibleCards.tsx           │        │     BalanceAnalytics.tsx         │
│  - 36-Card Deck Codex            │        │  Mode: [⚔ PvE] | [🤺 PvP]        │
│  - Filter by Class & Type        │        └─────────────────┬────────────────┘
│  - Detailed Inspection Modal     │                          │
│  - Crucible GDD Rulebook         │            ┌─────────────┴─────────────┐
└──────────────────────────────────┘            ▼                           ▼
                                    ┌───────────────────────┐   ┌───────────────────────┐
                                    │      PvE Mode         │   │      PvP Arena        │
                                    │ - Champion vs Mob     │   │ - Player 1 vs Player 2│
                                    │ - Biome, CR, Drops    │   │ - Dual 9-Card Decks   │
                                    │ - GM Tuning Panel     │   │ - Face-down Traps     │
                                    └───────────┬───────────┘   └───────────┬───────────┘
                                                │                           │
                                                └─────────────┬─────────────┘
                                                              ▼
                                               ┌───────────────────────────────┐
                                               │   Universal Hack Modal        │
                                               │   [Player 1] [Player 2] [Mob] │
                                               │ - Attributes (STR/AGI/VIT/INT)│
                                               │ - Equipment & Inventory       │
                                               │ - Spawner from allItems       │
                                               │ - Consumable test (0-turn /   │
                                               │   normal turn)                │
                                               │ - Revive & SR adjustments     │
                                               └───────────────────────────────┘
```

---

## 2. Step-by-Step Implementation Strategy

### Step 1: Strip PvP Arena out of `CrucibleCards.tsx`
- Remove `duelistA`, `duelistB`, `handleStartDuel`, wager state, and the `'arena'` tab button.
- Streamline tabs to **`🎴 Card Catalog`** and **`📖 Crucible Rules`**.
- Keep all 36 cards, search query, archetype filters (Cana, Bhana, Prana, Gana), and type filters (Attack, Spell, Trap) with pristine styling.

### Step 2: Upgrade PvP Duel Arena in `BalanceAnalytics.tsx`
- Expand `Player 1` and `Player 2` data models:
  - Both combatants have full `CharacterEntity` properties: `attrs`, `maxAttrs`, `hp`, `maxHp`, `mp`, `maxMp`, `level`, `walletSR`, `equippedWeapon`, `equippedArmor`, `inventory`, `deck`, `hand`, `discard`, `traps`, `summons`, `shieldActive`.
  - Both players have dynamic 9-card decks drawn deterministically from their chosen archetype.
- Add full controls for Player 1 AND Player 2:
  - When it's Player 1's turn: Player 1 controls are enabled (Play Card, Attack, Cast Spell, Set Trap, Use Item, End Turn, Auto-Play).
  - When it's Player 2's turn: Player 2 controls are enabled.
  - Interactive turn passing and visual dice rolling.
  - Interactive Trap Triggers: When an attack is declared, defender's set traps (*Counterstep*, *Aegis Barrier*, etc.) trigger and negate or retaliate.
  - 1-HP token summons absorb attacks before HP damage.

### Step 3: Expand Hack Current Match Modal for Dual-Player Support
- Add a top sub-navigation in the Hack Modal:
  - `[Player 1: <Name>]`
  - `[Player 2: <Name>]`
  - `[PvE Mob Overrides]` (when in PvE mode)
- For whichever player is selected:
  - Champion selector (switches archetype, base stats, and loads their 9-card deck).
  - Attribute editors (STR, AGI, VIT, INT, Level).
  - Vitals & Currency (HP, MP, Lives, Total SR, Wallet SR).
  - Equipment slots: Show currently equipped weapon and armor with unequip button.
  - Inventory list: Show each item with "Equip" or "Use".
  - Consumable options:
    - **Use (Normal)**: Applies effect and consumes player's turn.
    - **Test Use (No Turn Cost)**: Applies effect immediately without consuming turn.
  - Item Spawner: Select any item from `allItems` and click "+ Spawn into Inventory".
  - Instant Revive: Set HP to Max HP.

### Step 4: Verification and Polish
- Verify mode switching (`PvE` ⟷ `PvP`) works instantly without breaking ongoing states.
- Verify Hack Modal updates Player 1 or Player 2 cleanly.
- Verify both players can take actions, play cards, and trigger traps.
- Verify applet builds cleanly with `compile_applet`.
