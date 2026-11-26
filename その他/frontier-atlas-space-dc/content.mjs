export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  entryNumber: 2,
  catalogCount: 2,
  category: 'SPACE INFRASTRUCTURE',
  endorsementNotice: '企業・研究機関の出典を使っていますが、本ページはそれらの承認・推奨を示しません。',
  modelNotice: '地球・衛星・地球局は仕組みを学ぶ独自の模式図です。実機のCAD、実際の軌道、通信速度、熱設計を再現したものではありません。',
  simulationNotice: '軌道・光子・熱の動きは教育用に短縮・誇張しています。時間や距離は実際の運用スケールではありません。',
});

export const ENTRY = Object.freeze({
  id: 'orbital-compute',
  title: 'ORBITAL COMPUTE',
  japaneseTitle: '宇宙データセンター',
  shortTitle: '宇宙データセンター',
  status: '軌道上計算は実証段階 / 大規模宇宙DCは研究・構想',
  summary: '太陽光で発電し、AIを軌道上で動かし、光でデータをやり取りする。宇宙データセンターの仕組みと、実証と大規模構想の境界を学びます。',
});

export const MODES = Object.freeze([
  {
    id: 'overall',
    label: '全体',
    english: 'SYSTEM OVERVIEW',
    title: '宇宙で計算する仕組み',
    summary: '太陽光発電、AI計算、衛星間の光通信、赤外線による放熱を組み合わせ、処理結果を地球へ送ります。どこか一つだけの技術ではなく、系全体の設計が重要です。',
    study: 'まずは地上データセンターの完全な代替ではなく、宇宙で集まるデータを近くで処理する軌道上エッジ処理が現実的です。',
    flow: [
      ['01', '太陽光を集める', '広い太陽電池で電力を確保'],
      ['02', '軌道上で計算', 'AIアクセラレータがデータを処理'],
      ['03', '光でつなぐ', '衛星間でデータを中継'],
      ['04', '地球へ返す', '必要な結果だけを地上局へ送信'],
    ],
  },
  {
    id: 'power',
    label: '発電',
    english: 'SOLAR POWER',
    title: '太陽光を電力に変える',
    summary: 'Google Project Suncatcherの構想では、太陽光発電衛星群が計算衛星を支えます。適切な軌道では地球の影に入る時間を抑え、太陽光をほぼ連続して利用できる可能性があります。',
    study: '連続受光は「すべての軌道で必ず得られる」性質ではありません。軌道・季節・姿勢制御・蓄電の設計が前提です。',
    flow: [
      ['01', '広い受光面', '太陽電池を展開して光を集める'],
      ['02', '電力変換', 'DC電力を計算・通信系へ分配'],
      ['03', '影と蓄電', '日食や姿勢に備えて電力を調整'],
      ['04', '重量との trade-off', 'パネル・蓄電・構造物の打ち上げ質量が課題'],
    ],
  },
  {
    id: 'link',
    label: '光通信',
    english: 'FREE-SPACE OPTICS',
    title: '光でデータを渡す',
    summary: '自由空間光通信は、大気を通さず衛星同士や地球との間を光で結ぶ方式です。指向制御が合えば、狭いビームで大容量のデータを送れる可能性があります。',
    study: '雲・大気揺らぎの影響を受けにくい衛星間と、地球局への最終区間では条件が異なります。地球側は雲などによる通信不能時間を考慮する必要があります。',
    flow: [
      ['01', 'データを光へ', 'レーザーデータを光信号に変換'],
      ['02', '狭いビーム', '望遠鏡で相手衛星へ精密に指向'],
      ['03', '追尾・再接続', '相手の動きに合わせてビームを制御'],
      ['04', '地球局で受信', '必要な結果を光回線から地上網へ'],
    ],
  },
  {
    id: 'cooling',
    label: '放熱',
    english: 'THERMAL REJECTION',
    title: '冷たい宇宙、でも熱は逃がす',
    summary: '宇宙空間は冷たく見えても、真空では空気による対流冷却ができません。計算機の熱は主に赤外線として放射し、大きなラジエーターで宇宙へ放出する必要があります。',
    study: '放射でも熱を出せる量には限界があります。発電・計算・放熱の面積と質量を、熱設計の中でまとめて考える必要があります。',
    flow: [
      ['01', '熱を集める', 'チップの熱を熱プレート・配管へ移動'],
      ['02', '赤外線へ変換', 'ラジエーター表面が熱を放射'],
      ['03', '真空へ放出', '空気がなくても輻射熱は宇宙へ出る'],
      ['04', '温度を保つ', '放射面積・受光・機器の許容温度を調整'],
    ],
  },
  {
    id: 'compute',
    label: '軌道上処理',
    english: 'ON-ORBIT EDGE COMPUTE',
    title: 'データを軌道上で先に処理',
    summary: '宇宙で集まったデータをすべて地上へ送るのではなく、軌道上で選別・推論・要約などを実行する考え方です。Google構想のTPUや、2025年11月にH100を搭載して打ち上げ、2025年12月に小型LLMの推論・学習を実施したと企業が発表したStarcloud-1が、この方向性の例です。',
    study: 'Starcloud-1は小型LLMの推論・学習を実施した企業発表がありますが、大規模データセンターそのものではありません。',
    flow: [
      ['01', '近くのデータ', '観測・センサーのデータを軌道上で取得'],
      ['02', 'エッジで選別', '不要な raw data を地上へ送らず削減'],
      ['03', 'AIで処理', '推論・分類・要約などを実行'],
      ['04', '結果を送信', '価値のある結果を地球側へ届ける'],
    ],
  },
]);

export const MODE_ORDER = Object.freeze(MODES.map(mode => mode.id));

export const HOTSPOTS = Object.freeze({
  solar: Object.freeze({
    title: '太陽光パネル',
    english: 'SOLAR ARRAY',
    mode: 'power',
    description: '太陽電池を広く展開し、計算モジュールや通信機器へ電力を供給します。模型ではセル、フレーム、配線を簡略化しています。',
    specs: [['入力', '太陽光'], ['出力', '直流電力'], ['課題', '日食・姿勢・質量']],
  }),
  chip: Object.freeze({
    title: 'AI計算モジュール',
    english: 'AI COMPUTE MODULE',
    mode: 'compute',
    description: 'TPUやGPUなどのアクセラレータを搭載する計算部です。Starcloud-1はH100を搭載して打ち上げられた小型の実証衛星として紹介されています。',
    specs: [['例', 'TPU / H100'], ['処理', '推論・学習・選別'], ['熱', '放熱設計と直結']],
  }),
  optical: Object.freeze({
    title: '光通信',
    english: 'OPTICAL TERMINAL',
    mode: 'link',
    description: 'レーザー光を細いビームで送受信するターミナルです。衛星同士を光で結び、データを地球へ中継します。',
    specs: [['方式', '自由空間光通信'], ['要点', '精密な指向・追尾'], ['地球局', '雲などの条件を考慮']],
  }),
  radiator: Object.freeze({
    title: '放熱ラジエーター',
    english: 'RADIATOR',
    mode: 'cooling',
    description: '真空では空冷できないため、チップの熱を赤外線として宇宙へ放出します。オレンジ色の粒は空気ではなく放射熱の模式表現です。',
    specs: [['方式', '赤外線による輻射'], ['課題', '真空では空冷ができない'], ['設計', '面積と質量の制約']],
  }),
  ground: Object.freeze({
    title: '地球側受信',
    english: 'GROUND RECEIVER',
    mode: 'link',
    description: '軌道上から届いた光信号を受信し、既存の地上ネットワークへつなぐ地球局です。通信可能な時間と気象条件を考慮します。',
    specs: [['役割', '光信号を受信'], ['接続先', '地上のネットワーク'], ['課題', '大気・雲・地球局配置']],
  }),
});

export const RESEARCH_STATUS = Object.freeze({
  orbital: Object.freeze({
    title: '軌道上計算',
    status: '実証段階',
    detail: '2025年11月にH100を搭載して打ち上げ、2025年12月に小型LLMの推論・学習を実施したとStarcloudが発表。',
    tone: 'demonstrated',
  }),
  scale: Object.freeze({
    title: '大規模宇宙データセンター',
    status: '研究・構想',
    detail: 'Google Project Suncatcherのような衛星群の構想。Starcloud-1の実証だけで大規模DCの完成を示すものではありません。',
    tone: 'concept',
  }),
});

export const COMPARISON = Object.freeze([
  Object.freeze({ term: '電力', ground: '送電網・燃料', space: '太陽光＋蓄電' }),
  Object.freeze({ term: '冷却', ground: '空冷・水冷', space: '赤外線で放熱' }),
  Object.freeze({ term: 'データ', ground: '集中処理', space: '軌道上エッジ処理' }),
]);

export const SPECIFICATIONS = Object.freeze([
  ['発電', '太陽光発電衛星', '軌道・蓄電・姿勢が前提'],
  ['計算', 'TPU / AIアクセラレータ', '軌道上での推論・選別'],
  ['通信', '自由空間光通信', '衛星間と地球局を光で接続'],
  ['放熱', '赤外線ラジエーター', '真空では空冷ができない'],
]);

export const BENEFITS = Object.freeze([
  '適切な軌道では、太陽光をほぼ連続して利用できる可能性がある。',
  '地上の土地や水冷却の制約を避けられる可能性がある。',
  '宇宙で集まったデータを、通信量を抑えて軌道上で処理できる。',
]);

export const CHALLENGES = Object.freeze([
  '打ち上げコストと、機器・ラジエーターの質量',
  '真空での熱放散、放射線による機器への影響',
  '衛星間の精密な光通信、保守・更新の難しさ',
  '軌道デブリ、地球との遅延、地上局や気象条件',
]);

export const SOURCES = Object.freeze([
  Object.freeze({ label: 'Google Research — Project Suncatcher', href: 'https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/' }),
  Object.freeze({ label: 'Starcloud — Starcloud-1', href: 'https://www.starcloud.com/starcloud-1' }),
  Object.freeze({ label: 'Axiom Space — Orbital Data Center', href: 'https://www.axiomspace.com/orbital-data-center' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回し、ホイールまたは + / - キーでズームします。',
  '上部の5つのモードで、発電・光通信・放熱・軌道上処理を順に強調できます。',
  'ラベルを選ぶと、その機器へカメラが寄ります。モバイルでは解説パネルが開きます。',
  '再生 / 一時停止と速度で、太陽光・データ・熱の流れを確認できます。',
  '「視点を戻す」はカメラだけを全体表示へ戻します。モードと時刻は変わりません。',
  'モデルは教育用です。軌道・通信速度・温度・時間は実際の設計値ではありません。',
]);
