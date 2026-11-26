export const ATLAS_CAPACITY = 16;

export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  subtitle: '宇宙への巨大な輸送機関',
  capacity: ATLAS_CAPACITY,
  entryNumber: 1,
  researchStatus: '開発・飛行試験中',
  modelNotice: '全高約121m・直径約9mを基準にした独自の教育用模式図です。実機のCADではなく、構成・エンジン数・形状は世代や仕様で変わります。',
  simulationNotice: '動きは現実の軌道・流体・重力計算ではなく、順序を学ぶための短い教育用モンタージュです。分離高度320〜360モデル単位も、実際の高度や時間をそのまま表すものではない圧縮表現です。',
  endorsementNotice: 'SpaceXの企業情報を出典として使っています。本ページは企業の承認・推奨を示しません。',
});

export const ENTRY = Object.freeze({
  id: 'starship',
  entryNumber: 1,
  title: 'STARSHIP',
  japaneseTitle: 'スターシップ — 宇宙への巨大な輸送機関',
  shortTitle: 'スターシップ',
  manufacturer: 'SpaceX',
  category: '再使用型ロケット',
  status: ATLAS.researchStatus,
  summary: 'Super HeavyとStarshipを組み合わせた2段式の輸送システム。再使用、ホットステージング、液体メタンと液体酸素を軸に、月・火星などへの運用を目指しています。',
});

export const CATALOG = Object.freeze([ENTRY]);

export const STAGES = Object.freeze([
  {
    id: 'liftoff',
    number: 1,
    start: 0,
    end: 10,
    title: '発進',
    english: 'LIFTOFF',
    summary: 'Super Heavyの33基とStarshipの6基、合計39基のRaptorが燃焼を開始します。押し上げる力が機体の重さを上回ると、発射台を離れます。',
    confirmed: ['統合機体の発進・上昇', '多基エンジンの同時燃焼'],
    planned: ['安定した再利用への反復', 'より短いターンアラウンド'],
    study: '推力と重量の差が、発進の決め手です。',
  },
  {
    id: 'ascent',
    number: 2,
    start: 10,
    end: 22,
    title: '上昇 / Max-Q',
    english: 'ASCENT / MAX-Q',
    summary: '大気が濃いうちは空気抵抗が強まります。Max-Qは動圧が最大になる付近を指し、機体にかかる曲げ荷重も大きくなるため、エンジン出力や姿勢が調整されます。',
    confirmed: ['大気圏内の制御された上昇', '飛行試験中の姿勢・推力制御'],
    planned: ['反復飛行での運用確立', '想定荷重内での安定飛行'],
    study: '速くなるほど空気抵抗は増えますが、上空では空気が薄くなるためMax-Qが生まれます。',
  },
  {
    id: 'hotstage',
    number: 3,
    start: 22,
    end: 30,
    title: 'ホットステージング',
    english: 'HOT STAGING',
    summary: '下段のエンジンが燃焼を続けるなかで上段が分離し、Starship側のエンジンが点火します。大きな隙間を空けずに次の推進へつなぐ方式です。',
    confirmed: ['ホットステージングによる段階分離', '分離後の上段エンジン点火'],
    planned: ['反復運用での分離手順の確立', 'より高度な誘導・制御'],
    study: '通常のコールド分離と違い、上段の点火と下段の分離が重なります。',
  },
  {
    id: 'booster-return',
    number: 4,
    start: 30,
    end: 44,
    title: 'ブースター帰還 / キャッチ',
    english: 'BOOSTER RETURN / CATCH',
    summary: 'Super Heavyは高い位置で横移動し、直立してから垂直降下します。タワーの下段用アームが開いて機体上部を挟み、アームを閉鎖した後にエンジンを停止します。地面に着地させないキャッチ式の模式図です。',
    confirmed: ['ブースターの制御帰還', '飛行試験におけるタワーキャッチ・再利用の実例'],
    planned: ['再利用の頻度と信頼性を高めること', '点検・再整備の効率化'],
    study: '帰還は打ち上げの逆再生ではありません。質量と燃料が減り、制御方法も変わります。',
  },
  {
    id: 'orbit',
    number: 5,
    start: 44,
    end: 54,
    title: '軌道',
    english: 'ORBIT / BEYOND',
    summary: 'Starshipは宇宙空間を航行し、この模式図では軌道stageに入ってからペイロードベイ扉を開き、太陽翼を展開します。終了前に再格納します。給油や月・火星への輸送も設計上の目標です。',
    confirmed: ['上段による宇宙空間での飛行', '飛行試験で得られた構造・熱・制御の知見'],
    planned: ['軌道給油', '無人月貨物輸送', '有人月・火星ミッション'],
    study: '「宇宙に行く」ことと「決められた軌道に乗る」ことは、別の技術課題です。',
  },
  {
    id: 'ship-return',
    number: 6,
    start: 54,
    end: 70,
    title: '上段帰還 / アームキャッチ',
    english: 'SHIP RETURN / CATCH',
    summary: 'Starship上段も姿勢変更・再突入・フラップ制御を経て、高い位置で直立し、垂直降下とエンジン減速で上段用アームへ近づきます。アーム閉鎖後にエンジンを停止し、下段の上に並べて保持します。上段キャッチとこの最終状態は開発・構想として描画しており、実績と混同しません。',
    confirmed: ['上段の大気圏内飛行', 'フラップによる姿勢制御の実証'],
    planned: ['上段のアームキャッチ', '上下段を反復回収する運用', '軌道給油・月・火星輸送'],
    study: '上段の帰還・キャッチは、ここでは開発・構想として描く教育用モンタージュです。',
  },
]);

export const SPECIFICATIONS = Object.freeze([
  ['全高', '約121m', '構成・世代で変動'],
  ['直径', '約9m', '胴体の公称値'],
  ['エンジン', '33 + 6基', 'Raptorを目安に配置'],
  ['推進剤', 'メタン / 酸素', '液体メタン＋液体酸素'],
  ['構成', '2段式', 'Super Heavy + Starship'],
]);

export const PRINCIPLES = Object.freeze([
  ['再使用', '回収した機体を点検・再整備して繰り返し使う設計。反復した再利用の確立は開発目標です。'],
  ['アームキャッチ', '地面着陸ではなく塔のアームで機体を挟む構想。下段は飛行試験例があり、上段は開発・構想として描画します。'],
  ['ホットステージング', '上段の分離と点火を重ね、推進の空白を小さくする試み。'],
  ['メタンと酸素', '比較的扱いやすい液体メタンを使い、燃焼には液体酸素を組み合わせます。'],
  ['月・火星へ', '大きな貨物や多人の輸送を見込んだ構想。実現には給油・着陸・居住など多くの課題が残ります。'],
]);

export const HOTSPOTS = Object.freeze({
  engines: Object.freeze({
    title: 'Raptorエンジン',
    english: 'PROPULSION',
    description: '液体メタンと液体酸素を燃やして推力を出すエンジンです。模型ではSuper Heavyに33基、Starshipに6基を配置しました。内側と外側ではベルの大きさを変え、 vacuum 用と sea-level 用の違いを視覚化しています。実機の数や型式は世代で変わります。',
    specs: [['Super Heavy', '33基を目安'], ['Starship', '6基を目安'], ['推進剤', '液体メタン＋液体酸素']],
    view: 'engines',
  }),
  tanks: Object.freeze({
    title: '液体メタン / 液体酸素タンク',
    english: 'PROPELLANT TANKS',
    description: '推進剤を別々のタンクに格納します。模型では酸素側を青、メタン側を琥珀色で示し、仕切りや配管を簡略化しています。実際のタンク配置・断熱・ヘッダータンクはこの模式図どおりではありません。',
    specs: [['酸化剤', '液体酸素'], ['燃料', '液体メタン'], ['表示', '色は学習用の凡例']],
    view: 'tanks',
  }),
  hotstage: Object.freeze({
    title: 'ホットステージリング',
    english: 'STAGE INTERFACE',
    description: '上段が離れる境界にあるリングとベントを表しています。下段の排気が上段へ強く当たらないよう、間のガスを逃がす考え方です。分離の順序を「断面」や「分解」で確認できます。',
    specs: [['目的', '分離時の干渉を減らす'], ['表示', 'ベントを簡略化'], ['関連段階', 'ホットステージング']],
    view: 'hotstage',
  }),
  flaps: Object.freeze({
    title: '前方 / 後方フラップ',
    english: 'AERODYNAMIC CONTROL',
    description: '後方フラップ2枚は左右の±X、前方フラップ2枚は20°と160°の140°間隔で配置した計4枚です。前方は薄く小ぶりで、leeward側へ寄せ、ヒンジ軸を傾けています。大気中では空気力を受けて姿勢を制御します。',
    specs: [['後方 / 前方', '2枚 + 2枚'], ['役割', '大気圏内の姿勢制御'], ['形状', '教育用の近似']],
    view: 'flaps',
  }),
  payload: Object.freeze({
    title: 'ペイロード部',
    english: 'PAYLOAD VOLUME',
    description: '先端部の中に衛星や貨物を収める空間を想定しています。模型では上昇・分離・帰還中は太陽翼と簡易PEZディスペンサーを格納し、軌道stageでのみベイ扉を開いて展開します。帰還前に再格納します。',
    specs: [['想定', '衛星・貨物'], ['展開', '軌道stageのみ'], ['表示', '汎用モデル']],
    view: 'payload',
  }),
});

export const VIEW_PRESETS = Object.freeze([
  { id: 'overall', label: '全体' },
  { id: 'engines', label: 'エンジン' },
  { id: 'hotstage', label: 'ホットステージング' },
  { id: 'flaps', label: 'フラップ' },
]);

export const SOURCES = Object.freeze([
  { label: 'SpaceX — Starship', href: 'https://www.spacex.com/vehicles/starship' },
  { label: 'SpaceX — Updates', href: 'https://www.spacex.com/updates' },
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回し、ホイールまたは + / - キーでズームします。',
  '上部の「観察」ボタンで視点・断面・分解ツールを開きます。閉じるボタンまたはEscで閉じられます。',
  '「視点を戻す」はカメラだけを初期位置へ戻します。ミッション時刻は変わりません。',
  '段階名を選ぶと、その段階の開始時刻へ移動して一時停止し、追跡は「自動」に戻ります。',
  '分離後は下部transport内の「自動 / 両方 / 上段 / 下段」で追跡先を選べます。手動選択は自動へ戻すかリセットするまで保持されます。',
  '「断面」は胴体を半透明にしてタンクやペイロードを見せます。「分解」は内部を少し左右へ広げます。',
  '帰還は横移動・直立・垂直降下・アーム閉鎖・エンジン停止の順です。上段キャッチと最終的な上下段保持は開発・構想として描画します。',
  '再生速度とタイムラインは教育用の短いモンタージュです。実際の飛行時間・高度・軌道ではありません。',
]);
