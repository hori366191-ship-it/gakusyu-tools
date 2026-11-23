// Approximate mean radii and sidereal periods; display geometry has its own scale.
// Sources: NASA Solar System Exploration and JPL planet data (see credits).
export const TAU = 2 * Math.PI;
export const RAD = Math.PI / 180;
export const AU_KM = 149597870.7;
export const SCENE_UNITS_PER_AU = 1000;
export const BODIES = [
  { id: 'sun', name: '太陽', en: 'SUN', kind: '恒星', color: '#ffc987', km: 695700, spin: 25.38, tilt: 7.25,
    intro: '自ら光を放つ太陽系の中心。太陽は高温のプラズマでできています。',
    task: '太陽の表面にある黒点と、縁の外に広がる淡い光を探そう。',
    why: '可視光で見る太陽の表面は光球と呼ばれます。黒点は周囲より温度が低いため暗く見えます。光球の外に広がるコロナは、皆既日食で光球が月に隠れると観察できます。この黒点と光の形は演出です。実際の太陽を直接見てはいけません。' },
  { id: 'mercury', name: '水星', en: 'MERCURY', kind: '岩石惑星', color: '#b5a99f', km: 2439.7, a: 0.3871, e: 0.2056, i: 7.00, node: 48.33, peri: 29.13, phase: 218, period: 87.97, spin: 58.646, tilt: 0.034,
    intro: '太陽に最も近く、8惑星で最も小さい岩石の惑星です。',
    task: '真上の画面で時間を進め、太陽の近くと遠くで進む速さを比べよう。',
    why: '水星の軌道は8惑星の中で最もつぶれた楕円です。太陽に近いときは速く、遠いときは遅く進みます。ケプラーの第2法則では、太陽と惑星を結ぶ線が同じ時間に掃く面積は等しくなります。' },
  { id: 'venus', name: '金星', en: 'VENUS', kind: '岩石惑星', color: '#f2c986', km: 6051.8, a: 0.7233, e: 0.0068, i: 3.39, node: 76.68, peri: 54.92, phase: 120, period: 224.70, spin: -243.02, tilt: 177.36,
    intro: '大きさは地球とほぼ同じですが、厚い二酸化炭素の大気と硫酸の雲に覆われています。',
    task: '雲の筋を探そう。地球のような青い海や地表は見えるかな？',
    why: '上空から可視光で見ると雲が地表を隠します。「あかつき」の紫外線観測では、肉眼では見えにくい雲の模様がわかります。このモデルでは観測画像に色を付けています。二酸化炭素を多く含む大気の温室効果のため、地表は約460℃にも達します。' },
  { id: 'earth', name: '地球', en: 'EARTH', kind: '岩石惑星', color: '#75b5ff', km: 6371, a: 1.0000, e: 0.0167, i: 0, node: 0, peri: 102.94, phase: 258, period: 365.256, spin: 0.99727, tilt: 23.44,
    intro: '液体の水が地表に広がり、生命が確認されている唯一の惑星です。',
    task: '青い縁と、昼と夜の境目を探そう。宇宙から見ると大気はどれほど薄いだろう？',
    why: '大気の分子は青い光を赤い光より強く散乱します。地球の縁では大気を斜めに長く通る光が見え、青い帯が目立ちます。太陽に照らされる側が昼です。' },
  { id: 'mars', name: '火星', en: 'MARS', kind: '岩石惑星', color: '#ec936f', km: 3389.5, a: 1.5237, e: 0.0934, i: 1.85, node: 49.56, peri: 286.50, phase: 278, period: 686.98, spin: 1.02596, tilt: 25.19,
    intro: '赤い砂や岩が目立つ惑星。かつて地表を水が流れた痕跡が見つかっています。',
    task: '赤い地表と、極の白っぽい部分を見比べよう。',
    why: '赤色の主な原因は酸化鉄を含むちりです。極冠には水の氷があり、冬には二酸化炭素も凍って季節的な霜を作ります。' },
  { id: 'jupiter', name: '木星', en: 'JUPITER', kind: '木星型惑星', color: '#e8b192', km: 69911, a: 5.2029, e: 0.0484, i: 1.30, node: 100.47, peri: 274.25, phase: 51, period: 4332.59, spin: 0.41354, tilt: 3.13, flatten: 0.065,
    intro: '太陽系最大の惑星。主に水素とヘリウムでできています。',
    task: '明暗の縞を追いかけ、縞にまじった赤い渦を探そう。',
    why: '高速で自転する木星では雲が帯状に並び、隣り合う帯には異なる向きの風が吹いています。大赤斑は巨大な長寿命の嵐です。' },
  { id: 'saturn', name: '土星', en: 'SATURN', kind: '木星型惑星', color: '#f3d394', km: 58232, a: 9.537, e: 0.0539, i: 2.49, node: 113.66, peri: 338.94, phase: 158, period: 10759.22, spin: 0.444, tilt: 26.73, flatten: 0.098,
    intro: '木星に次ぐ大きさで、氷を主成分とする粒の集まりが明るい環を作っています。',
    task: '環を斜めから見たあと、「環を横から見る」で厚みの見え方を比べよう。',
    why: '環の幅は非常に広い一方、多くの部分は幅に比べて極めて薄いので、真横からは細い線に近く見えます。暗いすき間の一つはカッシーニの間隙です。太陽の光を遮る環は土星にも影を落とします。' },
  { id: 'uranus', name: '天王星', en: 'URANUS', kind: '天王星型惑星', color: '#8de4df', km: 25362, a: 19.189, e: 0.0473, i: 0.77, node: 74.02, peri: 96.94, phase: 47, period: 30688.5, spin: -0.71833, tilt: 97.77, flatten: 0.023,
    intro: '青緑色の天王星は、自転軸が公転面にほぼ寝ています。',
    task: '淡い環の面と、太陽を回る軌道の面の角度を比べよう。',
    why: '天王星の赤道面は自転軸に垂直で、環もほぼ赤道面を回ります。軌道に対し自転軸が約98°傾いているので、環の面も公転面から大きく傾いています。' },
  { id: 'neptune', name: '海王星', en: 'NEPTUNE', kind: '天王星型惑星', color: '#819ef1', km: 24622, a: 30.070, e: 0.0086, i: 1.77, node: 131.78, peri: 273.18, phase: 113, period: 60182, spin: 0.67125, tilt: 28.32, flatten: 0.017,
    intro: '8惑星のうち太陽から最も遠く、大気には強い風が吹いています。',
    task: '時間を加速し、太陽に近い惑星と公転の進み方を比べよう。',
    why: '海王星の公転は約165年で1周です。太陽から遠い惑星ほど、太陽を1周するのに長い時間がかかります。青みには大気中のメタンによる赤い光の吸収が関係します。' },
];

export function sceneRadius(body) {
  return body.km / AU_KM * SCENE_UNITS_PER_AU;
}

export function sceneRadii(body) {
  const polarRatio = 1 - (body.flatten || 0);
  const equatorial = sceneRadius(body) / Math.cbrt(polarRatio);
  return [equatorial, equatorial * polarRatio];
}

// Newton's method for E − e sin E = M. Bounded elliptic eccentricities in this model.
export function eccentricAnomaly(mean, eccentricity) {
  const m = ((mean % TAU) + TAU) % TAU;
  let e = m;
  for (let n = 0; n < 6; n++) e -= (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
  return e;
}

export function orbitalPoint(body, mean) {
  const a = body.a;
  const e = eccentricAnomaly(mean, body.e);
  const x = a * (Math.cos(e) - body.e);
  const z = a * Math.sqrt(1 - body.e ** 2) * Math.sin(e);
  const w = body.peri * RAD, i = body.i * RAD, n = body.node * RAD;
  const u = x * Math.cos(w) - z * Math.sin(w);
  const v = x * Math.sin(w) + z * Math.cos(w);
  return [u * Math.cos(n) - v * Math.cos(i) * Math.sin(n), v * Math.sin(i), -u * Math.sin(n) - v * Math.cos(i) * Math.cos(n)];
}

export function positionAt(body, days) {
  if (!body.a) return [0, 0, 0];
  const mean = body.phase * RAD + TAU * ((days % body.period) / body.period);
  return orbitalPoint(body, mean);
}

export function readingsFor(body) {
  const km = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
  const entries = [['平均半径', `${km.format(body.km)} km`]];
  if (body.a) {
    entries.push(['軌道長半径', `${body.a.toFixed(3)} AU`]);
    entries.push(['公転周期', body.period < 1000 ? `${km.format(body.period)} 日` : `約 ${km.format(body.period / 365.256)} 地球年`]);
    entries.push(['恒星自転周期', `${km.format(Math.abs(body.spin) < 2 ? Math.abs(body.spin) * 24 : Math.abs(body.spin))} ${Math.abs(body.spin) < 2 ? '時間' : '日'}${body.spin < 0 ? '（逆行）' : ''}`]);
  } else {
    entries.push(['表面温度（光球）', '約 5,500 ℃'], ['自転（赤道付近）', '約 25 日']);
  }
  return entries;
}
