import type { Artifact, ArtType, StyleId } from '../types';

/* ============================================================
   PROCEDURAL ARTIFACTS — the COMMON tier (score 0-9)
   Hand-authored files cover Uncommon and above. This module
   fills the Common tier with believable, modest filler: workshop
   pieces, fragments, sketches, anonymous objects. Generation is
   DETERMINISTIC (a seeded RNG) so the catalogue and its ids are
   stable between runs and reloads.
   ids start at 0411, continuing after the hand-authored set.
   ============================================================ */

const STYLES: StyleId[] = [
  'egyptian', 'classical', 'medieval', 'renaissance', 'baroque',
  'asian', 'romanticism', 'impressionism', 'modernism',
  'contemporary', 'popculture', 'precolumbian', 'islamic',
];

/* per-type noun pools — modest, plausible Common-tier objects */
const NOUNS: Record<ArtType, string[]> = {
  Painting: [
    'Sketch', 'Study', 'Workshop Copy', 'Faded Panel', 'Devotional Card',
    'Unfinished Canvas', 'Decorative Fragment', 'Minor Portrait',
  ],
  Sculpture: [
    'Carved Fragment', 'Plaster Cast', 'Worn Relief', 'Small Figurine',
    'Broken Statuette', 'Architectural Fragment', 'Practice Carving',
  ],
  Manuscript: [
    'Torn Leaf', 'Scribal Exercise', 'Account Fragment', 'Margin Sketch',
    'Copybook Page', 'Damaged Folio', 'Letter Fragment',
  ],
  Object: [
    'Pottery Shard', 'Worn Coin', 'Clay Lamp', 'Bead String', 'Bone Tool',
    'Glass Fragment', 'Cracked Tile', 'Simple Vessel', 'Spindle Whorl',
  ],
};

/* gentle style-flavour adjectives */
const ADJECTIVES = [
  'Weathered', 'Modest', 'Faded', 'Chipped', 'Provincial', 'Plain',
  'Unattributed', 'Time-Worn', 'Humble', 'Rough-Hewn',
];

/* descriptive sentence fragments, kept deliberately understated */
const DESCRIPTIONS = [
  'A modest piece, valued more for its age than its artistry.',
  'A worn workshop object, its maker long forgotten.',
  'A small fragment, plain but genuinely old.',
  'An unremarkable piece that fills a gap in a collection.',
  'A damaged work, of interest mainly to the patient scholar.',
  'A common object of its time, surviving by sheer luck.',
];

const TYPE_WEIGHTS: [ArtType, number][] = [
  ['Painting', 0.40], ['Object', 0.32], ['Sculpture', 0.18], ['Manuscript', 0.10],
];

/* --- a tiny seeded RNG so output is stable ----------------- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function pad(n: number): string {
  return String(n).padStart(4, '0');
}

/** Build `count` Common-tier artifacts, ids starting at `startId`. */
export function generateCommonArtifacts(
  count: number, startId: number,
): Artifact[] {
  const rng = mulberry32(0x4D757365); // fixed seed -> stable catalogue
  const out: Artifact[] = [];
  for (let i = 0; i < count; i++) {
    const style = pick(rng, STYLES);
    // weighted type roll
    let r = rng(), type: ArtType = 'Painting';
    for (const [t, w] of TYPE_WEIGHTS) {
      if (r < w) { type = t; break; }
      r -= w;
    }
    const score = Math.floor(rng() * 10);            // 0-9, Common
    // Commons are cheap filler: roughly §1,000-§4,000, scaled by
    // score (quality) and nudged by type, with a little spread so
    // no two are quite alike. They repay through modest visitor
    // draw over time, not through being crowd-pullers.
    const typeMult = type === 'Painting' ? 1.1
      : type === 'Sculpture' ? 1.0
      : type === 'Object' ? 0.92 : 0.85;
    const value = Math.round(
      (1000 + score * 280) * typeMult * (0.85 + rng() * 0.5));
    const id = pad(startId + i);
    const noun = pick(rng, NOUNS[type]);
    const adj = pick(rng, ADJECTIVES);
    out.push({
      id,
      name: `${adj} ${noun}`,
      type, style,
      author: 'Unknown',
      year: 'undated',
      description: pick(rng, DESCRIPTIONS),
      score, value,
      image: `artifacts/${id}.jpg`,
    });
  }
  return out;
}
