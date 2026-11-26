export const MODE_IDS = Object.freeze(['hypothesis', 'experiment', 'measurement', 'analysis', 'next-design']);

export const MODES = Object.freeze([
  {
    id: 'hypothesis',
    number: '01',
    english: 'HYPOTHESIS & PLAN',
    title: '仮説から実験計画へ',
    shortTitle: '問いを計画に変える',
    status: '研究・一部自動化',
    lead: '研究者の問いを受け取り、文献・ツール・データを組み合わせて実行可能な計画を組み立てます。',
    detail: 'Biomniは言語モデルの推論、検索拡張計画、コード実行を組み合わせた汎用エージェントとして報告されています。この展示のカードとAIコアは、計画・記憶・ツール選択の流れを模式化したものです。',
    stage: 'PLAN · HYPOTHESIS',
    observed: [
      'Biomniは25領域の論文からツール・データベース・プロトコルを発見し、統一された行動空間を構築しました。',
      '研究者が自然言語で問うと、適切なツールを選び、手順を計画し、コードを書いて実行します。',
    ],
    research: [
      '評価は443問・10種類の biomedical taskで行われ、平均精度57%と報告されています。',
      'タスク固有の再学習なしで、遺伝学・免疫学・薬理学・臨床医学などへ一般化することを目指します。',
    ],
    conceptual: [
      'この展示の仮説カードは生成されておらず、科学的主張の正しさを評価するものでもありません。',
    ],
    specs: ['5枚の計画カード', 'AIコア', '95個の回路ディテール'],
    challenges: ['目的の曖昧さ', 'ツール選択の誤り', '知識の鮮度'],
  },
  {
    id: 'experiment',
    number: '02',
    english: 'ROBOTIC EXECUTION',
    title: 'ロボットによる実験実行',
    shortTitle: '計画を動作へ',
    status: '研究・部分的自動化',
    lead: 'ピペットとロボットアームが、プレートの指定位置へ試薬を分注します。',
    detail: 'Biomniは多段階の薬物用量反応実験を動かす、実行可能なラボロボット用コードを生成したケースが報告されています。ここでは96ウェルのマイクロプレートと液滴粒子を自作し、安全で短い動作ループにしています。',
    stage: 'EXECUTE · ROBOT & PIPETTE',
    observed: [
      '報告されたケースでは、Biomniが実験手順を生成し、研究者が遺伝子編集クローニング手順をそのまま実施して配列で成功を確認しました。',
      'ロボット用コードの生成と、実際の無人実験室の完全自律運営は同じではありません。',
    ],
    research: [
      'ロボット統合では、装置の較正、衝突回避、試薬の状態管理、例外からの回復が必要です。',
    ],
    conceptual: [
      '96ウェルへの分注アニメーションは実装置の制御プログラムではなく、危険物や実試薬を扱いません。',
    ],
    specs: ['96ウェル', '24バイアル', '6関節の模式アーム'],
    challenges: ['装置インターフェース', '較正とハードウェア故障', 'コンタミネーション'],
  },
  {
    id: 'measurement',
    number: '03',
    english: 'MEASUREMENT & SENSING',
    title: '顕微鏡とセンシング',
    shortTitle: '実験結果を測る',
    status: '研究・部分的自動化',
    lead: '顕微鏡がプレートを走査し、画像やシグナルをデジタルデータへ変換します。',
    detail: '自律ラボでは、測定装置の制御と品質管理が重要です。この展示の顕微鏡、スキャン光、波形は、測定工程の概念を説明する自作モデルで、実際の画像解析や臨床診断は行っていません。',
    stage: 'OBSERVE · MICROSCOPE',
    observed: [
      'Biomniは公開スマートウォッチデータを解析し、COVID-19の既知の早期兆候を復元しました。',
      '測定結果の品質は、較正・ブランク・対照・再現性の設計に依存します。',
    ],
    research: [
      '画像・時系列・機器データを横断し、異常検出と不確実性を扱う研究が進んでいます。',
    ],
    conceptual: [
      '走査線と波形は教育用の演出で、実際の顕微鏡画像やセンサー値ではありません。',
    ],
    specs: ['4対物レンズ', '12本の測定バー', '220液滴・データ粒子'],
    challenges: ['測定誤差', '対照群の欠落', '画像のドメインシフト'],
  },
  {
    id: 'analysis',
    number: '04',
    english: 'ANALYSIS & REASONING',
    title: 'データ解析と理由付け',
    shortTitle: '結果から意味を探る',
    status: '研究・一部自動化',
    lead: '測定データを統計・コード・モデルで解析し、仮説を支持する証拠を整理します。',
    detail: 'Biomniは計画、記憶、推論、環境相互作用を組み合わせ、コードでワークフローを動的に構成します。この展示の棒グラフと粒子は、解析結果がAIコアへ戻る経路を示します。',
    stage: 'REASON · DATA ANALYSIS',
    observed: [
      'Biomniのベンチマークは、因果遺伝子優先順位、薬物再用途、希少疾患診断、微生物叢解析などを含みます。',
      '平均精度57%は、無誤りや全タスクでの専門家同等を意味しません。',
    ],
    research: [
      '過程の評価、説明可能性、再現可能なコード、独立した検証が重要です。',
    ],
    conceptual: [
      'グラフの数値は決定的な教育用データで、統計的有意差や因果効果を計算していません。',
    ],
    specs: ['12解析バー', '30フローパーティクル', '決定的な模式データ'],
    challenges: ['相関と因果の混同', '過学習', '評価リーク'],
  },
  {
    id: 'next-design',
    number: '05',
    english: 'NEXT EXPERIMENT DESIGN',
    title: '次の実験を設計する',
    shortTitle: '結果を次の問いへ',
    status: '研究・閉ループの構想',
    lead: '結果を次の実験条件へフィードバックし、別の候補を比較する閉ループを目指します。',
    detail: '閉ループ最適化は自己走行ラボの重要な方向性です。ただし、目標設定、安全判断、研究倫理、装置保全までを完全にAIへ委ねる自律ラボが一般に実証されたわけではありません。',
    stage: 'ITERATE · NEXT DESIGN',
    observed: [
      '一部の自己走行ラボでは、測定結果に応じて次の測定点や候補を選ぶ部分的な閉ループが実装されています。',
      'Biomniの論文も、人間が問いの設定・結果の判断・創造的な飛躍を担うことを重視しています。',
    ],
    research: [
      '能動学習、ベイズ最適化、不確実性を考慮した実験計画が研究されています。',
    ],
    conceptual: [
      '自律度80%以上で表示する完全閉ループは、安全性・信頼性・倫理が実証されたものではなく、未実証の未来像です。',
    ],
    specs: ['5段階の反復', '自律度スライダー', '人間レビューゲート'],
    challenges: ['目標のずれ', '安全制約', '長期的な信頼性'],
  },
]);

export const HOTSPOT_IDS = Object.freeze(['ai-core', 'robot-arm', 'microplate', 'microscope', 'human-gate']);

export const HOTSPOTS = Object.freeze([
  {
    id: 'ai-core',
    title: 'AIコア',
    english: 'PLAN · MEMORY · REASON',
    role: '計画・記憶・推論・ツール選択',
    current: '95個の回路ディテールと回転リングが、エージェントの推論とワークフロー構成を表します。',
    evidence: 'Biomniは言語モデル推論、検索拡張計画、コード実行を統合しています。',
    caveat: '発光やリングの動きは、実際のニューラルネットワーク内部を可視化したものではありません。',
  },
  {
    id: 'robot-arm',
    title: 'ロボットアームとピペット',
    english: 'ROBOTIC EXECUTION',
    role: '位置決め・分注・把持',
    current: '6関節の模式アームがプレートへ移動し、ピペット先端から液滴が落ちます。',
    evidence: 'Biomniは多段階薬物用量反応実験のロボット用コードを生成しました。',
    caveat: '実装置の運動学、較正、衝突回避、安全性制御は実装していません。',
  },
  {
    id: 'microplate',
    title: '96ウェルマイクロプレート',
    english: 'PARALLEL EXPERIMENT',
    role: '条件を並べて比較',
    current: '8×12のウェルと液面が、条件設計と反復実験を表します。',
    evidence: 'マイクロプレートは生物学・薬学で広く使われる標準的な実験形式です。',
    caveat: '色の変化は模式データで、実際の反応、濃度、阻害率を測定していません。',
  },
  {
    id: 'microscope',
    title: '顕微鏡と測定',
    english: 'MEASUREMENT',
    role: '画像・シグナル・品質管理',
    current: '対物レンズ、ステージ、走査光が測定工程を表します。',
    evidence: 'Biomniは公開スマートウォッチデータの解析ケースを報告しています。',
    caveat: 'この展示は画像を撮影・解析せず、波形やバーは教育用の模式値です。',
  },
  {
    id: 'human-gate',
    title: '人間レビューゲート',
    english: 'HUMAN OVERSIGHT',
    role: '目的・安全・結果の判断',
    current: '自律度80%未満ではフローがここで分断され、人の確認を挟む開ループを表示します。',
    evidence: 'Biomniの論文は、人間が問いの設定、結果の判断、創造的な飛躍を担うことを強調しています。',
    caveat: '自律度80%は表示用のしきい値で、実システムの安全レベルや自律性を測定するものではありません。',
  },
]);

export const SOURCES = Object.freeze([
  {
    organization: 'Science',
    title: 'Autonomous biomedical research with an artificial intelligence agent',
    year: '2026',
    href: 'https://www.science.org/doi/10.1126/science.adz4351',
    kind: '研究論文',
  },
  {
    organization: 'Science Advances',
    title: 'A self-supervised robotic system for autonomous contact-based spatial mapping of semiconductor properties',
    year: '2025',
    href: 'https://www.science.org/doi/10.1126/sciadv.adw7071',
    kind: '関連研究',
  },
]);

export const EVIDENCE_LEGEND = Object.freeze([
  { label: '実測・報告', text: '論文・公表資料に記載された測定・成果' },
  { label: '実装', text: 'このHTML内で動作する可視化' },
  { label: '研究', text: '現在進められている手法・課題' },
  { label: '構想', text: '完全自律など未実証の未来像' },
]);

export const AUTOMATION_LEVELS = Object.freeze([
  { max: 39, label: '単一工程の自動化', evidence: '研究・部分的自動化', loop: 'open' },
  { max: 64, label: '複数工程の自動化', evidence: '研究・部分的自動化', loop: 'open' },
  { max: 79, label: '広範囲の自動化', evidence: '研究・人間レビュー併用', loop: 'open' },
  { max: 100, label: '完全自律ラボ', evidence: '構想・未実証', loop: 'closed' },
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグ / 1本指で周回、ホイール / ピンチ / ＋−キーでズームします。',
  'Spaceで再生・一時停止、Rでリセット、矢印キーで視点を動かします。',
  '5つの工程モードと自律度スライダーを切り替えられます。',
  '自律度80%以上は、実証された完全自律ではなく構想表示です。',
  'モバイルでは「解説を開く」から下部シートを展開できます。',
]);

export const EXHIBIT = Object.freeze({
  definition: '仮説、実験、測定、解析、次の設計を閉ループでつなぐ自律型AIラボの教育用展示。',
  modelNotice: '教育用の近似です。実際のAIエージェント、ロボット制御、顕微鏡、統計解析は動作していません。自律度は表示用の概念パラメータです。',
  boundaryNotice: '現状の部分的自動化と、完全自律ラボの構想を区別します。自律度80%以上を選んでも、安全性・信頼性・倫理が実証されたという意味ではありません。',
  endorsementNotice: '掲載企業・研究機関の承認・推奨を示しません。',
});

export const getMode = id => MODES.find(mode => mode.id === id) || MODES[0];
export const getHotspot = id => HOTSPOTS.find(hotspot => hotspot.id === id) || null;
export const getAutomationLevel = value => AUTOMATION_LEVELS.find(level => value <= level.max) || AUTOMATION_LEVELS.at(-1);
