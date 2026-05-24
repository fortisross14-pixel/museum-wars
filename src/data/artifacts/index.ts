/* ============================================================
   ARTIFACT DATABASE — INDEX  ( src/data/artifacts/ )
   Merges every artifact source into a single ARTIFACTS array and
   the ARTIFACT_BY_ID lookup. The rest of the app imports from
   '../data/artifacts' exactly as before — this file is the only
   thing that needs to change when a new batch is added.

   Sources, in id order:
     pass1.ts       ids 0001-0210  — 10 core icons + 200 real works
     pass2.ts       ids 0211-0410  — 200 real works
     pass3.ts       ids 0411-0610  — 200 real / inspired-by-real works
     procedural.ts  ids 0611+      — generated Common-tier filler

   TO ADD A NEW HAND-AUTHORED BATCH:
     1. drop e.g. pass3.ts into this folder (exports an Artifact[])
     2. import it below and add it to the ARTIFACTS spread
     3. raise PROCEDURAL_START_ID to sit after the new batch
   ============================================================ */
import type { Artifact } from '../types';
import { ARTIFACTS_PASS1 } from './pass1';
import { ARTIFACTS_PASS2 } from './pass2';
import { ARTIFACTS_PASS3 } from './pass3';
import { generateCommonArtifacts } from './procedural';

/** how many procedural Common-tier artifacts to generate */
export const PROCEDURAL_COUNT = 300;
/** first id for the procedural block — must sit after the last
 *  hand-authored id (currently 0610). */
export const PROCEDURAL_START_ID = 611;

const HANDCRAFTED: Artifact[] = [
  ...ARTIFACTS_PASS1,
  ...ARTIFACTS_PASS2,
  ...ARTIFACTS_PASS3,
];

const PROCEDURAL: Artifact[] = generateCommonArtifacts(
  PROCEDURAL_COUNT, PROCEDURAL_START_ID,
);

/** the full catalogue */
export const ARTIFACTS: Artifact[] = [
  ...HANDCRAFTED,
  ...PROCEDURAL,
];

/** quick lookup by id */
export const ARTIFACT_BY_ID: Record<string, Artifact> =
  Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));

/* --- a dev-time integrity check ----------------------------
   Catches duplicate ids if two batches overlap. Tree-shaken out
   of production builds; in dev it warns to the console. */
if (import.meta.env?.DEV) {
  const seen = new Set<string>();
  for (const a of ARTIFACTS) {
    if (seen.has(a.id)) console.warn(`[artifacts] duplicate id: ${a.id}`);
    seen.add(a.id);
  }
}
