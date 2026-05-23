/* ============================================================
   ENGINE — CORE  ( src/engine/ )  — STAGE 1 REWORK
   Pure game logic. State in -> new state out. No DOM, no React.

   Key model changes from the old build:
     * a museum specialises in a STYLE (not a category)
     * three RIVAL PLAYERS share the city and grow each week
     * weekly maintenance is a real EXPENSE line
     * visitors follow a supply/demand curve of price vs quality
     * phases: choose-specialty -> name-gallery -> playing -> ended
   ============================================================ */
import type {
  GameState, StyleId, Room, GameEvent, Sponsor, LogEntry, RivalPlayer,
  StaffMember, StaffRole, Expedition, ExpeditionKind,
} from '../data/types';
import {
  STYLES, STYLE_IDS, BUILDINGS, BUILDING_ORDER, ROOM_CAPACITY,
  RESEARCH_TIERS, AD_CAMPAIGN, START, RIVAL_NAMES, AUCTION_HOUSES,
  EXPEDITION_KINDS, EXPEDITION_WEEKS, EXPEDITION_INCIDENT_CHANCE,
  rarityForScore,
} from '../data/constants';
import type { AuctionHouseDef } from '../data/constants';
import { ARTIFACTS, ARTIFACT_BY_ID } from '../data/artifacts';
import { randInt, rand, money, uid } from './util';

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

/* --- the three rival players ------------------------------- */
function makeRivals(): RivalPlayer[] {
  return RIVAL_NAMES.map((name, i) => ({
    id: 'rival' + i,
    name,
    fame: randInt(4, 12),
    quality: randInt(20, 60),
    visitors: randInt(80, 220),
  }));
}

/* --- fresh game -------------------------------------------- */
export function newGame(): GameState {
  return {
    playerName: '',
    galleryName: '',
    funds: START.funds,
    fame: 0,
    week: 1,
    specialties: [],
    research: null,
    expertise: {},
    buildingId: 'local',
    rooms: makeRooms('local'),
    owned: [],
    rivals: makeRivals(),
    log: [],
    events: [],
    activeEvent: null,
    auction: null,
    pendingItemId: null,
    ticket: START.defaultTicket,
    sponsors: [],
    wingNames: {},
    adWeeksLeft: 0,
    lastRevenue: 0,
    lastExpenses: 0,
    joinedHouses: ['house1'],   // the free starter house is joined by default
    history: [],
    staff: [],
    candidates: makeCandidates(),
    expeditions: [],
    phase: 'choose-specialty',
  };
}

/* --- helpers ----------------------------------------------- */
export const roomIsFull = (r: Room) => r.items.length >= ROOM_CAPACITY;
export const roomReady = (r: Room) => r.unlocked && !r.researching;
export const canPlace = (r: Room, style: StyleId) =>
  roomReady(r) && r.theme === style && !roomIsFull(r);
export const hasOpenSlotFor = (s: GameState, style: StyleId) =>
  s.rooms.some(r => canPlace(r, style));

function logged(s: GameState, entry: LogEntry): GameState {
  return { ...s, log: [entry, ...s.log].slice(0, 60) };
}
function fork(s: GameState): GameState {
  return {
    ...s,
    rooms: s.rooms.map(r => ({ ...r, items: [...r.items] })),
    expertise: { ...s.expertise },
    specialties: [...s.specialties],
    owned: [...s.owned],
    rivals: s.rivals.map(r => ({ ...r })),
    sponsors: s.sponsors.map(sp => ({ ...sp })),
    wingNames: { ...s.wingNames },
    log: [...s.log],
    staff: s.staff.map(m => ({ ...m })),
    candidates: s.candidates.map(m => ({ ...m })),
    expeditions: s.expeditions.map(e => ({ ...e, foundIds: [...e.foundIds] })),
  };
}

/* --- founding specialty + naming --------------------------- */
/** Pick the founding style. Moves to the name-gallery phase. */
export function chooseSpecialty(s: GameState, style: StyleId): GameState {
  const next = fork(s);
  next.specialties = [style];
  next.expertise[style] = 0.5;
  next.phase = 'name-gallery';
  const first = next.rooms.find(r => r.unlocked);
  if (first) first.theme = style;
  return next;
}

/** Three random Uncommon works offered as a founding acquisition.
 *  The player picks one to lead their collection; its style becomes
 *  the founding specialty. Uncommon (score 10-19) so the starter is
 *  a real, named work rather than procedural filler. */
export function foundingArtworkChoices(): string[] {
  const pool = ARTIFACTS.filter(a => a.score >= 10 && a.score <= 19);
  const out: string[] = [];
  const avail = [...pool];
  while (out.length < 3 && avail.length) {
    out.push(avail.splice(Math.floor(Math.random() * avail.length), 1)[0].id);
  }
  return out;
}

/** Choose the founding artwork. The museum specialises in that
 *  work's style, owns the work from the start, and moves to the
 *  name-gallery phase. */
export function chooseFoundingArtwork(s: GameState, artId: string): GameState {
  const art = ARTIFACT_BY_ID[artId];
  if (!art) return s;
  const next = fork(s);
  next.specialties = [art.style];
  next.expertise[art.style] = 0.5;
  next.owned = [artId];
  next.pendingItemId = artId;          // placed during/after onboarding
  next.phase = 'name-gallery';
  const first = next.rooms.find(r => r.unlocked);
  if (first) first.theme = art.style;
  return next;
}

/** Name the gallery and set the opening ticket price; begin play.
 *  The gallery name is permanent; the ticket changes later in Manage. */
export function nameGallery(
  s: GameState, playerName: string, galleryName: string, ticket: number,
): GameState {
  const next = fork(s);
  next.playerName = playerName.trim() || 'Curator';
  next.galleryName = galleryName.trim() || 'The New Gallery';
  next.ticket = Math.max(0, Math.round(ticket));
  next.phase = 'playing';
  next.log = [{ kind: 'good',
    text: `${next.galleryName} opens its doors — a ${STYLES[next.specialties[0]].name} gallery.` }];
  // hang the founding artwork on the wall of the starter room
  if (next.pendingItemId) {
    const art = ARTIFACT_BY_ID[next.pendingItemId];
    const room = next.rooms.find(r => canPlace(r, art.style));
    if (room) {
      room.items = [...room.items, art.id];
      next.pendingItemId = null;
      next.log.unshift({ kind: 'good',
        text: `${art.name} takes pride of place as the founding work.` });
    }
  }
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
  if (!hasRole(s, 'researcher'))
    return { ok: false, reason: 'You must employ a Researcher to research a new style.' };
  if (s.fame < tier.fameReq)
    return { ok: false, reason: `Requires ${tier.fameReq} fame.` };
  if (s.funds < tier.fee)
    return { ok: false, reason: `Requires a ${money(tier.fee)} research fee.` };
  const host = s.rooms.find(r => r.unlocked && !r.theme && !r.researching);
  if (!host)
    return { ok: false, reason: 'Needs an open, unassigned room to host it.' };
  return { ok: true, hostRoomId: host.id };
}
export function startResearch(s: GameState, style: StyleId): Result {
  const chk = canResearch(s);
  if (!chk.ok) return { state: s, error: chk.reason };
  if (s.specialties.includes(style))
    return { state: s, error: 'Already a specialty.' };
  // a skilled researcher shortens the work by up to a week
  const skill = roleSkill(s, 'researcher');
  const weeks = Math.max(2, randInt(3, 4) - (skill >= 3 ? 1 : 0));
  const tier = researchTier(s)!;
  let next = fork(s);
  next.funds -= tier.fee;
  next.research = { style, weeksLeft: weeks };
  next.rooms = next.rooms.map(r => r.id === chk.hostRoomId
    ? { ...r, researching: { style, weeksLeft: weeks } } : r);
  next = logged(next, { kind: 'good',
    text: `Began researching ${STYLES[style].name} (${weeks} weeks).` });
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
  s: GameState, roomId: number, style: StyleId,
): Result {
  if (!s.specialties.includes(style))
    return { state: s, error: 'That specialty is not unlocked.' };
  const room = s.rooms.find(r => r.id === roomId);
  if (!room || !room.unlocked || room.theme || room.researching)
    return { state: s, error: 'That room cannot be assigned.' };
  let next = fork(s);
  next.rooms = next.rooms.map(r =>
    r.id === roomId ? { ...r, theme: style } : r);
  next = logged(next, { kind: 'good',
    text: `Assigned ${STYLES[style].name} to a room.` });
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
  const byStyle: Record<string, string[]> = {};
  for (const id of s.owned) {
    const a = ARTIFACT_BY_ID[id];
    (byStyle[a.style] = byStyle[a.style] || []).push(id);
  }
  for (const style of s.specialties) {
    const room = rooms.find(r => r.unlocked && !r.theme);
    if (room) room.theme = style;
  }
  for (const room of rooms) {
    if (!room.unlocked || !room.theme) continue;
    const q = byStyle[room.theme] || [];
    while (q.length && !roomIsFull(room)) room.items.push(q.shift()!);
  }
  let next = fork(s);
  next.funds -= b.moveCost;
  next.buildingId = buildingId;
  next.rooms = rooms;
  next.wingNames = {};
  next = logged(next, { kind: 'good',
    text: `Moved the collection to the ${b.name}.` });
  return { state: next };
}

/* --- weekly events: the auction houses --------------------- */
/** rarity band index 0..5 (common..worldicon) for a score */
function bandIndexForScore(score: number): number {
  if (score >= 200) return 5;
  if (score >= 100) return 4;
  if (score >= 50) return 3;
  if (score >= 20) return 2;
  if (score >= 10) return 1;
  return 0;
}

/** which houses the player can currently SEE (fame-unlocked) */
export function unlockedHouses(s: GameState): AuctionHouseDef[] {
  return AUCTION_HOUSES.filter(h => s.fame >= h.fameToUnlock);
}
/** houses the player has actually JOINED (paid the join fee) */
export function joinedHouses(s: GameState): AuctionHouseDef[] {
  return AUCTION_HOUSES.filter(h => s.joinedHouses.includes(h.id));
}
/** pay the one-time join fee for a house */
export function joinHouse(s: GameState, houseId: string): Result {
  const h = AUCTION_HOUSES.find(x => x.id === houseId);
  if (!h) return { state: s, error: 'Unknown auction house.' };
  if (s.joinedHouses.includes(houseId))
    return { state: s, error: 'Already a member of that house.' };
  if (s.fame < h.fameToUnlock)
    return { state: s, error: `That house opens at ${h.fameToUnlock} fame.` };
  if (s.funds < h.joinFee)
    return { state: s, error: `Joining costs ${money(h.joinFee)}.` };
  let next = fork(s);
  next.funds -= h.joinFee;
  next.joinedHouses = [...next.joinedHouses, houseId];
  next = logged(next, { kind: 'good',
    text: `Joined ${h.name}${h.joinFee > 0 ? ` for ${money(h.joinFee)}` : ''}.` });
  return { state: next };
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legend'];
function houseSkewLabel(h: AuctionHouseDef): string {
  // name the two heaviest bands the house offers
  const ranked = h.rarityWeights
    .map((w, i) => ({ w, i }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w);
  const top = ranked.slice(0, 2).map(x => RARITY_NAMES[x.i]);
  return `mostly ${top.join(' & ')}`;
}

/** Build one auction for a given house. Lots are drawn with the
 *  house's rarity weights, and skewed toward the player's unlocked
 *  styles so themed rooms can still be filled. World Icons (band 5)
 *  are never offered. */
function buildHouseAuction(s: GameState, h: AuctionHouseDef): GameEvent | null {
  // candidate pool: not owned, not a World Icon, and the house
  // must actually offer that rarity band (weight > 0).
  const styleSet = new Set(s.specialties);
  const pool = ARTIFACTS.filter(a => {
    if (s.owned.includes(a.id)) return false;
    const band = bandIndexForScore(a.score);
    if (band >= 5) return false;                 // never auction World Icons
    return h.rarityWeights[band] > 0;
  });
  if (pool.length === 0) return null;

  const count = randInt(3, 5);
  const avail = [...pool];
  const lots: string[] = [];
  for (let i = 0; i < count && avail.length; i++) {
    const weighted = avail.map(a => {
      const band = bandIndexForScore(a.score);
      let w = h.rarityWeights[band] || 0.01;
      // favour the player's unlocked styles ~3x so rooms are fillable
      if (styleSet.has(a.style)) w *= 3;
      return { a, w };
    });
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
    kind: 'auction',
    houseId: h.id,
    house: h.name,
    skewLabel: houseSkewLabel(h),
    fee: h.attendFee,
    lotIds: lots,
  };
}

/** Each week, every JOINED house may hold a sale. */
export function rollEvents(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const h of joinedHouses(s)) {
    if (events.length >= START.maxEventsPerWeek) break;
    // the humble house holds sales often; grander houses less so
    const chance = h.id === 'house1' ? 0.8 : h.id === 'house2' ? 0.6 : 0.45;
    if (Math.random() <= chance) {
      const ev = buildHouseAuction(s, h);
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
  next.activeEvent = { ...ev, attended: true, lotIndex: 0, acquired: [], passed: [] };
  next.events = next.events.filter(e => e.id !== eventId);
  next = logged(next, { kind: 'good',
    text: `Attended a sale at ${ev.house}${ev.fee > 0 ? ` (fee ${money(ev.fee)})` : ''}.` });
  return { state: next };
}

/** Skip the current lot without bidding — advance to the next. */
export function passLot(s: GameState): GameState {
  const ev = s.activeEvent;
  if (!ev) return s;
  let next = fork(s);
  const art = ARTIFACT_BY_ID[ev.lotIds[ev.lotIndex || 0]];
  next.activeEvent = {
    ...ev,
    passed: [...(ev.passed || []), art.id],
    lotIndex: (ev.lotIndex || 0) + 1,
  };
  next.auction = null;
  return next;
}

/** Leave the auction entirely, forfeiting any remaining lots. */
export function leaveAuction(s: GameState): GameState {
  let next = fork(s);
  next.activeEvent = null;
  next.auction = null;
  return next;
}

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
    // won items go straight to the collection — they are placed
    // later from the Galleries tab, so the auction can continue.
    const fameGain = Math.max(1, Math.round(art.score * 0.25));
    next.fame += fameGain;
    next.expertise[art.style] = Math.min(5,
      +(((next.expertise[art.style] || 0) + 0.2 + art.score / 500)).toFixed(2));
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
  if (!room || !canPlace(room, art.style))
    return { state: s, error: 'That room cannot take this work.' };
  let next = fork(s);
  next.rooms = next.rooms.map(r =>
    r.id === roomId ? { ...r, items: [...r.items, art.id] } : r);
  next.pendingItemId = null;
  next = logged(next, { kind: 'good',
    text: `Placed ${art.name} in a ${STYLES[art.style].name} room.` });
  const filled = next.rooms.find(r => r.id === roomId)!;
  if (roomIsFull(filled)) {
    const quality = filled.items.reduce(
      (acc, id) => acc + ARTIFACT_BY_ID[id].score, 0);
    const bonus = 20 + Math.round(quality * 0.18);
    next.fame += bonus;
    next = logged(next, { kind: 'good',
      text: `Completed a ${STYLES[filled.theme!].name} room — +${bonus} fame.` });
  }
  return { state: next };
}

/** Take an artwork off its wall and back into the private
 *  collection. The work stays owned — it just leaves display. */
export function removeArtifact(s: GameState, artId: string): Result {
  const room = s.rooms.find(r => r.items.includes(artId));
  if (!room) return { state: s, error: 'That work is not on display.' };
  const art = ARTIFACT_BY_ID[artId];
  let next = fork(s);
  next.rooms = next.rooms.map(r =>
    r.id === room.id ? { ...r, items: r.items.filter(id => id !== artId) } : r);
  next = logged(next, { kind: 'note',
    text: `Moved ${art.name} into the private collection.` });
  return { state: next };
}

/* --- management: tickets, sponsors, advertising ------------ */
/** Set the ticket price (any currency amount). Changeable any time. */
export function setTicket(s: GameState, price: number): GameState {
  let next = fork(s);
  next.ticket = Math.max(0, Math.round(price));
  next = logged(next, { kind: 'note',
    text: `Ticket price set to ${money(next.ticket)}.` });
  return next;
}

export function availableSponsors(s: GameState): Sponsor[] {
  const roster: Sponsor[] = [
    { id: 'merchant', name: 'The Aldermoor Trust',   gift: 800,  weeklyBonus: 1, wingNamed: null },
    { id: 'banker',   name: 'House of Castellan',    gift: 1800, weeklyBonus: 2, wingNamed: null },
    { id: 'magnate',  name: 'The Verrane Endowment', gift: 3600, weeklyBonus: 4, wingNamed: null },
  ];
  const have = new Set(s.sponsors.map(sp => sp.id));
  const fameGate: Record<string, number> = { merchant: 0, banker: 35, magnate: 90 };
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

/* --- personnel --------------------------------------------- */
/* Three roles:
     curator   — lifts weekly fame and the museum's visitor draw
     researcher— REQUIRED to research a new style; speeds research
     explorer  — boosts expeditions (used by the expedition system)
   A member's `skill` (1-3) scales both their effect and their wage. */

const STAFF_FIRST = [
  'Eleanor', 'Marcus', 'Priya', 'Tomas', 'Ada', 'Hugo', 'Nadia',
  'Oscar', 'Leila', 'Viktor', 'Mei', 'Sofia', 'Idris', 'Greta',
];
const STAFF_LAST = [
  'Vance', 'Okonkwo', 'Reyes', 'Halloran', 'Brandt', 'Costa',
  'Whitfield', 'Aaltonen', 'Marchetti', 'Devereux', 'Sandoval',
];
const ROLE_LABEL: Record<StaffRole, string> = {
  curator: 'Curator', researcher: 'Researcher', explorer: 'Expedition Leader',
};

function staffName(): string {
  return `${STAFF_FIRST[randInt(0, STAFF_FIRST.length - 1)]} `
    + STAFF_LAST[randInt(0, STAFF_LAST.length - 1)];
}

/** wage scales with skill — a star hire costs real money each week */
function wageFor(role: StaffRole, skill: number): number {
  const base = role === 'explorer' ? 320 : role === 'curator' ? 280 : 240;
  return base * skill;
}

/** build a fresh pool of recruits — one or two of each role */
export function makeCandidates(): StaffMember[] {
  const out: StaffMember[] = [];
  const roles: StaffRole[] = ['curator', 'researcher', 'explorer'];
  for (const role of roles) {
    const n = randInt(1, 2);
    for (let i = 0; i < n; i++) {
      const skill = randInt(1, 3);
      out.push({
        id: uid('staff'),
        name: staffName(),
        role, skill,
        wage: wageFor(role, skill),
        hired: false,
      });
    }
  }
  return out;
}

export const ROLE_NAME = ROLE_LABEL;

/** the hired staff of a given role (may be empty) */
export function staffOfRole(s: GameState, role: StaffRole): StaffMember[] {
  return s.staff.filter(m => m.role === role);
}
/** does the museum employ at least one of this role? */
export function hasRole(s: GameState, role: StaffRole): boolean {
  return s.staff.some(m => m.role === role);
}
/** combined skill of a role (sum of skills) — 0 if none employed */
export function roleSkill(s: GameState, role: StaffRole): number {
  return staffOfRole(s, role).reduce((acc, m) => acc + m.skill, 0);
}
/** total weekly wage bill */
export function weeklyWages(s: GameState): number {
  return s.staff.reduce((acc, m) => acc + m.wage, 0);
}

/** Hire a recruit from the candidate pool. A one-off signing fee
 *  of four weeks' wage is paid up front; the wage then recurs. */
export function hireStaff(s: GameState, candidateId: string): Result {
  const cand = s.candidates.find(c => c.id === candidateId);
  if (!cand) return { state: s, error: 'That recruit is no longer available.' };
  const signingFee = cand.wage * 4;
  if (s.funds < signingFee)
    return { state: s, error: `Hiring needs a ${money(signingFee)} signing fee.` };
  let next = fork(s);
  next.funds -= signingFee;
  next.staff = [...next.staff, { ...cand, hired: true }];
  next.candidates = next.candidates.filter(c => c.id !== candidateId);
  next = logged(next, { kind: 'good',
    text: `Hired ${cand.name} as ${ROLE_LABEL[cand.role]} (${money(cand.wage)}/week).` });
  return { state: next };
}

/** Dismiss a hired staff member — their wage stops next week. */
export function dismissStaff(s: GameState, staffId: string): Result {
  const m = s.staff.find(x => x.id === staffId);
  if (!m) return { state: s, error: 'No such staff member.' };
  let next = fork(s);
  next.staff = next.staff.filter(x => x.id !== staffId);
  next = logged(next, { kind: 'note',
    text: `${m.name} has left the museum's employ.` });
  return { state: next };
}

/* --- expeditions ------------------------------------------- */
/* An expedition is commissioned with a kind, a style (must be a
   researched specialty), a budget, and optionally an explorer to
   lead it. It runs EXPEDITION_WEEKS weeks, then yields a set of
   works whose rarity is shaped by the budget. A bigger budget
   tilts the odds toward rarer finds; a leading explorer tilts
   them further and softens the cost of an incident. */

/** the rarity-band odds (Common..Legend) for a given budget.
 *  Returns weights summing to ~100. A small budget is almost all
 *  Common; a vast budget can turn up Epic and even Legend. World
 *  Icons never appear — they are reserved for another system. */
export function expeditionOdds(budget: number, explorerSkill = 0):
  number[] {
  // anchor points the brief gave, interpolated by budget:
  //   ~5k    -> [95, 5, 0, 0, 0]
  //   ~1m    -> [40, 30, 15, 12, 3]
  const lo = [95, 5, 0, 0, 0];
  const hi = [40, 30, 15, 12, 3];
  // log-scaled position between 5k and 1m
  const t = Math.max(0, Math.min(1,
    (Math.log10(Math.max(5000, budget)) - Math.log10(5000)) /
    (Math.log10(1000000) - Math.log10(5000))));
  // explorer skill nudges the position upward a little
  const tt = Math.min(1, t + explorerSkill * 0.05);
  const w = lo.map((l, i) => l + (hi[i] - l) * tt);
  return w;
}

/** roll one artifact id of a given style using band odds.
 *  Bands: 0 Common 1 Uncommon 2 Rare 3 Epic 4 Legend. */
function rollFind(
  style: StyleId, odds: number[], owned: Set<string>,
): string | null {
  const total = odds.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let band = 0;
  for (let i = 0; i < odds.length; i++) {
    if (r < odds[i]) { band = i; break; }
    r -= odds[i];
  }
  const inBand = (sc: number) =>
    band === 0 ? sc < 10 : band === 1 ? sc >= 10 && sc < 20
      : band === 2 ? sc >= 20 && sc < 50 : band === 3 ? sc >= 50 && sc < 100
      : sc >= 100 && sc < 200;
  // prefer unowned works of the style in that band; widen if none
  let pool = ARTIFACTS.filter(a =>
    a.style === style && !owned.has(a.id) && inBand(a.score));
  if (pool.length === 0)
    pool = ARTIFACTS.filter(a =>
      a.style === style && !owned.has(a.id) && a.score < 200);
  if (pool.length === 0) return null;
  return pool[randInt(0, pool.length - 1)].id;
}

/** explorers currently free to lead an expedition (not already
 *  leading one). */
export function freeExplorers(s: GameState): StaffMember[] {
  const busy = new Set(
    s.expeditions.filter(e => !e.resolved && e.leaderId)
      .map(e => e.leaderId));
  return s.staff.filter(m => m.role === 'explorer' && !busy.has(m.id));
}

/** Commission an expedition. The budget is spent immediately. */
export function commissionExpedition(
  s: GameState, kind: ExpeditionKind, style: StyleId,
  budget: number, leaderId: string | null,
): Result {
  const def = EXPEDITION_KINDS.find(k => k.id === kind);
  if (!def) return { state: s, error: 'Unknown expedition type.' };
  if (!s.specialties.includes(style))
    return { state: s, error: 'You can only seek a style you have researched.' };
  if (budget < def.minBudget)
    return { state: s, error: `A ${def.name} needs at least ${money(def.minBudget)}.` };
  if (s.funds < budget)
    return { state: s, error: 'You cannot afford that budget.' };
  if (leaderId && !freeExplorers(s).some(m => m.id === leaderId))
    return { state: s, error: 'That leader is not available.' };

  const leader = leaderId ? s.staff.find(m => m.id === leaderId) : null;
  const explorerSkill = leader ? leader.skill : 0;

  // decide the outcome now; it is revealed when the player resolves it
  const incident = Math.random() < EXPEDITION_INCIDENT_CHANCE
    // a strong leader can avert an incident
    && Math.random() > explorerSkill * 0.15;
  const odds = expeditionOdds(budget, explorerSkill);
  // how many works: budget and leader raise the count; an incident cuts it
  let finds = 1 + Math.floor(Math.log10(Math.max(5000, budget)) - 3.4)
    + (explorerSkill > 0 ? 1 : 0);
  finds = Math.max(1, finds);
  if (incident) finds = Math.max(1, finds - 1);

  const owned = new Set(s.owned);
  const foundIds: string[] = [];
  for (let i = 0; i < finds; i++) {
    const id = rollFind(style, odds, owned);
    if (id) { foundIds.push(id); owned.add(id); }
  }

  let next = fork(s);
  next.funds -= budget;
  next.expeditions = [...next.expeditions, {
    id: uid('exp'),
    kind, style, budget, leaderId,
    weeksLeft: EXPEDITION_WEEKS,
    incident,
    foundIds,
    resolved: false,
  }];
  next = logged(next, { kind: 'good',
    text: `Commissioned a ${def.name} seeking ${STYLES[style].name} works `
      + `(${money(budget)}, ${EXPEDITION_WEEKS} weeks).` });
  return { state: next };
}

/** expeditions whose timer has run out and await the result game */
export function expeditionsReady(s: GameState): Expedition[] {
  return s.expeditions.filter(e => !e.resolved && e.weeksLeft <= 0);
}
/** expeditions still in progress */
export function expeditionsActive(s: GameState): Expedition[] {
  return s.expeditions.filter(e => !e.resolved && e.weeksLeft > 0);
}

/** Claim the works the player matched in the result mini-game.
 *  `claimedIds` are the ids successfully matched. */
export function resolveExpedition(
  s: GameState, expeditionId: string, claimedIds: string[],
): Result {
  const exp = s.expeditions.find(e => e.id === expeditionId);
  if (!exp) return { state: s, error: 'No such expedition.' };
  if (exp.resolved) return { state: s, error: 'Already resolved.' };
  let next = fork(s);
  // only ids that were actually part of the find can be claimed
  const valid = claimedIds.filter(id => exp.foundIds.includes(id)
    && !next.owned.includes(id));
  for (const id of valid) {
    next.owned.push(id);
    const art = ARTIFACT_BY_ID[id];
    const fameGain = Math.max(1, Math.round(art.score * 0.3));
    next.fame += fameGain;
    next.expertise[art.style] = Math.min(5,
      +(((next.expertise[art.style] || 0) + 0.2 + art.score / 500)).toFixed(2));
  }
  next.expeditions = next.expeditions.map(e =>
    e.id === expeditionId ? { ...e, resolved: true } : e);
  const kindName = EXPEDITION_KINDS.find(k => k.id === exp.kind)?.name
    || 'expedition';
  next = logged(next, {
    kind: valid.length > 0 ? 'good' : 'note',
    text: valid.length > 0
      ? `The ${kindName} returned with ${valid.length} work(s) for the collection.`
      : `The ${kindName} returned, but nothing was secured.`,
  });
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

/** placed-artifact count */
export function placedCount(s: GameState): number {
  return s.rooms.reduce((n, r) => n + r.items.length, 0);
}

/* --- VISITORS: an incremental, diminishing-returns model ----
   Each artwork on display draws its own small crowd of DAILY
   visitors, scaled by quality (score) and type. Successive works
   add less than the first — the 2nd ~80%, 3rd ~65%, and so on —
   so three Commons draw roughly twelve extra a day, not fifteen.
   Per-week takings then carry weekly noise.

   BALANCE ANCHORS (tuned to the design brief):
     * 0 items  -> 0 visitors
     * the starter Uncommon  -> revenue roughly covers upkeep
     * each added Common     -> ~5 extra visitors/day at first,
       repaying a ~2-4k Common in about ten weeks, faster as the
       collection grows
   Daily-visitor scale, by ambition: a strong local museum tops out
   around 500/day; regional and national institutions far beyond. */

const TYPE_DRAW: Record<string, number> = {
  Painting: 1.15, Sculpture: 1.05, Object: 0.95, Manuscript: 0.85,
};

/** per-artwork DAILY visitor pull, before diminishing returns.
 *  A score-0 Common pulls a handful a day; an Uncommon noticeably
 *  more; a Legend draws a real crowd. Type nudges it a little. */
function artifactDailyDraw(id: string): number {
  const a = ARTIFACT_BY_ID[id];
  const typeMult = TYPE_DRAW[a.type] ?? 1;
  // base 4/day + score scaling; Common ~4-7, Uncommon ~9-13,
  // Rare ~15-28, Epic/Legend climbing well past that.
  return (4 + a.score * 0.85) * typeMult;
}

/** the museum's expected DAILY visitors — incremental with
 *  diminishing returns on each successive (lower-ranked) work. */
export function dailyVisitors(s: GameState): number {
  const draws: number[] = [];
  for (const r of s.rooms)
    for (const id of r.items) draws.push(artifactDailyDraw(id));
  if (draws.length === 0) return 0;

  // best pieces count fullest; each next piece is worth a little
  // less — the 2nd ~85%, 3rd ~72%, 4th ~61% — so three Commons add
  // roughly twelve a day rather than fifteen.
  draws.sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < draws.length; i++) {
    const dimin = Math.max(0.5, Math.pow(0.85, i));
    total += draws[i] * dimin;
  }
  // fame and completed rooms lift the daily figure too
  total += s.fame * 0.5;
  total += s.rooms.filter(roomIsFull).length * 7;
  // a curator makes the museum a draw in its own right
  total += roleSkill(s, 'curator') * 14;
  return total * BUILDINGS[s.buildingId].prestige;
}

/** weekly visitors — six open days, shaped by ticket-price demand
 *  and weekly noise. Higher prices suppress demand past a fair
 *  point that itself rises with how strong the museum is. */
export function computeVisitors(s: GameState): number {
  const perDay = dailyVisitors(s);
  if (perDay <= 0) return 0;

  // a fair admission rises only gently with the museum's draw, so
  // adding works grows visitors rather than throttling them.
  const fairPrice = 7 + perDay / 70;
  const ratio = s.ticket / Math.max(1, fairPrice);
  let demandMult: number;
  if (ratio <= 1) demandMult = 1.12 - ratio * 0.12;     // 1.12 .. 1.0
  else demandMult = Math.exp(-(ratio - 1) * 1.05);      // softer falloff

  let weekly = perDay * 6 * demandMult;                 // six open days
  if (s.adWeeksLeft > 0) weekly *= AD_CAMPAIGN.visitorMult;
  weekly *= rand(0.85, 1.15);                           // weekly noise
  return Math.max(0, Math.round(weekly));
}

/* weekly revenue. Effective take per visitor is the ticket plus a
   gift-shop / extras fraction — about §3 on top of a typical §5
   ticket. Tuned so the starter Uncommon roughly meets upkeep and
   each cheap Common pays itself back over about ten weeks. */
export function computeRevenue(s: GameState): number {
  const visitors = computeVisitors(s);
  return Math.round(visitors * (s.ticket + 3));
}

/** weekly expenses = building maintenance + staff wages */
export function computeExpenses(s: GameState): number {
  return BUILDINGS[s.buildingId].maintenance + weeklyWages(s);
}

/* --- rankings ---------------------------------------------- */
/** the player as a rankable museum-like record */
export function playerVisitorsEstimate(s: GameState): number {
  return computeVisitors(s);
}

/* --- advance one week -------------------------------------- */
export function advanceWeek(s: GameState): GameState {
  let next = fork(s);

  // research progress
  if (next.research) {
    const left = next.research.weeksLeft - 1;
    if (left <= 0) {
      const sp = next.research.style;
      next.specialties.push(sp);
      next.expertise[sp] = Math.max(next.expertise[sp] || 0, 0.5);
      next.rooms = next.rooms.map(r =>
        r.researching && r.researching.style === sp
          ? { ...r, researching: null, theme: sp } : r);
      next.research = null;
      next = logged(next, { kind: 'good',
        text: `Research complete — ${STYLES[sp].name} is now a specialty.` });
    } else {
      next.research = { ...next.research, weeksLeft: left };
      next.rooms = next.rooms.map(r => r.researching
        ? { ...r, researching: { ...r.researching, weeksLeft: left } } : r);
    }
  }

  // sponsor weekly fame
  next.fame += next.sponsors.reduce((acc, sp) => acc + sp.weeklyBonus, 0);
  // a curator builds the museum's reputation week on week
  next.fame += roleSkill(next, 'curator') * 2;

  // expeditions count down; when one reaches zero it awaits its
  // result mini-game on the Week tab.
  next.expeditions = next.expeditions.map(e => {
    if (e.resolved || e.weeksLeft <= 0) return e;
    const left = e.weeksLeft - 1;
    return { ...e, weeksLeft: left };
  });
  for (const e of next.expeditions) {
    if (!e.resolved && e.weeksLeft === 0) {
      const kindName = EXPEDITION_KINDS.find(k => k.id === e.kind)?.name
        || 'expedition';
      next = logged(next, { kind: 'note',
        text: `Your ${kindName} has returned — check its result on the Week tab.` });
    }
  }

  // economy: revenue in, expenses out — both recorded for display
  const revenue = computeRevenue(next);
  const expenses = computeExpenses(next);
  next.funds += revenue - expenses;
  next.lastRevenue = revenue;
  next.lastExpenses = expenses;
  if (revenue - expenses < 0) {
    next = logged(next, { kind: 'bad',
      text: `A lean week: ${money(revenue)} earned, ${money(expenses)} in upkeep.` });
  }

  // advertising countdown
  if (next.adWeeksLeft > 0) next.adWeeksLeft -= 1;

  // refresh the recruit pool every fourth week, or if it has run dry
  if (next.candidates.length === 0 || next.week % 4 === 0) {
    next.candidates = makeCandidates();
  }

  // the three rival players grow each week
  next.rivals = next.rivals.map(r => {
    const lead = r.fame - next.fame;
    const fg = lead > 50 ? randInt(0, 2)
      : lead > 0 ? randInt(2, 5)
      : randInt(3, 7);
    return {
      ...r,
      fame: r.fame + fg,
      quality: r.quality + randInt(3, 9),
      visitors: Math.max(0, r.visitors + randInt(-40, 120)),
    };
  });

  // record a snapshot of the week that just finished, for the
  // Manage chart. Keep the most recent 12 (the chart shows 10).
  next.history = [
    ...next.history,
    {
      week: s.week,
      dailyVisitors: Math.round(dailyVisitors(next)),
      fame: next.fame,
      quality: museumQuality(next),
    },
  ].slice(-12);

  next.week += 1;
  next.events = [];
  next.activeEvent = null;
  next.auction = null;

  // open-ended play — no week cap. Detect newly unlocked auction
  // houses and announce them.
  for (const h of AUCTION_HOUSES) {
    if (next.fame >= h.fameToUnlock && h.fameToUnlock > 0
        && !next.joinedHouses.includes(h.id)
        && s.fame < h.fameToUnlock) {
      next = logged(next, { kind: 'good',
        text: `Your fame opens the doors of ${h.name} — join it from the Week tab.` });
    }
  }

  next.events = rollEvents(next);
  return next;
}

/* --- final score ------------------------------------------- */
export interface FinalScore {
  score: number; grade: string;
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
  return { score, grade, quality, completeRooms, collValue };
}

/* re-exports the UI leans on */
export { STYLES, STYLE_IDS, BUILDINGS, rarityForScore };
export { BUILDING_ORDER as BUILDING_ORDER_PUBLIC } from '../data/constants';
