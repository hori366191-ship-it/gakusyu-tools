export const ATLAS = Object.freeze({
  entryNumber: 'LS / 01',
  id: 'optogenetics',
  title: '光遺伝学 — 光で神経を操る',
  shortTitle: '光遺伝学',
  category: 'LIFE SCIENCE / OPTOGENETICS',
  definition: '光遺伝学は、光に反応する膜タンパク質を特定の細胞へ導入し、光でその細胞の活動を制御する研究手法です。神経細胞の活動と行動・記憶・感覚との因果関係を調べるために使われます。',
  modelNotice: '模型の大きさ・配置・粒子数・再生時間・光強度は教育用の近似です。実際の神経活動、治療効果、臨床成績を再現・予測するものではありません。',
  endorsementNotice: '本ページはノーベル財団・研究機関の承認・推奨を示しません。',
});

export const MODE_IDS = Object.freeze(['off', 'channel', 'ions', 'potential']);
export const CYCLE_SECONDS = 20;

export const MODES = Object.freeze([
  Object.freeze({
    id: 'off', number: '01', start: 0, end: .18,
    title: '光OFF', english: 'LIGHT OFF',
    status: '研究実装', structureLabel: 'RESTING MEMBRANE · CHANNEL CLOSED', color: '#79c8dd',
    summary: '光ファイバーは待機し、channelrhodopsin（ChR2）のチャネルは閉じています。細胞は外部からの光刺激を受けていません。',
    detail: 'ChR2はアルガーの細胞膜に見いだされた光作動性陽イオンチャネルです。青色光がない状態では開口せず、この模型でもイオン流入と活動電位を止めています。実際の静止膜電位はイオンの濃度勾配と他の多くのチャネルが協調して作ります。',
    study: '青色光照射によって、ChR2を発現させた神経細胞を励起できることが2005年に報告され、2007年には生きたマウスの脳でも実証されました。',
    boundary: '「光を当てるだけ」で任意の脳深部を安全に操れるわけではありません。遺伝子導入、光の届く範囲、細胞種、実験条件の制御が必要です。',
    flow: [['01', 'ChR2発現', '標的細胞に光感受性タンパク質を導入'], ['02', '光待機', '閉じたチャネルと静止膜'], ['03', '応答なし', 'イオン流入・活動電位は発生しない']],
  }),
  Object.freeze({
    id: 'channel', number: '02', start: .18, end: .43,
    title: 'channel open', english: 'BLUE LIGHT · CHANNEL OPEN',
    status: '研究実装', structureLabel: '470 nm BLUE LIGHT · CHR2 OPEN', color: '#63e6ff',
    summary: '青色光パルスがChR2に当たり、膜を横断するチャネルの形が変わって開きます。開口部から陽イオンが通過できるようになります。',
    detail: 'ChR2にレチナールという光吸収基質が結合しています。青色光の吸収がチャネル構造の変化を引き起こし、Na⁺やCa²⁺などの陽イオンが細胞内へ入り込みます。模型の7本のらせんは膜貫通タンパク質の構造を簡略化したものです。',
    study: 'ノーベル委員会の2026年発表は、Peter HegemannとGeorg NagelによるChRの発見、Karl Deisserothによる神経細胞への応用を、2026年ノーベル医学賞の業績として紹介しています。',
    boundary: '開口は光に依存しますが、現実には不活性化・脱感作・回復などの時間経過があります。この展示は単純な開閉のサイクルに縮約しています。',
    flow: [['01', '青色光', 'ファイバー先端から標的膜へ'], ['02', 'コンフォメーション変化', 'ChR2のチャネルが開口'], ['03', '陽イオン通路', 'Na⁺ / Ca²⁺が通過可能に']],
  }),
  Object.freeze({
    id: 'ions', number: '03', start: .43, end: .70,
    title: 'ion influx', english: 'CATION INFLUX · DEPOLARIZATION',
    status: '研究実装', structureLabel: 'Na⁺ / Ca²⁺ INFLUX · DEPOLARIZATION', color: '#9cf1cc',
    summary: '開いたChR2を通って陽イオンが細胞内へ流入し、膜の内側が正に近づきます。これを脱分極と呼びます。',
    detail: 'イオンは電気化学的勾配に従って動きます。ChR2を介した陽イオン流入は膜を脱分極させ、活動電位を発生しやすい状態にします。シアンの粒はNa⁺、緑の粒はCa²⁺の模式表現で、粒の数や速さは実測値ではありません。',
    study: '光で引き起こす膜電位変化は、電気生理測定や細胞内カルシウム観測などで研究されてきました。細胞の種類や発現量によって応答は変わります。',
    boundary: 'イオン流入が直ちに必ず活動電位になるとは限りません。閾値、膜の性質、周囲の神経回路、光刺激の強さとタイミングが結果を左右します。',
    flow: [['01', '陽イオン流入', 'チャネルを通り内側へ'], ['02', '脱分極', '膜内側が正に近づく'], ['03', '閾値へ', '条件がそろえば活動電位へ']],
  }),
  Object.freeze({
    id: 'potential', number: '04', start: .70, end: 1,
    title: 'action potential', english: 'ACTION POTENTIAL · PROPAGATION',
    status: '研究実装', structureLabel: 'THRESHOLD REACHED · AXON PROPAGATION', color: '#ffd27a',
    summary: '脱分極が閾値を超えると活動電位が発生し、軸索に沿って伝わります。軸索終端では神経伝達物質の放出へつながります。',
    detail: '活動電位は電位依存性のNa⁺チャネルとK⁺チャネルが協働して生じます。ChR2はその開始を光で助ける役割です。髄鞘は軸索の伝導を助け、節間を跳ぶように興奮が伝わる塩基節渡りを模式化しています。',
    study: '光遺伝学によって、特定の神経細胞集団を励起・抑制し、記憶、感情、行動との因果関係を調べる研究が進められています。治療としての視覚回復も研究・試行されています。',
    boundary: 'この展示は治療の成功・安全性・承認を示しません。ヒトでの応用には、遺伝子導入、光の届く範囲、免疫反応、標的の特異性、長期的な安全性などの課題が残ります。',
    flow: [['01', '活動電位発生', '脱分極が閾値を超える'], ['02', '軸索を伝導', '髄鞘の節間を興奮が進む'], ['03', '終端へ', 'シナプス小胞の放出を準備']],
  }),
]);

export const HOTSPOTS = Object.freeze({
  soma: Object.freeze({
    number: '01', title: 'ソーマ', english: 'SOMA', color: '#86dcf2', mode: 'off',
    role: '細胞体・情報統合', description: '核やミトコンドリアを含む細胞体です。樹状突起からの入力と軸索起始部での出力を統合します。模型では膜を半透明にして内部構造を見せています。',
    specs: [['主な構造', '核・小胞体・ミトコンドリア'], ['ChR2', '発現させた膜タンパク質を配置'], ['模型上の縮尺', '教育用に拡大']],
  }),
  channel: Object.freeze({
    number: '02', title: 'ChR2チャネル', english: 'CHANNELRHODOPSIN-2', color: '#63e6ff', mode: 'channel',
    role: '光をイオン流へ変える', description: '7回膜を貫通するChR2を模式化しています。青色光で構造が変わり、陽イオンが通る開口ができます。実際の分子構造・イオン選択性・動力学をそのまま再現した模型ではありません。',
    specs: [['光の例', '青色・約470 nm'], ['透過イオン', 'Na⁺ / Ca²⁺ など'], ['役割', '光依存性の陽イオン導通路']],
  }),
  fiber: Object.freeze({
    number: '03', title: '光ファイバー', english: 'OPTICAL FIBER', color: '#a9c6ff', mode: 'channel',
    role: '標的まで光を運ぶ', description: '光ファイバーの先端からChR2発現細胞へ青色光を送ります。外装・保護層・先端リングと、光の粒を別の材質で表しています。',
    specs: [['入力', 'パルス青色光'], ['配置', '標的細胞の近く'], ['制約', '散乱・吸収・組織への影響']],
  }),
  axon: Object.freeze({
    number: '04', title: '軸索と髄鞘', english: 'AXON / MYELIN', color: '#ffd27a', mode: 'potential',
    role: '活動電位を遠くへ運ぶ', description: '長い軸索を髄鞘が覆います。模型では髄鞘の節間を光る粒が跳び、活動電位の伝わり方を示します。髄鞘を作るグリア細胞の構造は省略しています。',
    specs: [['信号', '活動電位'], ['髄鞘', '伝導速度と効率を助ける'], ['模型', '節間渡りを簡略表現']],
  }),
  terminal: Object.freeze({
    number: '05', title: '軸索終端', english: 'AXON TERMINAL', color: '#d2a6ff', mode: 'potential',
    role: '次の細胞へ信号を渡す', description: '軸索の先端が分枝し、シナプス小胞が並びます。活動電位が到達すると、伝達物質の放出が促されます。表示している粒は小胞の模式表現です。',
    specs: [['入力', '伝わってきた活動電位'], ['出力', '神経伝達物質の放出'], ['対象', '隣接ニューロンなど']],
  }),
});

export const EVIDENCE = Object.freeze([
  Object.freeze({ kind: 'implementation', label: '実装・実測', title: '研究ツールとして確立', items: ['特定細胞へのChR2導入と光励起', 'マウスなど生体での神経回路操作', '細胞種・回路・行動を結び付ける因果研究'] }),
  Object.freeze({ kind: 'research', label: '研究中', title: '理解と治療の研究', items: ['記憶・感覚・行動に関わる回路の解明', '視覚回復などのヒト研究・試行', '遺伝子導入と光デリバリーの改善'] }),
  Object.freeze({ kind: 'concept', label: '構想・未確立', title: '安易な一般化はできない', items: ['あらゆる脳深部を無侵襲で操る実装', '安全性・持続性・特異性が解決済みという主張', 'この模型を治療成績の証明として扱うこと'] }),
]);

export const SPECS = Object.freeze([
  ['基本方式', '光感受性イオンチャネル＋標的細胞導入＋光照射'],
  ['ChR2の光の例', '青色・約470 nm'],
  ['応答の特徴', 'ミリ秒〜ミリ秒秒台の速い応答'],
  ['主な研究用途', '神経細胞の励起・神経回路の因果解明'],
  ['治療応用', '視覚回復などを研究・試行段階で検討'],
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: '遺伝子導入', english: 'DELIVERY', text: '目的の細胞にChR2を導入する必要があり、ベクター、発現量、標的細胞の選択が課題になります。' }),
  Object.freeze({ title: '光の到達範囲', english: 'LIGHT DELIVERY', text: '組織による吸収・散乱があり、脳深部や広い範囲へ十分な光を届ける設計が難しくなります。' }),
  Object.freeze({ title: '標的の特異性', english: 'SPECIFICITY', text: '意図しない細胞・回路への作用や、発現タンパク質自身の影響を評価する必要があります。' }),
  Object.freeze({ title: '安全性', english: 'SAFETY', text: '熱、免疫反応、遺伝子導入の長期的影響、デバイスの生体適合性を検証する必要があります。' }),
  Object.freeze({ title: '時間制御', english: 'KINETICS', text: 'チャネルの開閉・不活性化・回復は有限で、精密な実験にはパルス設計が重要です。' }),
]);

export const SOURCES = Object.freeze([
  Object.freeze({ organization: 'NobelPrize.org', year: '2026', title: 'The Nobel Prize in Physiology or Medicine 2026 — Press release', href: 'https://www.nobelprize.org/prizes/medicine/2026/press-release/', note: '2026年10月5日。2026年ノーベル医学賞の一次情報。受賞者は Karl Deisseroth、Peter Hegemann、Georg Nagel。' }),
]);

export const RESEARCH_STAGE = Object.freeze({
  status: '研究実装は確立 / 治療は用途別に研究中',
  detail: '基礎研究のツールとしては広く使われます。視覚回復などの治療応用のヒト研究は進みますが、本展示は承認・有効性・安全性を断定しません。',
});

export const OPERATING_GUIDE = Object.freeze([
  '4つのモードで、光OFF → ChR2開口 → イオン流入 → 活動電位の順を学びます。',
  'モードを選ぶとその状態の先頭で一時停止します。再生またはタイムラインで変化を観察できます。',
  '左の構成要素または3Dホットスポットを選ぶと、カメラが寄り、右に役割と基本仕様を表示します。',
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  '光強度スライダーは教育用の概念入力です。0%では光に依存する状態を起こしません。',
  '「視点を戻す」はカメラと選択だけを戻し、「リセット」は再生時刻・速度・光強度も初期化します。',
  'Spaceキーで再生・一時停止、Rキーで視点リセットができます。',
  '粒子の数・速さ・髄鞘の見え方・光の広がりは教育用近似で、実測や治療効果ではありません。',
]);

export function getMode(id) {
  return MODES.find(mode => mode.id === id) || MODES[0];
}

export function getHotspot(id) {
  return HOTSPOTS[id] || null;
}
