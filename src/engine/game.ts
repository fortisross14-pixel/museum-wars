/* ============================================================
   ENGINE — CORE  ( src/engine/ )
   Pure game logic. State in -> new state out. No DOM, no React.
   Every mutating function returns a fresh GameState (or a
   { state, error } pair).
   ============================================================ */
import type {
  GameState, CategoryId, Room, GameEvent, Sponsor, TicketPrice, LogEntry,
} from '../data/types';
import {
  CATEGORIES, CATEGORY_IDS, BUILDINGS, BUILDING_ORDER, ROOM_CAPACITY,
  RESEARCH_TIERS, TICKET_PRICING, AD_CAMPAIGN, START, rarityForScore,
} from '../data/constants';
import { ARTIFACTS, ARTIFACT_BY_ID } from '../data/artifacts';
import { randInt, money, uid } from './util';

type Result = { state: GameState; error?: string };

/* --- room construction ------------------------------------- */
export function makeRooms(buildingId: string): Room[] {
  const b = BUILDINGS[buildingId];
  const rooms: Room[] = [];
  let n = 0;
  for (const hall of b.halls) {
    for (let i = 0; i < hall.roomCap; i++) {
      rooms.push({
        id: n++, hallId: hall.id, hallName: hall.name,
        unlocked: i < hall.startRooms,
        theme: null, researching: null, items: [],
      });
    }
  }
  return rooms;
}

/* --- fresh game -------------------------------------------- */
export function newGame(): GameState {
  return {
    funds: START.funds,
    fame: 0,
    week: 1,
    specialties: [],
    research: null,
    expertise: { renaissance: 0, egypt: 0, eastasia: 0, sculpture: 0 },
    buildingId: 'local',
    rooms: makeRooms('local'),
    owned: [],
    rivalFame: 8,
    rivalQuality: 60,
    log: [],
    events: [],
    activeEvent: null,
    auction: null,
    pendingItemId: null,
    ticket: 'standard',
    sponsors: [],
    wingNames: {},
    adWeeksLeft: 0,
    phase: 'choose-specialty',
  };
}

/* --- helpers ----------------------------------------------- */
export const roomIsFull = (r: Room) => r.items.length >= ROOM_CAPACITY;
export const roomReady = (r: Room) => r.unlocked && !r.researching;
export const canPlace = (r: Room, cat: CategoryId) =>
  roomReady(r) && r.theme === cat && !roomIsFull(r);
export const hasOpenSlotFor = (s: GameState, cat: CategoryId) =>
  s.rooms.some(r => canPlace(r, cat));

function logged(s: GameState, entry: LogEntry): GameState {
  return { ...s, log: [entry, ...s.log].slice(0, 60) };
}
/** deep-ish clone of the parts that get mutated together */
function fork(s: GameState): GameState {
  return {
    ...s,
    rooms: s.rooms.map(r => ({ ...r, items: [...r.items] })),
    expertise: { ...s.expertise },
    specialties: [...s.specialties],
    owned: [...s.owned],
    sponsors: s.sponsors.map(sp => ({ ...sp })),
    wingNames: { ...s.wingNames },
    log: [...s.log],
  };
}

/* --- founding specialty ------------------------------------ */
export function chooseSpecialty(s: GameState, cat: CategoryId): GameState {
  const next = fork(s);
  next.specialties = [cat];
  next.expertise[cat] = 0.5;
  next.phase = 'playing';
  next.log = [{ kind: 'good',
    text: `Founded as a ${CATEGORIES[cat].name} museum.` }];
  const first = next.rooms.find(r => r.unlocked);
  if (first) first.theme = cat;
  next.events = rollEvents(next);
  return next;
}

/* --- research ---------------------------------------------- */
export function researchTier(s: GameState) {
  return RESEARCH_TIERS[s.specialties.length - 1] || null;
}
export function canResearch(s: GameState):
  { ok: boolean; reason?: string; hostRoomId?: number } {
  if (s.research) return { ok: false, reason: 'Research already in progress.' };
  const tier = researchTier(s);
  if (!tier) return { ok: false, reason: 'All specialties unlocked.' };
  if (s.fame < tier.fameReq)
    return { ok: false, reason: `Requires ${tier.fameReq} fame.` };
  if (s.funds < tier.fee)
    return { ok: false, reason: `Requires a ${money(tier.fee)} research fee.` };
  const host = s.rooms.find(r => r.unlocked && !r.theme && !r.researching);
  if (!host)
    return { ok: false, reason: 'Needs an open, unassigned room to host it.' };
  return { ok: true, hostRoomId: host.id };
}
export function startResearch(s: GameState, cat: CategoryId): Result {
  const chk = canResearch(s);
  if (!chk.ok) return { state: s, error: chk.reason };
  if (s.specialties.includes(cat))
    return { state: s, error: 'Already a specialty.' };
  const weeks = randInt(3, 4);
  const tier = researchTier(s)!;
  let next = fork(s);
  next.funds -= tier.fee;
  next.research = { specialty: cat, weeksLeft: weeks };
  next.rooms = next.rooms.map(r => r.id === chk.hostRoomId
    ? { ...r, researching: { specialty: cat, weeksLeft: weeks } } : r);
  next = logged(next, { kind: 'good',
    text: `Began researching ${CATEGORIES[cat].name} (${weeks} weeks).` });
  return { state: next };
}

/* --- rooms ------------------------------------------------- */
export function openRoom(s: GameState): Result {
  const locked = s.rooms.find(r => !r.unlocked);
  if (!locked) return { state: s, error: 'This building has no further rooms.' };
  if (s.funds < START.roomCost)
    return { state: s, error: 'Not enough funds to open a room.' };
  let next = fork(s);
  next.funds -= START.roomCost;
  next.rooms = next.rooms.map(r =>
    r.id === locked.id ? { ...r, unlocked: true } : r);
  next = logged(next, { kind: 'good',
    text: `Opened a new room in the ${locked.hallName}.` });
  return { state: next };
}
export function assignRoom(
  s: GameState, roomId: number, cat: CategoryId,
): Result {
  if (!s.specialties.includes(cat))
    return { state: s, error: 'That specialty is not unlocked.' };
  const room = s.rooms.find(r => r.id === roomId);
  if (!room || !room.unlocked || room.theme || room.researching)
    return { state: s, error: 'That room cannot be assigned.' };
  let next = fork(s);
  next.rooms = next.rooms.map(r =>
    r.id === roomId ? { ...r, theme: cat } : r);
  next = logged(next, { kind: 'good',
    text: `Assigned ${CATEGORIES[cat].name} to a room.` });
  return { state: next };
}

/* --- buildings --------------------------------------------- */
export function nextBuilding(s: GameState): string | null {
  const i = BUILDING_ORDER.indexOf(s.buildingId);
  return BUILDING_ORDER[i + 1] || null;
}
export function moveToBuilding(s: GameState, buildingId: string): Result {
  const b = BUILDINGS[buildingId];
  if (!b) return { state: s, error: 'Unknown building.' };
  if (s.funds < b.moveCost)
    return { state: s, error: `Moving costs ${money(b.moveCost)}.` };
  const rooms = makeRooms(buildingId);
  // assign rooms to the player's specialties, then refill by theme
  const byCat: Record<string, string[]> = {};
  for (const id of s.owned) {
    const a = ARTIFACT_BY_ID[id];
    (byCat[a.category] = byCat[a.category] || []).push(id);
  }
  for (const cat of s.specialties) {
    const room = rooms.find(r => r.unlocked && !r.theme);
    if (room) room.theme = cat;
  }
  for (const room of rooms) {
    if (!room.unlocked || !room.theme) continue;
    const q = byCat[room.theme] || [];
    while (q.length && !roomIsFull(room)) room.items.push(q.shift()!);
  }
  let next = fork(s);
  next.funds -= b.moveCost;
  next.buildingId = buildingId;
  next.rooms = rooms;
  next.wingNames = {};   // wing names reset with the new building
  next = logged(next, { kind: 'good',
    text: `Moved the collection to the ${b.name}.` });
  return { state: next };
}

/* --- weekly events ----------------------------------------- */
const RARITY_SKEWS = {
  modest: { label: 'mostly Common & Uncommon',
    weights: [6, 4, 2, 0.6, 0.12, 0.02] },
  fair: { label: 'Uncommon to Rare',
    weights: [2, 4, 4, 1.6, 0.4, 0.06] },
  fine: { label: 'Rare and finer',
    weights: [0.4, 1.5, 4, 3, 1.2, 0.25] },
};
// weights index aligns with RARITY band order in constants

function bandIndexForScore(score: number): number {
  // 0 common .. 5 worldicon
  if (score >= 200) return 5;
  if (score >= 100) return 4;
  if (score >= 50) return 3;
  if (score >= 20) return 2;
  if (score >= 10) return 1;
  return 0;
}

function buildEvent(s: GameState, cat: CategoryId): GameEvent | null {
  const starsHere = s.expertise[cat] || 0;
  const skewId = starsHere >= 3 ? (Math.random() < 0.5 ? 'fine' : 'fair')
    : starsHere >= 1.5 ? (Math.random() < 0.6 ? 'fair' : 'modest')
    : (Math.random() < 0.8 ? 'modest' : 'fair');
  const skew = RARITY_SKEWS[skewId as keyof typeof RARITY_SKEWS];

  const isDonation = Math.random() < 0.36;
  const count = isDonation ? randInt(2, 3) : randInt(2, 5);

  const pool = ARTIFACTS.filter(
    a => a.category === cat && !s.owned.includes(a.id));
  if (pool.length === 0) return null;

  const avail = [...pool];
  const lots: string[] = [];
  for (let i = 0; i < count && avail.length; i++) {
    const weighted = avail.map(a => ({
      a, w: skew.weights[bandIndexForScore(a.score)] || 0.05,
    }));
    const total = weighted.reduce((acc, x) => acc + x.w, 0);
    let r = Math.random() * total;
    let chosen = weighted[weighted.length - 1].a;
    for (const x of weighted) { r -= x.w; if (r <= 0) { chosen = x.a; break; } }
    lots.push(chosen.id);
    avail.splice(avail.indexOf(chosen), 1);
  }
  if (lots.length === 0) return null;

  return {
    id: uid('ev'),
    kind: isDonation ? 'donation' : 'auction',
    category: cat,
    skewLabel: skew.label,
    fee: isDonation ? START.attendFeeDonation : START.attendFeeAuction,
    lotIds: lots,
    house: isDonation
      ? `${CATEGORIES[cat].name} estate donation`
      : `${CATEGORIES[cat].name} auction`,
  };
}

/** Roll this week's events. Each unlocked specialty independently
 *  rolls a chance of one event — so a week may have none, one, or
 *  several, capped at maxEventsPerWeek. */
export function rollEvents(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const cat of s.specialties) {
    if (events.length >= START.maxEventsPerWeek) break;
    if (Math.random() <= START.eventChancePerSpecialty) {
      const ev = buildEvent(s, cat);
      if (ev) events.push(ev);
    }
  }
  return events;
}

/* --- attend / auction flow --------------------------------- */
export function attendEvent(s: GameState, eventId: string): Result {
  const ev = s.events.find(e => e.id === eventId);
  if (!ev) return { state: s, error: 'Event not found.' };
  if (s.funds < ev.fee)
    return { state: s, error: 'Not enough funds for the attendance fee.' };
  let next = fork(s);
  next.funds -= ev.fee;
  next.activeEvent = { ...ev, attended: true, lotIndex: 0, acquired: [] };
  next.events = next.events.filter(e => e.id !== eventId);
  next = logged(next, { kind: 'good',
    text: `Attended the ${ev.house} (fee ${money(ev.fee)}).` });
  return { state: next };
}

/** Resolve a finished lot: bank a win, advance lotIndex. */
export function finishLot(s: GameState): GameState {
  const a = s.auction!;
  const ev = s.activeEvent!;
  let next = fork(s);
  next.activeEvent = { ...ev, acquired: [...(ev.acquired || [])] };
  next.auction = null;

  if (a.won) {
    const art = ARTIFACT_BY_ID[a.artifactId];
    next.funds -= a.currentBid;
    next.owned.push(art.id);
    next.activeEvent.acquired!.push(art.id);
    next.pendingItemId = art.id;
    // fame from a win scales with the artifact's score
    const fameGain = Math.max(1, Math.round(art.score * 0.25));
    next.fame += fameGain;
    next.expertise[art.category] = Math.min(5,
      +(next.expertise[art.category] + 0.2 + art.score / 500).toFixed(2));
    next = logged(next, { kind: 'good',
      text: `Acquired ${art.name} for ${money(a.currentBid)}. +${fameGain} fame.` });
  } else {
    const art = ARTIFACT_BY_ID[a.artifactId];
    next = logged(next, { kind: 'bad', text: `Lost ${art.name} at auction.` });
  }
  if (next.activeEvent) {
    next.activeEvent = {
      ...next.activeEvent,
      lotIndex: (next.activeEvent.lotIndex || 0) + 1,
    };
  }
  return next;
}

/* --- placing artifacts ------------------------------------- */
export function placeArtifact(s: GameState, roomId: number): Result {
  const art = s.pendingItemId ? ARTIFACT_BY_ID[s.pendingItemId] : null;
  if (!art) return { state: s, error: 'No artifact to place.' };
  const room = s.rooms.find(r => r.id === roomId);
  if (!room || !canPlace(room, art.category))
    return { state: s, error: 'That room cannot take this work.' };
  let next = fork(s);
  next.rooms = next.rooms.map(r =>
    r.id === roomId ? { ...r, items: [...r.items, art.id] } : r);
  next.pendingItemId = null;
  next = logged(next, { kind: 'good',
    text: `Placed ${art.name} in a ${CATEGORIES[art.category].name} room.` });
  // room completion: a milestone bonus scaled by the works inside
  const filled = next.rooms.find(r => r.id === roomId)!;
  if (roomIsFull(filled)) {
    const quality = filled.items.reduce(
      (acc, id) => acc + ARTIFACT_BY_ID[id].score, 0);
    const bonus = 20 + Math.round(quality * 0.18);
    next.fame += bonus;
    next = logged(next, { kind: 'good',
      text: `Completed a ${CATEGORIES[filled.theme!].name} room — +${bonus} fame.` });
  }
  return { state: next };
}

/* --- management: tickets, sponsors, advertising ------------ */
export function setTicket(s: GameState, t: TicketPrice): GameState {
  let next = fork(s);
  next.ticket = t;
  next = logged(next, { kind: 'note',
    text: `Ticket price set to ${TICKET_PRICING[t].label}.` });
  return next;
}

/** A roster of sponsors who may be courted. Offered ones depend
 *  on fame; each gives a one-off gift and a small weekly fame. */
export function availableSponsors(s: GameState): Sponsor[] {
  const roster: Sponsor[] = [
    { id: 'merchant', name: 'The Aldermoor Trust', gift: 800, weeklyBonus: 1, wingNamed: null },
    { id: 'banker',   name: 'House of Castellan',  gift: 1800, weeklyBonus: 2, wingNamed: null },
    { id: 'magnate',  name: 'The Verrane Endowment',gift: 3600, weeklyBonus: 4, wingNamed: null },
  ];
  const have = new Set(s.sponsors.map(sp => sp.id));
  // gate by fame so bigger sponsors arrive later
  const fameGate: Record<string, number> = {
    merchant: 0, banker: 35, magnate: 90,
  };
  return roster.filter(r => !have.has(r.id) && s.fame >= fameGate[r.id]);
}

export function courtSponsor(
  s: GameState, sponsorId: string, hallId: string,
): Result {
  const sp = availableSponsors(s).find(x => x.id === sponsorId);
  if (!sp) return { state: s, error: 'That sponsor is not available.' };
  const hallExists = BUILDINGS[s.buildingId].halls.some(h => h.id === hallId);
  if (!hallExists) return { state: s, error: 'Unknown wing.' };
  if (s.wingNames[hallId])
    return { state: s, error: 'That wing is already named.' };
  let next = fork(s);
  next.funds += sp.gift;
  next.sponsors = [...next.sponsors, { ...sp, wingNamed: hallId }];
  next.wingNames = { ...next.wingNames, [hallId]: sp.name };
  next = logged(next, { kind: 'good',
    text: `${sp.name} sponsors the museum — ${money(sp.gift)} gift; a wing now bears their name.` });
  return { state: next };
}

export function runAdCampaign(s: GameState): Result {
  if (s.adWeeksLeft > 0)
    return { state: s, error: 'A campaign is already running.' };
  if (s.funds < AD_CAMPAIGN.cost)
    return { state: s, error: `A campaign costs ${money(AD_CAMPAIGN.cost)}.` };
  let next = fork(s);
  next.funds -= AD_CAMPAIGN.cost;
  next.adWeeksLeft = AD_CAMPAIGN.weeks;
  next = logged(next, { kind: 'good',
    text: `Launched an advertising campaign for ${AD_CAMPAIGN.weeks} weeks.` });
  return { state: next };
}

/* --- derived stats ----------------------------------------- */
/** total quality = sum of all placed artifact scores */
export function museumQuality(s: GameState): number {
  let q = 0;
  for (const r of s.rooms)
    for (const id of r.items) q += ARTIFACT_BY_ID[id].score;
  return q;
}

export function computeVisitors(s: GameState): number {
  const prestige = BUILDINGS[s.buildingId].prestige;
  const ticket = TICKET_PRICING[s.ticket];
  let v = 40 + s.fame * 5 + museumQuality(s) * 0.4;
  for (const room of s.rooms) {
    if (room.items.length === 0) continue;
    v += room.items.length * 4
      + (room.items.length / ROOM_CAPACITY) * 18;
  }
  v *= prestige * ticket.visitorMult;
  if (s.adWeeksLeft > 0) v *= AD_CAMPAIGN.visitorMult;
  return Math.round(v);
}

export function computeRevenue(s: GameState): number {
  const ticket = TICKET_PRICING[s.ticket];
  const visitors = computeVisitors(s);
  // gift-shop floor so a free museum still earns a little
  return Math.round(visitors * ticket.revenuePerVisitor + visitors * 0.25);
}

export function ranking(s: GameState): 1 | 2 {
  // ranked on fame + quality combined against the rival
  const mine = s.fame + museumQuality(s) * 0.5;
  const theirs = s.rivalFame + s.rivalQuality * 0.5;
  return mine >= theirs ? 1 : 2;
}

/* --- advance one week -------------------------------------- */
export function advanceWeek(s: GameState): GameState {
  let next = fork(s);

  // research progress
  if (next.research) {
    const left = next.research.weeksLeft - 1;
    if (left <= 0) {
      const sp = next.research.specialty;
      next.specialties.push(sp);
      next.expertise[sp] = Math.max(next.expertise[sp], 0.5);
      next.rooms = next.rooms.map(r =>
        r.researching && r.researching.specialty === sp
          ? { ...r, researching: null, theme: sp } : r);
      next.research = null;
      next = logged(next, { kind: 'good',
        text: `Research complete — ${CATEGORIES[sp].name} is now a specialty.` });
    } else {
      next.research = { ...next.research, weeksLeft: left };
      next.rooms = next.rooms.map(r => r.researching
        ? { ...r, researching: { ...r.researching, weeksLeft: left } } : r);
    }
  }

  // sponsor weekly fame
  const sponsorFame = next.sponsors.reduce((acc, sp) => acc + sp.weeklyBonus, 0);
  next.fame += sponsorFame;

  // economy
  next.funds += computeRevenue(next);

  // advertising countdown
  if (next.adWeeksLeft > 0) next.adWeeksLeft -= 1;

  // rival grows — calibrated against a 50-week museum that can
  // reach several hundred fame, so it stays a visible competitor.
  const lead = next.rivalFame - next.fame;
  const rg = lead > 60 ? randInt(1, 3)
    : lead > 0 ? randInt(4, 7)
    : randInt(6, 11);
  next.rivalFame += rg;
  next.rivalQuality += randInt(5, 12);

  next.week += 1;
  next.events = [];
  next.activeEvent = null;
  next.auction = null;

  if (next.week > START.totalWeeks) {
    next.phase = 'ended';
    return next;
  }
  next.events = rollEvents(next);
  return next;
}

/* --- final score ------------------------------------------- */
export interface FinalScore {
  score: number; grade: string; rank: 1 | 2;
  quality: number; completeRooms: number; collValue: number;
}
export function finalScore(s: GameState): FinalScore {
  const quality = museumQuality(s);
  const collValue = s.owned.reduce(
    (acc, id) => acc + ARTIFACT_BY_ID[id].value, 0);
  const completeRooms = s.rooms.filter(roomIsFull).length;
  const score = Math.round(
    s.fame * 8 + quality * 3 + collValue / 30 + completeRooms * 35);
  let grade: string;
  if (score >= 8000) grade = 'A Museum of Legend';
  else if (score >= 5500) grade = 'A Museum of Renown';
  else if (score >= 3000) grade = 'A Respected Institution';
  else if (score >= 1200) grade = 'A Promising Gallery';
  else grade = 'A Modest Beginning';
  return { score, grade, rank: ranking(s), quality, completeRooms, collValue };
}

/* re-exports the UI leans on */
export { CATEGORIES, CATEGORY_IDS, BUILDINGS, rarityForScore };
export { BUILDING_ORDER as BUILDING_ORDER_PUBLIC } from '../data/constants';
