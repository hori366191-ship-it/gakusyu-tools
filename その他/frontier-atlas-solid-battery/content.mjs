export const EXHIBIT = Object.freeze({
  title: '全固体電池 — 分解セル',
  shortTitle: '全固体電池',
  category: 'ENERGY STORAGE / SOLID ELECTROLYTE',
  definition: '全固体電池は、液体電解液の一部または全部をLiイオンを伝導する固体電解質に置き換えた蓄電池です。リチウム金属負極の利用により高エネルギー密度が期待されますが、界面抵抗・デンドライト・製造条件が実用化の課題です。',
  distinction: 'Liイオンは固体電解質の中を移動し、電子は外部回路を回ります。両者は同じ経路を通りません。イオンが動くことと、デンドライトが必ず防げることは別です。',
  modelNotice: '積層構造・イオン数・電流・デンドライト成長・リスク指数は教育用の近似です。特定製品の性能、寿命、安全性、実用化時期を再現・予測するものではありません。',
  endorsementNotice: '本ページは企業・研究機関の承認・推奨を示しません。企業発表は企業発表として扱い、査読論文の実測値と同一視しません。',
});

export const MODE_IDS = Object.freeze(['charge', 'migration', 'discharge', 'dendrite']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'charge', number: '01', label: '充電', english: 'CHARGING / Li PLATING', status: '研究セルで検証',
    summary: '外部電源から電子を供給し、正極から出たLiイオンを固体電解質を通して負極へ運びます。リチウム金属負極では、負極表面にLiが析出します。不均一な析出がデンドライトや空孔につながります。',
    focus: '上側の正極から下側のリチウム金属負極へ向かう青いLiイオンと、外部回路の電子に注目します。',
    boundary: '模式図はLi金属負極を使う全固体セルの例です。黒鉛負極へのインターカレーションを備える全固体電池もあり、内部反応は電極材料によって異なります。',
    weights: Object.freeze({ ions: 1.35, electrons: 1, deposition: 1, heat: .25, dendrite: .25 }),
  }),
  Object.freeze({
    id: 'migration', number: '02', label: 'イオン移動', english: 'Li+ TRANSPORT IN SOLID', status: '研究・材料開発',
    summary: 'Liイオンは結晶中の空孔サイトや粒界などを移動します。液体のように自由に泳ぐのではなく、固体の構造・欠陥・界面を通って伝導します。電子は固体電解質をできるだけ通らない設計が望まれます。',
    focus: '固体電解質の半透明な層を貫くLiイオンと、結晶サイトの模式表現に注目します。',
    boundary: 'イオン伝導度は温度、組成、密度、粒界、測定条件で変わります。スライダー出力は材料選定や寿命を保証する値ではありません。',
    weights: Object.freeze({ ions: 1.8, electrons: .25, deposition: .15, heat: .1, dendrite: .1 }),
  }),
  Object.freeze({
    id: 'discharge', number: '03', label: '放電', english: 'DISCHARGE / POWER DELIVERY', status: '研究セルで検証',
    summary: '負極のLiが酸化されてLiイオンと電子になり、Liイオンは固体電解質を正極へ、電子は外部回路を負荷へ戻ります。外部回路の電子が仕事を担います。',
    focus: '下側から上側へ向かうLiイオンと、外部回路を逆方向へ流れる電子に注目します。',
    boundary: '模式図の電流・容量・時間は実測値ではありません。実際の放電レート、温度、圧力、界面抵抗により性能は変わります。',
    weights: Object.freeze({ ions: 1.5, electrons: 1.25, deposition: .25, heat: .3, dendrite: .1 }),
  }),
  Object.freeze({
    id: 'dendrite', number: '04', label: 'デンドライト比較', english: 'DENDRITE GROWTH / SUPPRESSION', status: '研究・未解決',
    summary: '左は多孔質・界面が弱い条件、右は高密度・界面を制御した条件の教育比較です。Liは粒界、細孔、割れ、電子漏れ、応力集中などを通って進み、両電極を短絡させる可能性があります。',
    focus: '左右の比較セルで、負極表面のリチウム析出と固体電解質内部の枝状成長を比べます。',
    boundary: '固体電解質は必ずデンドライトを止めるわけではありません。Nature Communications 2024の約95%という臨界密度は、論文のLPS系・条件での知見であり、全材料・全電流への普遍保証ではありません。',
    weights: Object.freeze({ ions: .7, electrons: .2, deposition: 1.7, heat: .2, dendrite: 1.8 }),
  }),
]);

export const COMPONENT_IDS = Object.freeze(['cathode', 'electrolyte', 'anode', 'collectors', 'dendrite']);

export const COMPONENTS = Object.freeze([
  Object.freeze({ id: 'cathode', number: '01', title: '正極', english: 'CATHODE', role: '充電時にLiを放出', text: '遷移金属酸化物などの活物質がLiを吸蔵・放出します。層の厚み、粒子径、活物質含有率、導電剤、界面接触が性能と製造性に影響します。模式図では青い粒子和電極です。' }),
  Object.freeze({ id: 'electrolyte', number: '02', title: '固体電解質', english: 'SOLID ELECTROLYTE', role: 'Liイオンだけを通す設計', text: '酸化物・硫化物・ハロゲン化物・高分子などが候補です。イオン伝導度が高く、電子伝導度が低く、電極との化学的安定性が必要です。半透明の層は教育用に強調しています。' }),
  Object.freeze({ id: 'anode', number: '03', title: 'リチウム金属負極', english: 'Li-METAL ANODE', role: '充電時にLiを析出', text: 'Li金属は理論比容量3860 mAh/gと高く、負極の質量を減らせます。一方、表面での不均一析出、空孔、界面接触の喪失、デンドライトが課題です。' }),
  Object.freeze({ id: 'collectors', number: '04', title: '集電体', english: 'CURRENT COLLECTORS', role: '外部回路へ電子を集める', text: '正極と負極の外側に金属箔を置き、電子を外部回路へ導きます。模式図では外部ワイヤーのオレンジ粒子が電子で、固体電解質内の青粒子がLiイオンです。' }),
  Object.freeze({ id: 'dendrite', number: '05', title: 'デンドライトと界面', english: 'DENDRITE / INTERPHASE', role: '短絡につながる不均一成長', text: 'Liの枝状成長は、細孔や粒界への進入、界面反応、電子漏れ、応力による割れなど、複数の経路を組み合わせて起こります。高密度化や界面層はリスクを下げる方策ですが、万能ではありません。' }),
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: '界面抵抗', english: 'INTERFACIAL RESISTANCE', text: '固体同士の接触面積が小さく、酸化物系では抵抗が増えやすい条件があります。電極と電解質の組成・表面処理・接触設計が重要です。' }),
  Object.freeze({ title: 'デンドライトと細孔', english: 'Li FILAMENT PENETRATION', text: '粒界、連結した細孔、割れ、電子漏れなどを通るLi成長を、密度・界面・電流・圧力の観点から抑える必要があります。' }),
  Object.freeze({ title: '体積変化と接触喪失', english: 'VOLUME CHANGE / VOIDING', text: 'Liの析出・溶解で負極表面が変化し、電解質との接触が失われます。積層圧力の管理と界面設計が必要です。' }),
  Object.freeze({ title: '製造と積層圧力', english: 'MANUFACTURING / STACK PRESSURE', text: '薄く、密で、欠陥の少ない電解質を大面积・量産することや、必要な圧力を長時間維持することが課題です。' }),
  Object.freeze({ title: '材料ごとの安全条件', english: 'MATERIAL-SPECIFIC STABILITY', text: '硫化物は空気中の水分への配慮、酸化物は焼成温度や界面抵抗など、材料ごとに異なる条件があります。固体だから無条件に安全とは言えません。' }),
]);

export const SPECS = Object.freeze([
  Object.freeze({ label: '例の構成', value: 'Li | LLZO | NCM', note: '一構成・普遍仕様ではない' }),
  Object.freeze({ label: '固体電解質の役割', value: 'Li+伝導・電子絶縁', note: '液体を置換する候補材料' }),
  Object.freeze({ label: 'Li金属理論比容量', value: '3860 mAh/g', note: '理論値・実セル容量ではない' }),
  Object.freeze({ label: '論文の例', value: '1000サイクル・95%保持', note: '2022年論文の特定条件' }),
  Object.freeze({ label: '密度の知見', value: '約95%で連結細孔が閉鎖', note: '2024年LPS論文の条件' }),
  Object.freeze({ label: '3Dの層厚', value: '誇張・分解表示', note: '実寸スケールではない' }),
]);

export const EVIDENCE_LEVELS = Object.freeze([
  Object.freeze({ label: '実測', text: '論文・実験で、特定セル・条件について測定された結果。量産性能の保証ではありません。' }),
  Object.freeze({ label: '研究', text: '材料・界面・プロセスが実験室や試験セルで開発中の段階です。' }),
  Object.freeze({ label: '実用化', text: '製品・用途・条件が限定されて社会で使われる段階。材料名だけで一律には判断しません。' }),
  Object.freeze({ label: '構想', text: '将来の高エネルギー密度電池や全固体アーキテクチャの設計案です。' }),
]);

export const SOURCES = Object.freeze([
  Object.freeze({ organization: 'Nature Energy', title: 'Critical interphase overpotential as a lithium dendrite-suppression criterion for all-solid-state lithium battery design', href: 'https://www.nature.com/articles/s41560-023-01231-w', kind: '一次論文・2023', citation: 'Nature Energy (2023), s41560-023-01231-w.' }),
  Object.freeze({ organization: 'Nature Communications', title: 'Effect of solid-electrolyte pellet density on failure of solid-state batteries', href: 'https://www.nature.com/articles/s41467-024-45030-7', kind: '一次論文・2024', citation: 'Diallo et al., Nature Communications 15, 858 (2024).' }),
  Object.freeze({ organization: 'Nature Communications', title: 'High-energy and durable lithium metal batteries using garnet-type solid electrolytes with tailored lithium-metal compatibility', href: 'https://www.nature.com/articles/s41467-022-29531-x', kind: '一次論文・2022', citation: 'Kim et al., Nature Communications 13, 1883 (2022).' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  '充電・イオン移動・放電・デンドライト比較の4モードを切り替えます。',
  '青いLiイオンは固体電解質を移動し、オレンジの電子は外部回路を移動します。',
  '左の構成要素または3Dホットスポットを選ぶと、右の解説へ移動します。',
  'ドラッグまたは矢印キーで周回、ホイール・ピンチ・+ / -キーでズームします。',
  'Spaceキーで再生・一時停止、Rキーですべてリセットします。',
  '電流密度・電解質密度・界面品質は教育用の概念パラメータです。実測値や製品保証ではありません。',
  'デンドライト・リスクの数値は模式指数であり、短絡確率や寿命予測ではありません。',
]);

export function getMode(id) { return MODES.find(mode => mode.id === id) || MODES[0]; }
export function getComponent(id) { return COMPONENTS.find(component => component.id === id) || null; }
