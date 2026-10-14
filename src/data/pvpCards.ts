import { CharacterClass, ElementType } from '../types/game';

export type CardType = 'Attack' | 'Spell' | 'Trap';

export interface PvPCard {
  id: string;
  className: CharacterClass;
  title: string;
  type: CardType;
  range?: number;
  costHp?: number;
  costMp?: number;
  effect: string;
  flavor?: string;
}

export const CLASS_PVP_DECKS: Record<CharacterClass, PvPCard[]> = {
  Cana: [
    {
      id: 'cana_atk_1',
      className: 'Cana',
      title: 'Piercing Shot',
      type: 'Attack',
      range: 4,
      effect: 'Ignores all face-down Trap cards and cannot be negated until the end of the damage step only.'
    },
    {
      id: 'cana_atk_2',
      className: 'Cana',
      title: 'Ricochet Volley',
      type: 'Attack',
      range: 3,
      effect: 'If this attack connects, instantly deal half of its damage to a second target within 2 tiles of the first.'
    },
    {
      id: 'cana_atk_3',
      className: 'Cana',
      title: 'Elemental Arrow',
      type: 'Attack',
      range: 3,
      effect: 'Deals base weapon damage and applies your chosen element\'s specific DoT effect.'
    },
    {
      id: 'cana_spl_1',
      className: 'Cana',
      title: 'Quickstep',
      type: 'Spell',
      effect: 'Instantly draw 1 card from your deck and move 2 tiles without spending your standard movement.'
    },
    {
      id: 'cana_spl_2',
      className: 'Cana',
      title: 'Evasion',
      type: 'Spell',
      effect: 'Play from your hand when targeted by a ranged Attack card. Negate the attack and move 1 tile.'
    },
    {
      id: 'cana_spl_3',
      className: 'Cana',
      title: 'Heightened Senses',
      type: 'Spell',
      effect: 'Discard 1 card: force the opponent to reveal all their face-down Trap cards. They remain revealed until triggered.'
    },
    {
      id: 'cana_trp_1',
      className: 'Cana',
      title: 'Snare Trap',
      type: 'Trap',
      effect: 'Triggered when an opponent moves within 2 tiles of you. Their movement phase immediately ends.'
    },
    {
      id: 'cana_trp_2',
      className: 'Cana',
      title: 'Decoy',
      type: 'Trap',
      effect: 'Triggered when the opponent declares an Attack. Redirect the attack to an empty hex, causing it to miss entirely.'
    },
    {
      id: 'cana_trp_3',
      className: 'Cana',
      title: 'Punishing Wire',
      type: 'Trap',
      effect: 'Triggered when the opponent activates a Spell card. They take immediate damage equal to Cana\'s AGI stat. Also your opponent draws a card.'
    }
  ],
  Bhana: [
    {
      id: 'bhana_atk_1',
      className: 'Bhana',
      title: 'Sunder Armor',
      type: 'Attack',
      range: 1,
      effect: 'Range 1 (Melee). If this hits, destroy the opponent\'s equipped Armor rating for the remainder of their next turn.'
    },
    {
      id: 'bhana_atk_2',
      className: 'Bhana',
      title: 'Shield Bash',
      type: 'Attack',
      range: 1,
      effect: 'Range 1 (Melee). If this hits, the opponent is stunned and cannot play an Attack card on their next turn.'
    },
    {
      id: 'bhana_atk_3',
      className: 'Bhana',
      title: 'Elemental Strike',
      type: 'Attack',
      range: 1,
      effect: 'Range 1 (Melee). Deals heavy damage and applies your chosen element\'s DoT.'
    },
    {
      id: 'bhana_spl_1',
      className: 'Bhana',
      title: 'Fortify',
      type: 'Spell',
      effect: 'Halve all damage taken from Attack and Spell cards until the start of your next turn.'
    },
    {
      id: 'bhana_spl_2',
      className: 'Bhana',
      title: 'Colossus Stance',
      type: 'Spell',
      effect: 'Your next Attack card cannot be negated, redirected, or reduced by opponent Trap cards.'
    },
    {
      id: 'bhana_spl_3',
      className: 'Bhana',
      title: 'Second Wind',
      type: 'Spell',
      effect: 'Discard 1 card: recover HP equal to your VIT × 2, and cure any active DoT effects.'
    },
    {
      id: 'bhana_trp_1',
      className: 'Bhana',
      title: 'Counterstance',
      type: 'Trap',
      effect: 'Triggered when attacked in melee range. Negate the attack and deal the exact same damage back to the opponent.'
    },
    {
      id: 'bhana_trp_2',
      className: 'Bhana',
      title: 'Disarm',
      type: 'Trap',
      effect: 'Triggered when the opponent uses their movement phase. Force them to discard 1 random card from their hand. Also draw 1 card.'
    },
    {
      id: 'bhana_trp_3',
      className: 'Bhana',
      title: 'Iron Wall',
      type: 'Trap',
      effect: 'Triggered when the opponent casts a Spell card that deals damage. Reduce that damage to 0.'
    }
  ],
  Prana: [
    {
      id: 'prana_atk_1',
      className: 'Prana',
      title: 'Arcane Ray',
      type: 'Attack',
      range: 5,
      effect: 'Range 5 (Straight Line only). A high-velocity beam that cannot be dodged by Spells or Traps.'
    },
    {
      id: 'prana_atk_2',
      className: 'Prana',
      title: 'Force Blast',
      type: 'Attack',
      range: 3,
      effect: 'Range 3. Deals massive raw INT damage. If the target is adjacent to an obstacle, destroy the obstacle.'
    },
    {
      id: 'prana_atk_3',
      className: 'Prana',
      title: 'Elemental Burst',
      type: 'Attack',
      range: 3,
      effect: 'Range 3. Applies your chosen element\'s DoT. If target is already afflicted by DoT, consume it to deal double damage instantly.'
    },
    {
      id: 'prana_spl_1',
      className: 'Prana',
      title: 'Pot of Gods',
      type: 'Spell',
      effect: 'Discard 1 card from your hand to draw 2 cards from your deck.'
    },
    {
      id: 'prana_spl_2',
      className: 'Prana',
      title: 'Phase Step',
      type: 'Spell',
      effect: 'This card is unaffected. Instantly teleport up to 3 tiles away. You may play an Attack card immediately after.'
    },
    {
      id: 'prana_spl_3',
      className: 'Prana',
      title: 'Arcane Cloud',
      type: 'Spell',
      effect: 'Create a 1-tile smoke screen. You cannot be targeted by Attack cards while standing inside it.'
    },
    {
      id: 'prana_trp_1',
      className: 'Prana',
      title: 'Spellbind',
      type: 'Trap',
      effect: 'Triggered when the opponent plays a Spell card. Negate the Spell and draw 1 card.'
    },
    {
      id: 'prana_trp_2',
      className: 'Prana',
      title: 'Feedback Ward',
      type: 'Trap',
      effect: 'Triggered when an opponent attacks. Deal 10 magical damage to the attacker before their damage calculation is applied.'
    },
    {
      id: 'prana_trp_3',
      className: 'Prana',
      title: 'Glyph of Warding',
      type: 'Trap',
      effect: 'Triggered at the end of the opponent\'s turn if they did not move. They take 15 unavoidable magical damage. Also they draw 1 card.'
    }
  ],
  Gana: [
    {
      id: 'gana_atk_1',
      className: 'Gana',
      title: 'Soul Strike',
      type: 'Attack',
      range: 2,
      effect: 'Range 2. If you control a Summon Token on the board, the token executes the attack instead, gaining a +5 damage bonus.'
    },
    {
      id: 'gana_atk_2',
      className: 'Gana',
      title: 'Elemental Command',
      type: 'Attack',
      range: 3,
      effect: 'Range 3. Deals base damage and applies your chosen element\'s DoT.'
    },
    {
      id: 'gana_atk_3',
      className: 'Gana',
      title: 'Swarm Assault',
      type: 'Attack',
      effect: 'Command all active Summon Tokens on the board to attack the opponent simultaneously.'
    },
    {
      id: 'gana_spl_1',
      className: 'Gana',
      title: 'Dark Contract with the Entity',
      type: 'Spell',
      costHp: 5,
      effect: 'Summon 1 Fiend Token to the board to block movement or attack. Cost: You take 5 HP damage at the start of your next turn.'
    },
    {
      id: 'gana_spl_2',
      className: 'Gana',
      title: 'Dark Contract with the Gods',
      type: 'Spell',
      costHp: 5,
      effect: 'Search your deck for any Summon or Attack card and add it directly to your hand. Cost: You take 5 HP damage at start of next turn.'
    },
    {
      id: 'gana_spl_3',
      className: 'Gana',
      title: 'Forbidden Fusion',
      type: 'Spell',
      effect: 'Sacrifice two active Summon Tokens on the board to deal massive direct INT damage to the opponent, bypassing Defense.'
    },
    {
      id: 'gana_trp_1',
      className: 'Gana',
      title: 'Contract Laundering',
      type: 'Trap',
      effect: 'Triggered when you would take HP damage from your own "Dark Contract" Spells. Negate the damage and draw 1 card instead.'
    },
    {
      id: 'gana_trp_2',
      className: 'Gana',
      title: 'Soul Barrier',
      type: 'Trap',
      effect: 'Triggered when an opponent plays an Attack card while afflicted by your elemental DoT. Negate the attack and drain 15 of their MP.'
    },
    {
      id: 'gana_trp_3',
      className: 'Gana',
      title: 'Vengeful Spirit',
      type: 'Trap',
      effect: 'Triggered when one of your Summon Tokens is destroyed by an opponent. The opponent takes unblockable damage equal to the destroyed Token\'s attack power.'
    }
  ]
};
