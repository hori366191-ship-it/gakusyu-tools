import { AU_KM, orbitalPoint, RAD, TAU } from './bodies.mjs';

export const MOON_ORBITS = 'https://ssd.jpl.nasa.gov/sats/elem/';
export const MOON_RADII = 'https://ssd.jpl.nasa.gov/sats/phys_par/';

// Rounded JPL SSD mean elements. Node, periapsis and starting phase orient the
// illustrative orbits; they do not define a common date for the scene.
// For most Laplace-plane entries the equator is a close approximation. The
// larger Laplace-plane tilt for Iapetus is applied separately.
function moon(parentId, id, name, km, aKm, e, i, node, peri, phase, period, color, terrain, options = {}) {
  return Object.freeze({
    parentId, id, name, en: id[0].toUpperCase() + id.slice(1), kind: '天然衛星',
    km, aKm, a: aKm / AU_KM, e, i, node, peri, phase, period, color, terrain,
    frame: 'equator', planeTilt: 0, synchronous: true, ...options,
  });
}

export const MOONS = Object.freeze([
  moon('earth', 'moon', '月', 1737.4, 384400, .0554, 5.16, 125.08, 318.15, 135.27, 27.322, '#beb6ab', 'maria', { frame: 'ecliptic' }),
  moon('mars', 'phobos', 'フォボス', 11.08, 9375, .015, 1.1, 169.2, 216.3, 189.7, .3187, '#aca092', 'rock', { shape: [1.21, .81, 1.02], crater: .40 }),
  moon('mars', 'deimos', 'ダイモス', 6.2, 23457, 0, 1.8, 54.3, 0, 205, 1.2625, '#b8a59a', 'rock', { shape: [1.21, .90, .92] }),
  moon('jupiter', 'io', 'イオ', 1821.49, 421800, .004, 0, 0, 49.1, 330.9, 1.762732, '#e8c871', 'volcanic'),
  moon('jupiter', 'europa', 'エウロパ', 1560.8, 671100, .009, .5, 184, 45, 345.4, 3.525463, '#dfd2bd', 'fractured'),
  moon('jupiter', 'ganymede', 'ガニメデ', 2631.2, 1070400, .001, .2, 58.5, 198.3, 324.8, 7.155588, '#b7a595', 'mixed'),
  moon('jupiter', 'callisto', 'カリスト', 2410.3, 1882700, .007, .3, 309.1, 43.8, 87.4, 16.69044, '#a49888', 'craters'),
  moon('saturn', 'mimas', 'ミマス', 198.2, 186000, .020, 1.6, 66.2, 160.4, 275.3, .942422, '#bdbfc1', 'craters', { crater: .33 }),
  moon('saturn', 'enceladus', 'エンケラドゥス', 252.1, 238400, .005, 0, 0, 119.5, 57, 1.370218, '#e1e7e9', 'fractured'),
  moon('saturn', 'tethys', 'テティス', 531.1, 295000, .001, 1.1, 273, 335.3, 0, 1.887802, '#c6c8c2', 'craters', { crater: .39 }),
  moon('saturn', 'dione', 'ディオネ', 561.4, 377700, .002, 0, 0, 116, 212, 2.736916, '#bfc6c8', 'fractured'),
  moon('saturn', 'rhea', 'レア', 763.5, 527200, .001, .3, 133.7, 44.3, 31.5, 4.517503, '#c7c9c9', 'craters'),
  moon('saturn', 'titan', 'タイタン', 2574.76, 1221900, .029, .3, 78.6, 78.3, 11.7, 15.945448, '#e4a05d', 'haze', { planeTilt: .6 }),
  moon('saturn', 'iapetus', 'イアペトゥス', 734.3, 3561700, .028, 7.6, 86.5, 254.5, 74.8, 79.331002, '#c4b8a8', 'two-tone', { planeTilt: 14.8 }),
  moon('uranus', 'miranda', 'ミランダ', 235.8, 129846, .001, 4.4, 100.9, 154.8, 73, 1.413479, '#bbc1c7', 'mixed'),
  moon('uranus', 'ariel', 'アリエル', 578.9, 190929, .001, 0, 0, 9.6, 193.5, 2.520379, '#bec5cc', 'fractured'),
  moon('uranus', 'umbriel', 'ウンブリエル', 584.7, 265986, .004, .1, 174.8, 183.4, 253, 4.144177, '#92939b', 'craters'),
  moon('uranus', 'titania', 'チタニア', 788.9, 436298, .002, .1, 29.5, 184, 68.1, 8.705869, '#b8b3b1', 'mixed'),
  moon('uranus', 'oberon', 'オベロン', 761.4, 583511, .002, .1, 76.8, 132.2, 143.6, 13.463237, '#b1a9a6', 'craters'),
  moon('neptune', 'triton', 'トリトン', 1352.6, 354800, 0, 157.3, 177.7, 0, 63, 5.8792, '#d6bcba', 'mixed'),
  moon('neptune', 'nereid', 'ネレイド', 170, 5513900, .751, 5.1, 319.5, 296.8, 318.5, 360.133039, '#a8a6ad', 'craters', { frame: 'ecliptic', synchronous: false }),
]);

const groups = new Map();
for (const body of MOONS) {
  if (!groups.has(body.parentId)) groups.set(body.parentId, []);
  groups.get(body.parentId).push(body);
}
for (const moons of groups.values()) Object.freeze(moons);
const noMoons = Object.freeze([]);
export const moonsOf = id => groups.get(id) || noMoons;

export function moonMeanAt(body, days) {
  return body.phase * RAD + TAU * (days % body.period) / body.period;
}

// Components in AU in the indicated local reference plane. The rendered
// parent basis is applied to these vectors, never to the planet's daily spin.
export function moonOffsetAt(body, days) {
  const [x, y, z] = orbitalPoint(body, moonMeanAt(body, days));
  const c = Math.cos(body.planeTilt * RAD), s = Math.sin(body.planeTilt * RAD);
  return [x, y * c - z * s, y * s + z * c];
}

export function moonOrbitNormal(body) {
  const i = body.i * RAD, node = body.node * RAD, tilt = body.planeTilt * RAD;
  const x = Math.sin(i) * Math.sin(node), y = Math.cos(i), z = Math.sin(i) * Math.cos(node);
  return [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
}

export function moonReadings(body, parentName) {
  const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
  const hours = body.period < 1;
  return [
    ['親惑星', parentName],
    ['平均半径', `${format.format(body.km)} km`],
    ['軌道長半径（親惑星中心から）', `${format.format(body.aKm)} km`],
    ['親惑星を回る周期', `${format.format(body.period * (hours ? 24 : 1))} ${hours ? '時間' : '日'}${body.i > 90 ? '（逆行）' : ''}`],
  ];
}
