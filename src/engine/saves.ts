/* ============================================================
   ENGINE — SAVES  ( src/engine/ )
   localStorage-backed save slots. Three slots (0,1,2). The game
   autosaves the active slot after every meaningful change.
   ============================================================ */
import type { GameState, SaveSlot } from '../data/types';
import { makeCandidates } from './game';

const KEY = (slot: number) => `museum-wars:slot:${slot}`;
export const SLOT_COUNT = 3;

/* Saves made by an earlier build may lack fields that newer
   features added (staff, expeditions, history, ...). Loading such
   a save would crash any screen that reads a missing array. This
   migration backfills every field with a safe default so old
   saves keep working. New fields must be added here too. */
function migrateState(state: Partial<GameState>): GameState {
  const s = state as GameState & Record<string, unknown>;
  if (!Array.isArray(s.staff)) s.staff = [];
  if (!Array.isArray(s.candidates)) s.candidates = makeCandidates();
  // old saves predate staff specialties — drop the stale recruit
  // pool and any specialty-less staff so the new system is clean
  if (s.staff.some(m => !m.specialty)) {
    s.staff = s.staff.filter(m => !!m.specialty);
  }
  if (s.candidates.some(c => !c.specialty)) {
    s.candidates = makeCandidates();
  }
  if (!Array.isArray(s.expeditions)) s.expeditions = [];
  if (!s.shards || typeof s.shards !== 'object') s.shards = {};
  if (typeof s.galaPending !== 'boolean') s.galaPending = false;
  if (typeof s.blackMarketPending !== 'boolean') s.blackMarketPending = false;
  if (!Array.isArray(s.unanalyzed)) s.unanalyzed = [];
  if (!Array.isArray(s.forgeries)) s.forgeries = [];
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.joinedHouses)) s.joinedHouses = ['house1'];
  if (!Array.isArray(s.rivals)) s.rivals = [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.owned)) s.owned = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!s.expertise) s.expertise = {};
  if (typeof s.lastRevenue !== 'number') s.lastRevenue = 0;
  if (typeof s.lastExpenses !== 'number') s.lastExpenses = 0;
  if (s.pendingItemId === undefined) s.pendingItemId = null;
  if (s.research === undefined) s.research = null;
  if (s.activeEvent === undefined) s.activeEvent = null;
  if (s.auction === undefined) s.auction = null;

  // --- multi-museum migration ---------------------------------
  // a pre-multimuseum save kept rooms/fame/buildingId/etc. flat on
  // the state. Wrap that into a single Museum so the new array
  // model is satisfied and the game plays on unchanged.
  if (!Array.isArray(s.museums)) {
    const legacy = s as unknown as Record<string, unknown>;
    const museum = {
      id: 'museum_0',
      name: (s.galleryName as string) || 'The Museum',
      buildingId: (legacy.buildingId as string) || 'local',
      rooms: Array.isArray(legacy.rooms) ? legacy.rooms : [],
      fame: typeof legacy.fame === 'number' ? legacy.fame : 0,
      ticket: typeof legacy.ticket === 'number' ? legacy.ticket : 5,
      sponsors: Array.isArray(legacy.sponsors) ? legacy.sponsors : [],
      wingNames: legacy.wingNames || {},
      adWeeksLeft: typeof legacy.adWeeksLeft === 'number'
        ? legacy.adWeeksLeft : 0,
      loans: Array.isArray(legacy.loans) ? legacy.loans : [],
      open: true,
    };
    s.museums = [museum as GameState['museums'][number]];
    s.activeMuseumId = museum.id;
  }
  if (!s.activeMuseumId || !s.museums.some(m => m.id === s.activeMuseumId)) {
    s.activeMuseumId = s.museums[0]?.id || 'museum_0';
  }
  // backfill any museum missing the newer `open` flag
  for (const m of s.museums) {
    if (typeof m.open !== 'boolean') m.open = true;
    if (!Array.isArray(m.loans)) m.loans = [];
    if (!Array.isArray(m.sponsors)) m.sponsors = [];
    // pre-term-sponsor saves used a different Sponsor shape — drop
    // any sponsor lacking the new `scope`/`weeksLeft` fields
    m.sponsors = m.sponsors.filter(sp =>
      sp && typeof sp.scope === 'string'
      && typeof sp.weeksLeft === 'number');
    if (!m.wingNames) m.wingNames = {};
    if (typeof m.adWeeksLeft !== 'number') m.adWeeksLeft = 0;
  }
  return s;
}

/** read a slot's save, or null if empty / unreadable */
export function loadSlot(slot: number): SaveSlot | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveSlot;
    if (!parsed || typeof parsed.slot !== 'number' || !parsed.state) return null;
    parsed.state = migrateState(parsed.state);
    return parsed;
  } catch {
    return null;
  }
}

/** all three slots, empty ones as null */
export function listSlots(): (SaveSlot | null)[] {
  const out: (SaveSlot | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) out.push(loadSlot(i));
  return out;
}

/** write a game state into a slot (the autosave) */
export function saveSlot(slot: number, state: GameState): void {
  try {
    const record: SaveSlot = {
      slot,
      playerName: state.playerName,
      galleryName: state.galleryName,
      week: state.week,
      fame: state.museums.reduce((a, m) => a + (m.open ? m.fame : 0), 0),
      savedAt: Date.now(),
      state,
    };
    localStorage.setItem(KEY(slot), JSON.stringify(record));
  } catch {
    // storage full or unavailable — fail silently; the in-memory
    // game continues, only persistence is lost.
  }
}

/** erase a slot */
export function deleteSlot(slot: number): void {
  try { localStorage.removeItem(KEY(slot)); } catch { /* ignore */ }
}
