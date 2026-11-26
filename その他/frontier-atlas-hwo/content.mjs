export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS', entryNumber: 4, catalogCount: 5, category: 'EXOPLANET OBSERVATORY',
  endorsementNotice: 'NASAのHWO公式ページを出典としていますが、本ページはNASAの承認・推奨を示しません。',
  modelNotice: '分割鏡・ coronagraph・starshade・惑星・スペクトルは教育用の模式図です。HWOの確定設計、公式CAD、実観測画像ではありません。',
  simulationNotice: '鏡の展開、角分離、光量、時間を短縮・誇張しています。生命の候補ラインも実測スペクトルではなく説明用の模式表現です。',
});

export const ENTRY = Object.freeze({
  id: 'habitable-worlds-observatory', title: 'HABITABLE WORLDS', japaneseTitle: '生命を探す宇宙望遠鏡', status: '研究開発・計画・構想',
  summary: '星のまぶしい光を抑え、その周囲の惑星を直接撮影し、大気の光を分光する。Habitable Worlds Observatoryの構想を、分割鏡と二つの減光方式から学びます。',
});

export const MODES = Object.freeze([
  Object.freeze({ id: 'mirror-deploy', label: '分割鏡の展開', english: 'MIRROR DEPLOY', title: '大きな鏡を、折りたたんで運ぶ', summary: 'HWOの構想では大きな一次鏡が検討されています。多数の鏡セグメントをコンパクトに収納し、宇宙で展開・位相合わせする設計が課題になります。模型の37枚は中央穴を避けた教育用配置で、LUVOIRやHabExの既存概念を参考にしていますが、HWOの確定仕様ではありません。', study: 'NASAは鏡のサイズ、感度、安定性などを比較する設計トレードを行っています。セグメント数・直径・打ち上げ時期を確定事実として扱いません。', flow: [['01','折りたたみ','打ち上げ容器に収める'],['02','展開','セグメントを所定の位置へ'],['03','位相合わせ','一枚の大きな鏡として整合'],['04','安定した観測','揺れ・熱・ひずみを制御']] }),
  Object.freeze({ id: 'starlight-suppression', label: '減光', english: 'STARLIGHT SUPPRESSION', title: '惑星を見えるように、星を暗くする', summary: '太陽系外惑星は主星に比べて非常に暗く、角度も近接しています。coronagraphは望遠鏡内部で星の光を抑え、starshadeは別の遮光器を星と望遠鏡の間に置く構想です。', study: '模型の二方式は同時に確定採用されたものではなく、仕組みを比較するための並置です。回折・不安定さ・運用条件を考慮する必要があります。', flow: [['01','主星の光','惑星よりはるかに明るい'],['02','光を抑える','内部マスク / 外部遮光器'],['03','回折を管理','星周縁の光をできるだけ減らす'],['04','惑星を残す','微弱な惑星光を測る']] }),
  Object.freeze({ id: 'direct-imaging', label: '直接撮影', english: 'DIRECT IMAGING', title: '点ではなく、惑星の世界を撮る', summary: '直接撮影は主星から分離した惑星の光を捉えます。明るさや色・時間変化から、惑星の半径、軌道、大気や雲の手がかりを調べられます。模型の惑星は実在する特定の惑星ではありません。', study: '「ハビタブル」と言えるかは、主星からの距離だけでなく大気・水・気候などを総合的に判断します。画像だけですぐに生命が分かるわけではありません。', flow: [['01','減光した星','主星の光を管理'],['02','微弱な惑星光','長い露出で積み重ねる'],['03','画像を作る','位置・明るさ・色を測定'],['04','時間変化','軌道・自転・大気を探る']] }),
  Object.freeze({ id: 'spectroscopy', label: '分光', english: 'SPECTROSCOPY', title: '惑星の光を、成分の手がかりに分ける', summary: '惑星の光を波長ごとに分けると、大気中の分子などによる吸収の特徴を調べられます。直接撮影と分光を組み合わせることが、HWO構想の重要な目的です。', study: '吸収ラインは観測条件・モデル・ノイズとの照合が必要です。一つのラインだけで大気成分や生命を確定することはできません。', flow: [['01','惑星からの光','直接撮像で分離'],['02','分光器へ','波長ごとに分散'],['03','吸収特徴','大気候補との照合'],['04','不確かさ','複数ラインと独立した証拠']] }),
  Object.freeze({ id: 'biosignature', label: '生命兆候', english: 'BIOSIGNATURE', title: '生命の候補は、結論の直前で止まる', summary: '酸素・水蒸気・メタンなどの組み合わせは、生命活動に関連する可能性があるため検討されます。しかし火山・光化学・岩石など非生物の過程でも似た条件が生じ得ます。', study: 'biosignatureは「生命が証明された」という意味ではありません。複数の証拠、惑星の環境、誤った説明の除外を重ねて判断します。', flow: [['01','候補を集める','大気・表面・時間変化'],['02','非生物を検討','同じ兆候を作る別の説明'],['03','独立に確認','別の波長・観測・理論'],['04','慎重な結論','証拠の強さと不確かさを開示']] }),
]);
export const MODE_ORDER = Object.freeze(MODES.map(mode => mode.id));

export const HOTSPOTS = Object.freeze({
  mirror: Object.freeze({ title: '分割一次鏡', english: 'SEGMENTED PRIMARY', mode: 'mirror-deploy', description: '多数の鏡セグメントが一つの大きな光学系として働きます。模型の37枚・ actuators・支持構造は教育用の簡略化です。', specs: [['模型','37 hex segments'],['機能','光を集める'],['課題','展開・位相・安定性']] }),
  starshade: Object.freeze({ title: 'Starshade', english: 'EXTERNAL OCCULTER', mode: 'starlight-suppression', description: '星と望遠鏡の間に別の遮光器を置き、星の光を幾何的に抑える構想です。望遠鏡内のcoronagraphとは配置と役割が異なります。', specs: [['配置','主星と望遠鏡の間'],['方式','外部遮光器'],['課題','位置決め・回折']] }),
  coronagraph: Object.freeze({ title: 'Coronagraph', english: 'INTERNAL STARLIGHT MASK', mode: 'starlight-suppression', description: '望遠鏡内部の絞り・マスク・波面制御などを組み合わせ、主星の光を抑える方式です。模型は概念だけを表します。', specs: [['配置','望遠鏡内'],['方式','マスク・波面制御'],['課題','回折・感度']] }),
  planet: Object.freeze({ title: '系外惑星', english: 'EXOPLANET', mode: 'direct-imaging', description: '主星の光を抑えた後に残る、惑星からの微弱な光を捉えます。色・明るさ・時間変化が大気や雲の手がかりになります。', specs: [['観測','直接撮影'],['手がかり','明るさ・色・軌道'],['注意','模型は実観測画像ではない']] }),
  spectrograph: Object.freeze({ title: '分光器', english: 'SPECTROGRAPH', mode: 'spectroscopy', description: '惑星の光を波長ごとに分け、吸収特徴を測定します。模式スペクトルの水・酸素・メタンは候補の説明で、検出の発表ではありません。', specs: [['入力','惑星からの光'],['出力','波長別の強度'],['課題','ノイズ・モデル依存']] }),
});

export const RESEARCH_STATUS = Object.freeze([
  Object.freeze({ title: '系外惑星の直接撮影・分光', status: '実測・研究中', detail: 'すでに別の望遠鏡で一部の系外惑星が直接撮影・分光されています。HWO自体の観測実績ではありません。', tone: 'observed' }),
  Object.freeze({ title: 'Habitable Worlds Observatory', status: '計画・構想', detail: 'NASAが推奨する次期旗艦級の構想で、設計トレードや技術開発が進められています。確定した完成時期・仕様を本ページは断定しません。', tone: 'planned' }),
  Object.freeze({ title: '生命兆候の確定', status: '未解決', detail: '生命に関連し得る兆候と、生命の証明は別です。非生物の説明と不確かさの評価が必要です。', tone: 'open' }),
]);

export const SPECIFICATIONS = Object.freeze([
  ['分割鏡','多数のセグメント','打ち上げ時の折りたたみと宇宙での位相合わせ'],
  ['coronagraph','望遠鏡内で減光','絞り・マスク・波面制御を組み合わせる'],
  ['starshade','外部遮光器','主星と望遠鏡の間に配置する構想'],
  ['直接撮影＋分光','画像と波長情報','惑星の環境を多面的に調べる'],
]);
export const BENEFITS = Object.freeze([
  '地球型惑星の大気を直接調べる可能性がある',
  '生命に関係し得る化学と、惑星環境を一緒に考えられる',
  '太陽系外の多様な恒星系を比較できる',
]);
export const CHALLENGES = Object.freeze([
  '主星と惑星の巨大な明るさ・角度の差',
  '回折、鏡の安定性、精密な位置決め',
  '打ち上げ質量、展開、長期運用',
  '生命兆候と非生物過程の区別、観測の不確かさ',
]);
export const SOURCES = Object.freeze([
  Object.freeze({ label: 'NASA — Habitable Worlds Observatory', href: 'https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory' }),
  Object.freeze({ label: 'NASA HWO — Technology & Engineering', href: 'https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory/engineering/' }),
]);
export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  '5モードで、鏡の展開、減光、直接撮影、分光、生命兆候を確認できます。',
  'ラベルを選ぶと各部へ寄り、基本仕様を表示します。',
  'Spaceで再生 / 一時停止、Rでアニメーションと視点をリセットします。',
  'HWOは計画・構想です。模型の仕様・惑星・スペクトルは教育用近似です。',
]);
