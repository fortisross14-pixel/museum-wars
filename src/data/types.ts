/* ============================================================
   TYPES  ( src/data/ )
   Shared type definitions. No logic here.
   ============================================================ */

export type CategoryId =
  | 'renaissance' | 'egypt' | 'eastasia' | 'sculpture';

export type RarityId =
  | 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'worldicon';

/** An artifact is a real-ish artwork the player can acquire.
 *  `score` is the master quality number (0..250+); rarity is
 *  DERIVED from it via rarityForScore(). `value` is the rough
 *  auction price — correlated to score but not a rigid formula,
 *  so bargains exist. */
export interface Artifact {
  id: string;
  name: string;
  category: CategoryId;
  author: string;
  year: string;
  type: string;          // Painting, Sculpture, Manuscript, ...
  style: string;         // High Renaissance, New Kingdom, ...
  description: string;   // one or two sentences
  score: number;         // master quality value
  value: number;         // baseline auction price
  image: string;         // path under /artifacts/, letter fallback if missing
}

export interface RarityBand {
  id: RarityId;
  name: string;
  min: number;           // inclusive score floor
  cls: string;           // css class for colour
  hex: string;           // hex colour for slot fills
}

export interface CategoryDef {
  id: CategoryId;
  name: string;
}

/* --- buildings --------------------------------------------- */
export interface HallDef {
  id: string;
  name: string;
  roomCap: number;
  startRooms: number;
}
export interface BuildingDef {
  id: string;
  name: string;
  blurb: string;
  prestige: number;
  halls: HallDef[];
  moveCost: number;
}

/* --- live game state --------------------------------------- */
export interface Room {
  id: number;
  hallId: string;
  hallName: string;
  unlocked: boolean;
  theme: CategoryId | null;
  researching: { specialty: CategoryId; weeksLeft: number } | null;
  items: string[];                 // artifact ids
}

export type EventKind = 'auction' | 'donation';

/** A weekly opportunity. Several may be offered in one week. */
export interface GameEvent {
  id: string;
  kind: EventKind;
  category: CategoryId;
  house: string;
  skewLabel: string;
  fee: number;
  lotIds: string[];
  // populated once attended:
  attended?: boolean;
  lotIndex?: number;
  acquired?: string[];
}

export interface AuctionState {
  artifactId: string;
  estimate: number;
  currentBid: number;
  leader: 'house' | 'player' | 'rival';
  rivalCeiling: number;
  increment: number;
  mode: 'counting' | 'announcing';
  clockMs: number;
  announceMs: number;
  elapsedMs: number;
  sinceCountStart: number;
  rivalNextGap: number;
  over: boolean;
  won: boolean | null;
  message: string;
}

export interface Sponsor {
  id: string;
  name: string;
  gift: number;          // one-off funds given
  weeklyBonus: number;   // recurring fame per week
  wingNamed: string | null;  // hallId this sponsor's name is attached to
}

export type TicketPrice = 'free' | 'low' | 'standard' | 'premium';

export interface LogEntry { kind: 'good' | 'bad' | 'note'; text: string; }

export type Phase = 'choose-specialty' | 'playing' | 'ended';

export interface GameState {
  funds: number;
  fame: number;
  week: number;
  specialties: CategoryId[];
  research: { specialty: CategoryId; weeksLeft: number } | null;
  expertise: Record<CategoryId, number>;
  buildingId: string;
  rooms: Room[];
  owned: string[];
  rivalFame: number;
  rivalQuality: number;
  log: LogEntry[];
  events: GameEvent[];          // this week's offered events
  activeEvent: GameEvent | null;// the one currently being attended
  auction: AuctionState | null;
  pendingItemId: string | null; // a won artifact awaiting placement
  // management
  ticket: TicketPrice;
  sponsors: Sponsor[];
  wingNames: Record<string, string>;  // hallId -> sponsor display name
  adWeeksLeft: number;          // weeks of active advertising remaining
  phase: Phase;
}
