/* ============================================================
   ENGINE — BLACK MARKET  ( src/engine/ )
   A shadowy seller offers a Rare/Epic work at an Uncommon price.
   It may be genuine (40%) or a forgery (60%). The player plays an
   authentication mini-game: several examination points, each
   genuinely "consistent" or "suspicious". Judge enough correctly
   and you authenticate the piece — you learn the truth. Fail and
   you stay uncertain: buy blind, or pay a fee to inspect.
   Pure logic — the UI owns presentation.
   ============================================================ */
import type { StyleId } from '../data/types';
import { ARTIFACTS } from '../data/artifacts';
import { randInt } from './util';

/** the chance a black-market offer is actually genuine */
export const BLACK_MARKET_REAL_CHANCE = 0.4;

export interface BlackMarketOffer {
  artifactId: string;       // a real catalogue work (Rare or Epic)
  askingPrice: number;      // the bargain price
  isReal: boolean;          // the hidden truth
}

/** an examination point in the authentication game. Each is truly
 *  consistent or suspicious; for a forgery, more lean suspicious. */
export interface ExamPoint {
  id: number;
  label: string;            // what is being examined
  suspicious: boolean;      // the hidden truth of this point
  judged: 'consistent' | 'suspicious' | null;  // the player's call
}

const EXAM_LABELS = [
  'Brushwork and hand',
  'Pigment and materials',
  'Canvas or substrate age',
  'Signature and marks',
  'Provenance documents',
  'Patina and wear',
  'Frame and mounting',
  'Craquelure pattern',
];

/** Generate a black-market offer: a real Rare/Epic work priced
 *  like an Uncommon, genuine or forged by the house odds. */
export function makeBlackMarketOffer(playerStyles: StyleId[]):
  BlackMarketOffer {
  // pick a Rare or Epic work, biased to the player's styles
  const styleBias = playerStyles.length > 0 && Math.random() < 0.6
    ? playerStyles[randInt(0, playerStyles.length - 1)] : null;
  let pool = ARTIFACTS.filter(a =>
    a.score >= 20 && a.score < 100
    && (styleBias ? a.style === styleBias : true));
  if (pool.length === 0)
    pool = ARTIFACTS.filter(a => a.score >= 20 && a.score < 100);
  const art = pool[randInt(0, pool.length - 1)];
  // the bargain: priced where an Uncommon would sit
  const askingPrice = randInt(7000, 20000);
  const isReal = Math.random() < BLACK_MARKET_REAL_CHANCE;
  return { artifactId: art.id, askingPrice, isReal };
}

/** Build the authentication board — a set of examination points.
 *  A genuine piece has few suspicious points; a forgery has many. */
export function makeExamPoints(offer: BlackMarketOffer): ExamPoint[] {
  const count = 5;
  // genuine: ~1 suspicious red herring; forgery: ~3-4 genuine tells
  const suspiciousCount = offer.isReal
    ? randInt(0, 1)
    : randInt(3, 4);
  const labels = [...EXAM_LABELS];
  for (let i = labels.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  const flags = new Array(count).fill(false);
  for (let i = 0; i < suspiciousCount && i < count; i++) flags[i] = true;
  // shuffle which slots are suspicious
  for (let i = flags.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [flags[i], flags[j]] = [flags[j], flags[i]];
  }
  return labels.slice(0, count).map((label, i) => ({
    id: i, label, suspicious: flags[i], judged: null,
  }));
}

/** Did the player authenticate successfully? They must judge at
 *  least 4 of 5 examination points correctly. */
export function examSucceeded(points: ExamPoint[]): boolean {
  const correct = points.filter(p =>
    p.judged !== null
    && (p.judged === 'suspicious') === p.suspicious).length;
  return correct >= 4;
}

/** the fee to have an expert inspect after a failed authentication */
export function inspectionFee(offer: BlackMarketOffer): number {
  return Math.round(offer.askingPrice * 0.25);
}
