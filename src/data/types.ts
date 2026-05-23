/* ============================================================
   TYPES  ( src/data/ )   — STAGE 1 REWORK
   Artifacts are now described by three independent dimensions:
     - type   : what kind of object (Painting, Sculpture, ...)
     - style  : the tradition it belongs to (Renaissance, ...)
     - rarity : derived from a numeric score
   A museum specialises in a STYLE; a styled room takes any type
   of that style.
   ============================================================ */

/* --- artifact dimensions ----------------------------------- */
export type ArtType = 'Painting' | 'Sculpture' | 'Manuscript' | 'Object';

export type StyleId =
  | 'egyptian' | 'classical' | 'medieval' | 'renaissance' | 'baroque'
  | 'asian' | 'romanticism' | 'impressionism' | 'modernism'
  | 'contemporary' | 'popculture' | 'precolumbian' | 'islamic';

export type RarityId =
  | 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'worldicon';

export interface StyleDef { id: StyleId; name: string; }

export interface RarityBand {
  id: RarityId;
  name: string;
  min: number;       // inclusive score floor
  cls: string;       // css colour class
  hex: string;       // slot fill colour
}

/** An artwork. `style` is what a museum specialises in; `type` is
 *  an independent filter dimension. `id` is the catalogue number
 *  shown as 0001 etc. */
export interface Artifact {
  id: string;            // '0001'
  name: string;
  type: ArtType;
  style: StyleId;
  author: string;        // often 'Unknown'
  year: string;          // estimated, e.g. 'c. 1503' or '1969'
  description: string;
  score: number;         // master quality; rarity derived from it
  value: number;         // baseline auction price
  image: string;         // path under /artifacts/, letter fallback
}

/* --- buildings --------------------------------------------- */
export interface HallDef {
  id: string; name: string; roomCap: number; startRooms: number;
}
export interface BuildingDef {
  id: string; name: string; blurb: string;
  prestige: number;
  halls: HallDef[];
  moveCost: number;
  maintenance: number;   // weekly upkeep expense
}

/* --- districts --------------------------------------------- */
export interface DistrictDef {
  id: string; name: string; blurb: string;
  accent: string;
  pos: { x: number; y: number };
  buildingIds: string[];
}

/* --- competitor museums ------------------------------------ */
export type MuseumTier = 'local' | 'regional' | 'national' | 'global';
/** A static, real-inspired competitor. Numbers never change. */
export interface StaticMuseum {
  id: string;
  name: string;
  city: string;
  tier: MuseumTier;
  inYourCity: boolean;   // true = competes in the City ranking
  fame: number;
  quality: number;
  visitors: number;
}

/* --- live game state --------------------------------------- */
export interface Room {
  id: number;
  hallId: string;
  hallName: string;
  unlocked: boolean;
  theme: StyleId | null;             // a room specialises in a STYLE
  researching: { style: StyleId; weeksLeft: number } | null;
  items: string[];
}

export type EventKind = 'auction' | 'donation';
export interface GameEvent {
  id: string;
  kind: EventKind;
  houseId: string;          // which auction house this sale belongs to
  house: string;            // the house's display name
  skewLabel: string;
  fee: number;
  lotIds: string[];
  attended?: boolean;
  lotIndex?: number;
  acquired?: string[];
  passed?: string[];        // lots the player chose to skip
}

export interface AuctionState {
  artifactId: string;
  estimate: number;
  currentBid: number;
  leader: 'house' | 'player' | 'rival';
  rivalCeiling: number;
  increment: number;
  // intro     — paused, awaiting the player's "Begin Auction"
  // announcing— a bid is being announced (held announceMs)
  // counting  — sitting on a countdown number (held stepMs)
  mode: 'intro' | 'announcing' | 'counting';
  count: number;          // the countdown number currently shown (3,2,1)
  phaseMs: number;        // ms remaining in the current step/announce
  elapsedMs: number;
  rivalNextGap: number;   // ms of counting before the rival may bid
  sinceCountStart: number;
  over: boolean;
  won: boolean | null;
  message: string;
}

export interface Sponsor {
  id: string; name: string;
  gift: number; weeklyBonus: number;
  wingNamed: string | null;
}

export type TicketPrice = number;   // an actual currency amount now

export interface LogEntry { kind: 'good' | 'bad' | 'note'; text: string; }

export type Phase = 'choose-specialty' | 'name-gallery' | 'playing' | 'ended';

/** One of the three rival players sharing the city. */
export interface RivalPlayer {
  id: string;
  name: string;
  fame: number;
  quality: number;
  visitors: number;
}

/* --- personnel --------------------------------------------- */
/** the three staff roles a museum can hire for. */
export type StaffRole = 'curator' | 'researcher' | 'explorer';

/** a hireable (or hired) staff member. `skill` 1-3 sets both the
 *  size of their effect and their weekly wage. */
export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  skill: number;          // 1..3
  wage: number;           // weekly salary
  hired: boolean;
}

/* --- expeditions ------------------------------------------- */
/** the kinds of expedition a museum can commission. */
export type ExpeditionKind =
  | 'antiques' | 'dig' | 'estate' | 'frontier';

/** a commissioned expedition in progress, or one awaiting its
 *  result. `foundIds` is decided when the expedition is launched
 *  but only revealed/claimed when the player plays the result. */
export interface Expedition {
  id: string;
  kind: ExpeditionKind;
  style: StyleId;
  budget: number;
  leaderId: string | null;        // an explorer staff id, or null
  weeksLeft: number;              // counts down; 0 = ready to resolve
  incident: boolean;              // did something go wrong en route
  foundIds: string[];             // the works the expedition turned up
  resolved: boolean;              // has the player played the result
}

export interface GameState {
  playerName: string;
  galleryName: string;
  funds: number;
  fame: number;
  week: number;
  specialties: StyleId[];
  research: { style: StyleId; weeksLeft: number } | null;
  expertise: Partial<Record<StyleId, number>>;
  buildingId: string;
  rooms: Room[];
  owned: string[];
  rivals: RivalPlayer[];          // the 3 rival players
  log: LogEntry[];
  events: GameEvent[];
  activeEvent: GameEvent | null;
  auction: AuctionState | null;
  pendingItemId: string | null;
  ticket: TicketPrice;
  sponsors: Sponsor[];
  wingNames: Record<string, string>;
  adWeeksLeft: number;
  lastRevenue: number;
  lastExpenses: number;
  joinedHouses: string[];         // auction houses the player has paid to join
  history: WeekSnapshot[];        // per-week stats, newest last
  staff: StaffMember[];           // hired personnel
  candidates: StaffMember[];      // recruits currently available to hire
  expeditions: Expedition[];      // commissioned expeditions
  phase: Phase;
}

/* --- weekly history (powers the Manage chart) -------------- */
export interface WeekSnapshot {
  week: number;
  dailyVisitors: number;          // average daily visitors that week
  fame: number;
  quality: number;
}

/* --- save slots -------------------------------------------- */
export interface SaveSlot {
  slot: number;                   // 0,1,2
  playerName: string;
  galleryName: string;
  week: number;
  fame: number;
  savedAt: number;                // epoch ms
  state: GameState;
}
