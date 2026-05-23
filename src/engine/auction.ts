/* ============================================================
   ENGINE — AUCTION  ( src/engine/ )
   The "going once, going twice" auction, discrete-step model.

   A lot begins paused on an intro card; the player clicks Begin.
   Then the countdown runs in clear, even steps:
     * a 2s announcement of the standing bid ("someone bid X...")
     * "3"  held 2s
     * "2"  held 2s
     * "1"  held 2s
     * SOLD
   Any bid (player or rival) interrupts and restarts: a fresh 2s
   announcement of the new bid, then 3-2-1 again. The clock never
   moves continuously — it sits on a number for a full 2s — so the
   UI is calm and bid buttons never jump.
   All functions are pure: state in -> new auction object out.
   ============================================================ */
import type { AuctionState, GameState } from '../data/types';
import { ARTIFACT_BY_ID } from '../data/artifacts';
import { rand, money } from './util';

export const AUCTION_CFG = {
  stepMs: 2000,         // each countdown number is held this long
  announceMs: 2000,     // a new bid is announced for this long
  countFrom: 3,         // count 3 -> 2 -> 1 -> sold
  hardCapMs: 90000,
  rivalMinGapMs: 1400,
  rivalMaxGapMs: 3200,
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
  const rivalCeiling = Math.round(estimate * rand(0.65, 1.35) * expertiseCut);
  return {
    artifactId, estimate,
    currentBid: Math.round(estimate * 0.12),
    leader: 'house',
    rivalCeiling,
    increment: Math.max(15, Math.round(estimate * 0.1)),
    mode: 'intro',                 // paused — wait for "Begin Auction"
    count: AUCTION_CFG.countFrom,
    phaseMs: 0,
    elapsedMs: 0,
    rivalNextGap: rand(AUCTION_CFG.rivalMinGapMs, AUCTION_CFG.rivalMaxGapMs),
    sinceCountStart: 0,
    over: false,
    won: null,
    message: 'This lot is up next.',
  };
}

/** Player clicks "Begin Auction" — leaves the intro pause and
 *  starts the opening 2s announcement. */
export function beginAuction(a: AuctionState): AuctionState {
  if (a.mode !== 'intro') return a;
  return {
    ...a,
    mode: 'announcing',
    phaseMs: AUCTION_CFG.announceMs,
    message: `The lot opens at ${money(a.currentBid)} — anyone bid higher?`,
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
    phaseMs: AUCTION_CFG.announceMs,
    count: AUCTION_CFG.countFrom,
    message: who === 'player'
      ? `You bid ${money(amount)} — anyone give more?`
      : `The Thorncrest Collection bids ${money(amount)} — anyone give more?`,
  };
}

function closeLot(a: AuctionState): AuctionState {
  const playerWon = a.leader === 'player';
  return {
    ...a,
    over: true,
    won: playerWon,
    message: playerWon ? 'SOLD — to your museum!'
      : a.leader === 'rival' ? 'SOLD — to a rival.'
      : 'The lot passed unsold.',
  };
}

/** Advance the auction by deltaMs. The UI calls this on a timer.
 *  In `intro` the auction is frozen until beginAuction() is called. */
export function tickAuction(
  state: GameState, deltaMs: number,
): AuctionState | null {
  const a = state.auction;
  if (!a || a.over || a.mode === 'intro') return a;
  const C = AUCTION_CFG;
  const n: AuctionState = { ...a };
  n.elapsedMs += deltaMs;
  if (n.elapsedMs >= C.hardCapMs) return closeLot(n);

  // --- announcement phase: hold the new-bid message for announceMs
  if (n.mode === 'announcing') {
    n.phaseMs -= deltaMs;
    if (n.phaseMs <= 0) {
      n.mode = 'counting';
      n.count = C.countFrom;
      n.phaseMs = C.stepMs;
      n.sinceCountStart = 0;
      n.rivalNextGap = rand(C.rivalMinGapMs, C.rivalMaxGapMs);
      n.message = `Going... ${n.count}`;
    }
    return n;
  }

  // --- counting phase: sit on a number for stepMs, then step down
  n.phaseMs -= deltaMs;
  n.sinceCountStart += deltaMs;

  // the rival may jump in mid-count (only if not already leading)
  if (n.leader !== 'rival' && n.sinceCountStart >= n.rivalNextGap) {
    const rivalBid = n.currentBid + n.increment;
    if (rivalBid <= n.rivalCeiling) return applyBid(n, 'rival', rivalBid);
    n.rivalNextGap = C.hardCapMs;       // rival hit ceiling, goes quiet
  }

  if (n.phaseMs <= 0) {
    n.count -= 1;
    if (n.count <= 0) return closeLot(n);
    n.phaseMs = C.stepMs;
    n.message = `Going... ${n.count}`;
  }
  return n;
}

/** Player places a bid. Returns the new auction or an error. */
export function playerBid(
  state: GameState,
): { auction: AuctionState | null; error?: string } {
  const a = state.auction;
  if (!a || a.over) return { auction: a };
  if (a.mode === 'intro')
    return { auction: a, error: 'Begin the auction first.' };
  if (a.leader === 'player')
    return { auction: a, error: 'You already hold the leading bid.' };
  const myBid = a.currentBid + a.increment;
  if (myBid > state.funds)
    return { auction: a, error: 'That bid would exceed your funds.' };
  return { auction: applyBid(a, 'player', myBid) };
}
