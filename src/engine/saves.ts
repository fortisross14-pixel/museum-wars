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
  const s = state as GameState;
  if (!Array.isArray(s.staff)) s.staff = [];
  if (!Array.isArray(s.candidates)) s.candidates = makeCandidates();
  if (!Array.isArray(s.expeditions)) s.expeditions = [];
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.joinedHouses)) s.joinedHouses = ['house1'];
  if (!Array.isArray(s.sponsors)) s.sponsors = [];
  if (!Array.isArray(s.rivals)) s.rivals = [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.owned)) s.owned = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!s.wingNames) s.wingNames = {};
  if (!s.expertise) s.expertise = {};
  if (typeof s.adWeeksLeft !== 'number') s.adWeeksLeft = 0;
  if (typeof s.lastRevenue !== 'number') s.lastRevenue = 0;
  if (typeof s.lastExpenses !== 'number') s.lastExpenses = 0;
  if (s.pendingItemId === undefined) s.pendingItemId = null;
  if (s.research === undefined) s.research = null;
  if (s.activeEvent === undefined) s.activeEvent = null;
  if (s.auction === undefined) s.auction = null;
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
      fame: state.fame,
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
