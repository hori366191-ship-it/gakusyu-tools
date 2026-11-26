export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  entryNumber: 4,
  catalogCount: 5,
  endorsementNotice: '本ページはGoogle DeepMind・Unitree・企業・研究機関の承認・推奨を示しません。',
});

export const ENTRY = Object.freeze({
  id: 'physical-ai',
  title: 'EMBODIED INTELLIGENCE',
  japaneseTitle: 'Physical AI・ロボット',
  category: 'ROBOTICS / VISION-LANGUAGE-ACTION',
  modelNotice: '歩行、センサー範囲、政策ネットワーク、障害物、報酬は教育用近似です。実機の制御プログラム、安全性保証、学習データの再現ではありません。',
});

export const MODE_ORDER = Object.freeze(['perception', 'planning', 'actuation', 'balance', 'learning']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'perception', label: '知覚', english: 'PERCEPTION',
    title: 'センサーから環境の状態をつくる',
    summary: '深度カメラ、LiDAR、関節エンコーダ、IMU、力センサーなどから、物体の位置、床の傾き、自己の姿勢を推定します。点群はノイズを含む不完全な観測です。',
    study: '実装：実機にはセンサーとフィルタリングがあります。図の点群・走査線は、その役割を説明するための生成データです。',
    flow: [
      ['01', '光・音・力を測る', 'カメラ、LiDAR、IMU、力センサー'],
      ['02', '座標へ変換', '機体中心の環境表現'],
      ['03', 'ノイズを抑える', '複数時刻・複数センサーを統合'],
      ['04', '状態を更新', '政策と制御へ渡す'],
    ],
  }),
  Object.freeze({
    id: 'planning', label: '計画', english: 'PLANNING',
    title: '目標を安全な行動列に分ける',
    summary: '指示と環境状態から、接近経路、把持、足の置き位置、回避行動を計画します。高水準の意味判断と低水準の動作生成を分けて考えると理解しやすくなります。',
    study: '研究：Gemini Robotics 1.5はVLAモデル、Gemini Robotics-ER 1.5は物理環境の推論・計画を担うという構成をGoogle DeepMindが2025年9月に発表しました。',
    flow: [
      ['01', '指示を理解', '目標と制約を表す'],
      ['02', '環境と照合', '到達可能性・危険を評価'],
      ['03', '部分計画を作る', '経路、動作、条件分岐'],
      ['04', '実行して再計画', '観測が変われば更新'],
    ],
  }),
  Object.freeze({
    id: 'actuation', label: '運動制御', english: 'ACTUATION',
    title: '関節トルクを物理的な動きに変える',
    summary: '目標関節角やトルクをモーターへ送り、重力、慣性、地面反力の中で歩行を作ります。ソフトウェアの命令だけでは不十分で、ハードウェアと制御周期が重要です。',
    study: '実装：サーボ、減速機、エンコーダ、電流制御が実機にあります。模型の角度と速度は実測ではありません。',
    flow: [
      ['01', '目標姿勢を決める', '関節角・トルクの指令'],
      ['02', 'モーターを駆動', '電流からトルクを発生'],
      ['03', '力を制御', '接触・滑りを検出'],
      ['04', '次のサイクル', '高速なフィードバック'],
    ],
  }),
  Object.freeze({
    id: 'balance', label: 'バランス', english: 'BALANCE',
    title: '支持脚と全身で倒れにくさを作る',
    summary: '重心、角運動量、足裏の圧力、地面の傾斜を監視し、足の置き位置や胴体姿勢を修正します。押されたときの反応も、知覚と制御の協調です。',
    study: '研究・実装：歩行ロボットのバランス制御は実証されています。しかし、あらゆる環境で転ばない保証や、人との安全な共存を一般的に保証するものではありません。',
    flow: [
      ['01', '傾きを検知', 'IMU・力・関節状態'],
      ['02', '重心を推定', '支持脚と全身の関係'],
      ['03', '修正動作', '踏み出し・胴体・腕'],
      ['04', '転倒を防ぐ', '失敗時は停止・保護'],
    ],
  }),
  Object.freeze({
    id: 'learning', label: '学習', english: 'LEARNING & GENERALIZATION',
    title: '経験から政策を更新する',
    summary: 'シミュレーションや実機データから、観測から行動を選ぶ政策を学習します。報酬、試行回数、ドメインランダマイズ、実機での安全性が性能を左右します。',
    study: '研究：VLAや世界モデルは進歩していますが、新しい家庭・工場・屋外環境への普遍的な汎化と安全な実装は研究中です。四足ロボットの経験を人型へそのまま移せるとも限りません。',
    flow: [
      ['01', 'データを集める', '観測・行動・結果'],
      ['02', '学習を回す', '模倣学習・強化学習など'],
      ['03', '実機で検証', 'sim-to-realの差を測定'],
      ['04', '安全に更新', '限定環境から段階的に展開'],
    ],
  }),
]);

export const FLOW_CAPTIONS = Object.freeze({
  perception: 'センサー → ノイズ除去 → 環境表現 → 政策へ',
  planning: '指示 → 環境認識 → 行動計画 → 実行・再計画',
  actuation: '関節指令 → モーター → 地面反力 → 歩行',
  balance: 'IMU・足裏 → 重心推定 → 修正動作 → 安定化',
  learning: 'データ → 政策更新 → 実機検証 → 安全な展開',
});

export const HOTSPOTS = Object.freeze({
  sensors: Object.freeze({
    mode: 'perception', title: 'センサー群', english: 'SENSING SUITE',
    description: '頭部の深度カメラとLiDAR、胴体のIMU、関節のエンコーダ、足裏の力センサーを模式化しています。実機の搭載数・性能は構成によって異なります。',
    specs: [['知覚', '深度カメラ・3D LiDAR'], ['自己状態', 'IMU・関節エンコーダ'], ['接触', '足裏・手の力センサー']],
  }),
  joints: Object.freeze({
    mode: 'actuation', title: '関節アクチュエータ', english: 'JOINT ACTUATORS',
    description: 'モーター、減速機、エンコーダを一体化した関節です。模型では主要12関節を動かし、G1の23自由度以上の実機を単純化しています。',
    specs: [['基本', 'PMSMモーター（G1）'], ['例', 'G1は23自由度'], ['モデル', '主要12関節を教育用に簡略化']],
  }),
  policy: Object.freeze({
    mode: 'planning', title: '政策ネットワーク', english: 'POLICY NETWORK',
    description: '観測を入力し、次の行動や関節指令を出力する学習済みモデルの概念図です。表示されたニューロンや重みは本物のGemini Roboticsモデルではありません。',
    specs: [['入力', '観測・指示・自己状態'], ['出力', '行動・関節指令'], ['研究例', 'Vision-Language-Action']],
  }),
  obstacle: Object.freeze({
    mode: 'planning', title: '障害物・経路', english: 'OBSTACLE & PATH',
    description: '床の障害物と、その周囲を迂回する予測経路です。実機では走査の影、透明物、動く物、未整地などで計画が難しくなります。',
    specs: [['計画', '到達可能性を評価'], ['危険', '衝突・転倒・挟まれ'], ['更新', '新しい観測で再計画']],
  }),
  balance: Object.freeze({
    mode: 'balance', title: '足裏・バランス', english: 'BALANCE CONTROL',
    description: '支持足の圧力中心と胴体の傾きから、踏み出し位置や姿勢を修正します。右の四足ロボットは別の身体構成を持つことを示す比較模型です。',
    specs: [['検出', 'IMU・足裏力'], ['制御', '全身フィードバック'], ['限界', '環境依存・安全保証は別問題']],
  }),
});

export const RESEARCH_STATUS = Object.freeze({
  platforms: Object.freeze({ status: '実装・製品', kind: 'demonstrated', title: 'ロボット基盤', detail: 'Unitree G1やGo2のように、歩行・センシング・開発者向け制御を持つ実機が販売・研究利用されています。' }),
  vla: Object.freeze({ status: '研究・限定提供', kind: 'demonstrated', title: 'VLAモデル', detail: 'Google DeepMindは2025年9月、Gemini Robotics 1.5を選定パートナー向けに提供し、Robotics-ER 1.5を開発者向けに提供したと発表しました。' }),
  general: Object.freeze({ status: '研究', kind: 'concept', title: '汎用ロボット', detail: '未知の家庭や職場で、幅広い作業を安全にこなす一般目的ロボットは研究目標です。' }),
  deployment: Object.freeze({ status: '実装・限定用途', kind: 'demonstrated', title: '現場展開', detail: '検査、搬送、研究、デモなど限定された用途では実装例があります。万能・無監督を意味しません。' }),
  safety: Object.freeze({ status: '研究', kind: 'concept', title: '安全と汎化', detail: '長いタスク、予期しない接触、センサー故障、人間の行動変化への頑健性が課題です。' }),
});

export const COMPARISON = Object.freeze([
  Object.freeze({ term: '入力', classical: '単一の命令', embodied: '観測 + 命令' }),
  Object.freeze({ term: '出力', classical: '回答・画像', embodied: '関節指令' }),
  Object.freeze({ term: '評価', classical: 'ベンチマーク', embodied: '実環境での成功' }),
  Object.freeze({ term: '失敗', classical: '誤回答', embodied: '衝突・転倒' }),
]);

export const ARCHITECTURE = Object.freeze(['センサーと自己状態', '環境表現', '政策ネットワーク', '安全制御', 'アクチュエータ']);

export const BENEFITS = Object.freeze([
  'カメラや言語だけでなく物理結果で価値を測れる',
  '物流、検査、危険区域、支援作業などに活用できる',
  '異なる身体間で技能を移す研究が進む',
  '実環境のデータでモデルの限界を検証できる',
]);

export const CHALLENGES = Object.freeze([
  '知覚のノイズ、隠れ、動的環境への対応',
  '歩行と把持の安全なフィードバック',
  'sim-to-real、データ収集、消費電力',
  '長いタスクでのエラー蓄積と再計画',
  '安全性・責任・プライバシー・人間の作業への影響',
]);

export const SPECIFICATIONS = Object.freeze([
  ['G1', '23自由度（標準）', 'EDU構成ではオプションを含む'],
  ['G1', '約35kg・高さ1.32m', 'Unitree公式の標準構成'],
  ['Go2', '約15kg・12関節', '四足ロボットの例'],
  ['モデル', '5モード・40秒', '実機の制御周期ではない'],
]);

export const SOURCES = Object.freeze([
  Object.freeze({ title: 'Google DeepMind — Gemini Robotics 1.5 brings AI agents into the physical world', href: 'https://deepmind.google/discover/blog/gemini-robotics-15-brings-ai-agents-into-the-physical-world/' }),
  Object.freeze({ title: 'Unitree — G1 Humanoid Robot', href: 'https://www.unitree.com/g1' }),
  Object.freeze({ title: 'Unitree — Go2 Quadruped Robot', href: 'https://www.unitree.com/go2' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回、ホイールまたは+ / -キーでズームできます。',
  '知覚・計画・運動制御・バランス・学習の5モードを切り替えます。',
  '再生 / 一時停止、0.5× / 1× / 2×、タイムラインで歩行と信号を観察します。',
  'センサー、関節、政策、障害物、足裏のホットスポットを選べます。',
  'Spaceで再生を切り替え、ダブルクリックで視点を戻します。',
]);
