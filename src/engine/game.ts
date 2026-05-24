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
  GameState, StyleId, Room, GameEvent, LogEntry, RivalPlayer,
  StaffMember, StaffRole, Expedition, ExpeditionTier, Museum,
} from '../data/types';
import {
  STYLES, STYLE_IDS, BUILDINGS, BUILDING_ORDER, ROOM_CAPACITY,
  RESEARCH_TIERS, AD_CAMPAIGN, START, RIVAL_NAMES, AUCTION_HOUSES,
  EXPEDITION_TIERS, EXPEDITION_WEEKS, SUMMON_COST,
  rarityForScore,
} from '../data/constants';
import type { AuctionHouseDef } from '../data/constants';
import type { PurchaseOutcome as BMPurchaseOutcome } from './blackmarket';
import { ARTIFACTS, ARTIFACT_BY_ID } from '../data/artifacts';
import { randInt, rand, money, uid, gaussian } from './util';

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

/* --- museum helpers ---------------------------------------- */
let museumCounter = 0;
/** build a fresh museum in a given building */
export function makeMuseum(buildingId: string, name: string): Museum {
  return {
    id: 'museum_' + (museumCounter++),
    name,
    buildingId,
    rooms: makeRooms(buildingId),
    fame: 0,
    ticket: START.defaultTicket,
    sponsors: [],
    wingNames: {},
    adWeeksLeft: 0,
    loans: [],
    open: true,
  };
}
/** the museum the player is currently viewing/managing */
export function activeMuseum(s: GameState): Museum {
  return s.museums.find(m => m.id === s.activeMuseumId)
    || s.museums.find(m => m.open)
    || s.museums[0];
}
/** the museum with a given id (falls back to the active one) */
export function museumById(s: GameState, id: string): Museum {
  return s.museums.find(m => m.id === id) || activeMuseum(s);
}
/** every open museum */
export function openMuseums(s: GameState): Museum[] {
  return s.museums.filter(m => m.open);
}
/** combined fame across all open museums */
export function totalFame(s: GameState): number {
  return openMuseums(s).reduce((acc, m) => acc + m.fame, 0);
}

/* --- fresh game -------------------------------------------- */
export function newGame(): GameState {
  const first = makeMuseum('local', '');
  return {
    playerName: '',
    galleryName: '',
    funds: START.funds,
    week: 1,
    specialties: [],
    research: null,
    expertise: {},
    museums: [first],
    activeMuseumId: first.id,
    owned: [],
    rivals: makeRivals(),
    log: [],
    events: [],
    activeEvent: null,
    auction: null,
    pendingItemId: null,
    lastRevenue: 0,
    lastExpenses: 0,
    joinedHouses: ['house1'],   // the free starter house is joined by default
    history: [],
    staff: [],
    candidates: makeCandidates(),
    expeditions: [],
    shards: {},
    galaPending: false,
    blackMarketPending: false,
    restorationOwed: {},
    stolenUndeclared: {},
    salvageOnly: [],
    phase: 'choose-specialty',
  };
}

/* --- helpers ----------------------------------------------- */
export const roomIsFull = (r: Room) => r.items.length >= ROOM_CAPACITY;
export const roomReady = (r: Room) => r.unlocked && !r.researching;
export const canPlace = (r: Room, style: StyleId) =>
  roomReady(r) && r.theme === style && !roomIsFull(r);
export const hasOpenSlotFor = (s: GameState, style: StyleId) =>
  activeMuseum(s).rooms.some(r => canPlace(r, style));

function logged(s: GameState, entry: LogEntry): GameState {
  return { ...s, log: [entry, ...s.log].slice(0, 60) };
}
function fork(s: GameState): GameState {
  return {
    ...s,
    museums: s.museums.map(m => ({
      ...m,
      rooms: m.rooms.map(r => ({ ...r, items: [...r.items] })),
      sponsors: m.sponsors.map(sp => ({ ...sp })),
      wingNames: { ...m.wingNames },
      loans: m.loans.map(l => ({ ...l })),
    })),
    expertise: { ...s.expertise },
    specialties: [...s.specialties],
    owned: [...s.owned],
    rivals: s.rivals.map(r => ({ ...r })),
    log: [...s.log],
    staff: s.staff.map(m => ({ ...m })),
    candidates: s.candidates.map(m => ({ ...m })),
    expeditions: s.expeditions.map(e => ({ ...e })),
    shards: { ...s.shards },
    restorationOwed: { ...(s.restorationOwed || {}) },
    stolenUndeclared: { ...(s.stolenUndeclared || {}) },
    salvageOnly: [...(s.salvageOnly || [])],
  };
}

/* --- founding specialty + naming --------------------------- */
/** Pick the founding style. Moves to the name-gallery phase. */
export function chooseSpecialty(s: GameState, style: StyleId): GameState {
  const next = fork(s);
  next.specialties = [style];
  next.expertise[style] = 0.5;
  next.phase = 'name-gallery';
  const first = activeMuseum(next).rooms.find(r => r.unlocked);
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
export function chooseFoundingArtwork(
  s: GameState, artId: string, allChoices?: string[],
): GameState {
  const art = ARTIFACT_BY_ID[artId];
  if (!art) return s;
  const next = fork(s);
  next.specialties = [art.style];
  next.expertise[art.style] = 0.5;
  next.owned = [artId];
  next.pendingItemId = artId;          // placed during/after onboarding
  next.phase = 'name-gallery';
  const first = activeMuseum(next).rooms.find(r => r.unlocked);
  if (first) first.theme = art.style;
  // the heirloom works the player did NOT pick pass to the cousins
  // — each cousin's starting strength reflects the piece they took.
  if (allChoices && allChoices.length) {
    const taken = allChoices.filter(id => id !== artId);
    next.rivals = next.rivals.map((r, i) => {
      const heirloom = taken[i] ? ARTIFACT_BY_ID[taken[i]] : null;
      if (!heirloom) return r;
      return {
        ...r,
        // a cousin who inherited a finer piece starts a touch stronger
        fame: r.fame + Math.round(heirloom.score * 0.4),
        quality: r.quality + heirloom.score,
        heirloomId: heirloom.id,
      };
    });
  }
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
  next.phase = 'playing';
  const mus = activeMuseum(next);
  mus.name = next.galleryName;
  mus.ticket = Math.max(0, Math.round(ticket));
  next.log = [{ kind: 'good',
    text: `${next.galleryName} opens its doors — a ${STYLES[next.specialties[0]].name} gallery.` }];
  // hang the founding artwork on the wall of the starter room
  if (next.pendingItemId) {
    const art = ARTIFACT_BY_ID[next.pendingItemId];
    const room = mus.rooms.find(r => canPlace(r, art.style));
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
/** the flat research fee, after a "thrifty" researcher's discount
 *  (up to 40% off, scaling with the thrifty researcher's skill). */
export function researchFee(s: GameState): number {
  const thrifty = specialtySkill(s, 'thrifty');
  const discount = Math.min(0.4, thrifty * 0.14);
  return Math.round(2000 * (1 - discount));
}
export function canResearch(s: GameState):
  { ok: boolean; reason?: string } {
  if (s.research) return { ok: false, reason: 'Research already in progress.' };
  const tier = researchTier(s);
  if (!tier) return { ok: false, reason: 'All specialties unlocked.' };
  if (!hasRole(s, 'researcher'))
    return { ok: false, reason: 'You must employ a Researcher to research a new style.' };
  if (s.funds < researchFee(s))
    return { ok: false, reason: `Requires a ${money(researchFee(s))} research fee.` };
  return { ok: true };
}
export function startResearch(s: GameState, style: StyleId): Result {
  const chk = canResearch(s);
  if (!chk.ok) return { state: s, error: chk.reason };
  if (s.specialties.includes(style))
    return { state: s, error: 'Already a specialty.' };
  // a "swift" researcher shortens the work by up to a week
  const swift = specialtySkill(s, 'swift');
  const weeks = Math.max(2, randInt(3, 4) - (swift >= 2 ? 1 : 0));
  let next = fork(s);
  next.funds -= researchFee(s);
  next.research = { style, weeksLeft: weeks };
  next = logged(next, { kind: 'good',
    text: `Began researching ${STYLES[style].name} (${weeks} weeks). `
      + 'Theme any open room to it once complete.' });
  return { state: next };
}

/* --- rooms ------------------------------------------------- */
export function openRoom(s: GameState): Result {
  const locked = activeMuseum(s).rooms.find(r => !r.unlocked);
  if (!locked) return { state: s, error: 'This building has no further rooms.' };
  if (s.funds < START.roomCost)
    return { state: s, error: 'Not enough funds to open a room.' };
  let next = fork(s);
  next.funds -= START.roomCost;
  const oMus = activeMuseum(next);
  oMus.rooms = oMus.rooms.map(r =>
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
  const room = activeMuseum(s).rooms.find(r => r.id === roomId);
  if (!room || !room.unlocked || room.theme || room.researching)
    return { state: s, error: 'That room cannot be assigned.' };
  let next = fork(s);
  const aMus = activeMuseum(next);
  aMus.rooms = aMus.rooms.map(r =>
    r.id === roomId ? { ...r, theme: style } : r);
  next = logged(next, { kind: 'good',
    text: `Assigned ${STYLES[style].name} to a room.` });
  return { state: next };
}

/* --- buildings --------------------------------------------- */
export function nextBuilding(s: GameState): string | null {
  const i = BUILDING_ORDER.indexOf(activeMuseum(s).buildingId);
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
  const mvMus = activeMuseum(next);
  mvMus.buildingId = buildingId;
  mvMus.rooms = rooms;
  mvMus.wingNames = {};
  next = logged(next, { kind: 'good',
    text: `Moved ${mvMus.name} to the ${b.name}.` });
  return { state: next };
}

/* --- multiple museums -------------------------------------- */
/** Open a NEW museum in a building. Costs that building's move-in
 *  fee. The new museum starts empty and becomes the active one.
 *  The collection is shared, so works can be moved into it. */
export function openMuseumAt(
  s: GameState, buildingId: string, name: string,
): Result {
  const b = BUILDINGS[buildingId];
  if (!b) return { state: s, error: 'Unknown building.' };
  if (s.funds < b.moveCost)
    return { state: s, error: `Opening a museum here costs ${money(b.moveCost)}.` };
  const cleanName = name.trim() || `${b.name}`;
  let next = fork(s);
  next.funds -= b.moveCost;
  const museum = makeMuseum(buildingId, cleanName);
  next.museums = [...next.museums, museum];
  next.activeMuseumId = museum.id;
  next = logged(next, { kind: 'good',
    text: `Opened a new museum — ${cleanName} — in the ${b.name} `
      + `(${money(b.moveCost)}).` });
  return { state: next };
}

/** Close a museum. Its rooms close and upkeep stops. Art on its
 *  walls returns to the collection, unplaced. Loans there end —
 *  the works go back to their lenders (a loan, once ended, cannot
 *  be re-hung). At least one museum must remain open. */
export function closeMuseum(s: GameState, museumId: string): Result {
  const target = s.museums.find(m => m.id === museumId);
  if (!target) return { state: s, error: 'No such museum.' };
  if (!target.open) return { state: s, error: 'That museum is already closed.' };
  if (openMuseums(s).length <= 1)
    return { state: s, error: 'You cannot close your only open museum.' };

  let next = fork(s);
  const m = next.museums.find(mm => mm.id === museumId)!;
  // owned works on its walls simply leave display — still owned
  const ownedOnWalls = m.rooms.flatMap(r =>
    r.items.filter(id => next.owned.includes(id)));
  // its loans end and are returned to lenders
  const endedLoans = m.loans.length;
  m.loans = [];
  m.rooms = m.rooms.map(r => ({ ...r, items: [] }));
  m.open = false;
  // if the closed museum was active, switch to another open one
  if (next.activeMuseumId === museumId) {
    const other = next.museums.find(mm => mm.open);
    if (other) next.activeMuseumId = other.id;
  }
  next = logged(next, { kind: 'note',
    text: `${m.name} has closed. ${ownedOnWalls.length} work(s) returned `
      + `to your collection`
      + (endedLoans > 0
        ? `; ${endedLoans} loan(s) ended and were returned to their lenders.`
        : '.') });
  return { state: next };
}

/** Switch which museum is being viewed/managed. */
export function switchMuseum(s: GameState, museumId: string): GameState {
  const m = s.museums.find(mm => mm.id === museumId);
  if (!m || !m.open) return s;
  return { ...s, activeMuseumId: museumId };
}

/** Rename a museum. */
export function renameMuseum(
  s: GameState, museumId: string, name: string,
): GameState {
  const clean = name.trim();
  if (!clean) return s;
  const next = fork(s);
  const m = next.museums.find(mm => mm.id === museumId);
  if (m) m.name = clean;
  return next;
}

/** Rename a wing of a museum. An empty name clears the custom
 *  name, reverting to the building's default wing name. */
export function renameWing(
  s: GameState, museumId: string, hallId: string, name: string,
): GameState {
  const next = fork(s);
  const m = next.museums.find(mm => mm.id === museumId);
  if (!m) return s;
  const clean = name.trim();
  m.wingNames = { ...m.wingNames };
  if (clean) m.wingNames[hallId] = clean;
  else delete m.wingNames[hallId];
  return next;
}

/** The fame bonus a wing earns for thematic cohesion: the more
 *  of its OPEN rooms share a single style, the higher the bonus.
 *  A wing entirely devoted to one style is the strongest. */
export function wingCohesionBonus(museum: Museum, hallId: string): number {
  const rooms = museum.rooms.filter(r => r.hallId === hallId && r.unlocked);
  if (rooms.length < 2) return 0;
  // count rooms per style; the dominant style drives the bonus
  const byStyle: Record<string, number> = {};
  for (const r of rooms)
    if (r.theme) byStyle[r.theme] = (byStyle[r.theme] || 0) + 1;
  const top = Math.max(0, ...Object.values(byStyle));
  if (top < 2) return 0;
  // 2 same-style rooms -> +6, 3 -> +14, 4 -> +24, 5 -> +36 ...
  return top * (top - 1) * 3;
}
/** total wing-cohesion fame across all of a museum's wings */
export function museumCohesionBonus(museum: Museum): number {
  const hallIds = [...new Set(museum.rooms.map(r => r.hallId))];
  return hallIds.reduce((a, h) => a + wingCohesionBonus(museum, h), 0);
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
  return AUCTION_HOUSES.filter(h => totalFame(s) >= h.fameToUnlock);
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
  if (totalFame(s) < h.fameToUnlock)
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
    activeMuseum(next).fame += fameGain;
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
  // forgeries are salvage-only — they can never hang on a wall
  if (s.salvageOnly.includes(art.id))
    return { state: s,
      error: 'A forgery cannot be exhibited — it can only be sold.' };
  // an altered work must be restored, a stolen work declared, first
  if (s.restorationOwed[art.id])
    return { state: s,
      error: 'This work must be restored before it can be exhibited.' };
  if (s.stolenUndeclared[art.id])
    return { state: s,
      error: 'This work must be declared before it can be exhibited.' };
  const room = activeMuseum(s).rooms.find(r => r.id === roomId);
  if (!room || !canPlace(room, art.style))
    return { state: s, error: 'That room cannot take this work.' };
  let next = fork(s);
  const pMus = activeMuseum(next);
  pMus.rooms = pMus.rooms.map(r =>
    r.id === roomId ? { ...r, items: [...r.items, art.id] } : r);
  next.pendingItemId = null;
  next = logged(next, { kind: 'good',
    text: `Placed ${art.name} in a ${STYLES[art.style].name} room.` });
  const filled = activeMuseum(next).rooms.find(r => r.id === roomId)!;
  if (roomIsFull(filled)) {
    const quality = filled.items.reduce(
      (acc, id) => acc + ARTIFACT_BY_ID[id].score, 0);
    const bonus = 20 + Math.round(quality * 0.18);
    activeMuseum(next).fame += bonus;
    next = logged(next, { kind: 'good',
      text: `Completed a ${STYLES[filled.theme!].name} room — +${bonus} fame.` });
  }
  return { state: next };
}

/** Take an artwork off its wall and back into the private
 *  collection. The work stays owned — it just leaves display. */
export function removeArtifact(s: GameState, artId: string): Result {
  const room = activeMuseum(s).rooms.find(r => r.items.includes(artId));
  if (!room) return { state: s, error: 'That work is not on display.' };
  const art = ARTIFACT_BY_ID[artId];
  let next = fork(s);
  const rmMus = activeMuseum(next);
  rmMus.rooms = rmMus.rooms.map(r =>
    r.id === room.id ? { ...r, items: r.items.filter(id => id !== artId) } : r);
  next = logged(next, { kind: 'note',
    text: `Moved ${art.name} into the private collection.` });
  return { state: next };
}

/** What a quick private sale pays — a flat 70% of catalogue value. */
export function quickSellPrice(artId: string): number {
  return Math.round(ARTIFACT_BY_ID[artId].value * 0.7);
}

/** Remove an owned work from the collection entirely — taken off
 *  any wall and removed from `owned`. Shared by both sell paths. */
function deaccession(s: GameState, artId: string): GameState {
  const next = fork(s);
  next.owned = next.owned.filter(id => id !== artId);
  for (const m of next.museums) {
    m.rooms = m.rooms.map(r =>
      r.items.includes(artId)
        ? { ...r, items: r.items.filter(id => id !== artId) } : r);
  }
  return next;
}

/** Sell a work immediately for a guaranteed 70% of its value. */
export function quickSellArtifact(s: GameState, artId: string): Result {
  if (!s.owned.includes(artId))
    return { state: s, error: 'You do not own that work.' };
  const art = ARTIFACT_BY_ID[artId];
  const price = quickSellPrice(artId);
  let next = deaccession(s, artId);
  next.funds += price;
  next = logged(next, { kind: 'good',
    text: `Sold ${art.name} privately for ${money(price)}.` });
  return { state: next };
}

/** Consign a work to auction — the hammer price is random, a
 *  normal-ish spread from 60% to 140% of value, centred near 100%.
 *  A gamble against the certain 70% of a quick sale. */
export function auctionSellArtifact(s: GameState, artId: string): Result {
  if (!s.owned.includes(artId))
    return { state: s, error: 'You do not own that work.' };
  const art = ARTIFACT_BY_ID[artId];
  // gaussian() is ~[-1,1] centred 0 -> map to 0.6..1.4 centred 1.0
  const factor = 1 + gaussian() * 0.4;
  const price = Math.round(art.value * Math.max(0.6, Math.min(1.4, factor)));
  let next = deaccession(s, artId);
  next.funds += price;
  const pct = Math.round((price / art.value) * 100);
  next = logged(next, {
    kind: pct >= 100 ? 'good' : 'note',
    text: `${art.name} sold at auction for ${money(price)} (${pct}% of value).`,
  });
  return { state: next };
}

/* --- management: tickets, sponsors, advertising ------------ */
/** Set the ticket price (any currency amount). Changeable any time. */
export function setTicket(
  s: GameState, price: number, museumId?: string,
): GameState {
  let next = fork(s);
  const mus = museumId ? museumById(next, museumId) : activeMuseum(next);
  mus.ticket = Math.max(0, Math.round(price));
  next = logged(next, { kind: 'note',
    text: `${mus.name}: ticket price set to ${money(mus.ticket)}.` });
  return next;
}

/* --- sponsors: term-based building & wing sponsorships ------
   A sponsor firm backs a museum's building, or one of its wings,
   for a fixed term (26 or 52 weeks), paying weekly. The pay scales
   with the museum's fame and quality — a strong museum attracts
   richer backing. A 52-week term pays more in total than two
   26-week terms would, and saves re-courting. While sponsored,
   the building or wing bears the sponsor's name. */

/** the pool of sponsor firms a museum can court */
const SPONSOR_FIRMS = [
  'The Aldermoor Trust', 'House of Castellan', 'The Verrane Endowment',
  'Pemberton & Reece', 'The Hallowell Foundation', 'Granby Industries',
  'The Marchpane Society', 'Ostend Maritime', 'The Calloway Bequest',
  'Thornquist Holdings',
];

/** the weekly pay a sponsorship offers, scaling with the museum's
 *  fame and quality. Building sponsorship pays more than a wing. */
export function sponsorWeeklyPay(
  s: GameState, museumId: string, scope: 'building' | 'wing',
  termWeeks: number,
): number {
  const mus = museumById(s, museumId);
  const quality = museumQuality(s, museumId);
  // a base that grows with the museum's standing
  const base = 300 + mus.fame * 4 + quality * 1.5;
  const scopeMult = scope === 'building' ? 1.0 : 0.55;
  // a 52-week term pays a little more per week than a 26 — loyalty
  const termMult = termWeeks >= 52 ? 1.15 : 1.0;
  return Math.round(base * scopeMult * termMult);
}

/** Is a scope available to sponsor on a museum? A building can
 *  hold one building sponsor; each wing one wing sponsor. */
export function canSponsor(
  s: GameState, museumId: string, scope: 'building' | 'wing',
  hallId: string | null,
): { ok: boolean; reason?: string } {
  const mus = museumById(s, museumId);
  if (scope === 'building') {
    if (mus.sponsors.some(sp => sp.scope === 'building'))
      return { ok: false, reason: 'The building already has a sponsor.' };
  } else {
    if (!hallId) return { ok: false, reason: 'No wing chosen.' };
    if (mus.sponsors.some(sp => sp.scope === 'wing' && sp.hallId === hallId))
      return { ok: false, reason: 'That wing already has a sponsor.' };
  }
  return { ok: true };
}

/** Court a sponsor for a museum's building or a wing, for a term
 *  of 26 or 52 weeks. The sponsor names the space and pays weekly
 *  until the term runs out. */
export function courtSponsor(
  s: GameState, museumId: string, scope: 'building' | 'wing',
  hallId: string | null, termWeeks: number, firmName: string,
): Result {
  const chk = canSponsor(s, museumId, scope, hallId);
  if (!chk.ok) return { state: s, error: chk.reason };
  const term = termWeeks >= 52 ? 52 : 26;
  const pay = sponsorWeeklyPay(s, museumId, scope, term);
  let next = fork(s);
  const mus = museumById(next, museumId);
  const sponsor = {
    id: uid('spon'),
    name: firmName,
    scope, hallId: scope === 'wing' ? hallId : null,
    termWeeks: term, weeksLeft: term, weeklyPay: pay,
  };
  mus.sponsors = [...mus.sponsors, sponsor];
  // the sponsor names the space, with a scope suffix —
  // "Granby Industries Gallery", "The Hallowell Foundation Wing"
  if (scope === 'wing' && hallId) {
    mus.wingNames = { ...mus.wingNames, [hallId]: `${firmName} Wing` };
  } else if (scope === 'building') {
    mus.name = `${firmName} Gallery`;
  }
  next = logged(next, { kind: 'good',
    text: `${firmName} will sponsor ${scope === 'building'
      ? mus.name : 'a wing of ' + mus.name} for ${term} weeks `
      + `(${money(pay)}/week).` });
  return { state: next };
}

/** sponsor firms not already backing this museum */
export function availableFirms(s: GameState, museumId: string): string[] {
  const mus = museumById(s, museumId);
  const taken = new Set(mus.sponsors.map(sp => sp.name));
  return SPONSOR_FIRMS.filter(f => !taken.has(f));
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

/* the three specialties available to each role, with a label and
   a one-line description of the effect. */
export const STAFF_SPECIALTIES: Record<StaffRole, {
  id: import('../data/types').StaffSpecialty; label: string; effect: string;
}[]> = {
  researcher: [
    { id: 'basic', label: 'Junior Researcher',
      effect: 'Enables research — no frills, but cheap to keep.' },
    { id: 'thrifty', label: 'Resourceful Researcher',
      effect: 'Cuts the fee of every research project.' },
    { id: 'swift', label: 'Brilliant Researcher',
      effect: 'Shortens research by a week.' },
  ],
  explorer: [
    { id: 'surveyor', label: 'Field Surveyor',
      effect: 'Grants extra digs on every expedition board.' },
    { id: 'quartermaster', label: 'Quartermaster',
      effect: 'Reduces the cost of commissioning expeditions.' },
    { id: 'veteran', label: 'Veteran Pathfinder',
      effect: 'Raises how many hazards an expedition can survive.' },
  ],
  curator: [
    { id: 'publicist', label: 'Curator–Publicist',
      effect: 'Builds the museum\u2019s fame each week.' },
    { id: 'steward', label: 'Curator–Steward',
      effect: 'Trims weekly upkeep costs.' },
    { id: 'authenticator', label: 'Curator–Authenticator',
      effect: 'Analyses black-market buys for free — no forgery slips past.' },
  ],
};

/** wage by role, specialty and skill. The basic researcher is
 *  deliberately cheap; effect specialties cost more. */
function wageFor(
  role: StaffRole, specialty: string, skill: number,
): number {
  let base = role === 'explorer' ? 300 : role === 'curator' ? 280 : 250;
  if (specialty === 'basic') base = 150;        // the cheap researcher
  return base * skill;
}

/** build a fresh pool of recruits — exactly three of each role,
 *  one per specialty, so every hire is a distinct choice. */
export function makeCandidates(): StaffMember[] {
  const out: StaffMember[] = [];
  const roles: StaffRole[] = ['curator', 'researcher', 'explorer'];
  for (const role of roles) {
    for (const spec of STAFF_SPECIALTIES[role]) {
      const skill = randInt(1, 3);
      out.push({
        id: uid('staff'),
        name: staffName(),
        role, specialty: spec.id, skill,
        wage: wageFor(role, spec.id, skill),
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
/** the summed skill of all hired staff with a given specialty
 *  (0 if none) — drives the size of that specialty's effect. */
export function specialtySkill(s: GameState, specialty: string): number {
  return s.staff
    .filter(m => m.specialty === specialty)
    .reduce((acc, m) => acc + m.skill, 0);
}
/** does the museum employ any staffer of a given specialty? */
export function hasSpecialty(s: GameState, specialty: string): boolean {
  return s.staff.some(m => m.specialty === specialty);
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

/* --- expeditions: tiers, shards, summoning ------------------ */
/* The player picks a TIER (common/uncommon/rare/epic). The cost is
   spent at once; the expedition runs EXPEDITION_WEEKS, then the
   player plays a board mini-game. Common/Uncommon boards yield
   whole objects; Rare/Epic boards yield shards, banked per style
   and spent to summon a work. */

/** explorers currently free to lead an expedition */
export function freeExplorers(s: GameState): StaffMember[] {
  const busy = new Set(
    s.expeditions.filter(e => !e.resolved && e.leaderId)
      .map(e => e.leaderId));
  return s.staff.filter(m => m.role === 'explorer' && !busy.has(m.id));
}

/** the shard-bank key for a tier+style, e.g. "rare:egyptian" */
export function shardKey(tier: 'rare' | 'epic', style: StyleId): string {
  return `${tier}:${style}`;
}
/** how many shards of a tier+style the player holds */
export function shardCount(
  s: GameState, tier: 'rare' | 'epic', style: StyleId,
): number {
  return s.shards[shardKey(tier, style)] || 0;
}

/** Commission an expedition of a tier. Cost spent immediately. */
/** the cost to commission a tier after a "quartermaster"
 *  explorer's discount — up to 30% off, scaling with skill. */
export function expeditionCost(s: GameState, tier: ExpeditionTier): number {
  const def = EXPEDITION_TIERS.find(t => t.id === tier);
  if (!def) return 0;
  const quarter = specialtySkill(s, 'quartermaster');
  return Math.round(def.cost * (1 - Math.min(0.3, quarter * 0.1)));
}

export function commissionExpedition(
  s: GameState, tier: ExpeditionTier, style: StyleId,
  leaderId: string | null,
): Result {
  const def = EXPEDITION_TIERS.find(t => t.id === tier);
  if (!def) return { state: s, error: 'Unknown expedition tier.' };
  if (!s.specialties.includes(style))
    return { state: s, error: 'You can only seek a style you have researched.' };
  const cost = expeditionCost(s, tier);
  if (s.funds < cost)
    return { state: s, error: `A ${def.name} costs ${money(cost)}.` };
  if (leaderId && !freeExplorers(s).some(m => m.id === leaderId))
    return { state: s, error: 'That leader is not available.' };

  let next = fork(s);
  next.funds -= cost;
  next.expeditions = [...next.expeditions, {
    id: uid('exp'),
    tier, style, leaderId,
    weeksLeft: EXPEDITION_WEEKS,
    resolved: false,
  }];
  next = logged(next, { kind: 'good',
    text: `Commissioned a ${def.name} seeking ${STYLES[style].name} `
      + `(${money(cost)}, ${EXPEDITION_WEEKS} weeks).` });
  return { state: next };
}

/** expeditions whose timer has run out and await the board game */
export function expeditionsReady(s: GameState): Expedition[] {
  return s.expeditions.filter(e => !e.resolved && e.weeksLeft <= 0);
}
/** expeditions still in progress */
export function expeditionsActive(s: GameState): Expedition[] {
  return s.expeditions.filter(e => !e.resolved && e.weeksLeft > 0);
}

/** pick a random artifact of a style within a score band, not owned */
export function rollArtifactOfBand(
  s: GameState, style: StyleId, band: 'common' | 'uncommon',
): string | null {
  const owned = new Set(s.owned);
  const inBand = (sc: number) =>
    band === 'common' ? sc < 10 : sc >= 10 && sc < 20;
  let pool = ARTIFACTS.filter(a =>
    a.style === style && !owned.has(a.id) && inBand(a.score));
  if (pool.length === 0)
    pool = ARTIFACTS.filter(a => !owned.has(a.id) && inBand(a.score));
  if (pool.length === 0) return null;
  return pool[randInt(0, pool.length - 1)].id;
}

/** Resolve a played-out expedition. The board mini-game produces
 *  a result: either whole artifact ids won, or a shard count.
 *  `objectIds` — whole works won (Common/Uncommon tiers).
 *  `shardsWon` — shards banked (Rare/Epic tiers). */
export function resolveExpedition(
  s: GameState, expeditionId: string,
  result: { objectIds?: string[]; shardsWon?: number },
): Result {
  const exp = s.expeditions.find(e => e.id === expeditionId);
  if (!exp) return { state: s, error: 'No such expedition.' };
  if (exp.resolved) return { state: s, error: 'Already resolved.' };
  const def = EXPEDITION_TIERS.find(t => t.id === exp.tier)!;
  let next = fork(s);

  let summary: string;
  if (def.yieldsObjects) {
    const ids = (result.objectIds || [])
      .filter(id => ARTIFACT_BY_ID[id] && !next.owned.includes(id));
    for (const id of ids) {
      next.owned.push(id);
      const art = ARTIFACT_BY_ID[id];
      activeMuseum(next).fame += Math.max(1, Math.round(art.score * 0.3));
      next.expertise[art.style] = Math.min(5,
        +(((next.expertise[art.style] || 0) + 0.2 + art.score / 500)).toFixed(2));
    }
    summary = ids.length > 0
      ? `The ${def.name} returned with ${ids.length} work(s).`
      : `The ${def.name} returned empty-handed.`;
  } else {
    const won = Math.max(0, Math.round(result.shardsWon || 0));
    const tier = exp.tier as 'rare' | 'epic';
    const key = shardKey(tier, exp.style);
    next.shards = { ...next.shards, [key]: (next.shards[key] || 0) + won };
    summary = won > 0
      ? `The ${def.name} banked ${won} ${tier} ${STYLES[exp.style].name} shard(s).`
      : `The ${def.name} returned with no shards.`;
  }
  next.expeditions = next.expeditions.map(e =>
    e.id === expeditionId ? { ...e, resolved: true } : e);
  next = logged(next, { kind: 'good', text: summary });
  return { state: next };
}

/** Summon a Rare or Epic work, spending banked shards of that
 *  tier+style. Picks a random unowned work of that rarity+style. */
export function summonArtifact(
  s: GameState, tier: 'rare' | 'epic', style: StyleId,
): Result {
  const cost = SUMMON_COST[tier];
  const have = shardCount(s, tier, style);
  if (have < cost)
    return { state: s, error: `Need ${cost} ${tier} ${STYLES[style].name} shards (you have ${have}).` };
  const owned = new Set(s.owned);
  const inBand = (sc: number) =>
    tier === 'rare' ? sc >= 20 && sc < 50 : sc >= 50 && sc < 100;
  let pool = ARTIFACTS.filter(a =>
    a.style === style && !owned.has(a.id) && inBand(a.score));
  if (pool.length === 0)
    pool = ARTIFACTS.filter(a => !owned.has(a.id) && inBand(a.score));
  if (pool.length === 0)
    return { state: s, error: 'No works of that kind remain to summon.' };

  const art = pool[randInt(0, pool.length - 1)];
  let next = fork(s);
  const key = shardKey(tier, style);
  next.shards = { ...next.shards, [key]: have - cost };
  next.owned.push(art.id);
  activeMuseum(next).fame += Math.max(1, Math.round(art.score * 0.3));
  next.expertise[art.style] = Math.min(5,
    +(((next.expertise[art.style] || 0) + 0.25 + art.score / 500)).toFixed(2));
  next = logged(next, { kind: 'good',
    text: `Summoned ${art.name} from ${cost} ${tier} shards.` });
  return { state: next };
}

/* --- loans (from galas) ------------------------------------ */
/** ids of works currently on loan and hanging in a given room */
export function loanedIdsInRoom(s: GameState, roomId: number): string[] {
  return activeMuseum(s).loans.filter(l => l.roomId === roomId)
    .map(l => l.artifactId);
}
/** every loaned artifact id, across every museum */
export function allLoanedIds(s: GameState): string[] {
  return s.museums.flatMap(m => m.loans.map(l => l.artifactId));
}
/** total weekly cost of all active loans, across every museum */
export function weeklyLoanFees(s: GameState): number {
  return s.museums.reduce((acc, m) =>
    acc + m.loans.reduce((a, l) => a + l.weeklyFee, 0), 0);
}

/** Accept a loan, hanging the work in a room whose theme matches
 *  the piece's style and has a free slot. Returns an error if no
 *  such wall is open. */
export function acceptLoan(
  s: GameState, artifactId: string, weeks: number,
  weeklyFee: number, lenderName: string,
): Result {
  const art = ARTIFACT_BY_ID[artifactId];
  if (!art) return { state: s, error: 'Unknown work.' };
  // the loan enters the active museum immediately, unplaced — the
  // player exhibits it from the Loaned Items block when ready.
  let next = fork(s);
  const lMus = activeMuseum(next);
  lMus.loans = [...lMus.loans, {
    id: uid('loan'),
    artifactId, roomId: null,
    weeksLeft: weeks, weeklyFee, lenderName,
  }];
  next = logged(next, { kind: 'good',
    text: `${lenderName} loans ${art.name} for ${weeks} weeks `
      + `(${money(weeklyFee)}/week) — exhibit it from your galleries.` });
  return { state: next };
}

/** Exhibit a loaned work on a wall. The wall must match the work's
 *  style and have a free slot. A loan can be placed only once. */
export function placeLoan(
  s: GameState, loanId: string, roomId: number,
): Result {
  const mus0 = activeMuseum(s);
  const loan = mus0.loans.find(l => l.id === loanId);
  if (!loan) return { state: s, error: 'No such loan.' };
  if (loan.roomId !== null)
    return { state: s, error: 'That loan is already on display.' };
  const art = ARTIFACT_BY_ID[loan.artifactId];
  const room = mus0.rooms.find(r => r.id === roomId);
  if (!room || !roomReady(room) || room.theme !== art.style)
    return { state: s, error: 'That wall cannot take this work.' };
  const used = room.items.length + loanedIdsInRoom(s, room.id).length;
  if (used >= ROOM_CAPACITY)
    return { state: s, error: 'That room is full.' };
  let next = fork(s);
  const m = activeMuseum(next);
  m.loans = m.loans.map(l =>
    l.id === loanId ? { ...l, roomId } : l);
  next = logged(next, { kind: 'note',
    text: `${art.name} (on loan) is now on display.` });
  return { state: next };
}

/* --- black market ------------------------------------------ */
/* --- black market: buying & resolving ---------------------- */
/** Buy a black-market offer. The caller passes the resolved
 *  PurchaseOutcome from the authentication game. A genuine work
 *  joins the collection; an "altered" work joins but owes a
 *  restoration fee before it may be exhibited; a "stolen" work
 *  joins but owes a declaration fee; forgeries join as
 *  SALVAGE-ONLY items that can never be exhibited, only sold. */
export function buyBlackMarket(
  s: GameState, artifactId: string, outcome: BMPurchaseOutcome,
): Result {
  const art = ARTIFACT_BY_ID[artifactId];
  if (!art) return { state: s, error: 'Unknown work.' };
  if (s.funds < outcome.pricePaid)
    return { state: s, error: 'You cannot afford this piece.' };
  let next = fork(s);
  next.funds -= outcome.pricePaid;
  if (!next.owned.includes(artifactId)) next.owned.push(artifactId);

  if (outcome.salvageOnly) {
    // a forgery — it enters as a salvage-only holding, never to
    // hang on a wall; the player can only sell it on
    next.salvageOnly = [...next.salvageOnly, artifactId];
    next = logged(next, { kind: 'bad',
      text: outcome.verdict === 'full_forgery'
        ? `${art.name} proves an outright forgery — worthless, fit only `
          + `to be quietly sold off.`
        : `${art.name} proves part-forged — it cannot be exhibited, only `
          + `salvaged for a fraction of what it seemed worth.` });
    return { state: next };
  }

  // a genuine / altered / misattributed / stolen work — it joins
  // the collection and earns the usual acquisition fame
  activeMuseum(next).fame += Math.max(1, Math.round(art.score * 0.2));
  next.expertise[art.style] = Math.min(5,
    +(((next.expertise[art.style] || 0) + 0.2 + art.score / 500)).toFixed(2));

  if (outcome.restorationFee > 0) {
    next.restorationOwed = { ...next.restorationOwed,
      [artifactId]: outcome.restorationFee };
    next = logged(next, { kind: 'note',
      text: `${art.name} joins the collection, but is altered — pay its `
        + `${money(outcome.restorationFee)} restoration before exhibiting it.` });
  } else if (outcome.declareFee > 0) {
    next.stolenUndeclared = { ...next.stolenUndeclared,
      [artifactId]: outcome.declareFee };
    next = logged(next, { kind: 'note',
      text: `${art.name} is genuine — but stolen. Declare it `
        + `(${money(outcome.declareFee)}) to keep it lawfully.` });
  } else {
    next = logged(next, { kind: 'good',
      text: `${art.name} joins the collection for ${money(outcome.pricePaid)}.` });
  }
  return { state: next };
}

/** Pay the restoration fee owed on an "altered" black-market
 *  work, clearing it for exhibition. */
export function payRestoration(s: GameState, artifactId: string): Result {
  const owed = s.restorationOwed[artifactId];
  if (!owed) return { state: s, error: 'No restoration is owed on that work.' };
  if (s.funds < owed)
    return { state: s, error: `Restoration costs ${money(owed)}.` };
  let next = fork(s);
  next.funds -= owed;
  const ro = { ...next.restorationOwed };
  delete ro[artifactId];
  next.restorationOwed = ro;
  next = logged(next, { kind: 'good',
    text: `${ARTIFACT_BY_ID[artifactId].name} is restored — it may now be `
      + `exhibited.` });
  return { state: next };
}

/** Declare a stolen black-market work to the authorities, paying
 *  the declaration fee to keep it lawfully. */
export function declareStolen(s: GameState, artifactId: string): Result {
  const owed = s.stolenUndeclared[artifactId];
  if (!owed) return { state: s, error: 'That work is not flagged stolen.' };
  if (s.funds < owed)
    return { state: s, error: `Declaring it costs ${money(owed)}.` };
  let next = fork(s);
  next.funds -= owed;
  const su = { ...next.stolenUndeclared };
  delete su[artifactId];
  next.stolenUndeclared = su;
  next = logged(next, { kind: 'good',
    text: `${ARTIFACT_BY_ID[artifactId].name} is declared and lawfully `
      + `yours — it may now be exhibited.` });
  return { state: next };
}

export function runAdCampaign(s: GameState, museumId?: string): Result {
  const mid = museumId || s.activeMuseumId;
  if (museumById(s, mid).adWeeksLeft > 0)
    return { state: s, error: 'A campaign is already running.' };
  if (s.funds < AD_CAMPAIGN.cost)
    return { state: s, error: `A campaign costs ${money(AD_CAMPAIGN.cost)}.` };
  let next = fork(s);
  next.funds -= AD_CAMPAIGN.cost;
  museumById(next, mid).adWeeksLeft = AD_CAMPAIGN.weeks;
  next = logged(next, { kind: 'good',
    text: `Launched an advertising campaign for ${AD_CAMPAIGN.weeks} weeks.` });
  return { state: next };
}

/* --- derived stats ----------------------------------------- */
/** total quality = sum of all placed artifact scores */
export function museumQuality(s: GameState, museumId?: string): number {
  const mus = museumId ? museumById(s, museumId) : activeMuseum(s);
  let q = 0;
  for (const r of mus.rooms)
    for (const id of r.items) q += ARTIFACT_BY_ID[id].score;
  return q;
}

/** placed-artifact count (active museum) */
export function placedCount(s: GameState, museumId?: string): number {
  const mus = museumId ? museumById(s, museumId) : activeMuseum(s);
  return mus.rooms.reduce((n, r) => n + r.items.length, 0);
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

/** a museum's expected DAILY visitors — incremental with
 *  diminishing returns on each successive (lower-ranked) work. */
export function dailyVisitors(s: GameState, museum?: Museum): number {
  const mus = museum || activeMuseum(s);
  const draws: number[] = [];
  for (const r of mus.rooms)
    for (const id of r.items) draws.push(artifactDailyDraw(id));
  // works on loan that are ON DISPLAY draw visitors too
  for (const l of mus.loans)
    if (l.roomId !== null) draws.push(artifactDailyDraw(l.artifactId));
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
  total += mus.fame * 0.5;
  total += mus.rooms.filter(roomIsFull).length * 7;
  // a curator makes the museum a draw in its own right
  total += specialtySkill(s, 'publicist') * 14;
  return total * BUILDINGS[mus.buildingId].prestige;
}

/** weekly visitors for a museum — six open days, shaped by
 *  ticket-price demand and weekly noise. */
export function computeVisitors(s: GameState, museum?: Museum): number {
  const mus = museum || activeMuseum(s);
  const perDay = dailyVisitors(s, mus);
  if (perDay <= 0) return 0;

  const fairPrice = 7 + perDay / 70;
  const ratio = mus.ticket / Math.max(1, fairPrice);
  let demandMult: number;
  if (ratio <= 1) demandMult = 1.12 - ratio * 0.12;     // 1.12 .. 1.0
  else demandMult = Math.exp(-(ratio - 1) * 1.05);      // softer falloff

  let weekly = perDay * 6 * demandMult;                 // six open days
  if (mus.adWeeksLeft > 0) weekly *= AD_CAMPAIGN.visitorMult;
  weekly *= rand(0.85, 1.15);                           // weekly noise
  return Math.max(0, Math.round(weekly));
}

/* weekly revenue for a museum. */
export function computeRevenue(s: GameState, museum?: Museum): number {
  const mus = museum || activeMuseum(s);
  const visitors = computeVisitors(s, mus);
  return Math.round(visitors * (mus.ticket + 3));
}
/** total weekly revenue across every open museum */
export function totalRevenue(s: GameState): number {
  return openMuseums(s).reduce((acc, m) => acc + computeRevenue(s, m), 0);
}
/** total weekly visitors across every open museum */
export function totalVisitors(s: GameState): number {
  return openMuseums(s).reduce((acc, m) => acc + computeVisitors(s, m), 0);
}

/** weekly expenses = building maintenance + staff wages */
/** weekly expenses = building maintenance + staff wages + a small
 *  per-room variable cost. Most upkeep (security, front office) is
 *  fixed in the building's maintenance figure; opening extra rooms
 *  only adds the variable part — electricity, cleaning — so each
 *  unlocked room beyond the first adds a modest surcharge. */
export function computeExpenses(s: GameState): number {
  // building maintenance + per-room surcharge, summed over every
  // open museum; loan fees and wages are already player-wide.
  let buildings = 0;
  for (const m of openMuseums(s)) {
    const roomsOpen = m.rooms.filter(r => r.unlocked).length;
    const roomSurcharge = Math.max(0, roomsOpen - 1) * 120;
    buildings += BUILDINGS[m.buildingId].maintenance + roomSurcharge;
  }
  const gross = buildings + weeklyLoanFees(s);
  // a "steward" curator trims building upkeep — up to 30% off
  // (wages are never discounted).
  const steward = specialtySkill(s, 'steward');
  const trimmed = Math.round(gross * (1 - Math.min(0.3, steward * 0.1)));
  return trimmed + weeklyWages(s);
}

/* --- rankings ---------------------------------------------- */
/** the player's combined weekly visitors across all museums */
export function playerVisitorsEstimate(s: GameState): number {
  return totalVisitors(s);
}

/* --- advance one week -------------------------------------- */
export function advanceWeek(s: GameState): GameState {
  let next = fork(s);

  // research progress — a global timer; no room hosts it
  if (next.research) {
    const left = next.research.weeksLeft - 1;
    if (left <= 0) {
      const sp = next.research.style;
      next.specialties.push(sp);
      next.expertise[sp] = Math.max(next.expertise[sp] || 0, 0.5);
      next.research = null;
      next = logged(next, { kind: 'good',
        text: `Research complete — ${STYLES[sp].name} is now a specialty. `
          + 'Theme any open room to it.' });
    } else {
      next.research = { ...next.research, weeksLeft: left };
    }
  }

  // sponsor weekly fame — each museum's sponsors lift its own fame;
  // a publicist curator lifts every museum a little; and a wing of
  // rooms sharing a style earns thematic-cohesion fame each week.
  const pubBonus = specialtySkill(next, 'publicist') * 3;
  for (const m of next.museums) {
    if (!m.open) continue;
    m.fame += pubBonus;
    // wing cohesion is generous weekly but scaled down here so it
    // accrues steadily rather than spiking
    m.fame += Math.round(museumCohesionBonus(m) * 0.25);
  }

  // sponsors pay weekly, count down, and depart when the term ends
  for (const m of next.museums) {
    let payTotal = 0;
    for (const sp of m.sponsors) payTotal += sp.weeklyPay;
    next.funds += payTotal;
    const ending = m.sponsors.filter(sp => sp.weeksLeft <= 1);
    for (const sp of ending) {
      // the named space reverts when the sponsor departs
      if (sp.scope === 'wing' && sp.hallId
          && m.wingNames[sp.hallId] === `${sp.name} Wing`) {
        const wn = { ...m.wingNames };
        delete wn[sp.hallId];
        m.wingNames = wn;
      }
      next = logged(next, { kind: 'note',
        text: `${sp.name}'s sponsorship of ${m.name} has ended.` });
    }
    m.sponsors = m.sponsors
      .map(sp => ({ ...sp, weeksLeft: sp.weeksLeft - 1 }))
      .filter(sp => sp.weeksLeft > 0);
  }

  // expeditions count down; when one reaches zero it awaits its
  // result mini-game on the Week tab.
  next.expeditions = next.expeditions.map(e => {
    if (e.resolved || e.weeksLeft <= 0) return e;
    const left = e.weeksLeft - 1;
    return { ...e, weeksLeft: left };
  });
  for (const e of next.expeditions) {
    if (!e.resolved && e.weeksLeft === 0) {
      const tierName = EXPEDITION_TIERS.find(t => t.id === e.tier)?.name
        || 'expedition';
      next = logged(next, { kind: 'note',
        text: `Your ${tierName} has returned — play it out on the Week tab.` });
    }
  }

  // loans count down; when one reaches zero the work leaves
  for (const m of next.museums) {
    for (const l of m.loans.filter(l => l.weeksLeft <= 1)) {
      next = logged(next, { kind: 'note',
        text: `The loan of ${ARTIFACT_BY_ID[l.artifactId].name} from `
          + `${l.lenderName} has ended — the work has been returned.` });
    }
    m.loans = m.loans
      .map(l => ({ ...l, weeksLeft: l.weeksLeft - 1 }))
      .filter(l => l.weeksLeft > 0);
  }

  // economy: revenue in, expenses out — both recorded for display
  const revenue = totalRevenue(next);
  const expenses = computeExpenses(next);
  next.funds += revenue - expenses;
  next.lastRevenue = revenue;
  next.lastExpenses = expenses;
  if (revenue - expenses < 0) {
    next = logged(next, { kind: 'bad',
      text: `A lean week: ${money(revenue)} earned, ${money(expenses)} in upkeep.` });
  }

  // advertising countdown — per museum
  for (const m of next.museums)
    if (m.adWeeksLeft > 0) m.adWeeksLeft -= 1;

  // refresh the recruit pool every fourth week, or if it has run dry
  if (next.candidates.length === 0 || next.week % 4 === 0) {
    next.candidates = makeCandidates();
  }

  // the three rival cousins grow each week, each with a distinct
  // temperament so the race feels alive but never hopeless:
  //  - rival 0  "the rival": paces YOU — pulls ahead when you do
  //             well, eases when you are behind. A true race.
  //  - rival 1  "the slow one": a gentle, steady climb.
  //  - rival 2  "the fast starter": climbs quickly early but
  //             decelerates hard and effectively caps — they will
  //             be second or third in the city, never the Louvre.
  const playerFame = totalFame(next);
  next.rivals = next.rivals.map((r, i) => {
    let fg: number;
    if (i === 0) {
      // relative to the player: matches your pace, ahead/behind nudge
      const lead = r.fame - playerFame;
      fg = lead > 30 ? randInt(0, 1)
        : lead > 0 ? randInt(1, 3)
        : randInt(2, 4);
    } else if (i === 1) {
      // the slow, steady cousin
      fg = randInt(1, 2);
    } else {
      // the fast starter — growth decays as their fame rises and
      // is choked off near a soft cap (~140 fame: a strong second
      // or third in the city, not a world museum)
      const cap = 140;
      const room = Math.max(0, cap - r.fame) / cap;   // 1 -> 0
      fg = Math.round(randInt(2, 7) * room);
    }
    return {
      ...r,
      fame: r.fame + fg,
      quality: r.quality + randInt(2, 6),
      visitors: Math.max(0, r.visitors + randInt(-40, 110)),
    };
  });

  // record a snapshot of the week that just finished, for the
  // Manage chart. Keep the most recent 12 (the chart shows 10).
  next.history = [
    ...next.history,
    {
      week: s.week,
      dailyVisitors: Math.round(
        openMuseums(next).reduce((a, m) => a + dailyVisitors(next, m), 0)),
      fame: totalFame(next),
      quality: openMuseums(next).reduce(
        (a, m) => a + museumQuality(next, m.id), 0),
    },
  ].slice(-12);

  next.week += 1;
  next.events = [];
  next.activeEvent = null;
  next.auction = null;

  // open-ended play — no week cap. Detect newly unlocked auction
  // houses and announce them.
  for (const h of AUCTION_HOUSES) {
    if (totalFame(next) >= h.fameToUnlock && h.fameToUnlock > 0
        && !next.joinedHouses.includes(h.id)
        && totalFame(s) < h.fameToUnlock) {
      next = logged(next, { kind: 'good',
        text: `Your fame opens the doors of ${h.name} — join it from the Week tab.` });
    }
  }

  next.events = rollEvents(next);
  // a gala appears some weeks — a chance to court collectors for loans
  next.galaPending = Math.random() < 0.4;
  if (next.galaPending)
    next = logged(next, { kind: 'note',
      text: 'A society gala is being held this week — a chance to court '
        + 'collectors for a loan.' });
  // a black-market offer surfaces occasionally — a bargain, if genuine
  next.blackMarketPending = Math.random() < 0.3;
  if (next.blackMarketPending)
    next = logged(next, { kind: 'note',
      text: 'A discreet seller has surfaced with a piece priced well below '
        + 'its rarity — though its authenticity is another matter.' });
  return next;
}

/* --- final score ------------------------------------------- */
export interface FinalScore {
  score: number; grade: string;
  quality: number; completeRooms: number; collValue: number;
}
export function finalScore(s: GameState): FinalScore {
  const quality = openMuseums(s).reduce(
    (a, m) => a + museumQuality(s, m.id), 0);
  const collValue = s.owned.reduce(
    (acc, id) => acc + ARTIFACT_BY_ID[id].value, 0);
  const completeRooms = openMuseums(s).reduce(
    (a, m) => a + m.rooms.filter(roomIsFull).length, 0);
  const score = Math.round(
    totalFame(s) * 8 + quality * 3 + collValue / 30 + completeRooms * 35);
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
