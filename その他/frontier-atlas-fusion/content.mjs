export const EXHIBIT = Object.freeze({
  title: '核融合 — 詳細トカマク',
  shortTitle: '詳細トカマク',
  category: 'FUSION / MAGNETIC CONFINEMENT',
  definition: 'トカマクは、強力な磁場で高温プラズマを torus（輪）状に閉じ込め、軽い原子核の融合反応を研究する装置です。ITERは発電所ではなく、燃焼プラズマと工学的課題を実証する研究装置です。',
  distinction: 'プラズマ温度は「原子核を高速で衝突させる条件」、発電は「中性子が運ぶ熱を冷却・蒸気・タービンへ変換する工程」です。高温であることと、すでに電力が作られることは同じではありません。',
  modelNotice: '3D形状・粒子数・スライダー出力は教育用の近似です。実際のITERの寸法、動作、熱流、建設日程、発電量を再現・予測するものではありません。',
  endorsementNotice: '本ページはITERその他の企業・研究機関の承認・推奨を示しません。',
});

export const MODE_IDS = Object.freeze(['heating', 'confinement', 'reaction', 'blanket', 'power']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'heating', number: '01', label: '加熱', english: 'PLASMA HEATING', status: '研究実証（建設中）',
    summary: '中性粒子ビームと高周波 heating で、プラズマ中の粒子を高速化します。数百万〜1億度を超える条件を目指しますが、これは電気炉の温度表示とは異なり、プラズマの熱エネルギーを表します。',
    focus: '加熱されたプラズマと4基の中性粒子ビーム注入系に注目します。',
    boundary: 'ITERは実際の発電プラントではありません。ビーム・冷却・電源を含む投入エネルギーと、融合で得られるエネルギーを混同しないことが重要です。',
    weights: Object.freeze({ plasma: 1.25, fields: .35, reaction: .2, heat: .1, electric: 0 }),
  }),
  Object.freeze({
    id: 'confinement', number: '02', label: '磁場閉じ込め', english: 'MAGNETIC CONFINEMENT', status: '研究実証',
    summary: 'toroidalコイルとpoloidalコイル、中央ソレノイドが作る螺旋状の磁場で、プラズマを容器から隔てます。温度・密度・閉じ込め時間の3条件を同時に満たす必要があります。',
    focus: '18組のtoroidalコイル、6組のpoloidalコイル、中央ソレノイドと磁場粒子に注目します。',
    boundary: '模式図のコイル数は実際のITERの全コイルを数えたものではありません。磁場線は概念を示し、プラズマの数値シミュレーションではありません。',
    weights: Object.freeze({ plasma: .8, fields: 1.5, reaction: .15, heat: .1, electric: 0 }),
  }),
  Object.freeze({
    id: 'reaction', number: '03', label: '融合反応', english: 'D–T FUSION REACTION', status: '研究目標',
    summary: '重水素Dと三重水素Tが融合し、ヘリウム4（alpha粒子）と中性子n、エネルギーを生みます。alpha粒子はプラズマを加熱し、中性子は磁場の影響を受けず外側へ進みます。',
    focus: 'プラズマ内の閃光と、中性子が容器を横切る経路に注目します。',
    boundary: 'ITERの公開設計値として、融合出力500 MWに対しプラズマ加熱入力50 MW、プラズマQ=10が目指されます。Q=10は電力量比・発電効率ではありません。',
    weights: Object.freeze({ plasma: 1.45, fields: .55, reaction: 1.8, heat: .45, electric: 0 }),
  }),
  Object.freeze({
    id: 'blanket', number: '04', label: 'ブランケット熱', english: 'BLANKET HEAT CAPTURE', status: '研究・開発',
    summary: '中性子は電荷を持たないため磁場で止められません。周囲のブランケットで運動エネルギーを熱に変え、冷却材が熱を運び出します。三重水素を増殖する構想もあります。',
    focus: '18枚のブランケットモジュール、冷却チャンネル、熱の脈動に注目します。',
    boundary: '融合エネルギーの約80%は中性子が運ぶとITERは説明します。模式図の割合・温度は教育用で、実際の熱流束や材料寿命を計算しません。',
    weights: Object.freeze({ plasma: .65, fields: .3, reaction: .65, heat: 1.8, electric: .05 }),
  }),
  Object.freeze({
    id: 'power', number: '05', label: '発電への構想', english: 'FUTURE POWER EXTRACTION', status: '構想（DEMO等）',
    summary: 'ITERでは捕捉熱を冷却塔へ排出します。将来の融合発電所では、熱で蒸気を作り、タービンと発電機で電気に変える構想です。ここではその系を半透明の「構想パーツ」として重ねています。',
    focus: '右側の冷却回路・蒸気タービン・発電機の半透明パーツに注目します。これらはITERの実装パーツではありません。',
    boundary: 'ITERの実測発電量は0 MWです。教育換算の電力を「実測」「運転実績」「実用化済み」と読まないでください。',
    weights: Object.freeze({ plasma: .45, fields: .2, reaction: .45, heat: 1, electric: 1.8 }),
  }),
]);

export const COMPONENT_IDS = Object.freeze(['vessel', 'coils', 'plasma', 'divertor', 'blanket']);

export const COMPONENTS = Object.freeze([
  Object.freeze({ id: 'vessel', number: '01', title: '真空容器', english: 'VACUUM VESSEL', role: '高真空・プラズマとの隔離', text: 'プラズマと周囲の機器を隔てる二重壁の容器です。加熱用ポートや診断窓を通じて、ビーム・計測・保守機器が接続されます。模式図では24分割の外殻と12個のポートを簡略化しています。' }),
  Object.freeze({ id: 'coils', number: '02', title: '磁場コイル', english: 'TOROIDAL / POLOIDAL COILS', role: '螺旋磁場の生成', text: 'toroidalは輪の周方向、poloidalは短半径の断面方向を回る磁場です。両者を重ねて、荷電粒子が容器壁へ直接ぶつかりにくい経路を作ります。' }),
  Object.freeze({ id: 'plasma', number: '03', title: 'プラズマ', english: 'D–T PLASMA TORUS', role: '融合反応が起きる高温状態', text: '電子と原子核が分かれた希薄な状態です。専用shaderの発光帯は粒子の動きを視覚化したもので、実際の光の色・密度・温度分布を再現していません。' }),
  Object.freeze({ id: 'divertor', number: '04', title: 'ダイバータ', english: 'DIVERTOR / HEAT EXHAUST', role: '熱と粒子の排気', text: 'プラズマの外周から熱・粒子を制御して排気します。ITERが特に課題とする、 extreme heat flux に耐える材料・冷却・形状の研究が必要です。' }),
  Object.freeze({ id: 'blanket', number: '05', title: 'ブランケット', english: 'BREEDING BLANKET / SHIELD', role: '中性子の吸収・熱回収', text: '容器内側を覆い、中性子の運動エネルギーを熱へ変えます。ITERは熱除去やトリチウム増殖関連技術を試験しますが、発電用タービンはITERの構成要素ではありません。' }),
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: '材料と中性子照射', english: 'NEUTRON-RESISTANT MATERIALS', text: '高エネルギー中性子による脆化・膨張・放射化に耐える材料と、その健全性を確認する試験が必要です。' }),
  Object.freeze({ title: 'ダイバータの熱排気', english: 'HEAT EXHAUST', text: 'ごく狭い領域に集中する熱を、材料を壊さずに取り除くことが大きな工学的課題です。' }),
  Object.freeze({ title: 'トリチウム燃料循環', english: 'TRITIUM FUEL CYCLE', text: '三重水素は自然界にほとんどなく、半減期も約12.3年です。増殖・回収・再利用を実証する必要があります。' }),
  Object.freeze({ title: '保守と遠隔操作', english: 'REMOTE MAINTENANCE', text: '放射化された内部機器を人が直接交換できないため、遠隔ロボットによる保守技術が必要です。' }),
  Object.freeze({ title: '発電への変換損失', english: 'POWER CONVERSION', text: '融合熱を電気に変える効率だけでなく、プラズマ加熱・磁場・冷却・補機の消費電力も含めたplant gainが課題です。' }),
]);

export const SPECS = Object.freeze([
  Object.freeze({ label: '目的', value: '燃焼プラズマ研究', note: '発電所ではない' }),
  Object.freeze({ label: 'プラズマ大半径', value: '約6.2 m', note: '公開設計値' }),
  Object.freeze({ label: '融合出力目標', value: '500 MW', note: '実測値ではない' }),
  Object.freeze({ label: 'プラズマ加熱入力', value: '50 MW', note: 'Q=10の意味に注意' }),
  Object.freeze({ label: '温度の目安', value: '約1.5億 °C', note: '条件の例・近似' }),
  Object.freeze({ label: 'ITERからの実測発電', value: '0 MW', note: 'タービンなし' }),
]);

export const EVIDENCE_LEVELS = Object.freeze([
  Object.freeze({ label: '実測', text: '装置・実験で測定済みの値。ITERの目標値と混ぜません。' }),
  Object.freeze({ label: '研究', text: '実験室・試験装置で検証中の技術。実用製品の保証ではありません。' }),
  Object.freeze({ label: '実用化', text: '社会で使われている技術。ITER型の発電はこの区分ではありません。' }),
  Object.freeze({ label: '構想', text: 'DEMOや将来発電所など、設計・研究が進む段階の案です。' }),
]);

export const SOURCES = Object.freeze([
  Object.freeze({ organization: 'ITER', title: 'On The Road to ITER', href: 'https://www.iter.org/project/road-iter', kind: '公式・プロジェクト行程', citation: 'ITER Organization, “On The Road to ITER”.' }),
  Object.freeze({ organization: 'ITER', title: 'Making it work', href: 'https://www.iter.org/fusion-energy/making-it-work', kind: '公式・物理と課題', citation: 'ITER Organization, “Making it work”.' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  '5つのモードで、加熱・閉じ込め・融合・熱回収・将来発電を切り替えます。',
  '左の構成要素または3Dホットスポットを選ぶと、右の解説へ移動します。',
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  'Spaceキーで再生・一時停止、Rキーで視点と選択をリセットします。',
  'スライダーは教育用の模式モデルです。ITERの実測値や将来予測ではありません。',
  '発電モードの半透明タービンは「構想」であり、ITERにはありません。',
]);

export function getMode(id) {
  return MODES.find(mode => mode.id === id) || MODES[0];
}

export function getComponent(id) {
  return COMPONENTS.find(component => component.id === id) || null;
}
