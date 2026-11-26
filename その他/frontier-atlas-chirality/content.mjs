export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  entryNumber: 5,
  catalogCount: 5,
  endorsementNotice: '本ページはノーベル賞・研究機関・企業の承認・推奨を示しません。',
});

export const ENTRY = Object.freeze({
  id: 'chirality',
  title: 'MIRROR CHEMISTRY',
  japaneseTitle: 'キラリティ・鏡像化学',
  category: 'ASYMMETRIC SYNTHESIS / HOMOCHIRALITY',
  modelNotice: '触媒表面、分子、反応経路、選択性は教育用の模式図です。特定の反応の遷移状態、エネルギー、速度、鏡像体過剰率を再現していません。',
});

export const MODE_ORDER = Object.freeze(['achiral', 'binding', 'reaction', 'product']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'achiral', label: '非キラル', english: 'ACHIRAL ENVIRONMENT',
    title: '鏡に映る2種類が同じ割合でできる',
    summary: 'キラルな生成物は、互いに鏡像となるR体とS体のような異性体として現れます。触媒や環境がキラルでなければ、エネルギー的に等価な経路からほぼ1:1で生成されることが基本です。',
    study: '基礎：1:1は理想化された説明です。実際には不純物、測定、後処理などによってわずかな偏りが生じることもあります。',
    flow: [
      ['01', '非キラルな原料', '右手と左手の原料が同数'],
      ['02', '等価な経路', '触媒も環境も左右を区別しない'],
      ['03', '2種類の生成物', '鏡像異性体が生成'],
      ['04', 'ほぼ1:1', '鏡像体過剰率ee ≈ 0%'],
    ],
  }),
  Object.freeze({
    id: 'binding', label: '触媒結合', english: 'CHIRAL CATALYST BINDING',
    title: 'キラルな触媒が一方を選びやすくする',
    summary: 'キラル触媒のポケットは、右手型と左手型で異なる相互作用を生みます。結合しやすさや遷移状態の安定性に差が出ると、反応速度と生成割合に偏りが生まれます。',
    study: '実用化・研究：不斉触媒は医薬品などで使われます。この模型は一般的なキラル認識の説明であり、Soai反応そのものの触媒構造ではありません。',
    flow: [
      ['01', '原料が接近', '右手型・左手型'],
      ['02', '異なる相互作用', '触媒のキラル環境'],
      ['03', '安定性に差', '反応経路のエネルギーがずれる'],
      ['04', '選ばれやすさ', '一方の反応が優位に'],
    ],
  }),
  Object.freeze({
    id: 'reaction', label: '選択反応', english: 'SELECTIVE REACTION',
    title: 'エネルギー差を選択性へ変える',
    summary: '異なる遷移状態の自由エネルギー差が、速度定数比に影響します。ここでは2本の発光経路で、一方が低い障壁を通る様子を模式化しています。',
    study: '研究：Kaganは1986年に不斉合成の非線形効果を発見しました。Soaiは1995年に自己触媒反応の可能性を報告し、2003年にきわめて強い鏡像選択性を実現しました。',
    flow: [
      ['01', '触媒へ結合', '2種類の配位・会合'],
      ['02', '遷移状態', '障壁の高さが異なる'],
      ['03', '生成物を放出', '触媒は次のサイクルへ'],
      ['04', '割合が偏る', '選択性を定量測定する'],
    ],
  }),
  Object.freeze({
    id: 'product', label: 'キラル生成物', english: 'CHIRAL PRODUCT',
    title: '片側に偏った生成物と自己増幅',
    summary: '生成物が触媒反応を促進する自己触媒では、小さな初期の偏りが増幅される場合があります。生命が特定の鏡像を多く使う理由との関連が研究されています。',
    study: '研究：Soai反応は実験室での強力な例です。地球の生命の起源で同じ機構が起きたと証明したものではなく、普遍的な説明には追加研究が必要です。',
    flow: [
      ['01', '小さな初期差', '偶然・外部要因など'],
      ['02', '生成物が触媒として働く', '正のフィードバック'],
      ['03', '鏡像体過剰が増大', '同じ向きがさらに増える'],
      ['04', '化学と生命をつなぐ', '起源仮説は引き続き研究'],
    ],
  }),
]);

export const FLOW_CAPTIONS = Object.freeze({
  achiral: '非キラル環境 → 等価な経路 → 右手 / 左手が約1:1',
  binding: '右手 / 左手 → キラル触媒 → 異なる相互作用',
  reaction: '結合 → 異なる遷移状態 → 選択的な生成物',
  product: '小さな偏り → 自己触媒 → 強い鏡像体過剰',
});

export const HOTSPOTS = Object.freeze({
  mirror: Object.freeze({
    mode: 'achiral', title: '鏡像異性体', english: 'ENANTIOMERS',
    description: '同じ原子と結合を持ちながら、空間配置が鏡像として異なる分子です。色は右手・左手を区別する教育用の記号で、化学式やCIPのR/S判定そのものではありません。',
    specs: [['原子', '同じ組成・結合'], ['空間', '鏡像として重ならない'], ['性質', '非キラル環境では同じ']],
  }),
  catalyst: Object.freeze({
    mode: 'binding', title: 'キラル触媒表面', english: 'CHIRAL CATALYST SURFACE',
    description: '左右非対称なポケットを持つ触媒の模式図です。モデルでは表面のくぼみとリガンドで、2種類の鏡像体に対する相互作用の差を表します。',
    specs: [['役割', '反応経路を変える'], ['特徴', '自分自身は消費されない'], ['表示', '支持体・活性サイト・リガンド']],
  }),
  ligand: Object.freeze({
    mode: 'binding', title: 'キラルリガンド', english: 'CHIRAL LIGAND',
    description: '触媒の金属中心や活性サイトにキラルな環境を与える部分です。実用触媒では金属、有機分子、支持体、溶媒の組み合わせが選択性を決めます。',
    specs: [['配置', '左右非対称'], ['作用', '基質の向きを制限'], ['設計', '構造と選択性を同時に最適化']],
  }),
  pathway: Object.freeze({
    mode: 'reaction', title: '反応経路', english: 'REACTION PATHWAY',
    description: '2種類の鏡像体がたどる、異なる高さの反応障壁を模式化しています。実際のエネルギー図は溶媒、温度、濃度、触媒状態に依存します。',
    specs: [['比較', '遷移状態の自由エネルギー'], ['結果', '速度・生成割合に差'], ['注意', '図の高さは実測値ではない']],
  }),
  product: Object.freeze({
    mode: 'product', title: '片側選択生成', english: 'ENANTIOENRICHED PRODUCT',
    description: '一方の鏡像体が多く含まれる生成物を、鏡像体過剰率eeで評価します。Soai型の自己触媒では、生成物が反応を促進し、偏りを増幅する例があります。',
    specs: [['指標', '鏡像体過剰率 ee'], ['研究例', 'Soaiの自己触媒'], ['区別', '実験結果と生命起源の仮説']],
  }),
});

export const RESEARCH_STATUS = Object.freeze({
  industrial: Object.freeze({ status: '実用化', kind: 'demonstrated', title: '不斉触媒', detail: 'キラル触媒による選択合成は、医薬品をはじめとする実用的な化学製造で使われています。' }),
  kagan: Object.freeze({ status: '研究で確立', kind: 'demonstrated', title: '非線形効果', detail: 'Henri B. Kaganは1986年、不斉合成における非線形効果を発見しました。' }),
  soai: Object.freeze({ status: '基礎研究', kind: 'demonstrated', title: '自己触媒', detail: 'Kenso Soaiは1995年に可能性を報告し、2003年にきわめて強い鏡像選択性を伴う反応を発表しました。' }),
  origin: Object.freeze({ status: '研究', kind: 'concept', title: '生命のホモキラリティ', detail: '2026年ノーベル化学賞は、不斉有機合成の非線形効果と自己触媒を対象としています。生命起源での普遍機構の証明とは別です。' }),
  scale: Object.freeze({ status: '研究・開発', kind: 'concept', title: '工業化と普遍性', detail: '触媒の回収、耐久性、コスト、幅広い基質への適用、自然界での普遍性には課題が残ります。' }),
});

export const COMPARISON = Object.freeze([
  Object.freeze({ term: '触媒', nonChiral: '非キラル', chiral: 'キラル' }),
  Object.freeze({ term: '経路', nonChiral: '等価', chiral: 'エネルギーの差' }),
  Object.freeze({ term: '生成', nonChiral: '約1:1', chiral: '片側に偏る' }),
  Object.freeze({ term: '課題', nonChiral: '分離が必要', chiral: '選択性・回収' }),
]);

export const ARCHITECTURE = Object.freeze(['キラル触媒 / リガンド', '基質の結合', '選択的な遷移状態', '生成物の放出', '触媒の再生']);

export const BENEFITS = Object.freeze([
  '目的の鏡像体を優先的に合成できる',
  '不要な鏡像体の生成と分離を減らせる可能性がある',
  '医薬品や機能性材料の設計に直結する',
  '生命の化学的左右非対称性を研究する手がかりになる',
]);

export const CHALLENGES = Object.freeze([
  '触媒の設計、合成、回収、耐久性',
  'わずかなエネルギー差を高い選択性へ変える',
  '溶媒・温度・濃度・不純物の影響',
  '自己触媒の機構と生命起源への適用を区別する',
  '鏡像体の分析・純度・安全性評価',
]);

export const SPECIFICATIONS = Object.freeze([
  ['2026', 'Kagan / Soai', 'ノーベル化学賞の受賞者'],
  ['1986', '非線形効果', 'Kaganによる発見'],
  ['1995 / 2003', 'Soai反応', '可能性の報告 / 強い選択性'],
  ['モデル', '49触媒部品・64分子原子', '教育用のInstanced detail'],
]);

export const SOURCES = Object.freeze([
  Object.freeze({ title: 'NobelPrize.org — Press release: Nobel Prize in Chemistry 2026', href: 'https://www.nobelprize.org/prizes/chemistry/2026/press-release/' }),
  Object.freeze({ title: 'NobelPrize.org — Advanced information: asymmetric organic synthesis', href: 'https://www.nobelprize.org/prizes/chemistry/2026/advanced-information/' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回、ホイールまたは+ / -キーでズームできます。',
  '非キラル・触媒結合・選択反応・キラル生成物の4モードを切り替えます。',
  '再生 / 一時停止、0.5× / 1× / 2×、タイムラインで分子の動きを観察します。',
  '鏡像体、触媒、リガンド、反応経路、生成物のホットスポットを選べます。',
  'Spaceで再生を切り替え、ダブルクリックで視点を戻します。',
]);
