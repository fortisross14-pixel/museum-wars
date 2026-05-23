/* ============================================================
   ENGINE — UTILITIES  ( src/engine/ )
   Pure helpers. RNG isolated here so it can be seeded for tests.
   ============================================================ */

export const rand = (min: number, max: number) =>
  Math.random() * (max - min) + min;
export const randInt = (min: number, max: number) =>
  Math.floor(rand(min, max + 1));
export const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

/** a roughly-normal random value, mean 0, ~99.7% within ±1
 *  (Box-Muller, clamped). Used for auction sale variance. */
export const gaussian = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) / 3;
  return Math.max(-1, Math.min(1, g));
};

export const money = (n: number) => '§' + Math.round(n).toLocaleString();

/** star string for an expertise value 0..5 */
export const stars = (n: number) => {
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '')
    + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
};

let idCounter = 0;
export const uid = (prefix: string) => `${prefix}_${Date.now()}_${idCounter++}`;
