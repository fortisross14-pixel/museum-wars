/* ============================================================
   ENGINE — GALA  ( src/engine/ )
   A gala generates a handful of wealthy guests. Each guest owns a
   few real catalogue works and has a personality. The player picks
   a target work, then plays a persuasion conversation: each round
   offers tagged dialogue lines; lines matching the guest's likes
   build trust, lines hitting dislikes lose it. Enough trust at the
   end secures a loan of the chosen work.
   Pure logic — the UI owns presentation.
   ============================================================ */
import type { StyleId } from '../data/types';
import { ARTIFACTS } from '../data/artifacts';
import { GUEST_ARCHETYPES, CONVERSE_LINES } from '../data/gala';
import type { GuestArchetype, ConverseLine } from '../data/gala';
export { TAG_LABEL } from '../data/gala';
import { randInt, rand } from './util';

const GUEST_FIRST = [
  'Lady Ashcombe', 'Baron Veil', 'Mme. Toussaint', 'Sir Roderick Quayle',
  'Contessa Bellandi', 'Mr. Augustus Frame', 'Dowager Hesketh',
  'Don Ramiro Salas', 'Mrs. Edith Calloway', 'Herr Direktor Brandt',
];

export interface Guest {
  id: string;
  name: string;
  archetype: GuestArchetype;
  collection: string[];       // artifact ids the guest owns/offers
}

/** the live state of a persuasion conversation */
export interface Conversation {
  guest: Guest;
  targetId: string;           // the work the player is pursuing
  trust: number;              // hidden score, starts at a baseline
  round: number;              // current round (0-based)
  totalRounds: number;        // scales with the target's rarity
  options: ConverseLine[];    // the lines offered this round
  lastDelta: number;          // trust change from the last choice
  lastText: string;           // the guest's reaction line
  usedLines: string[];        // dialogue already offered this talk
  finished: boolean;
}

/** rounds of conversation needed, by the target's rarity score */
function roundsForScore(score: number): number {
  if (score >= 50) return 5;        // Epic+
  if (score >= 20) return 4;        // Rare
  if (score >= 10) return 3;        // Uncommon
  return 3;                          // Common
}
/** the trust threshold to secure the loan, by rarity */
function thresholdForScore(score: number): number {
  if (score >= 50) return 9;
  if (score >= 20) return 7;
  return 5;
}

/** Generate the guests for a gala. Each owns 2-3 real works,
 *  weighted toward the styles the player cares about. */
export function makeGuests(playerStyles: StyleId[]): Guest[] {
  const count = randInt(3, 4);
  const guests: Guest[] = [];
  const usedNames = new Set<string>();
  const usedArt = new Set<string>();

  for (let i = 0; i < count; i++) {
    let name = GUEST_FIRST[randInt(0, GUEST_FIRST.length - 1)];
    let guard = 0;
    while (usedNames.has(name) && guard++ < 20)
      name = GUEST_FIRST[randInt(0, GUEST_FIRST.length - 1)];
    usedNames.add(name);

    const archetype = GUEST_ARCHETYPES[randInt(0, GUEST_ARCHETYPES.length - 1)];

    // 2-3 works, Uncommon and up, biased to the player's styles
    const want = randInt(2, 3);
    const collection: string[] = [];
    for (let k = 0; k < want; k++) {
      const styleBias = playerStyles.length > 0 && Math.random() < 0.6
        ? playerStyles[randInt(0, playerStyles.length - 1)] : null;
      let pool = ARTIFACTS.filter(a =>
        a.score >= 10 && a.score < 200 && !usedArt.has(a.id)
        && (styleBias ? a.style === styleBias : true));
      if (pool.length === 0)
        pool = ARTIFACTS.filter(a =>
          a.score >= 10 && a.score < 200 && !usedArt.has(a.id));
      if (pool.length === 0) break;
      const pick = pool[randInt(0, pool.length - 1)];
      collection.push(pick.id);
      usedArt.add(pick.id);
    }
    guests.push({ id: 'guest_' + i, name, archetype, collection });
  }
  return guests;
}

/** deal a fresh round of dialogue options — a shuffled handful
 *  spanning several tags so the player always has a real choice. */
function dealOptions(used: Set<string>): ConverseLine[] {
  // candidate lines not yet used this conversation
  let pool = CONVERSE_LINES.filter(l => !used.has(l.text));
  // if the bank is exhausted, allow reuse rather than deal nothing
  if (pool.length < 3) pool = CONVERSE_LINES.slice();
  // shuffle the pool
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // take 3, each a distinct tag and a distinct line
  const out: ConverseLine[] = [];
  const tagsUsed = new Set<string>();
  for (const line of shuffled) {
    if (tagsUsed.has(line.tag)) continue;
    out.push(line);
    tagsUsed.add(line.tag);
    if (out.length === 3) break;
  }
  // if too few distinct tags remained, top up ignoring the tag rule
  for (const line of shuffled) {
    if (out.length === 3) break;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/** Begin a conversation with a guest, pursuing a chosen work. */
export function startConversation(guest: Guest, targetId: string):
  Conversation {
  const score = ARTIFACTS.find(a => a.id === targetId)?.score || 0;
  const first = dealOptions(new Set());
  return {
    guest, targetId,
    trust: 3,                         // a polite baseline
    round: 0,
    totalRounds: roundsForScore(score),
    options: first,
    lastDelta: 0,
    lastText: `${guest.name} regards you with mild interest.`,
    usedLines: first.map(l => l.text),
    finished: false,
  };
}

/** Play one dialogue line. Lines matching the guest's likes raise
 *  trust; dislikes lower it; neutral lines barely move it. */
export function chooseLine(c: Conversation, line: ConverseLine):
  Conversation {
  if (c.finished) return c;
  const liked = c.guest.archetype.likes.includes(line.tag);
  const disliked = c.guest.archetype.dislikes.includes(line.tag);
  // a little noise so the same choice is not perfectly predictable
  let delta: number;
  let reaction: string;
  if (liked) {
    delta = 2 + (Math.random() < 0.4 ? 1 : 0);
    reaction = `${c.guest.name} warms to that — clearly the right note.`;
  } else if (disliked) {
    delta = -(2 + (Math.random() < 0.4 ? 1 : 0));
    reaction = `${c.guest.name} stiffens. That did not land well.`;
  } else {
    delta = rand(0, 1) < 0.5 ? 0 : 1;
    reaction = `${c.guest.name} gives a noncommittal nod.`;
  }
  const trust = Math.max(0, c.trust + delta);
  const round = c.round + 1;
  const finished = round >= c.totalRounds;
  const used = new Set(c.usedLines);
  const nextOptions = finished ? [] : dealOptions(used);
  for (const o of nextOptions) used.add(o.text);
  return {
    ...c,
    trust, round,
    lastDelta: delta,
    lastText: reaction,
    options: nextOptions,
    usedLines: [...used],
    finished,
  };
}

/** The outcome of a finished conversation. */
export interface GalaOutcome {
  success: boolean;
  loanWeeks: number;
  weeklyFee: number;
  message: string;
}

export function conversationOutcome(c: Conversation): GalaOutcome {
  const art = ARTIFACTS.find(a => a.id === c.targetId)!;
  const threshold = thresholdForScore(art.score);
  if (c.trust >= threshold) {
    // a stronger rapport -> longer loan, gentler fee
    const over = c.trust - threshold;
    const loanWeeks = 3 + Math.min(5, over);
    const baseFee = Math.round(art.value * 0.012);
    const weeklyFee = Math.max(200, Math.round(baseFee * (1 - over * 0.06)));
    return {
      success: true, loanWeeks, weeklyFee,
      message: `${c.guest.name} agrees to loan ${art.name} for `
        + `${loanWeeks} weeks.`,
    };
  }
  return {
    success: false, loanWeeks: 0, weeklyFee: 0,
    message: `${c.guest.name} declines, politely but firmly. `
      + `${art.name} stays in their collection.`,
  };
}
