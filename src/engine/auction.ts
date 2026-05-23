/* ============================================================
   ENGINE — AUCTION  ( src/engine/ )
   The real-time "going once, going twice" auction.
   Model: after every bid the clock is set to exactly 3s. If
   nobody bids before it hits 0, the leader wins. A bid triggers
   a 1s frozen announcement, then the 3s count restarts. hardCap
   bounds total lot duration.
   All functions are pure: state in -> new auction object out.
   The UI runs a tick interval that calls tickAuction().
   ============================================================ */
import type { AuctionState, GameState } from '../data/types';
import { ARTIFACT_BY_ID } from '../data/artifacts';
import { rand, money } from './util';

export const AUCTION_CFG = {
  countdownMs: 3000,
  announceMs: 1000,
  hardCapMs: 60000,
  rivalMinGapMs: 1200,
  rivalMaxGapMs: 2600,
};

/** Price an artifact will roughly fetch. Correlated to score but
 *  not rigid — a 99 costs more than a 56, modestly, since they
 *  share a band; randomness means bargains and overpriced lots
 *  both occur. `value` is the data baseline; we jitter it. */
export function lotEstimate(artifactId: string): number {
  const art = ARTIFACT_BY_ID[artifactId];
  // baseline value, nudged by score within its band, then jittered
  const scoreNudge = 1 + (art.score % 50) / 260;   // small intra-band lift
  return Math.round(art.value * scoreNudge * rand(0.85, 1.15));
}

export function startLot(state: GameState, artifactId: string): AuctionState {
  const art = ARTIFACT_BY_ID[artifactId];
  const estimate = lotEstimate(artifactId);
  const starsHere = state.expertise[art.style] || 0;
  const expertiseCut = 1 - Math.min(0.35, starsHere * 0.06);
  // ceiling spans below to moderately above the estimate
  const rivalCeiling = Math.round(estimate * rand(0.65, 1.35) * expertiseCut);
  return {
    artifactId, estimate,
    currentBid: Math.round(estimate * 0.12),
    leader: 'house',
    rivalCeiling,
    increment: Math.max(15, Math.round(estimate * 0.1)),
    mode: 'counting',
    clockMs: AUCTION_CFG.countdownMs,
    announceMs: 0,
    elapsedMs: 0,
    sinceCountStart: 0,
    rivalNextGap: rand(AUCTION_CFG.rivalMinGapMs, AUCTION_CFG.rivalMaxGapMs),
    over: false,
    won: null,
    message: 'The lot opens — going once...',
  };
}

function applyBid(
  a: AuctionState, who: 'player' | 'rival', amount: number,
): AuctionState {
  return {
    ...a,
    currentBid: amount,
    leader: who,
    mode: 'announcing',
    announceMs: AUCTION_CFG.announceMs,
    message: who === 'player'
      ? `You bid ${money(amount)}.`
      : `The Thorncrest Collection bids ${money(amount)}.`,
  };
}

function closeLot(a: AuctionState): AuctionState {
  const playerWon = a.leader === 'player';
  return {
    ...a,
    over: true,
    won: playerWon,
    message: playerWon ? 'Sold — to your museum.'
      : a.leader === 'rival' ? 'Sold — to a rival.'
      : 'The lot passed.',
  };
}

/** Advance the auction by deltaMs. The UI calls this on a timer. */
export function tickAuction(
  state: GameState, deltaMs: number,
): AuctionState | null {
  const a = state.auction;
  if (!a || a.over) return a;
  const C = AUCTION_CFG;
  const n: AuctionState = { ...a };
  n.elapsedMs += deltaMs;

  if (n.mode === 'announcing') {
    n.announceMs -= deltaMs;
    if (n.announceMs <= 0) {
      n.mode = 'counting';
      n.clockMs = C.countdownMs;
      n.sinceCountStart = 0;
      n.rivalNextGap = rand(C.rivalMinGapMs, C.rivalMaxGapMs);
      n.message = 'Going once...';
    }
    return n;
  }

  n.clockMs -= deltaMs;
  n.sinceCountStart += deltaMs;
  if (n.elapsedMs >= C.hardCapMs) return closeLot(n);

  if (n.leader !== 'rival' && n.sinceCountStart >= n.rivalNextGap) {
    const rivalBid = n.currentBid + n.increment;
    if (rivalBid <= n.rivalCeiling) return applyBid(n, 'rival', rivalBid);
    n.rivalNextGap = C.hardCapMs;       // rival hit ceiling, goes quiet
  }
  if (n.clockMs <= 0) return closeLot(n);
  n.message = n.clockMs <= 1000 ? 'Going twice...' : 'Going once...';
  return n;
}

/** Player places a bid. Returns the new auction or an error. */
export function playerBid(
  state: GameState,
): { auction: AuctionState | null; error?: string } {
  const a = state.auction;
  if (!a || a.over) return { auction: a };
  if (a.mode === 'announcing')
    return { auction: a, error: 'Wait for the bid to be announced.' };
  if (a.leader === 'player')
    return { auction: a, error: 'You already hold the leading bid.' };
  const myBid = a.currentBid + a.increment;
  if (myBid > state.funds)
    return { auction: a, error: 'That bid would exceed your funds.' };
  return { auction: applyBid(a, 'player', myBid) };
}
