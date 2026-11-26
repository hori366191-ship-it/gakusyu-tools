export const ATLAS = Object.freeze({
  entryNumber: 'LS / 02',
  id: 'crispr-base-editing',
  title: 'CRISPR / ベース編集 — 遺伝子を精密に書き換える',
  shortTitle: 'CRISPR / ベース編集',
  category: 'LIFE SCIENCE / GENOME EDITING',
  definition: 'CRISPR-Cas9はguide RNAに誘導されて特定DNA配列を認識します。Cas9切断は二本鎖に傷を付けて修復を利用し、ベース編集は二本鎖切断を起こさず、標的の一塩基を別の塩基へ化学変換します。',
  modelNotice: '配列・分子の形・編集窓・修復粒子・再生時間は教育用の近似です。実際の編集効率、オフターゲット頻度、治療成績を再現・予測するものではありません。',
  endorsementNotice: '本ページは研究機関の承認・推奨を示しません。',
});

export const MODE_IDS = Object.freeze(['recognition', 'edit', 'repair', 'edited']);
export const MECHANISM_IDS = Object.freeze(['cut', 'base']);
export const CYCLE_SECONDS = 24;
export const BASE_PAIRS = 32;
export const TARGET_INDEX = 8;
export const PAM = 'AGG';
export const ORIGINAL_SEQUENCE = 'GCTAACGTACGTTAGCTAGC';
export const EDITED_SEQUENCE = 'GCTAACGTGCGTTAGCTAGC';
export const CUT_SEQUENCE = 'GCTAACGTCGTTAGCTAGC';

export const MODES = Object.freeze([
  Object.freeze({
    id: 'recognition', number: '01', start: 0, end: .25,
    title: 'target recognition', english: 'GUIDE RNA / PAM RECOGNITION', color: '#72e4ed',
    summary: 'guide RNAのspacer配列がDNAと相補的に結合し、Cas9が隣接するPAMを認識します。標的部位が決まる段階です。',
    detail: ' SpCas9の代表的なPAMはNGGです。guide RNAは標的DNA鎖と塩基対を作り、もう一方の非標的鎖はRループとして露出します。模型の配列は教学用の任意配列で、特定の疾患遺伝子ではありません。',
    study: 'CRISPR-Cas9の配列認識機構は構造研究と生化学で調べられています。標的配列とPAMの両方が、編集ツールの設計に重要です。',
    boundary: 'guide RNAが標的に似た配列を認識しないとは限りません。オフターゲット編集は、配列特異性、細胞状態、酵素 design に依存します。',
    flow: [['01', 'guide RNA', '20塩基のspacerが標的鎖へ'], ['02', 'PAM認識', 'Cas9がNGGを確認'], ['03', 'Rループ', '非標的鎖が露出']],
  }),
  Object.freeze({
    id: 'edit', number: '02', start: .25, end: .50,
    title: 'cut vs base edit', english: 'DSB OR SINGLE-BASE CHEMISTRY', color: '#ffc07a',
    summary: '機構を切り替えます。Cas9切断はDNA二本鎖を切り、ベース編集は二本鎖切断なしで標的塩基を化学変換します。',
    detail: '活性Cas9はHNHドメインとRuvCドメインで相補的な2本を切り、二本鎖切断（DSB）を作ります。アデニンベースエディターは不活性化Cas9に脱アミナーゼを融合し、AをI（イノシン）を経てGへ変換します。多くのベースエディターは片側のニックを利用しますが、DSBは作りません。',
    study: 'ベース編集は2016年の原理報告以後、編集窓の狭小化、bystander編集やオフターゲットの低減に向けて改良されています。2025年のNature Communications論文は、TadA-NW1による4塩基の狭い編集窓とbystander低減を報告しています。',
    boundary: 'ベース編集はあらゆる塩基置換に対応するわけではありません。利用できる変換、PAM、編集窓、近傍のbystander、デリバリーと安全性を評価する必要があります。',
    flow: [['01', '標的塩基', 'A·Tを例に表示'], ['02A', 'Cas9切断', '2本鎖切断 → 細胞修復'], ['02B', 'ベース編集', 'A→I→G / T→C・DSBなし']],
  }),
  Object.freeze({
    id: 'repair', number: '03', start: .50, end: .75,
    title: 'repair', english: 'CELLULAR REPAIR / RESOLUTION', color: '#b39cff',
    summary: '細胞の修復機構が中間状態を処理します。切断経路とベース編集経路では、修復に使われる仕組みと不確実性が異なります。',
    detail: 'DSBの修復にはNHEJやHDRなどが関わり、NHEJでは小さな挿入・欠失が生じることがあります。ベース編集では、塩基の化学変換とDNA複製・修復によってA·T→G·Cが固定されます。ベース編集にもエラーは残り、bystander編集やオフターゲット編集が課題です。',
    study: '2026年のNature Biotechnology論文OptiPrimeは、ベース編集ではなくプライム編集の効率予測と修復（MMR）の研究です。本展示は出典として区別し、その結果をベース編集の実測値として扱いません。',
    boundary: '「修復が起これば必ず意図した編集になる」とは限りません。切断経路ではIndel、ベース編集ではbystander・部分編集などの結果を検証する必要があります。',
    flow: [['01A', 'DSB修復', 'NHEJ / HDR・Indelの可能性'], ['01B', '塩基変換の固定', 'A·T→G·Cへ'], ['02', '配列検証', '意図した編集と副反応を確認']],
  }),
  Object.freeze({
    id: 'edited', number: '04', start: .75, end: 1,
    title: 'edited sequence', english: 'INTENDED EDIT / VERIFICATION', color: '#83e2b5',
    summary: '編集後の配列を、編集前と並べて確認します。ベース編集は一塩基のA·T→G·C、切断経路の例は1塩基欠失です。',
    detail: '表示するGCTAACGTACGTTAGCTAGCは任意の20塩基配列です。ベース編集では9番目のA·TがG・Cに変わります。切断経路の図は、NHEJで小さな欠失が起きた例であり、切断の必然的な結果ではありません。',
    study: '実用的な編集では、標的效率、product purity、bystander、オフターゲット、細胞機能への影響を別々に測定します。配列が一致することだけでは治療の有効性・安全性は証明できません。',
    boundary: 'この展示には実験プロトコル、ツール選定、安全性評価、規制上の判断は含まれません。ヒトの遺伝子編集は専門の研究・臨床開発の文脈で扱う必要があります。',
    flow: [['01', '編集前後を比較', '一塩基変換または小さなIndel'], ['02', '副反応を測定', 'bystander / off-target'], ['03', '機能を検証', '配列だけでなく細胞・生体で評価']],
  }),
]);

export const MECHANISMS = Object.freeze({
  cut: Object.freeze({
    id: 'cut', label: 'Cas9切断', english: 'DOUBLE-STRAND BREAK',
    badge: 'DSBをつくる', title: '二本鎖切断と細胞修復',
    description: 'Cas9が相補的な2本を切断し、DNA二本鎖切断（DSB）を作ります。細胞の修復を利用して配列を変えますが、NHEJでは小さな挿入・欠失が生じる可能性があります。',
    change: '例：20塩基 → 19塩基（1塩基欠失）',
    doubleStrandBreak: true,
  }),
  base: Object.freeze({
    id: 'base', label: 'ベース編集', english: 'BASE EDITING · NO DSB',
    badge: 'DSBをつくらない', title: '一塩基の化学変換',
    description: '不活性化Cas9と脱アミナーゼで標的AをIを経てGへ変換し、二本鎖切断（DSB）を作りません。多くの場合、DNA複製・修復で相補鎖もCに変わり、A·T→G·Cが固定されます。',
    change: '例：A·T → G·C（9番目の塩基対）',
    doubleStrandBreak: false,
  }),
});

export const HOTSPOTS = Object.freeze({
  helix: Object.freeze({
    number: '01', title: 'DNA二重らせん', english: 'DNA DOUBLE HELIX', color: '#72e4ed', mode: 'recognition',
    role: '32塩基対の教学用配列', description: '2本の糖リン酸骨格と32塩基対を表示しています。AはT、GはCと対になります。らせんの太さや回転数は分子構造を視覚化するための近似です。',
    specs: [['骨格', '糖リン酸骨格2本'], ['塩基対', 'A·T / G·C'], ['標的', '20塩基＋PAM（AGG）']],
  }),
  guide: Object.freeze({
    number: '02', title: 'guide RNA', english: 'GUIDE RNA / SPACER', color: '#9cf1cc', mode: 'recognition',
    role: '標的配列を指定する', description: '20塩基のspacerが標的DNA鎖と相補的に結合します。図のguide RNAは非標的鎖と同じ配列をUに置き換えた教学表示で、PAMはRNAには含みません。',
    specs: [['spacer', '20塩基（例）'], ['相補性', '標的DNA鎖と塩基対'], ['PAM', 'Cas9が別に認識']],
  }),
  cas9: Object.freeze({
    number: '03', title: 'Cas9', english: 'CAS9 / RECOGNITION & CLEAVAGE', color: '#a9c6ff', mode: 'edit',
    role: '配列認識と切断', description: '認識ローブ、HNH、RuvCを模式化しています。活性Cas9は2本鎖を切断しますが、ベースエディターでは切断活性を失ったCas9が標的へ誘導する足場として働きます。',
    specs: [['認識', 'guide RNA＋PAM'], ['切断', 'HNH / RuvC'], ['BEでのCas9', '不活性化・ニックアーゼ等']],
  }),
  deaminase: Object.freeze({
    number: '04', title: '脱アミナーゼ', english: 'DEAMINASE / BASE EDITOR', color: '#ffc07a', mode: 'edit',
    role: 'AをIへ化学変換', description: 'アデニンベースエディターの脱アミナーゼが、露出した標的AをIへ変換します（A → I → G）。Iは複製・修復の過程でGとして読み取られ、相補鎖はCになります。',
    specs: [['変換', 'A → I → G'], ['相補鎖', 'T → C'], ['DSB', 'ベース編集では作らない']],
  }),
  repair: Object.freeze({
    number: '05', title: '修復と検証', english: 'REPAIR / SEQUENCE VERIFICATION', color: '#d2a6ff', mode: 'repair',
    role: '中間状態から最終配列へ', description: 'DSBを修復するNHEJ / HDRなどの因子と、ベース編集の中間状態を処理する因子を模式化しています。紫の粒子は編集の成功・失敗を確率として予測するものではありません。',
    specs: [['切断経路', 'NHEJ / HDRなど'], ['BE経路', '複製・修復でG·Cへ'], ['検証', 'bystander / off-targetも測定']],
  }),
});

export const EVIDENCE = Object.freeze([
  Object.freeze({ kind: 'implementation', label: '実装・実測', title: '編集ツールとして実在', items: ['guide RNAとCas9による配列認識', 'Cas9切断と細胞修復の実験', 'ベース編集によるA·T→G·Cなどの変換'] }),
  Object.freeze({ kind: 'research', label: '研究中', title: '精度とデリバリーの改善', items: ['狭い編集窓とbystander編集の低減', 'オフターゲット編集の検出・低減', '細胞・動物・ヒト研究での機能と安全性評価'] }),
  Object.freeze({ kind: 'concept', label: '構想・未確立', title: '万能な書き換えではない', items: ['あらゆる塩基・長い配列を自由に置換するBE', '副反応や長期的危険が完全にないという主張', '模型の編集成功率を実測値として扱うこと'] }),
]);

export const SPECS = Object.freeze([
  ['基本方式', 'guide RNA＋Cas9、またはCas9融合ベースエディター'],
  ['SpCas9のPAM例', 'NGG（この展示の配列はAGG）'],
  ['ベース編集', '二本鎖切断なしの一塩基変換'],
  ['主な変換例', 'A·T→G·C / C·G→T·A'],
  ['主な課題', '編集効率、bystander、オフターゲット、デリバリー'],
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: 'bystander編集', english: 'BYSTANDER', text: '編集窓の中の意図しない近傍塩基も変換される可能性があります。2025年論文は編集窓を4塩基へ狭めた例を報告しています。' }),
  Object.freeze({ title: 'オフターゲット', english: 'OFF-TARGET', text: 'guide RNAに似たゲノム配列が編集される可能性があり、感受性の高い検出と酵素改良が研究されています。' }),
  Object.freeze({ title: 'デリバリー', english: 'DELIVERY', text: '編集ツールを目的の細胞・組織へ届け、十分な活性と安全性を確保する必要があります。' }),
  Object.freeze({ title: '修復の多様性', english: 'REPAIR OUTCOMES', text: 'DSBの修復や塩基変換の固定は細胞状態に依存し、部分編集・Indel・望まない変換が生じることがあります。' }),
  Object.freeze({ title: '倫理・規制', english: 'GOVERNANCE', text: 'ヒトの体細胞・生殖細胞編集は、科学的検証、インフォームド・コンセント、規制と社会的合意を区別して扱う必要があります。' }),
]);

export const SOURCES = Object.freeze([
  Object.freeze({ organization: 'Nature Communications', year: '2025', title: 'A streamlined base editor engineering strategy to reduce bystander editing', href: 'https://www.nature.com/articles/s41467-025-63609-6', note: 'Valdez et al., Nature Communications 16, 8115 (2025)。TadA-NW1、狭い編集窓、bystander・オフターゲット低減の研究。' }),
  Object.freeze({ organization: 'Nature Biotechnology', year: '2026', title: 'Mechanistic machine learning for prediction of prime editing outcomes', href: 'https://www.nature.com/articles/s41587-026-03261-7', note: 'Hsu et al., Nature Biotechnology (2026)。OptiPrimeはプライム編集の研究であり、ベース編集の実測論文ではありません。' }),
]);

export const RESEARCH_STAGE = Object.freeze({
  status: '研究・臨床開発 / 用途ごとに段階が異なる',
  detail: '基礎研究の編集ツールとして実装されています。治療応用は対象疾患、デリバリー、臨床試験、地域の規制によって段階が異なります。本ページは承認状況を網羅しません。',
});

export const OPERATING_GUIDE = Object.freeze([
  '4つのモードで、標的認識 → 切断またはベース編集 → 修復 → 編集後配列の順を学びます。',
  '「Cas9切断」と「ベース編集」を切り替え、二本鎖切断の有無と修復の違いを比較します。',
  '左の構成要素または3Dホットスポットを選ぶと、カメラが寄り、右に役割と基本仕様を表示します。',
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  'モードを選ぶとその状態の先頭で一時停止します。再生またはタイムラインで変化を観察できます。',
  '「視点を戻す」はカメラと選択だけを戻し、「リセット」は再生時刻・速度・編集経路も初期化します。',
  'Spaceキーで再生・一時停止、Rキーで視点リセットができます。',
  '表示する20塩基は任意の教学配列です。粒子や分子の形は教育用近似で、編集効率の実測値ではありません。',
]);

export function getMode(id) {
  return MODES.find(mode => mode.id === id) || MODES[0];
}

export function getHotspot(id) {
  return HOTSPOTS[id] || null;
}

export function getMechanism(id) {
  return MECHANISMS[id] || MECHANISMS.base;
}
