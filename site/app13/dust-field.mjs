/**
 * 星巡りの塵・小石の純粋ロジック。three.js に依存しないので Node から直接テストできる。
 *
 * 座標はすべて scene units（1 AU = 1000）で、カメラを原点とした相対座標。
 * 演出は「接近中に粒が横を抜け、動いている粒だけが筋になる」ことだけを目的にしていて、
 * 実寸・実密度とは関係ない。
 */

/** 品質別の粒数（0 = 軽量では出さない）。末尾が高精細の最大数で、レイアウトもこの数で作る。
 *  省電力・バランス・高精細はおおよそ 40% / 70% / 100%。 */
export const GRAIN_COUNTS = {
  near: [0, 180, 320, 450],
  mid: [0, 180, 320, 450],
  far: [0, 360, 620, 900],
};

/** 筋が上限まで伸びたときの不透明度係数の下限。 */
export const STREAK_ALPHA_FLOOR = .28;

/** 決定的な疑似乱数（sky.mjs と同じ LCG）。 */
export function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * GLSL の mod と同じ折り返し。常に [0, size) を返す。
 * 負値・巨大値・NaN でも範囲外を返さない。
 */
export function wrapOffset(value, size) {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  const wrapped = value % size;
  // `+ 0` normalises -0 so callers always see a plain number.
  return (wrapped < 0 ? wrapped + size : wrapped) + 0;
}

/**
 * 接近中だけ筋を出すための強さ（0..1）。viewer が visit の進捗と組み合わせて使う。
 * - 新しい天体への接近: 出発直後に滑らかに立ち上げ、到着前に滑らかに弱める。
 * - 同じ天体の環視点切替（same）: 常に 0（筋を出さない）。
 * - reduced-motion: 呼び出し側で 0 にする（ここでは判定しない）。
 */
export function approachStreak(progress, same = false) {
  if (same) return 0;
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const smooth = v => v * v * (3 - 2 * v);
  const rise = smooth(Math.min(1, Math.max(0, (t - .02) / .16)));
  const fall = smooth(Math.min(1, Math.max(0, (t - .72) / .25)));
  return rise * (1 - fall);
}

/**
 * 箱（±halfExtent）の中に粒を決定的に並べる。
 * uniformBox を true にすると各軸 (rng()*2-1)*halfExtent の一様分布にし、半径系の指定は無視する
 * （一様なら GLSL の mod 折り返しで密度が保たれ、カメラ移動で球ごと画面外へずれない）。
 * それ以外では radius は [下限, 上限]、bias は半径分布（1 で一様、大きいほどカメラ寄りに集まる）、
 * logRadius を true にすると距離を rMin*(rMax/rMin)^u の対数分布にする。
 * rocks 個だけ kind=1（小石）にし、サイズを rockSize から取る。
 */
export function grainLayout(count, halfExtent, seed, options = {}) {
  const {
    radius = [halfExtent * .03, halfExtent * .82],
    bias = 1,
    logRadius = false,
    uniformBox = false,
    size = [.9, 1.8],
    tone = [.45, 1],
    rocks = 0,
    rockSize = [3, 8],
  } = options;
  const total = Math.max(0, Math.floor(count));
  const [rMin, rMax] = radius;
  const [sMin, sMax] = size;
  const [tMin, tMax] = tone;
  const rng = randomSequence(seed);
  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const tones = new Float32Array(total);
  const kinds = new Float32Array(total);
  const seeds = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (uniformBox) {
      // Uniform over the whole box: mod-wrapping then preserves the density
      // and the field never slides away from the camera.
      positions[i * 3] = (rng() * 2 - 1) * halfExtent;
      positions[i * 3 + 1] = (rng() * 2 - 1) * halfExtent;
      positions[i * 3 + 2] = (rng() * 2 - 1) * halfExtent;
    } else {
      const y = rng() * 2 - 1;
      const phi = rng() * Math.PI * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const dir = [ring * Math.cos(phi), y, ring * Math.sin(phi)];
      // 箱の面まで届く距離に収めてから半径を決める。
      const reach = Math.min(
        ...dir.map(axis => (Math.abs(axis) > 1e-6 ? halfExtent / Math.abs(axis) : Infinity)),
      );
      const distance = Math.min(
        logRadius && rMin > 0
          ? rMin * Math.pow(rMax / rMin, rng())
          : rMin + (rMax - rMin) * Math.pow(rng(), bias),
        reach,
      );
      positions[i * 3] = dir[0] * distance;
      positions[i * 3 + 1] = dir[1] * distance;
      positions[i * 3 + 2] = dir[2] * distance;
    }
    const rock = i < rocks;
    const pick = rng();
    kinds[i] = rock ? 1 : 0;
    sizes[i] = rock
      ? rockSize[0] + (rockSize[1] - rockSize[0]) * pick
      : sMin + (sMax - sMin) * pick;
    tones[i] = tMin + (tMax - tMin) * rng();
    seeds[i] = rng();
  }
  return { positions, sizes, tones, kinds, seeds };
}
