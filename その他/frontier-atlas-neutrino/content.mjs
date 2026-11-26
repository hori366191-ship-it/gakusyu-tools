export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  entryNumber: 3,
  catalogCount: 5,
  category: 'PARTICLE ASTRONOMY',
  endorsementNotice: 'NobelPrize.org・IceCubeを出典としていますが、本ページは両者の承認・推奨を示しません。',
  modelNotice: '地球断面、氷層、検出器グリッド、光の広がりは教育用の模式図です。実機のCAD、実際の深さ・距離・エネルギー・時間を再現していません。',
  simulationNotice: '極めて希な相互作用を視認できるよう、粒子・光・センサー応答を短縮・誇張しています。光の粒はCherenkov光の可視化です。',
});

export const ENTRY = Object.freeze({
  id: 'icecube-neutrino',
  title: 'NEUTRINO ICE',
  japaneseTitle: '氷の中の宇宙望遠鏡',
  status: '観測事実 / 起源は未解明',
  summary: '南極の氷に張り巡らされた光センサーが、宇宙から届く高エネルギーニュートリノを捉えます。観測された事実と、まだ分からない起源を分けて学びます。',
});

export const MODES = Object.freeze([
  Object.freeze({
    id: 'neutrino-pass', label: 'ニュートリノ通過', english: 'NEUTRINO PASS',
    title: 'ほぼ素通りする宇宙の使者',
    summary: 'ニュートリノは電気的に中性で、物質とほとんど相互作用せず地球をも通り抜けます。IceCubeが狙う高エネルギーの範囲では、そのような相互作用は特に希です。',
    study: '「何も反応しない」ように見えても、巨大な氷の体積と長い観測時間によって稀な反応を統計的に捉えます。模型の通過時間は実際よりずっと短い教育用表現です。',
    flow: [['01','宇宙から到来','高エネルギー天体過程で生成'],['02','地球を通過','多くのニュートリノは反応しない'],['03','氷へ進入','検出器体積を横切る'],['04','稀な相互作用','原子核と衝突して二次粒子']],
  }),
  Object.freeze({
    id: 'interaction', label: '相互作用', english: 'INTERACTION',
    title: '衝突点から二次粒子が生まれる',
    summary: 'ニュートリノが氷の中の原子核と相互作用すると、電荷を持つ二次粒子が発生します。ミューオンは長く伸びる軌道を作り、電子・カスケードはよりコンパクトな光の広がりを示します。',
    study: '模型は代表的な反応を一つの頂点にまとめています。実際には相互作用の種類・断面積・エネルギーによって、観測される光のパターンが異なります。',
    flow: [['01','相互作用','原子核との稀な衝突'],['02','二次粒子','ミューオンなどが発生'],['03','エネルギー移動','周囲の氷へエネルギーを渡す'],['04','特徴的な軌道','長い軌道 / コンパクトなカスケード']],
  }),
  Object.freeze({
    id: 'cherenkov', label: 'チェレンコフ光', english: 'CHERENKOV LIGHT',
    title: '氷の中を光のコーンが進む',
    summary: '水や氷の中を、その媒質中の光速度より速く進む荷電粒子は、Cherenkov光を放出します。光は進行方向を軸としたコーン状に広がり、センサーの配置と時刻から光路を推定します。',
    study: 'コーンと光子は模式表現です。氷中の光の速さは真空中より遅く、散乱・吸収や氷の性質も実際の再構成には組み込まれます。',
    flow: [['01','高速の荷電粒子','媒質中の光速度を超える'],['02','Cherenkov光','進行方向を軸に放出'],['03','氷を伝播','散乱・吸収を受けながら広がる'],['04','複数DOMへ','異なる位置と時刻に到達']],
  }),
  Object.freeze({
    id: 'sensors', label: 'センサー応答', english: 'SENSOR DETECTION',
    title: '光を受け取る5,160のDOM',
    summary: 'Digital Optical Module（DOM）は光電子増倍管と読み出し電子機器を内蔵します。IceCubeの氷中検出器は86本のケーブルに60個ずつ、計5,160個のDOMを配置し、光の到達時刻と強度を記録します。',
    study: '点灯は「ニュートリノそのものを直接見た」ことを意味しません。DOMが検出したのは二次粒子が放った光です。IceTopの表面検出器は別系統です。',
    flow: [['01','光子が到達','DOMの感度の高い光検出器へ'],['02','光電子へ変換','光電子増倍管が信号を増幅'],['03','時刻を記録','ナノ秒オーダーのタイミング'],['04','地上へ送信','位置・時刻・強度を観測データに']],
  }),
  Object.freeze({
    id: 'reconstruction', label: '再構成', english: 'RECONSTRUCTION',
    title: '光のパターンから来た方向を推定',
    summary: '複数DOMの位置・時刻・光量を使い、相互作用点、二次粒子の方向、エネルギー、相互作用の種類を確率的に推定します。良い再構成には、背景事象や検出器の不確かさの評価も必要です。',
    study: '方向の推定には誤差があります。高エネルギー天体ニュートリノの存在は観測されていますが、個々の起源や宇宙の粒子加速機構の全体像は未解明です。',
    flow: [['01','観測データ','位置・時刻・光量を集める'],['02','候補を評価','粒子仮説と光伝播を比較'],['03','方向・エネルギー','尤度に基づき推定'],['04','天空マップ','起源の候補領域を統計的に探す']],
  }),
]);

export const MODE_ORDER = Object.freeze(MODES.map(mode => mode.id));

export const HOTSPOTS = Object.freeze({
  surface: Object.freeze({ title: '南極の観測所', english: 'SOUTH POLE STATION', mode: 'neutrino-pass', description: '地表では、氷中のDOMから集めたデータを処理・送信します。安定した氷と南極の環境が観測条件の一部です。', specs: [['場所','南極'],['役割','データ処理・送信'],['課題','極地運用・通信']] }),
  strings: Object.freeze({ title: '深度センサー列', english: 'DETECTOR STRINGS', mode: 'sensors', description: '86本のケーブルに60個のDOMを配置。模型は本数を減らし、氷中検出器の立体配置だけを表します。', specs: [['氷中DOM','5,160個'],['ケーブル','86本'],['深度','約1,450〜2,450 m']] }),
  vertex: Object.freeze({ title: '相互作用の頂点', english: 'INTERACTION VERTEX', mode: 'interaction', description: 'ニュートリノと原子核が反応した場所です。ここから生まれた二次粒子の種類と方向を、放出された光から推定します。', specs: [['入力','高エネルギーニュートリノ'],['出力','二次粒子'],['推定','位置・方向・エネルギー']] }),
  cone: Object.freeze({ title: 'Cherenkovコーン', english: 'LIGHT CONE', mode: 'cherenkov', description: '荷電粒子の進行方向を軸に、Cherenkov光がコーン状に広がります。モデルの開き角・光量は教育用に誇張しています。', specs: [['媒体','氷 / 水'],['主体','荷電粒子'],['課題','散乱・吸収・不確かさ']] }),
  reconstruction: Object.freeze({ title: '方向再構成', english: 'SKY RECONSTRUCTION', mode: 'reconstruction', description: '複数DOMのデータを組み合わせ、元のニュートリノの方向とエネルギーを推定します。天空マップ上の候補は確定した起源ではありません。', specs: [['入力','時刻・位置・光量'],['出力','方向・エネルギー'],['注意','統計的な推定']] }),
});

export const RESEARCH_STATUS = Object.freeze([
  Object.freeze({ title: '高エネルギー天体ニュートリノ', status: '観測事実', detail: 'IceCubeは太陽系外に由来する高エネルギーニュートリノの発見を発表。2026年ノーベル物理学賞の対象にもなりました。', tone: 'observed' }),
  Object.freeze({ title: '個々の起源・加速機構', status: '未解明', detail: '方向の統計から候補天体を探りますが、全ての起源を特定したわけではありません。複数メッセンジャーとの照合が重要です。', tone: 'open' }),
  Object.freeze({ title: 'IceCube-Gen2', status: '研究・計画', detail: '検出感度を高める将来構想です。本模型は稼働中のIceCubeを簡略化したもので、Gen2の実装図ではありません。', tone: 'planned' }),
]);

export const SPECIFICATIONS = Object.freeze([
  ['検出体積','約1 km³の氷','巨大な体積が稀な反応を増やす'],
  ['氷中検出器','86 strings × 60 DOM','5,160個のDOMを氷中に配置'],
  ['記録','光の位置・時刻・強度','ニュートリノそのものは直接検出しない'],
  ['再構成','方向・エネルギー・相互作用','背景と不確かさも評価'],
]);

export const CHALLENGES = Object.freeze([
  '極めて少ない相互作用を、背景事象から統計的に切り分ける',
  '氷の光学的性質とセンサー較正の不確かさ',
  '方向再構成の誤差と、起源天体の同定',
  '南極での運用・通信・機器保守',
]);

export const BENEFITS = Object.freeze([
  'ニュートリノは直進し、物質や磁場による偏向を受けにくい',
  '地球を通過してきたニュートリノも観測できる',
  '光・宇宙線・重力波と組み合わせると、宇宙の高エネルギー現象を多角的に調べられる',
]);

export const SOURCES = Object.freeze([
  Object.freeze({ label: 'Nobel Prize — Physics 2026 press release', href: 'https://www.nobelprize.org/prizes/physics/2026/press-release/' }),
  Object.freeze({ label: 'IceCube — Quick Facts', href: 'https://icecube.wisc.edu/about-us/facts/' }),
  Object.freeze({ label: 'IceCube — Neutrino Observatory', href: 'https://icecube.wisc.edu/' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  '5つのモードで、通過・相互作用・Cherenkov光・センサー応答・再構成を順に確認できます。',
  'ラベルを選ぶと各部へ寄り、解説カードに基本仕様を表示します。',
  'Spaceで再生 / 一時停止、Rでアニメーションと視点をリセットします。',
  '光の粒・時間・距離・角度は教育用の誇張です。観測事実と未解明の境界に注目してください。',
]);
