/**
 * 32-bit FNV-1a over the UTF-16 code units of a string, with an optional seed mixed into the offset
 * basis. Pure integer math (Math.imul), so results are identical in every JS engine.
 */
export function fnv1a32(text: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Final avalanche (from murmur3's fmix32) so low bits are well distributed for `% dims`.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}
