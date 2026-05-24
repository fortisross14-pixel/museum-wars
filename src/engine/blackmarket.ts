/* ============================================================
   ENGINE — BLACK MARKET  ( src/engine/ )
   A shadowy seller offers a work at a bargain. The truth is
   hidden in four CATEGORIES — Signature, Patina, Documentation,
   Frame — each holding a hidden STATE. Those four states combine
   into one global VERDICT. The player spends limited research
   turns running ACTIONS; each returns a coded colour per category
   (green supports authenticity, yellow ambiguous, red contradicts,
   black no info). From the pattern of clues the player deduces
   the single global verdict that explains them all.

   Three prices: the hidden original VALUE, the dealer's ASK
   (~40-60% of value), and — if the piece proves stolen — a
   spooked-dealer STOLEN price (~25% of the ask).

   Pure logic — the UI owns presentation and timing.
   ============================================================ */
import type { StyleId } from '../data/types';
import { ARTIFACTS } from '../data/artifacts';
import { randInt } from './util';

/* --- the four evidence categories -------------------------- */
export type Category = 'signature' | 'patina' | 'documentation' | 'frame';
export const CATEGORIES: Category[] = [
  'signature', 'patina', 'documentation', 'frame',
];
export const CATEGORY_LABEL: Record<Category, string> = {
  signature: 'Signature & Marks',
  patina: 'Patina & Wear',
  documentation: 'Documentation',
  frame: 'Frame & Mounting',
};

/* --- the hidden state a category can hold ------------------- */
export type EvidenceState =
  | 'authentic'
  | 'restored'
  | 'modern'
  | 'forged'
  | 'inconsistent'
  | 'missing';

/* --- the global verdict ------------------------------------ */
export type Verdict =
  | 'genuine'
  | 'altered'
  | 'misattributed'
  | 'partial_forgery'
  | 'full_forgery'
  | 'stolen';

export interface VerdictDef {
  id: Verdict;
  label: string;
  blurb: string;
}
/* the FIXED deduction list — the same options every offer */
export const VERDICTS: VerdictDef[] = [
  { id: 'genuine', label: 'Genuine, period-correct work',
    blurb: 'Authentic throughout. A true bargain at the asking price.' },
  { id: 'altered', label: 'Genuine work, later altered or restored',
    blurb: 'Real, but reworked — a restoration fee is owed before display.' },
  { id: 'misattributed', label: 'Real work, wrongly attributed',
    blurb: 'Genuine, but not by who is claimed — its rarity differs.' },
  { id: 'partial_forgery', label: 'Part-genuine, part-forged',
    blurb: 'Compromised beyond display — salvage value only.' },
  { id: 'full_forgery', label: 'An outright forgery',
    blurb: 'A fake through and through. Worthless.' },
  { id: 'stolen', label: 'Genuine work, but stolen property',
    blurb: 'Real and fine — but stolen. It must be declared to be kept.' },
];

/* --- the hidden category-state pattern of each verdict ------ */
const VERDICT_PATTERN: Record<Verdict, Record<Category, EvidenceState>> = {
  genuine: {
    signature: 'authentic', patina: 'authentic',
    documentation: 'authentic', frame: 'authentic',
  },
  altered: {
    signature: 'authentic', patina: 'restored',
    documentation: 'authentic', frame: 'modern',
  },
  misattributed: {
    signature: 'inconsistent', patina: 'authentic',
    documentation: 'inconsistent', frame: 'authentic',
  },
  partial_forgery: {
    signature: 'forged', patina: 'authentic',
    documentation: 'inconsistent', frame: 'restored',
  },
  full_forgery: {
    signature: 'forged', patina: 'forged',
    documentation: 'forged', frame: 'modern',
  },
  stolen: {
    signature: 'authentic', patina: 'authentic',
    documentation: 'missing', frame: 'authentic',
  },
};

/* --- research actions -------------------------------------- */
export type FeedbackColour = 'green' | 'yellow' | 'red' | 'black';

export interface ActionDef {
  id: string;
  label: string;
  blurb: string;
  cost: number;
  covers: Category[];
}
export const ACTIONS: ActionDef[] = [
  { id: 'uv', label: 'UV Scan', cost: 1500,
    blurb: 'Ultraviolet light reveals overpainting and retouching.',
    covers: ['signature', 'patina', 'frame'] },
  { id: 'carbon', label: 'Carbon Dating', cost: 3000,
    blurb: 'Dates the physical materials of the work.',
    covers: ['patina', 'frame'] },
  { id: 'handwriting', label: 'Expert Handwriting Review', cost: 2000,
    blurb: 'A specialist studies the signature and marks.',
    covers: ['signature'] },
  { id: 'archive', label: 'Archive Search', cost: 1800,
    blurb: 'Hunts the paper trail of ownership and sale.',
    covers: ['documentation', 'signature'] },
  { id: 'pigment', label: 'Chemical Pigment Test', cost: 2500,
    blurb: 'Checks whether the pigments fit the claimed period.',
    covers: ['patina', 'signature'] },
  { id: 'frame', label: 'Frame Inspection', cost: 1200,
    blurb: 'Examines the frame, mounting and backing boards.',
    covers: ['frame'] },
  { id: 'interview', label: 'Dealer Interview', cost: 800,
    blurb: 'Press the dealer on where the piece came from.',
    covers: ['documentation'] },
  { id: 'xray', label: 'X-Ray Imaging', cost: 3500,
    blurb: 'Sees beneath the surface — hidden layers and repairs.',
    covers: ['signature', 'patina', 'documentation', 'frame'] },
];

/* --- the colour a state shows when an action looks at it ---- */
const STATE_COLOUR: Record<EvidenceState, FeedbackColour> = {
  authentic: 'green',
  restored: 'yellow',
  modern: 'red',
  forged: 'red',
  inconsistent: 'yellow',
  missing: 'yellow',
};

/* --- an offer and its hidden truth ------------------------- */
export interface BlackMarketOffer {
  artifactId: string;
  originalValue: number;
  ask: number;
  stolenPrice: number;
  verdict: Verdict;
  states: Record<Category, EvidenceState>;
  claimedStyle: StyleId;
  researchTurns: number;
  patience: number;
}

function turnsForScore(score: number): number {
  if (score >= 100) return 3;
  if (score >= 50) return 4;
  return 5;
}

/** Build a black-market offer. */
export function makeBlackMarketOffer(playerStyles: StyleId[]):
  BlackMarketOffer {
  const styleBias = playerStyles.length > 0 && Math.random() < 0.6
    ? playerStyles[randInt(0, playerStyles.length - 1)] : null;
  let pool = ARTIFACTS.filter(a =>
    a.score >= 20 && a.score < 130
    && (styleBias ? a.style === styleBias : true));
  if (pool.length === 0)
    pool = ARTIFACTS.filter(a => a.score >= 20 && a.score < 130);
  const art = pool[randInt(0, pool.length - 1)];

  const roll = Math.random();
  let verdict: Verdict;
  if (roll < 0.24) verdict = 'genuine';
  else if (roll < 0.42) verdict = 'altered';
  else if (roll < 0.58) verdict = 'misattributed';
  else if (roll < 0.72) verdict = 'stolen';
  else if (roll < 0.87) verdict = 'partial_forgery';
  else verdict = 'full_forgery';

  const value = art.value;
  const ask = Math.round(value * (0.4 + Math.random() * 0.2));
  const stolenPrice = Math.round(ask * 0.25);

  return {
    artifactId: art.id,
    originalValue: value,
    ask, stolenPrice,
    verdict,
    states: { ...VERDICT_PATTERN[verdict] },
    claimedStyle: art.style,
    researchTurns: turnsForScore(art.score),
    patience: randInt(4, 6),
  };
}

/* --- running a research action ----------------------------- */
export interface ActionResult {
  actionId: string;
  colours: Record<Category, FeedbackColour>;
}

/** Run an action against an offer, returning the coded feedback. */
export function runAction(
  offer: BlackMarketOffer, actionId: string,
): ActionResult {
  const def = ACTIONS.find(a => a.id === actionId)!;
  const colours: Record<Category, FeedbackColour> = {
    signature: 'black', patina: 'black',
    documentation: 'black', frame: 'black',
  };
  for (const cat of def.covers) {
    const truth = STATE_COLOUR[offer.states[cat]];
    if ((truth === 'green' || truth === 'red') && Math.random() < 0.2) {
      colours[cat] = 'yellow';
    } else {
      colours[cat] = truth;
    }
  }
  return { actionId, colours };
}

/* --- resolving the purchase -------------------------------- */
export interface PurchaseOutcome {
  verdict: Verdict;
  effectiveValue: number;
  pricePaid: number;
  restorationFee: number;
  canExhibit: boolean;
  salvageOnly: boolean;
  declareFee: number;
}

/** Work out the outcome of buying an offer. */
export function purchaseOutcome(
  offer: BlackMarketOffer, negotiatedAsk: number,
): PurchaseOutcome {
  const v = offer.verdict;
  const value = offer.originalValue;
  switch (v) {
    case 'genuine':
      return { verdict: v, effectiveValue: value, pricePaid: negotiatedAsk,
        restorationFee: 0, canExhibit: true, salvageOnly: false,
        declareFee: 0 };
    case 'altered':
      return { verdict: v, effectiveValue: Math.round(value * 0.85),
        pricePaid: negotiatedAsk,
        restorationFee: Math.round(value * 0.2),
        canExhibit: true, salvageOnly: false, declareFee: 0 };
    case 'misattributed':
      return { verdict: v, effectiveValue: Math.round(value * 0.6),
        pricePaid: negotiatedAsk, restorationFee: 0,
        canExhibit: true, salvageOnly: false, declareFee: 0 };
    case 'partial_forgery':
      return { verdict: v, effectiveValue: Math.round(value * 0.1),
        pricePaid: negotiatedAsk, restorationFee: 0,
        canExhibit: false, salvageOnly: true, declareFee: 0 };
    case 'full_forgery':
      return { verdict: v, effectiveValue: 0, pricePaid: negotiatedAsk,
        restorationFee: 0, canExhibit: false, salvageOnly: true,
        declareFee: 0 };
    case 'stolen':
      return { verdict: v, effectiveValue: value,
        pricePaid: offer.stolenPrice,
        restorationFee: 0, canExhibit: true, salvageOnly: false,
        declareFee: Math.round(value * 0.5) };
  }
}

/** A short, human verdict line for the result screen. */
export function verdictBlurb(v: Verdict): string {
  return VERDICTS.find(x => x.id === v)?.blurb || '';
}
