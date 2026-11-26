export const MODE_IDS = Object.freeze(['sequence', 'denoise', 'fold', 'docking', 'interaction']);

export const MODES = Object.freeze([
  {
    id: 'sequence',
    number: '01',
    english: 'PRIMARY SEQUENCE',
    title: 'アミノ酸配列',
    shortTitle: '配列から始める',
    status: '実測データを可視化',
    lead: '20種類のアミノ酸が並ぶ一次配列が、折りたたみの出発点です。',
    detail: 'この展示ではPDB 1CRN（46残基）と1UBQ（76残基）の実測座標を使い、まず鎖を伸ばした状態で配列と側鎖を表示します。原子の色は元素の慣例色です。',
    stage: 'INPUT · SEQUENCE',
    observed: [
      'RCSB PDBの1CRN / 1UBQは、実験的に決定された静的な構造スナップショットです。',
      '配列だけでは、側鎖の配置やフォールディング経路を一意には決まりません。',
    ],
    research: [
      '構造予測は配列と進化・化学的な手がかりから、可能性の高い立体構造を推定します。',
    ],
    conceptual: [
      '鎖を一直線に伸ばすアニメーションは、フォールディング経路そのものではありません。',
    ],
    specs: ['46 / 76残基', 'PDB実測座標', '元素別CPK色'],
    challenges: ['配列だけでは機能を断定できない', '構造は複数の状態を取りうる'],
  },
  {
    id: 'denoise',
    number: '02',
    english: 'DIFFUSION DENOISING',
    title: '拡散モデルのノイズ除去',
    shortTitle: 'ノイズから構造へ',
    status: '研究の模式化',
    lead: 'バラバラな座標から、ネットワークが少しずつ構造らしい配置を推定します。',
    detail: 'AlphaFold 3は原子座標を直接扱う拡散モジュールを採用しています。ここではその考え方を、ノイズ粒子が実測座標へ近づく教育用アニメーションで模式化します。AIによる推論は行っていません。',
    stage: 'RESEARCH · DENOISE',
    observed: [
      'AF3の拡散モジュールは、ノイズを加えた原子座標から真の座標を予測するように学習します。',
      '推論時はランダムノイズから段階的にデノイズし、複数の候補を生成できます。',
    ],
    research: [
      '低ノイズでは局所構造、高ノイズでは大域配置の学習が重要になります。',
      '生成モデルは、もっともらしいが誤った構造を生む可能性もあります。',
    ],
    conceptual: [
      '粒子の減衰と座標補間は、実際の学習済み拡散ネットワークではありません。',
    ],
    specs: ['320のShader粒子', '疑似デノイズ', '実験座標を目標に使用'],
    challenges: ['ハルシネーション', '候補の信頼度評価', '計算コスト'],
  },
  {
    id: 'fold',
    number: '03',
    english: 'SECONDARY STRUCTURE',
    title: '折りたたみと二次構造',
    shortTitle: 'ヘリックスとシート',
    status: '実測構造＋教育用補間',
    lead: 'アミノ酸鎖が折り、αヘリックスやβシートがタンパク質の骨格を作ります。',
    detail: 'PDBのHELIX / SHEET記録から二次構造範囲を読み取り、らせんと矢印で強調します。伸びた鎖から実測座標への補間は、動きや経路を正しく再現するものではありません。',
    stage: 'STRUCTURE · FOLD',
    observed: [
      '1CRNには2本のらせんと1つのβシート、1UBQには2本のらせんと5本のβストランドが記録されています。',
      '水素結合によってαヘリックスとβシートの局所構造が安定化します。',
    ],
    research: [
      '予測構造の精度は領域ごとに異なり、信頼度スコアとの対応を調べる研究が進んでいます。',
    ],
    conceptual: [
      '本物の折りたたみは協奏的で、この単純な補間で表せるものではありません。',
    ],
    specs: ['PDB二次構造記録', 'Instanced原子', '2段階LOD'],
    challenges: ['ループ領域の不確実性', '構造揺らぎ', '翻訳後修飾'],
  },
  {
    id: 'docking',
    number: '04',
    english: 'PROTEIN–LIGAND DOCKING',
    title: 'タンパク質–リガンド結合',
    shortTitle: '候補ポーズを探す',
    status: '研究の模式化',
    lead: '小さなリガンドがポケットにはまり込む候補配置を、複数の視点から比較します。',
    detail: 'AF3はタンパク質、核酸、低分子などを共同で予測できます。このモードのリガンドと軌道は自作の教育用モデルで、特定の薬剤や実際のドッキング結果ではありません。',
    stage: 'INTERACTION · DOCKING',
    observed: [
      'AF3はPoseBustersで、従来のドッキング手法との比較を行っています。',
      '正しい候補を選ぶには、衝突・キラリティ・化学的妥当性の検査が必要です。',
    ],
    research: [
      'タンパク質の柔軟性や水を含む相互作用は、ドッキング精度の課題です。',
    ],
    conceptual: [
      '5つのゴーストは候補数を示すだけで、スコアや結合自由エネルギーは計算していません。',
    ],
    specs: ['9原子の自作リガンド', '5候補ポーズ', '教育用ポケット'],
    challenges: ['タンパク質の柔軟性', '水とプロトン化', '実験検証'],
  },
  {
    id: 'interaction',
    number: '05',
    english: 'PROTEIN–DNA INTERACTION',
    title: 'タンパク質–DNA相互作用',
    shortTitle: '分子同士の接点',
    status: '相互作用の模式図',
    lead: 'タンパク質と核酸が協働すると、遺伝情報の読み取りや制御が可能になります。',
    detail: '二重らせんDNA、塩基対、接触線を自作で表示します。1CRN / 1UBQはこの展示用のDNA結合相手ではないため、配置と接触は一般概念を説明するための模式図です。',
    stage: 'COMPLEX · INTERACTION',
    observed: [
      'DNA結合タンパク質は、配列特異性と構造・静電相互作用を利用して標的に結合します。',
      'AF3はタンパク質–核酸複合体も共同予測の対象にしています。',
    ],
    research: [
      '界面の信頼度、DNAの曲がり、水やイオンの影響をどう評価するかが課題です。',
    ],
    conceptual: [
      '接触線は水素結合の本数や結合エネルギーを測定したものではありません。',
    ],
    specs: ['24塩基対のDNA', '48本の骨格線', '8本の模式接触線'],
    challenges: ['界面の信頼度', 'DNA・RNAの区別', '細胞環境の再現'],
  },
]);

export const HOTSPOT_IDS = Object.freeze(['chain', 'helix', 'sheet', 'diffusion', 'interaction']);

export const HOTSPOTS = Object.freeze([
  {
    id: 'chain',
    title: 'アミノ酸鎖',
    english: 'POLYMER BACKBONE',
    role: 'N–Cα–C–N–Cα–C…',
    current: '主鎖の原子を球と円柱で表示し、残基番号の順に結合しています。',
    evidence: '配列と主鎖原子はローカルのRCSB PDBファイルから読み取っています。',
    caveat: '拡張鎖への変形は表示用で、実際の伸長構造や折りたたみ経路を再現していません。',
  },
  {
    id: 'helix',
    title: 'αヘリックス',
    english: 'SECONDARY STRUCTURE',
    role: '局所的ならせん構造',
    current: 'PDBのHELIX記録をチューブで描き、折りたたみが進むと現れます。',
    evidence: '1CRNは7–19 / 23–30残基、1UBQは23–34 / 56–59残基を採用しています。',
    caveat: 'らせんの太さや色は見やすさのための装飾です。',
  },
  {
    id: 'sheet',
    title: 'βシート',
    english: 'SECONDARY STRUCTURE',
    role: 'ストランドが並ぶ構造',
    current: 'PDBのSHEET記録を棒と矢印で表示しています。',
    evidence: '1CRNは1–4 / 32–35残基、1UBQは5本のストランドを表示します。',
    caveat: '矢印はN→C方向の目安であり、水素結合ネットワークの全原子モデルではありません。',
  },
  {
    id: 'diffusion',
    title: '拡散ノイズ',
    english: 'GENERATIVE DENOISING',
    role: '不確かな座標を整える',
    current: '専用Shaderの粒子がデノイズ進行に合わせて密度と広がりを変えます。',
    evidence: 'AF3は原子座標を直接生成する拡散モジュールを採用しています。',
    caveat: '粒子の動きは数学的な拡散過程やAIニューラルネットワークの実演ではありません。',
  },
  {
    id: 'interaction',
    title: '相互作用界面',
    english: 'BIOMOLECULAR COMPLEX',
    role: 'リガンドまたはDNAとの接点',
    current: 'ドッキングでは5候補、DNAでは24塩基対と接触線を表示します。',
    evidence: 'AF3はタンパク質・核酸・低分子の複合体予測を扱います。',
    caveat: 'リガンド、ポケット、DNA配置は教育用の自作モデルで、結合親和性は計算していません。',
  },
]);

export const SPECIMENS = Object.freeze([
  {
    id: '1crn',
    pdb: '1CRN',
    name: 'クランビン',
    organism: 'Crambe hispanica subsp. abyssinica',
    residues: 46,
    resolution: '1.5 Å',
    year: '1981',
    href: 'https://www.rcsb.org/structure/1CRN',
  },
  {
    id: '1ubq',
    pdb: '1UBQ',
    name: 'ユビキチン',
    organism: 'Bos taurus',
    residues: 76,
    resolution: '1.8 Å',
    year: '1987',
    href: 'https://www.rcsb.org/structure/1UBQ',
  },
]);

export const REPRESENTATIONS = Object.freeze([
  { id: 'experimental', label: '実験構造', note: 'PDBの実測座標をそのまま表示' },
  { id: 'proxy', label: '予測プロキシ', note: '座標を滑らかにした教育用の代替モデル' },
  { id: 'compare', label: '重ねて比較', note: '実験座標をゴーストとして重ねる' },
]);

export const SOURCES = Object.freeze([
  {
    organization: 'Nature',
    title: 'Accurate structure prediction of biomolecular interactions with AlphaFold 3',
    year: '2024',
    href: 'https://www.nature.com/articles/s41586-024-07487-w',
    kind: '研究論文',
  },
  {
    organization: 'Nature News',
    title: 'AlphaFold database hits ‘next level’: the AI system now includes protein pairing',
    year: '2026',
    href: 'https://www.nature.com/articles/d41586-026-00787-3',
    kind: 'ニュース',
  },
  {
    organization: 'RCSB PDB',
    title: '1CRN — Water structure of a hydrophobic protein at atomic resolution',
    year: '1981',
    href: 'https://www.rcsb.org/structure/1CRN',
    kind: '公開実験構造',
  },
  {
    organization: 'RCSB PDB',
    title: '1UBQ — Structure of ubiquitin refined at 1.8 Å resolution',
    year: '1987',
    href: 'https://www.rcsb.org/structure/1UBQ',
    kind: '公開実験構造',
  },
]);

export const EVIDENCE_LEGEND = Object.freeze([
  { label: '実測', text: 'PDBに登録された実験構造' },
  { label: '実装', text: 'このHTML内で動作する可視化' },
  { label: '研究', text: '論文で報告された手法・評価' },
  { label: '構想', text: 'この展示用の模式化・未検証の表現' },
]);

export const COMPARISON = Object.freeze([
  ['出所', 'X線回折などの実験構造', '配列等から推定した構造'],
  ['この展示', '1CRN / 1UBQの実測座標', '実測座標を平滑化したプロキシ'],
  ['揺らぎ', '静的なスナップショット', '状態やアンサンブルを直接保証しない'],
  ['信頼度', 'B因子・検証指標など', 'pLDDT / PAE / PDEなど'],
  ['注意', '実験条件の影響を含む', '誤った構造ももっともらしく見える'],
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグ / 1本指で周回、ホイール / ピンチ / ＋−キーでズームします。',
  'Spaceで再生・一時停止、Rでリセット、矢印キーで視点を動かします。',
  '5つのモード、2種類のPDB、3種類の表現を切り替えられます。',
  'ホットスポットを選ぶと視点が寄り、右の解説に対象の根拠と限界が表示されます。',
  'モバイルでは「解説を開く」から下部シートを展開できます。',
]);

export const EXHIBIT = Object.freeze({
  definition: 'アミノ酸配列から立体構造と分子間相互作用を読み解くAI構造予測の教育用展示。',
  modelNotice: '教育用の近似です。AF3やAlphaFoldの推論、ドッキング、結合エネルギー計算は行っていません。信頼度カラーも実測pLDDTではありません。',
  predictionNotice: '予測プロキシは実測PDB座標を近傍平均で滑らかにした表示用モデルです。実際のAlphaFold予測との一致・精度を示しません。',
  endorsementNotice: '掲載企業・研究機関の承認・推奨を示しません。',
});

export const getMode = id => MODES.find(mode => mode.id === id) || MODES[0];
export const getHotspot = id => HOTSPOTS.find(hotspot => hotspot.id === id) || null;
export const getSpecimen = id => SPECIMENS.find(specimen => specimen.id === id) || SPECIMENS[0];
export const getRepresentation = id => REPRESENTATIONS.find(entry => entry.id === id) || REPRESENTATIONS[0];
