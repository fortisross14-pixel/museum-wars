/* ============================================================
   ENGINE — SAVES  ( src/engine/ )
   localStorage-backed save slots. Three slots (0,1,2). The game
   autosaves the active slot after every meaningful change.
   ============================================================ */
import type { GameState, SaveSlot } from '../data/types';

const KEY = (slot: number) => `museum-wars:slot:${slot}`;
export const SLOT_COUNT = 3;

/** read a slot's save, or null if empty / unreadable */
export function loadSlot(slot: number): SaveSlot | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveSlot;
    if (!parsed || typeof parsed.slot !== 'number' || !parsed.state) return null;
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
