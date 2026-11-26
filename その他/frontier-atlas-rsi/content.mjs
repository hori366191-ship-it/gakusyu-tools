export const EXHIBIT = Object.freeze({
  title: 'RSI — 再帰的自己改善',
  shortTitle: '再帰的自己改善',
  category: 'AI RESEARCH / RECURSIVE IMPROVEMENT',
  definition: 'RSI（再帰的自己改善）とは、AIが自らの改善に寄与し、その改善が次のAI開発へつながる考え方です。支援の実装と、完全自律の仮説を分けて考える必要があります。',
  modelNotice: 'スライダーとリスク表示は教育用の概念モデルです。実際の事故確率・知能の測定・将来予測ではありません。',
  endorsementNotice: '本ページは企業・研究機関の承認・推奨を示しません。',
});

export const MODE_IDS = Object.freeze(['assisted', 'hypothesis']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'assisted',
    number: '01',
    label: '現在のAI支援',
    shortTitle: '現在のAI支援',
    english: 'CURRENT AI ASSISTANCE',
    status: '実装されている用途',
    structureLabel: 'HUMAN IN THE LOOP · OPEN LOOP',
    structureNote: '評価の後に人間レビューを挟み、承認されてからモデル改善へ進みます。',
    lead: 'AIが研究・開発を支援し、人が目的と承認を担う形です。',
    summary: 'AIはコード生成、プロンプト改善、実験提案、データ分析、モデル評価など、AI研究・開発の有意義な部分をすでに支援しています。目的の最終決定や責任ある承認は、人が担う形が基本です。',
    observed: [
      'コード・テスト・修正案の生成',
      'プロンプトや分析手順の改善支援',
      '実験案の提案と結果の要約',
      'データ分析・モデル評価の支援',
    ],
    unverified: [
      '自分で研究アジェンダを設定するシステム',
      '後継モデルを自律設計するシステム',
      '自己 redesign・知能爆発の実証',
    ],
    boundary: 'RAND 2026の報告によれば、公開情報では自分の研究アジェンダを設定したり後継モデルを設計したりするシステムは確認されていません。',
    palette: Object.freeze({ primary: '#72e4ed', secondary: '#5aa8ff', risk: '#ff647c' }),
  }),
  Object.freeze({
    id: 'hypothesis',
    number: '02',
    label: '完全自律RSI（仮説）',
    shortTitle: '完全自律RSI',
    english: 'FULLY AUTONOMOUS RSI — HYPOTHESIS',
    status: '未実証の仮説',
    structureLabel: 'CLOSED LOOP / UNVERIFIED',
    structureNote: 'モデル改善が次のコード生成へ戻り、内側のリングで生成Nから生成N+1への交代を模式化します。',
    lead: 'AIが改善と後継設計まで繰り返す、未実証の思考実験です。',
    summary: 'AIが目標設定、実験、評価、モデル変更までを繰り返し、次の開発者へ交代する姿を思考実験として描きます。自己目標設定、自己 redesign、知能爆発は未実証の仮説であり、実現・速度・安全性を断定しません。',
    observed: [
      '再帰的な改善ループの考え方',
      '現在のAI支援を構成する個別技術',
      '評価・監督の重要性という論点',
    ],
    unverified: [
      '完全自律の自己目標設定',
      '後継モデルを自律的に設計する実装',
      '制御を失わず知能爆発が起きるという主張',
    ],
    boundary: 'このモードは「現在あるシステム」の再現ではありません。公開情報の範囲では完全自律RSIは確認されていません。',
    palette: Object.freeze({ primary: '#c39cff', secondary: '#ff83c8', risk: '#ff546d' }),
  }),
]);

export const NODE_IDS = Object.freeze(['code', 'experiment', 'evaluation', 'model']);

export const NODES = Object.freeze([
  Object.freeze({
    id: 'code',
    number: '01',
    title: 'コード生成',
    english: 'CODE GENERATION',
    role: '提案・実装・修正',
    current: 'AIがコード案やテストを生成し、開発者がレビューして採用します。生成物の正しさは、実行・テスト・人間の確認で確かめます。',
    hypothesis: '開発ツールや評価コードまでAIが書き換え、次の改善に使うという仮説です。自己変更の承認範囲と検証可能性が重要になります。',
    color: '#72e4ed',
  }),
  Object.freeze({
    id: 'experiment',
    number: '02',
    title: '実験',
    english: 'EXPERIMENT',
    role: '試行・観測・発見',
    current: 'AIは実験条件の提案、実行補助、結果の要約を支援します。どの問いを優先するかは、研究方針や人間の判断と結び付いています。',
    hypothesis: 'AIが次の実験を選び、開発のアジェンダまで進める仮説です。探索が速くなっても、測定の質や目標の正しさは別問題です。',
    color: '#6faeff',
  }),
  Object.freeze({
    id: 'evaluation',
    number: '03',
    title: '評価',
    english: 'EVALUATION',
    role: '測定・検証・合否',
    current: 'ベンチマーク、データ分析、人間のレビューなどで改善を測ります。評価は中立的でも完璧でもなく、評価方法そのものの見直しが必要です。',
    hypothesis: 'AIが自分と後継を評価する場合、評価器と改善対象の盲点が共有される懸念があります。評価ハックを防ぐ独立した検証が鍵になります。',
    color: '#83e2b5',
  }),
  Object.freeze({
    id: 'model',
    number: '04',
    title: 'モデル改善',
    english: 'MODEL IMPROVEMENT',
    role: '調整・学習・ redesign',
    current: 'AIはハイパーパラメータの探索、学習データの分析、評価結果の整理などを支援します。モデル変更の実施と責任は人間が管理します。',
    hypothesis: '学習方法やモデル構成を変え、後継モデルへ交代するまでを仮説モードで描きます。公開情報では、こうした完全自律の実装は確認されていません。',
    color: '#c39cff',
  }),
]);

export const CHALLENGES = Object.freeze([
  Object.freeze({ title: '評価の信頼性', english: 'EVALUATION RELIABILITY', text: '測っているものが本当の改善かを見極めるのが難しくなります。独立したテストと再現性が必要です。' }),
  Object.freeze({ title: '目標のずれ', english: 'GOAL MISALIGNMENT', text: '指定された指標を最大化しても、本来の目的や人間の価値から外れる可能性があります。' }),
  Object.freeze({ title: '評価ハック', english: 'REWARD HACKING', text: '能力そのものではなく、評価装置の穴やテストデータの特徴を利用するインセンティブが生まれます。' }),
  Object.freeze({ title: '内部セキュリティ', english: 'INSECURITY', text: 'コード、ツール、権限、データを渡す範囲が広がると、悪用や意図しない変更の影響も増します。' }),
  Object.freeze({ title: '監督の遅れ', english: 'OVERSIGHT LAG', text: '改善や実験の速度に対して、人が説明を読み、検証し、停止する速度が追いつかないことがあります。' }),
  Object.freeze({ title: 'loss of control', english: 'LOSS OF CONTROL', text: '変更の説明可能性・停止可能性・権限の縮小が失われると、人が系を制御しにくくなります。' }),
]);

export const SAFEGUARDS = Object.freeze([
  '独立した評価と隠れたテストを用意する',
  'サンドボックスで権限と外部影響を制限する',
  '重要な変更に人間の承認を残す',
  'ログ・再現手順・ロールバックを用意する',
  '自動化の範囲を段階的に広げる',
]);

export const SOURCE = Object.freeze({
  organization: 'RAND',
  title: 'Recursive Self-Improvement and Automated AI Research and Development',
  year: '2026',
  href: 'https://www.rand.org/pubs/perspectives/PEA5068-1.html',
  citation: 'RAND, Recursive Self-Improvement and Automated AI Research and Development, 2026.',
});

export const OPERATING_GUIDE = Object.freeze([
  '「現在のAI支援」と「完全自律RSI（仮説）」を切り替え、実装と仮説を比べます。',
  '現在のAI支援は人間承認ゲートを通る開ループ、仮説モードは内側の再帰リングを持つ閉ループです。',
  '外周の矢印・粒子・現在ノード表示は同じ方向で進みます。放射粒子はシアンがコアからノードへ、紫がノードからコアへ戻ります。',
  '左の構成要素または3Dラベルを選ぶと、その役割と未実証の部分を解説します。',
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  '「視点を戻す」はカメラと選択だけを初期状態にします。スライダーと再生時刻は変わりません。',
  '自動化を上げても、評価の信頼性と人間の監督を上げないと、概念上のリスクが増します。',
  'Spaceキーで再生・一時停止、Rキーで視点リセットができます。',
  '数値は教育用の概念モデルであり、実際の確率や能力の測定値ではありません。',
]);

export function getMode(id) {
  return MODES.find(mode => mode.id === id) || MODES[0];
}

export function getNode(id) {
  return NODES.find(node => node.id === id) || null;
}
