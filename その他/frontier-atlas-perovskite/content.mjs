export const EXHIBIT = Object.freeze({
  title: 'ペロブスカイト／シリコン — タンデム太陽電池',
  shortTitle: 'タンデム太陽電池',
  category: 'PHOTOVOLTAICS / PEROVSKITE–SILICON TANDEM',
  definition: 'タンデム太陽電池は、吸収する光の波長帯が異なる2つの太陽電池を重ねた構造です。ここでは、wide-bandgapペロブスカイトを上に、シリコンを下に置くモノシスリック2端子構成を模式化します。',
  distinction: '研究セルの高効率は、そのままモジュール寿命・量産歩留まり・実発電量を意味しません。小型面積の記録、長期安定性、モジュール実効化は別の指標です。',
  modelNotice: '層厚・結晶・光子・キャリア・バンド図・効率・劣化は教育用の近似です。特定デバイスの測定、材料設計、寿命予測、発電量予測を再現するものではありません。',
  endorsementNotice: '本ページは企業・研究機関の承認・推奨を示しません。企業の商用化発表は企業発表として明記し、研究結果と区別します。',
});

export const MODE_IDS = Object.freeze(['absorption', 'separation', 'extraction', 'degradation']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'absorption', number: '01', label: '光の吸収', english: 'ABSORPTION / SPECTRAL SPLIT', status: '研究・基本原理',
    summary: '上のwide-bandgapペロブスカイトは主に可視〜短波長の光を吸収し、下のシリコンは透過した長波長の光を吸収します。1枚のシリコンだけでは使いにくい波長を、2層で分担します。',
    focus: '上から降り注ぐ光子が、ペロブスカイト層で吸収される色と、シリコン層まで届く色に注目します。',
    boundary: '色や層厚は波長分担を説明するための模式表現です。実際の吸収係数、反射、干渉、結晶粒径、表面形状を計算していません。',
    weights: Object.freeze({ photons: 1.8, carriers: .35, current: .15, stability: .4, degradation: 0 }),
  }),
  Object.freeze({
    id: 'separation', number: '02', label: '電荷分離', english: 'CHARGE SEPARATION', status: '研究デバイス',
    summary: '吸収された光子がelectron-hole pairを作ります。ペロブスカイトのバンドアラインメントと界面で、電子と正孔が別の輸送層へ分かれます。再結合を抑えることが重要です。',
    focus: 'ペロブスカイト層内の電子・正孔と、上側の電子輸送層・下側の正孔輸送層に注目します。',
    boundary: '電子と正孔の速度、バンドオフセット、拡散長、再結合係数は模式値です。界面品質スライダーは実際の材料設計を保証しません。',
    weights: Object.freeze({ photons: .6, carriers: 1.8, current: .4, stability: .5, degradation: .05 }),
  }),
  Object.freeze({
    id: 'extraction', number: '03', label: '電流の抽出', english: 'CARRIER EXTRACTION / TANDEM CURRENT', status: '研究セル・モジュール',
    summary: '分かれた電子と正孔は電極へ集まり、外部回路へ電流を出します。2端子タンデムでは直列接続されるため、上下のサブセルの電流整合も重要です。輸送層の選択と界面の再結合損失を抑える設計が、取り出せる電流を左右します。',
    focus: '上側の電子輸送層、下側の正孔輸送層、相互接続、外部回路のキャリアに注目します。',
    boundary: '研究セルの効率記録と、モジュールの面積・歩留まり・長期発電量は別です。模式上の効率は実測PCEではなく、教育用の正規化出力です。',
    weights: Object.freeze({ photons: .8, carriers: 1.35, current: 1.8, stability: .4, degradation: .05 }),
  }),
  Object.freeze({
    id: 'degradation', number: '04', label: '安定性と劣化', english: 'STABILITY / DEGRADATION', status: '研究・実用化課題',
    summary: 'ペロブスカイトは水分、酸素、熱、光、イオン移動、界面反応などで劣化し得ます。封止、組成、界面、欠陥制御が研究されていますが、シリコン並みの長期実績を単に仮定できません。',
    focus: 'ペロブスカイト表面の暗い劣化領域と、水分・酸素粒子、封止品質の影響に注目します。',
    boundary: '劣化の速度・形・寿命は教育用の模式表現です。鉛を含む材料の環境管理、大面積均一性、モジュール製造、長期信頼性は別途検証が必要です。',
    weights: Object.freeze({ photons: .4, carriers: .45, current: .3, stability: 1.7, degradation: 1.8 }),
  }),
]);

export const COMPONENT_IDS = Object.freeze(['perovskite', 'silicon', 'lattice', 'transport', 'stability']);

export const COMPONENTS = Object.freeze([
  Object.freeze({ id: 'perovskite', number: '01', title: 'ペロブスカイト層', english: 'WIDE-BANDGAP PEROVSKITE', role: '上側の光吸収とキャリア生成', text: 'ABX3型に似た結晶構造を持つ材料群です。バンドギャップを調整でき、薄膜で強い光吸収を示します。ここではwide-bandgapの上側セルを模式化しています。' }),
  Object.freeze({ id: 'silicon', number: '02', title: 'シリコン層', english: 'CRYSTALLINE SILICON SUBCELL', role: '透過した長波長光を吸収', text: '結晶シリコンは実績のある太陽電池材料です。タンデムの下側では、ペロブスカイトを透過した光を吸収し、2層目として電流を分担します。' }),
  Object.freeze({ id: 'lattice', number: '03', title: 'ABX3結晶', english: 'CRYSTAL LATTICE / A–B–X SITES', role: '組成と欠陥を理解する', text: 'Aサイト、Bサイト、Xサイトからなる模式結晶です。組成を変えるとバンドギャップや安定性が変わります。表面欠陥やイオン移動も性能・劣化に影響します。' }),
  Object.freeze({ id: 'transport', number: '04', title: '輸送層と接続', english: 'ETL / HTL / INTERCONNECT', role: '電子と正孔を別方向へ導く', text: '上側の電子輸送層は電子を、下側の正孔輸送層は正孔を効率よく電極へ運びます。2端子構成の相互接続は上下サブセルを電気的に直列につなぎます。' }),
  Object.freeze({ id: 'stability', number: '05', title: '封止と界面', english: 'ENCAPSULATION / INTERFACE', role: '環境劣化を抑える', text: '低透湿の封止、界面パッシベーション、組成制御、欠陥制御などが劣化を抑える方策です。ただし、封止だけで鉛の環境管理や大面積製造の課題が消えるわけではありません。' }),
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: '長期安定性', english: 'OPERATIONAL STABILITY', text: '水分・酸素・熱・光・バイアスなどにさらされたときの出力保持と、試験条件をそろえた比較が必要です。' }),
  Object.freeze({ title: '鉛と環境管理', english: 'LEAD / ENVIRONMENTAL MANAGEMENT', text: '高性能な鉛ハロゲン化物ペロブスカイトでは、使用時の封止、回収、環境放出管理が重要です。無鉛化も研究されています。' }),
  Object.freeze({ title: '大面積の均一性', english: 'UNIFORMITY / SCALE-UP', text: '小型セルの高効率を、モジュール面積で維持するには、薄膜、結晶、界面、配線の均一性と歩留まりが必要です。' }),
  Object.freeze({ title: 'イオン移動とヒステリシス', english: 'ION MIGRATION / HYSTERESIS', text: '結晶内や界面のイオン移動が、バンド構造や応答に影響し得ます。測定履歴や走査条件にも注意が必要です。' }),
  Object.freeze({ title: '電流整合と再結合', english: 'CURRENT MATCHING / RECOMBINATION', text: '2端子タンデムでは上下の電流がそろうことが重要です。界面欠陥やエネルギー損失は抽出効率を下げます。' }),
]);

export const SPECS = Object.freeze([
  Object.freeze({ label: '構成例', value: 'monolithic 2-terminal', note: '4端子構成とは異なる' }),
  Object.freeze({ label: '上側バンドギャップ', value: '約1.7 eV', note: 'wide-bandgapの例' }),
  Object.freeze({ label: '下側シリコン', value: '約1.12 eV', note: '結晶シリコンの目安' }),
  Object.freeze({ label: '吸収の分担', value: '可視 / 近赤外', note: '上側 / 下側の模式' }),
  Object.freeze({ label: '研究セル効率', value: '30%超を報告', note: 'モジュール寿命とは別' }),
  Object.freeze({ label: '3Dの層厚', value: '誇張・分解表示', note: '実寸スケールではない' }),
]);

export const EVIDENCE_LEVELS = Object.freeze([
  Object.freeze({ label: '実測', text: '特定デバイス・条件で測定された効率、安定性、材料物性。面積・期間・手順を確認します。' }),
  Object.freeze({ label: '研究', text: '材料、界面、デバイス、モジュールが試験・開発中の段階です。' }),
  Object.freeze({ label: '実用化', text: '製品・用途・保証条件が限定されて導入される段階。シリコン単体の実績とタンデムを区別します。' }),
  Object.freeze({ label: '構想', text: '将来の低コスト・高効率・長寿命モジュールの設計・製造案です。' }),
]);

export const SOURCES = Object.freeze([
  Object.freeze({ organization: 'NREL', title: 'Perovskite Solar Cells', href: 'https://nrel.gov/pv/perovskite-solar-cells.html', kind: '公式研究機関', citation: 'National Renewable Energy Laboratory, Photovoltaic Research.' }),
  Object.freeze({ organization: 'MIT News', title: 'Explained: Why perovskites could take solar cells to new heights', href: 'https://news.mit.edu/2022/perovskites-solar-cells-explained-0715', kind: '研究機関の解説・2022', citation: 'David L. Chandler, MIT News, July 15, 2022.' }),
  Object.freeze({ organization: 'MIT News', title: 'Study unlocks nanoscale secrets for designing next-generation solar cells', href: 'https://news.mit.edu/2024/study-unlocks-nanoscale-secrets-tuning-perovskites-0228', kind: '研究機関の解説・2024', citation: 'David L. Chandler, MIT News, February 28, 2024.' }),
  Object.freeze({ organization: 'Nature Energy', title: 'Reduced recombination via tunable surface fields in perovskite thin films', href: 'https://www.nature.com/articles/s41560-024-01470-5', kind: '一次論文・2024', citation: 'deQuilettes et al., Nature Energy (2024), s41560-024-01470-5.' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  '光の吸収・電荷分離・電流抽出・安定性と劣化の4モードを切り替えます。',
  '上側ペロブスカイトと下側シリコンが、異なる波長の光を分担します。',
  '電子は上側の電子輸送層、正孔は下側の正孔輸送層へ分かれます。',
  '左の構成要素または3Dホットスポットを選ぶと、右の解説へ移動します。',
  'ドラッグまたは矢印キーで周回、ホイール・ピンチ・+ / -キーでズームします。',
  'Spaceキーで再生・一時停止、Rキーですべてリセットします。',
  '光子・界面・封止スライダーと効率は教育用の模式値です。実測PCE・寿命・発電量予測ではありません。',
]);

export function getMode(id) { return MODES.find(mode => mode.id === id) || MODES[0]; }
export function getComponent(id) { return COMPONENTS.find(component => component.id === id) || null; }
