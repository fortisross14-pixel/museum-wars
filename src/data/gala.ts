/* ============================================================
   GALA DATA — guest personalities and the conversation bank
   A gala generates guests; each guest is a personality archetype
   with traits they LIKE and DISLIKE. A persuasion conversation
   offers dialogue options, each tagged; matching a guest's likes
   builds trust, hitting dislikes loses it. Reach the trust
   threshold and the guest loans you a work from their collection.
   ============================================================ */

/** the tags a dialogue option can carry, and that a guest can
 *  like or dislike. */
export type ConverseTag =
  | 'prestige'      // appeals to status, being seen among the great
  | 'scholarship'   // appeals to expertise, study, preservation
  | 'exclusivity'   // appeals to rarity, a discerning few
  | 'publicity'     // appeals to crowds, fame, being widely seen
  | 'commerce'      // appeals to money, fees, profit
  | 'accessibility' // appeals to the public good, openness
  | 'flattery'      // direct praise of the guest
  | 'history';      // appeals to lineage, legacy, the past

export interface GuestArchetype {
  id: string;
  name: string;            // the archetype label
  blurb: string;           // a one-line read on them
  likes: ConverseTag[];
  dislikes: ConverseTag[];
}

export const GUEST_ARCHETYPES: GuestArchetype[] = [
  {
    id: 'academic',
    name: 'The Academic Elitist',
    blurb: 'Values expertise and preservation; disdains crowds and commerce.',
    likes: ['scholarship', 'exclusivity', 'history'],
    dislikes: ['publicity', 'commerce', 'accessibility'],
  },
  {
    id: 'socialite',
    name: 'The Socialite',
    blurb: 'Lives to be seen among the great and flattered.',
    likes: ['prestige', 'publicity', 'flattery'],
    dislikes: ['scholarship', 'accessibility'],
  },
  {
    id: 'patron',
    name: 'The Civic Patron',
    blurb: 'Believes art belongs to the public; suspicious of vanity.',
    likes: ['accessibility', 'history', 'scholarship'],
    dislikes: ['exclusivity', 'flattery'],
  },
  {
    id: 'magnate',
    name: 'The Shrewd Magnate',
    blurb: 'Thinks in returns; respects a clear-eyed deal.',
    likes: ['commerce', 'prestige', 'publicity'],
    dislikes: ['scholarship', 'history'],
  },
  {
    id: 'romantic',
    name: 'The Old Romantic',
    blurb: 'Moved by lineage, legacy, and a beautiful story.',
    likes: ['history', 'flattery', 'prestige'],
    dislikes: ['commerce', 'publicity'],
  },
  {
    id: 'connoisseur',
    name: 'The Quiet Connoisseur',
    blurb: 'Prizes a discerning eye and a rare, exclusive setting.',
    likes: ['exclusivity', 'scholarship', 'flattery'],
    dislikes: ['publicity', 'commerce'],
  },
];

/** a dialogue option offered during a conversation. */
export interface ConverseLine {
  tag: ConverseTag;
  text: string;
}

/* the bank of dialogue lines, grouped by tag. A conversation
   round offers a shuffled handful drawn across tags. */
export const CONVERSE_LINES: ConverseLine[] = [
  { tag: 'prestige', text: 'A piece like yours belongs among the great names of the age.' },
  { tag: 'prestige', text: 'Our finest hall would do justice to a collection of your standing.' },
  { tag: 'scholarship', text: 'Our curators would contextualise its importance with real rigour.' },
  { tag: 'scholarship', text: 'We would study and preserve it to the highest scholarly standard.' },
  { tag: 'exclusivity', text: 'It would be shown to a discerning few, never made common.' },
  { tag: 'exclusivity', text: 'Only those who truly understand such a work would see it.' },
  { tag: 'publicity', text: 'Thousands of visitors would come to admire your generosity.' },
  { tag: 'publicity', text: 'The press would carry your name alongside the exhibition.' },
  { tag: 'commerce', text: 'We are prepared to offer a generous loan fee for the privilege.' },
  { tag: 'commerce', text: 'Think of it as an arrangement that rewards us both handsomely.' },
  { tag: 'accessibility', text: 'It would be shared freely with the whole public, as art should be.' },
  { tag: 'accessibility', text: 'Every visitor, scholar or schoolchild alike, could stand before it.' },
  { tag: 'flattery', text: 'Frankly, your eye for acquisition is the envy of the room.' },
  { tag: 'flattery', text: 'Few collectors alive have assembled anything so considered.' },
  { tag: 'history', text: 'Its lineage deserves a setting that honours where it has been.' },
  { tag: 'history', text: 'We would tell the full story of its passage through the centuries.' },
];

/** the human-readable label for a tag (for the dialogue UI) */
export const TAG_LABEL: Record<ConverseTag, string> = {
  prestige: 'Appeal to prestige',
  scholarship: 'Appeal to scholarship',
  exclusivity: 'Appeal to exclusivity',
  publicity: 'Offer publicity',
  commerce: 'Discuss the fee',
  accessibility: 'Appeal to the public good',
  flattery: 'Flatter the collector',
  history: 'Discuss its history',
};
