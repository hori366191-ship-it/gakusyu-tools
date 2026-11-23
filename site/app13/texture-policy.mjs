export const MAP_LEVELS = Object.freeze({
  mercury: Object.freeze([512, 1024]),
  venus: Object.freeze([720, 1440]),
  earth: Object.freeze([1024, 2048, 4096]),
  mars: Object.freeze([1024, 2048, 4096]),
  jupiter: Object.freeze([1024, 2048, 3600]),
  saturn: Object.freeze([720, 1800]),
  uranus: Object.freeze([384, 720]),
  neptune: Object.freeze([384, 720]),
});

// angularRadius is sin(angle)≈radius/distance. One high-detail map at a time.
export function preferredMapSize(id, angularRadius, quality, coarse, deviceLimit) {
  const [preview, close, fine] = MAP_LEVELS[id] || [];
  if (!preview || preview > deviceLimit || angularRadius < .023) return 0;
  if (quality === 0 || angularRadius < (quality === 1 ? .19 : .115)) return preview;
  // On desktop, skip the intermediate download during a normal approach.
  if (quality === 3 && !coarse && fine <= deviceLimit) return angularRadius >= .17 ? fine : preview;
  return close <= deviceLimit ? close : preview;
}
