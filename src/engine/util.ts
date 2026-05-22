/* ============================================================
   ENGINE — UTILITIES  ( src/engine/ )
   Pure helpers. RNG isolated here so it can be seeded for tests.
   ============================================================ */

export const rand = (min: number, max: number) =>
  Math.random() * (max - min) + min;
export const randInt = (min: number, max: number) =>
  Math.floor(rand(min, max + 1));
export const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

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
