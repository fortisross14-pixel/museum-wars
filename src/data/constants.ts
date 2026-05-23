/* ============================================================
   GAME CONSTANTS  ( src/data/ )  — STAGE 1 REWORK
   ============================================================ */
import type {
  StyleDef, StyleId, RarityBand, RarityId, ArtType,
  BuildingDef, DistrictDef, StaticMuseum,
} from './types';

/* --- styles (what a museum specialises in) ----------------- */
export const STYLES: Record<StyleId, StyleDef> = {
  egyptian:     { id: 'egyptian',     name: 'Egyptian' },
  classical:    { id: 'classical',    name: 'Classical' },
  medieval:     { id: 'medieval',     name: 'Medieval' },
  renaissance:  { id: 'renaissance',  name: 'Renaissance' },
  baroque:      { id: 'baroque',      name: 'Baroque' },
  asian:        { id: 'asian',        name: 'Asian' },
  romanticism:  { id: 'romanticism',  name: 'Romanticism' },
  impressionism:{ id: 'impressionism',name: 'Impressionism' },
  modernism:    { id: 'modernism',    name: 'Modernism' },
  contemporary: { id: 'contemporary', name: 'Contemporary' },
  popculture:   { id: 'popculture',   name: 'Pop Culture' },
  precolumbian: { id: 'precolumbian', name: 'Pre-Columbian' },
  islamic:      { id: 'islamic',      name: 'Islamic' },
};
export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/* --- artifact types ---------------------------------------- */
export const ART_TYPES: ArtType[] = ['Painting', 'Sculpture', 'Manuscript', 'Object'];

/* --- rarity bands (derived from score) --------------------- */
export const RARITY_BANDS: RarityBand[] = [
  { id: 'common',    name: 'Common',     min: 0,   cls: 'r-common',    hex: '#6f6657' },
  { id: 'uncommon',  name: 'Uncommon',   min: 10,  cls: 'r-uncommon',  hex: '#4a6149' },
  { id: 'rare',      name: 'Rare',       min: 20,  cls: 'r-rare',      hex: '#2f6485' },
  { id: 'epic',      name: 'Epic',       min: 50,  cls: 'r-epic',      hex: '#7d4f9c' },
  { id: 'legend',    name: 'Legend',     min: 100, cls: 'r-legend',    hex: '#b06d1f' },
  { id: 'worldicon', name: 'World Icon', min: 200, cls: 'r-worldicon', hex: '#8b3a2f' },
];
export function rarityForScore(score: number): RarityBand {
  let band = RARITY_BANDS[0];
  for (const b of RARITY_BANDS) if (score >= b.min) band = b;
  return band;
}
export function rarityById(id: RarityId): RarityBand {
  return RARITY_BANDS.find(b => b.id === id) ?? RARITY_BANDS[0];
}

/* --- artifact type -> slot icon ---------------------------- */
export const TYPE_ICON: Record<ArtType, string> = {
  Painting: '🖼', Sculpture: '🗿', Manuscript: '📜', Object: '⚱',
};
export const typeIcon = (t: ArtType) => TYPE_ICON[t] || '◆';

/* --- buildings --------------------------------------------- */
export const ROOM_CAPACITY = 5;
export const BUILDINGS: Record<string, BuildingDef> = {
  local: {
    id: 'local', name: 'Local Gallery',
    blurb: 'A rented room in a small city. A beginning.',
    prestige: 1.0, moveCost: 0, maintenance: 1400,
    halls: [{ id: 'ground', name: 'Ground Floor', roomCap: 3, startRooms: 1 }],
  },
  town: {
    id: 'town', name: 'Town Museum',
    blurb: 'A civic museum across two halls.',
    prestige: 1.6, moveCost: 1600, maintenance: 4200,
    halls: [
      { id: 'east', name: 'East Hall', roomCap: 3, startRooms: 2 },
      { id: 'west', name: 'West Hall', roomCap: 3, startRooms: 1 },
    ],
  },
  palace: {
    id: 'palace', name: 'Historic Palace',
    blurb: 'A grand palace of three wings.',
    prestige: 2.4, moveCost: 4200, maintenance: 11000,
    halls: [
      { id: 'north', name: 'North Wing', roomCap: 3, startRooms: 2 },
      { id: 'south', name: 'South Wing', roomCap: 3, startRooms: 2 },
      { id: 'grand', name: 'Grand Wing', roomCap: 3, startRooms: 1 },
    ],
  },
};
export const BUILDING_ORDER = ['local', 'town', 'palace'];

/* --- districts (7) ----------------------------------------- */
export const DISTRICTS: DistrictDef[] = [
  { id: 'historic', name: 'Historic District',
    blurb: 'Old streets and civic halls — where a small museum can begin.',
    accent: '#b9892f', pos: { x: 82, y: 70 }, buildingIds: ['local', 'town'] },
  { id: 'art', name: 'Art District',
    blurb: 'Grand institutions and collectors. The address of a great museum.',
    accent: '#8b3a2f', pos: { x: 83, y: 20 }, buildingIds: ['palace'] },
  { id: 'college', name: 'College District',
    blurb: 'Universities and young crowds. No venues here yet.',
    accent: '#3f6694', pos: { x: 18, y: 17 }, buildingIds: [] },
  { id: 'bohemian', name: 'Bohemian Neighborhood',
    blurb: 'Artists and studios. No venues here yet.',
    accent: '#6b4a8a', pos: { x: 49, y: 17 }, buildingIds: [] },
  { id: 'downtown', name: 'Downtown',
    blurb: 'The commercial heart of the city. No venues here yet.',
    accent: '#3a352c', pos: { x: 47, y: 55 }, buildingIds: [] },
  { id: 'park', name: 'Park District',
    blurb: 'Green space and quiet. No venues here yet.',
    accent: '#4a6149', pos: { x: 13, y: 66 }, buildingIds: [] },
  { id: 'waterfront', name: 'Waterfront',
    blurb: 'Docks and open water. No venues here yet.',
    accent: '#2f4a55', pos: { x: 50, y: 86 }, buildingIds: [] },
];
export function districtOfBuilding(buildingId: string): DistrictDef | null {
  return DISTRICTS.find(d => d.buildingIds.includes(buildingId)) || null;
}

/* --- research tiers (Nth extra specialty) ------------------ */
export const RESEARCH_TIERS = [
  { fameReq: 20,  fee: 1200 },
  { fameReq: 60,  fee: 2500 },
  { fameReq: 130, fee: 4500 },
  { fameReq: 240, fee: 7000 },
];

/* --- advertising ------------------------------------------- */
export const AD_CAMPAIGN = { cost: 700, weeks: 4, visitorMult: 1.4 };

export const START = {
  funds: 50000,
  roomCost: 600,
  eventChancePerSpecialty: 0.5,
  maxEventsPerWeek: 3,
  defaultTicket: 8,            // starting ticket price
};

/* ============================================================
   AUCTION HOUSES
   Three fame-gated houses. Each has a rarity mix (weights for
   Common / Uncommon / Rare / Epic / Legend) and a join fee paid
   once. Lots still skew toward the player's unlocked styles, but
   the RARITY spread is set by the house. World Icons never appear
   in any house. More specialised houses can be added later.
   ============================================================ */
export interface AuctionHouseDef {
  id: string;
  name: string;
  blurb: string;
  fameToUnlock: number;       // fame needed before the house opens
  joinFee: number;            // one-time fee to gain access
  attendFee: number;          // fee charged each time you attend
  /** rarity weights: [common, uncommon, rare, epic, legend] */
  rarityWeights: [number, number, number, number, number];
}
export const AUCTION_HOUSES: AuctionHouseDef[] = [
  {
    id: 'house1',
    name: 'The Old Quarter Saleroom',
    blurb: 'A modest saleroom of estate clearances and minor lots.',
    fameToUnlock: 0, joinFee: 0, attendFee: 0,
    rarityWeights: [90, 9, 1, 0, 0],
  },
  {
    id: 'house2',
    name: 'Harringate & Cole Auctioneers',
    blurb: 'An established house drawing finer regional collections.',
    fameToUnlock: 120, joinFee: 200, attendFee: 60,
    rarityWeights: [75, 15, 9, 1, 0],
  },
  {
    id: 'house3',
    name: 'The Belvedere Rooms',
    blurb: 'A world auction house where legendary works change hands.',
    fameToUnlock: 600, joinFee: 1500, attendFee: 250,
    rarityWeights: [50, 20, 15, 12, 3],
  },
];

/* --- the three rival players' names ------------------------ */
export const RIVAL_NAMES = [
  'The Thorncrest Collection',
  'Adler & Voss Gallery',
  'The Marchetti Museum',
];

/* ============================================================
   STATIC COMPETITOR MUSEUMS
   Real-inspired, freely invented numbers. Numbers never change —
   they are fixed benchmarks the player's stats are measured
   against. `inYourCity` museums also appear in the City ranking.
   Tiers: 8 global, ~17 national, rest regional/local.
   ============================================================ */
export const STATIC_MUSEUMS: StaticMuseum[] = [
  /* --- global icons (8) --- */
  { id: 'louvre',      name: 'The Louvre',                 city: 'Paris',     tier: 'global', inYourCity: false, fame: 2400, quality: 2100, visitors: 85800 },
  { id: 'british',     name: 'The British Museum',         city: 'London',    tier: 'global', inYourCity: false, fame: 2150, quality: 2300, visitors: 109400 },
  { id: 'met',         name: 'The Metropolitan Museum',    city: 'New York',  tier: 'global', inYourCity: false, fame: 2050, quality: 1950, visitors: 88700 },
  { id: 'prado',       name: 'Museo del Prado',            city: 'Madrid',    tier: 'global', inYourCity: false, fame: 1700, quality: 1850, visitors: 122600 },
  { id: 'vatican',     name: 'The Vatican Museums',        city: 'Vatican',   tier: 'global', inYourCity: false, fame: 1900, quality: 2000, visitors: 70800 },
  { id: 'uffizi',      name: 'The Uffizi Gallery',         city: 'Florence',  tier: 'global', inYourCity: false, fame: 1650, quality: 1700, visitors: 101900 },
  { id: 'hermitage',   name: 'The State Hermitage',        city: 'St. Petersburg', tier: 'global', inYourCity: false, fame: 1750, quality: 1900, visitors: 112300 },
  { id: 'palace-mus',  name: 'The Palace Museum',          city: 'Beijing',   tier: 'global', inYourCity: false, fame: 1800, quality: 1600, visitors: 137600 },

  /* --- national (17) --- */
  { id: 'reinasofia', name: 'Museo Reina Sofía',           city: 'Madrid',    tier: 'national', inYourCity: false, fame: 920,  quality: 860,  visitors: 8200 },
  { id: 'smithsonian',name: 'The Smithsonian',             city: 'Washington',tier: 'national', inYourCity: false, fame: 1100, quality: 940,  visitors: 11000 },
  { id: 'nationalgal',name: 'The National Gallery',        city: 'London',    tier: 'national', inYourCity: false, fame: 1050, quality: 1120, visitors: 41900 },
  { id: 'orsay',      name: "Musée d'Orsay",               city: 'Paris',     tier: 'national', inYourCity: false, fame: 980,  quality: 1010, visitors: 8800 },
  { id: 'rijks',      name: 'The Rijksmuseum',             city: 'Amsterdam', tier: 'national', inYourCity: false, fame: 1010, quality: 1080, visitors: 18800 },
  { id: 'natmuschina',name: 'National Museum of China',    city: 'Beijing',   tier: 'national', inYourCity: false, fame: 870,  quality: 760,  visitors: 12500 },
  { id: 'anthro-mx',  name: 'National Anthropology Museum',city: 'Mexico City',tier:'national', inYourCity: false, fame: 780,  quality: 880,  visitors: 6400 },
  { id: 'egyptmus',   name: 'The Egyptian Museum',         city: 'Cairo',     tier: 'national', inYourCity: false, fame: 940,  quality: 1240, visitors: 5200 },
  { id: 'tokyonat',   name: 'Tokyo National Museum',       city: 'Tokyo',     tier: 'national', inYourCity: false, fame: 820,  quality: 900,  visitors: 7300 },
  { id: 'tate',       name: 'Tate Modern',                 city: 'London',    tier: 'national', inYourCity: false, fame: 990,  quality: 740,  visitors: 10200 },
  { id: 'moma',       name: 'The Museum of Modern Art',    city: 'New York',  tier: 'national', inYourCity: false, fame: 1080, quality: 820,  visitors: 8600 },
  { id: 'natindia',   name: 'National Museum of India',    city: 'New Delhi', tier: 'national', inYourCity: false, fame: 690,  quality: 720,  visitors: 4800 },
  { id: 'pushkin',    name: 'The Pushkin Museum',          city: 'Moscow',    tier: 'national', inYourCity: false, fame: 640,  quality: 700,  visitors: 4100 },
  { id: 'kunsthist',  name: 'Kunsthistorisches Museum',    city: 'Vienna',    tier: 'national', inYourCity: false, fame: 760,  quality: 880,  visitors: 4600 },
  /* national museums in YOUR city (2) */
  { id: 'city-natl-1',name: 'The Whitlock National Museum',city: 'Your City', tier: 'national', inYourCity: true,  fame: 700,  quality: 660,  visitors: 5200 },
  { id: 'city-natl-2',name: 'The Grand Civic Museum',      city: 'Your City', tier: 'national', inYourCity: true,  fame: 620,  quality: 720,  visitors: 4400 },
  /* global museum in your city (1) */
  { id: 'city-global',name: 'The Imperial Museum',         city: 'Your City', tier: 'global',   inYourCity: true,  fame: 1500, quality: 1450, visitors: 16000 },

  /* --- regional (12) --- */
  { id: 'reg-1', name: 'Ashbourne Museum of Art',  city: 'Ashbourne',  tier: 'regional', inYourCity: false, fame: 340, quality: 300, visitors: 8600 },
  { id: 'reg-2', name: 'The Castleton Gallery',    city: 'Castleton',  tier: 'regional', inYourCity: false, fame: 280, quality: 360, visitors: 8900 },
  { id: 'reg-3', name: 'Fairhaven Art Institute',  city: 'Fairhaven',  tier: 'regional', inYourCity: false, fame: 410, quality: 320, visitors: 8200 },
  { id: 'reg-4', name: 'The Linden Collection',    city: 'Linden',     tier: 'regional', inYourCity: false, fame: 250, quality: 280, visitors: 3100 },
  { id: 'reg-5', name: 'Pemberton Museum',         city: 'Pemberton',  tier: 'regional', inYourCity: false, fame: 360, quality: 340, visitors: 8600 },
  { id: 'reg-6', name: 'The Hartwell Gallery',     city: 'Hartwell',   tier: 'regional', inYourCity: false, fame: 300, quality: 260, visitors: 8800 },
  { id: 'reg-7', name: 'Brightwater Art Museum',   city: 'Brightwater',tier: 'regional', inYourCity: false, fame: 430, quality: 380, visitors: 8200 },
  { id: 'reg-8', name: 'The Aldermoor Institute',  city: 'Aldermoor',  tier: 'regional', inYourCity: false, fame: 270, quality: 310, visitors: 3000 },
  { id: 'reg-9', name: 'Crestfield Museum',        city: 'Crestfield', tier: 'regional', inYourCity: false, fame: 390, quality: 290, visitors: 8400 },

  /* --- regional, in YOUR city (3 static local-tier benchmarks) --- */
  { id: 'city-loc-1', name: 'The Rosewood Gallery',  city: 'Your City', tier: 'local', inYourCity: true, fame: 90,  quality: 80,  visitors: 520 },
  { id: 'city-loc-2', name: 'Maple Street Museum',   city: 'Your City', tier: 'local', inYourCity: true, fame: 140, quality: 120, visitors: 1300 },
  { id: 'city-loc-3', name: 'The Old Mill Gallery',  city: 'Your City', tier: 'local', inYourCity: true, fame: 200, quality: 170, visitors: 800 },
  /* regional, in your city (3) */
  { id: 'city-reg-1', name: 'The Beaumont Museum',   city: 'Your City', tier: 'regional', inYourCity: true, fame: 320, quality: 290, visitors: 8900 },
  { id: 'city-reg-2', name: 'Harborview Art Museum', city: 'Your City', tier: 'regional', inYourCity: true, fame: 380, quality: 350, visitors: 8600 },
  { id: 'city-reg-3', name: 'The Sterling Collection',city:'Your City', tier: 'regional', inYourCity: true, fame: 290, quality: 330, visitors: 3000 },
];
