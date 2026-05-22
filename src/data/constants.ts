/* ============================================================
   GAME CONSTANTS  ( src/data/ )
   Categories, rarity bands, buildings, tunable numbers.
   ============================================================ */
import type {
  CategoryDef, CategoryId, RarityBand, RarityId, BuildingDef,
} from './types';

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  renaissance: { id: 'renaissance', name: 'Renaissance Painting' },
  egypt:       { id: 'egypt',       name: 'Ancient Egypt' },
  eastasia:    { id: 'eastasia',    name: 'East Asian Art' },
  sculpture:   { id: 'sculpture',   name: 'Classical Sculpture' },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

/* --- rarity bands ------------------------------------------
   Rarity is DERIVED from an artifact's score:
     0-10 Common · 10-20 Uncommon · 20-50 Rare ·
     50-100 Epic · 100-200 Legend · 200+ World Icon
   `min` is the inclusive score floor of each band. */
export const RARITY_BANDS: RarityBand[] = [
  { id: 'common',    name: 'Common',     min: 0,   cls: 'r-common',    hex: '#6f6657' },
  { id: 'uncommon',  name: 'Uncommon',   min: 10,  cls: 'r-uncommon',  hex: '#4a6149' },
  { id: 'rare',      name: 'Rare',       min: 20,  cls: 'r-rare',      hex: '#2f6485' },
  { id: 'epic',      name: 'Epic',       min: 50,  cls: 'r-epic',      hex: '#7d4f9c' },
  { id: 'legend',    name: 'Legend',     min: 100, cls: 'r-legend',    hex: '#b06d1f' },
  { id: 'worldicon', name: 'World Icon', min: 200, cls: 'r-worldicon', hex: '#8b3a2f' },
];

/** the rarity band an artifact score falls into */
export function rarityForScore(score: number): RarityBand {
  let band = RARITY_BANDS[0];
  for (const b of RARITY_BANDS) if (score >= b.min) band = b;
  return band;
}
export function rarityById(id: RarityId): RarityBand {
  return RARITY_BANDS.find(b => b.id === id) ?? RARITY_BANDS[0];
}

/* --- buildings: building -> halls -> rooms ----------------- */
export const ROOM_CAPACITY = 5;

export const BUILDINGS: Record<string, BuildingDef> = {
  local: {
    id: 'local', name: 'Local Gallery',
    blurb: 'A rented room in a small city. A beginning.',
    prestige: 1.0,
    halls: [{ id: 'ground', name: 'Ground Floor', roomCap: 3, startRooms: 1 }],
    moveCost: 0,
  },
  town: {
    id: 'town', name: 'Town Museum',
    blurb: 'A civic museum across two halls.',
    prestige: 1.6,
    halls: [
      { id: 'east', name: 'East Hall', roomCap: 3, startRooms: 2 },
      { id: 'west', name: 'West Hall', roomCap: 3, startRooms: 1 },
    ],
    moveCost: 1600,
  },
  palace: {
    id: 'palace', name: 'Historic Palace',
    blurb: 'A grand palace of three wings.',
    prestige: 2.4,
    halls: [
      { id: 'north', name: 'North Wing', roomCap: 3, startRooms: 2 },
      { id: 'south', name: 'South Wing', roomCap: 3, startRooms: 2 },
      { id: 'grand', name: 'Grand Wing', roomCap: 3, startRooms: 1 },
    ],
    moveCost: 4200,
  },
};
export const BUILDING_ORDER = ['local', 'town', 'palace'];

/* --- districts (the city map) ------------------------------
   All seven districts of the city. `pos` is the centre-point of
   the district as a percentage of the map image, used to place a
   round button overlay. `buildingIds` may be empty (placeholder
   districts with no venues yet). */
export interface DistrictDef {
  id: string;
  name: string;
  blurb: string;
  accent: string;
  pos: { x: number; y: number };   // % of map image
  buildingIds: string[];
}
export const DISTRICTS: DistrictDef[] = [
  {
    id: 'historic', name: 'Historic District',
    blurb: 'Old streets and civic halls — where a small museum can begin.',
    accent: '#b9892f', pos: { x: 82, y: 70 },
    buildingIds: ['local', 'town'],
  },
  {
    id: 'art', name: 'Art District',
    blurb: 'Grand institutions and collectors. The address of a great museum.',
    accent: '#8b3a2f', pos: { x: 83, y: 20 },
    buildingIds: ['palace'],
  },
  {
    id: 'college', name: 'College District',
    blurb: 'Universities and young crowds. No venues here yet.',
    accent: '#3f6694', pos: { x: 18, y: 17 },
    buildingIds: [],
  },
  {
    id: 'bohemian', name: 'Bohemian Neighborhood',
    blurb: 'Artists and studios. No venues here yet.',
    accent: '#6b4a8a', pos: { x: 49, y: 17 },
    buildingIds: [],
  },
  {
    id: 'downtown', name: 'Downtown',
    blurb: 'The commercial heart of the city. No venues here yet.',
    accent: '#3a352c', pos: { x: 47, y: 55 },
    buildingIds: [],
  },
  {
    id: 'park', name: 'Park District',
    blurb: 'Green space and quiet. No venues here yet.',
    accent: '#4a6149', pos: { x: 13, y: 66 },
    buildingIds: [],
  },
  {
    id: 'waterfront', name: 'Waterfront',
    blurb: 'Docks and open water. No venues here yet.',
    accent: '#2f4a55', pos: { x: 50, y: 86 },
    buildingIds: [],
  },
];
/** which district a building sits in */
export function districtOfBuilding(buildingId: string): DistrictDef | null {
  return DISTRICTS.find(d => d.buildingIds.includes(buildingId)) || null;
}

/* --- artifact type -> slot icon (emoji glyph for the MVP) -- */
export const TYPE_ICON: Record<string, string> = {
  Painting: '🖼', Drawing: '✎', Fresco: '🖼',
  Sculpture: '🗿', Relief: '⛏', Bronze: '🗿',
  Ceramic: '⚱', Lacquerware: '⚱', Carving: '⚱',
  'Woodblock Print': '🖼', Manuscript: '📜', Inscription: '📜',
  'Funerary Object': '⚱', Jewellery: '💍',
};
export function typeIcon(type: string): string {
  return TYPE_ICON[type] || '◆';
}

/* --- research tiers (Nth extra specialty) ------------------ */
export const RESEARCH_TIERS = [
  { fameReq: 20,  fee: 1200 },
  { fameReq: 60,  fee: 2500 },
  { fameReq: 130, fee: 4500 },
];

/* --- ticket pricing ---------------------------------------- */
export const TICKET_PRICING = {
  free:     { label: 'Free',     revenuePerVisitor: 0,   visitorMult: 1.35 },
  low:      { label: 'Low',      revenuePerVisitor: 1.0, visitorMult: 1.15 },
  standard: { label: 'Standard', revenuePerVisitor: 1.8, visitorMult: 1.0 },
  premium:  { label: 'Premium',  revenuePerVisitor: 3.0, visitorMult: 0.78 },
} as const;

/* --- advertising ------------------------------------------- */
export const AD_CAMPAIGN = { cost: 700, weeks: 4, visitorMult: 1.4 };

export const START = {
  funds: 1500,
  totalWeeks: 50,
  roomCost: 600,
  attendFeeAuction: 90,
  attendFeeDonation: 45,
  eventChancePerSpecialty: 0.5,   // each specialty independently rolls
  maxEventsPerWeek: 3,
};
