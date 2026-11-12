/**
 * 有機反応マップ（app11）— 主要バックボーンの部品配置
 *
 * 反応グラフの位相（primary-topology.cjs）を先に固定し、学習系列ごとの部品
 * （脂肪族主幹・エステル、サリチル酸、芳香族環、クメン法、油脂、糖、ペプチド、
 * 高分子）を明示座標で置く。力配置の seed 調整は行わない。
 *
 * - 物質は個別の幅・高さを持てる（次数の多いハブだけ広げる）。
 * - 反応点は丸頂点のまま。主要枝は priority-router.cjs が障害物を避けて配線する。
 * - ここで決めた座標は layout.json に保存し、閲覧時には再計算しない。
 */
'use strict';

const G = require('./geometry.cjs');

const BASE_W = 136;
const BASE_H = 34;

// 主要物質の中心座標。反応点は別表。
const COMPOUNDS = {
  // 脂肪族主幹・エステル
  'ethene': [500, 300],
  'ethanol': [500, 600],
  'ethanal': [180, 760],
  'acetic-acid': [500, 900],
  'ethyl-acetate': [500, 760],
  'diethyl-ether': [240, 460],
  'ethane': [500, 60],
  'bromoethane': [240, 160],
  '1,2-dibromoethane': [760, 160],
  'polyethylene': [820, 400],
  // メタノール系
  'methanol': [180, 1100],
  'formaldehyde': [-160, 820],
  'formic-acid': [0, 650],
  // サリチル酸・アスピリン
  'methyl-salicylate': [380, 1100],
  'salicylic-acid': [580, 1100],
  'aspirin': [880, 1100],
  'acetic-anhydride': [1030, 1380],
  // 芳香族環（ringPlacements で上書きする）
  'benzene': [1836, 1177],
  'nitrobenzene': [1656, 872],
  'aniline': [1411, 737],
  'benzenediazonium-chloride': [1737, 464],
  'phenol': [2181, 573],
  'sodium-phenoxide': [2418, 667],
  'chlorobenzene': [2263, 936],
  'benzenesulfonic-acid': [1580, 1280],
  'p-hydroxyazobenzene': [1963, 220],
  'acetanilide': [1350, 1150],
  // クメン法・プロペン
  'cumene': [2050, 160],
  'cumene-hydroperoxide': [2500, 300],
  'acetone': [2620, 560],
  'propan-2-ol': [3050, 800],
  'propene': [2600, 1000],
  'propane': [2250, 1150],
  'polypropylene': [3000, 1250],
  // ベンジルアルコール
  'benzyl-alcohol': [2950, 350],
  'benzaldehyde': [3150, 350],
  'benzoic-acid': [3350, 350],
  // 油脂（平面埋め込みの縦系列）
  'glycerol': [100, 1500],
  'tristearin': [660, 1860],
  'stearic-acid': [660, 1620],
  'sodium-stearate': [500, 2100],
  'triolein': [900, 1860],
  // 糖
  'starch': [1400, 1550],
  'maltose': [1600, 1450],
  'glucose': [1700, 1600],
  'sucrose': [1900, 1500],
  'fructose': [1900, 1700],
  // ペプチド
  'glycine': [2500, 1750],
  'glycylalanine': [2700, 1750],
  'alanine': [2900, 1750],
  // PET
  'p-xylene': [1300, 1950],
  'terephthalic-acid': [1550, 2050],
  'ethylene-glycol': [1750, 1950],
  'pet': [1850, 2130],
  // ナイロン66
  'adipic-acid': [2250, 1950],
  'hexamethylenediamine': [2550, 1950],
  'nylon66': [2400, 2100],
  // 付加重合の独立成分
  'styrene': [3300, 1500],
  'polystyrene': [3300, 1380],
  'vinyl-chloride': [3300, 1730],
  'pvc': [3300, 1850],
  'caprolactam': [3300, 2050],
  'nylon6': [3300, 2130],
  // メタン
  'methane': [0, 300],
  'chloromethane': [0, 60]
};

// 芳香族環は 14 頂点の閉路。angle は画面座標（0=右, 90=下）。
const RING = [
  ['c:benzene', 97.1],
  ['r:benzene-nitration', 122.9],
  ['c:nitrobenzene', 148.6],
  ['r:nitrobenzene-reduction', 174.3],
  ['c:aniline', 200],
  ['r:aniline-diazotization', 225.7],
  ['c:benzenediazonium-chloride', 251.4],
  ['r:diazonium-phenol-coupling', 277.1],
  ['c:phenol', 302.9],
  ['r:phenol-acid-neutralization', 328.6],
  ['c:sodium-phenoxide', 354.3],
  ['r:chlorobenzene-dow-phenol', 20],
  ['c:chlorobenzene', 45.7],
  ['r:benzene-chlorination', 71.4]
];
const RING_CENTER = [1900, 850];
const RING_RX = 520;
const RING_RY = 330;

const REACTIONS = {
  'methane-chlorination': [0, 180],
  'ethene-bromine-addition': [620, 220],
  'ethene-hydrogen-bromide': [380, 220],
  'ethene-hydrogenation': [500, 180],
  'ethene-hydration': [500, 450],
  'ethanol-dehydration-ether': [380, 520],
  'ethanol-oxidation-ethanal': [240, 680],
  'ethanal-oxidation-acetic': [240, 840],
  'methanol-oxidation-formaldehyde': [100, 950],
  'formaldehyde-oxidation-formic': [-80, 740],
  'acetic-acid-ethanol-esterification': [340, 760],
  'ethyl-acetate-hydrolysis': [660, 760],
  'salicylic-acid-methyl-esterification': [380, 1230],
  'methyl-salicylate-hydrolysis': [380, 970],
  'salicylic-acid-acetylation': [730, 1230],
  'aspirin-hydrolysis': [730, 970],
  'aniline-acetic-anhydride': [1250, 1000],
  'benzene-sulfonation': [1780, 1320],
  'cumene-oxidation': [2250, 220],
  'cumene-hydroperoxide-decomposition': [2600, 400],
  'propan-2-ol-oxidation': [2830, 670],
  'propene-hydration': [2820, 900],
  'propene-hydrogenation': [2420, 1080],
  'propene-polymerization': [2800, 1120],
  'benzyl-alcohol-oxidation': [3050, 230],
  'benzaldehyde-oxidation': [3250, 230],
  'glycerol-stearic-esterification': [900, 1500],
  'tristearin-hydrolysis': [660, 1740],
  'tristearin-saponification': [580, 1980],
  'triolein-hydrogenation': [800, 1800],
  'sucrose-hydrolysis': [1800, 1600],
  'starch-hydrolysis-maltose': [1500, 1500],
  'starch-hydrolysis-glucose': [1550, 1600],
  'glycine-alanine-peptide': [2700, 1620],
  'glycylalanine-hydrolysis': [2700, 1880],
  'ethene-polymerization': [660, 360],
  'styrene-polymerization': [3180, 1440],
  'vinyl-chloride-polymerization': [3180, 1790],
  'caprolactam-ring-opening': [3180, 2110],
  'nylon66-condensation': [2400, 1880],
  'pet-condensation': [1700, 2070],
  'p-xylene-oxidation': [1425, 1880]
};

// 環のうち、閉路の頂点でない補助的な反応点（phenol と phenoxide の間の弦）。
const EXTRA_REACTIONS = {
  'sodium-phenoxide-acidification': [2450, 620],
  'phenol-acid-neutralization': [2150, 700],
  'benzene-sulfonation': [1700, 1270]
};

function ringPlacements() {
  const out = {};
  for (const [id, angle] of RING) {
    const rad = (angle * Math.PI) / 180;
    out[id] = [
      RING_CENTER[0] + RING_RX * Math.cos(rad),
      RING_CENTER[1] + RING_RY * Math.sin(rad)
    ];
  }
  return out;
}

function totalDegrees(source) {
  const degree = new Map();
  const touch = (id) => degree.set(id, (degree.get(id) || 0) + 1);
  for (const reaction of source.reactions) {
    for (const id of reaction.substrates) touch(id);
    for (const id of reaction.products) touch(id);
  }
  return degree;
}

function sizeFor(id, degree) {
  const d = degree.get(id) || 0;
  let w = BASE_W;
  if (d >= 8) w = 212;
  else if (d >= 6) w = 194;
  else if (d >= 4) w = 176;
  return { w, h: BASE_H };
}

function placePrimaryNodes(source) {
  const ring = ringPlacements();
  const degree = totalDegrees(source);
  const nodes = new Map();
  const reactions = new Map();
  const primaryReactionIds = source.reactions
    .filter((r) => source.priority.entries.get(r.id).tier === 'primary')
    .map((r) => r.id);
  const primaryCompoundIds = new Set();
  for (const r of source.reactions) {
    if (source.priority.entries.get(r.id).tier !== 'primary') continue;
    for (const id of r.substrates.concat(r.products)) primaryCompoundIds.add(id);
  }
  for (const id of [...primaryCompoundIds].sort()) {
    const point = COMPOUNDS[id] || ring['c:' + id];
    if (!point) throw new Error('主要物質の初期座標がない: ' + id);
    const size = sizeFor(id, degree);
    nodes.set(id, { x: point[0], y: point[1], w: size.w, h: size.h });
  }
  for (const rid of primaryReactionIds) {
    const point = REACTIONS[rid] || EXTRA_REACTIONS[rid] ||
      (() => {
        const hit = RING.find(([id]) => id === 'r:' + rid);
        return hit ? ring['r:' + rid] : null;
      })();
    if (!point) throw new Error('主要反応の初期座標がない: ' + rid);
    reactions.set(rid, { x: point[0], y: point[1] });
  }
  return { nodes, reactions, degree };
}

module.exports = {
  BASE_W,
  BASE_H,
  COMPOUNDS,
  REACTIONS,
  EXTRA_REACTIONS,
  RING,
  RING_CENTER,
  RING_RX,
  RING_RY,
  ringPlacements,
  totalDegrees,
  sizeFor,
  placePrimaryNodes
};
