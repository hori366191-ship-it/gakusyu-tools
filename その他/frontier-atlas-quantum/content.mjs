export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS',
  entryNumber: 3,
  catalogCount: 5,
  endorsementNotice: '本ページはGoogle・Nature・研究機関の承認・推奨を示しません。',
});

export const ENTRY = Object.freeze({
  id: 'superconducting-quantum',
  title: 'WILLOW / QEC',
  japaneseTitle: '超伝導量子コンピュータ',
  category: 'QUANTUM INFORMATION / ERROR CORRECTION',
  modelNotice: '49サイトの配置、 Bloch球、誤り率、訂正時間は教育用近似です。Willowの実チップ配線・回路図・測定値の再現ではありません。',
});

export const MODE_ORDER = Object.freeze(['superposition', 'error', 'syndrome', 'correction', 'logical']);

export const MODES = Object.freeze([
  Object.freeze({
    id: 'superposition', label: '重ね合わせ', english: 'SUPERPOSITION',
    title: '物理量子ビットの重ね合わせ',
    summary: '超伝導回路を極低温に保ち、マイクロ波で操作します。|0〉と|1〉の振幅と位相を持つ量子状態を模式化していますが、この球面上の点は古典的なシミュレーション表示です。',
    study: '実装：超伝導transmon量子ビット。Bloch球は状態を説明する数学的な表現で、量子ビット内部を直接撮影した姿ではありません。',
    flow: [
      ['01', '極低温に保つ', '希釈冷凍機でノイズを抑える'],
      ['02', 'マイクロ波を送る', 'ゲートで振幅と位相を操作'],
      ['03', '共鳴器で読む', '状態を高周波信号へ変換'],
      ['04', '次の操作へ', '測定が終わるまで状態を保持'],
    ],
  }),
  Object.freeze({
    id: 'error', label: '誤り注入', english: 'ERROR INJECTION',
    title: '物理量子ビットに誤りが起きる',
    summary: '熱雑音、電磁ノイズ、材料界面、制御誤差などによって量子状態が乱れます。ここでは1サイトだけを赤くして、ビット反転相当の誤りを人為的に見せる概念モデルです。',
    study: '研究：実際の誤りは連続的で複数同時に起きることもあり、色1つで表せる種類ではありません。',
    flow: [
      ['01', '環境と相互作用', '孤立した量子状態が乱される'],
      ['02', '状態がずれる', '期待する振幅・位相から変化'],
      ['03', '論理情報を脅かす', '小さい誤りでも演算を損なう'],
      ['04', '検出が必要', '論理量子ビット本体を直接壊さない'],
    ],
  }),
  Object.freeze({
    id: 'syndrome', label: '症例検出', english: 'SYNDROME EXTRACTION',
    title: '論理状態を壊さず症例を測る',
    summary: 'データ量子ビットの周囲の測定量子ビットと共鳴器を使い、隣接サイトのパリティを読みます。得られた0/1の列が症例で、誤りの場所や種類を推定する手がかりになります。',
    study: '研究・実装：測定量子ビットは補助の物理量子ビットです。データ量子ビットと論理量子ビットを同一視しません。',
    flow: [
      ['01', '補助量子ビットを操作', 'データ量子ビットと結合'],
      ['02', 'パリティを測定', '論理状態そのものは読まない'],
      ['03', '症例ビットを得る', '測定結果を復号器へ送る'],
      ['04', '誤りを推定', '原因を一意に特定しない場合もある'],
    ],
  }),
  Object.freeze({
    id: 'correction', label: '訂正', english: 'DECODING & CORRECTION',
    title: '復号して物理操作で訂正する',
    summary: '症例を古典の復号器にかけ、可能性の高い誤り位置と種類を推定します。推定に従って追加のパルスやゲートを適用し、符号で保護された情報を元に戻します。',
    study: '研究：Willowの実験ではリアルタイム誤り訂正とbeyond-breakevenが報告されました。このアニメーションは完全なアルゴリズムを実行していません。',
    flow: [
      ['01', '症例を集める', '空間・時間の測定結果'],
      ['02', '古典復号', '最も妥当な誤り履歴を推定'],
      ['03', '物理操作', 'パルスやゲートで補正'],
      ['04', '残存誤りを評価', '訂正が常に成功するわけではない'],
    ],
  }),
  Object.freeze({
    id: 'logical', label: '論理量子ビット', english: 'LOGICAL QUBIT',
    title: '多数の物理量子ビットで1つを守る',
    summary: '冗長な符号と反復測定により、1つの論理量子ビットを複数の物理量子ビットから構成します。物理量子ビット数と論理量子ビット数は別の尺度です。',
    study: '研究：物理量子ビットと論理量子ビットは別の単位です。スケールしても論理誤りが下がるbelow-thresholdが重要で、大規模なフォールトトレラント量子計算はまだ研究段階です。RCSベンチマークの結果とは分けて考えます。',
    flow: [
      ['01', '物理サイトを配置', 'データ・測定量子ビットを集める'],
      ['02', '符号で冗長化', '1つの論理状態を分散'],
      ['03', '反復して訂正', 'サイクル中も保護を継続'],
      ['04', '論理ゲートへ', '十分な品質と規模が必要'],
    ],
  }),
]);

export const FLOW_CAPTIONS = Object.freeze({
  superposition: '極低温 → マイクロ波ゲート → 共鳴器 → 測定',
  error: '環境ノイズ → 物理状態のずれ → 論理情報へのリスク',
  syndrome: 'データ量子ビット → 補助測定 → 症例ビット → 復号器',
  correction: '症例 → 古典復号 → 物理パルス → 残存誤りを評価',
  logical: '多数の物理量子ビット → 反復訂正 → 1つの論理量子ビット',
});

export const HOTSPOTS = Object.freeze({
  chip: Object.freeze({
    mode: 'superposition', title: '超伝導チップ', english: 'SUPERCONDUCTING CHIP',
    description: 'シリコン基板上に超伝導回路を集積します。ここではチップを透明に近い展示用プレートで示し、内部の量子ビットと配線を見えるようにしています。',
    specs: [['材質', 'シリコン基板 + 超伝導金属'], ['表示', '49サイトの教育用配置'], ['操作', 'マイクロ波パルス']],
  }),
  qubit: Object.freeze({
    mode: 'superposition', title: '物理量子ビット', english: 'PHYSICAL QUBIT',
    description: 'Transmon型では、コンデンサと非線形な接合を組み合わせた超伝導回路を使います。25個のデータサイトと24個の測定サイトを色分けしています。',
    specs: [['物理量子ビット', 'Hardware上の最小単位'], ['データサイト', '25（教育モデル）'], ['測定サイト', '24（教育モデル）']],
  }),
  resonator: Object.freeze({
    mode: 'syndrome', title: '共鳴器・読み出し', english: 'RESONATOR & READOUT',
    description: '各サイトに接続された共鳴器は、わずかな量子状態の違いを高周波信号へ変換します。金色の蛇行線は配線を模式化したものです。',
    specs: [['役割', '状態の読み出し・結合'], ['信号', 'マイクロ波'], ['表示', '49本の概念配線']],
  }),
  code: Object.freeze({
    mode: 'logical', title: '表面コード', english: 'SURFACE CODE',
    description: '隣接するデータサイトと測定サイトのパリティを使う符号です。この7×7表示はサイトの関係を学ぶ模型で、Willowの距離・配線・完全な符号ブロックとは一致しません。',
    specs: [['データ', '論理情報を担う'], ['測定', '症例を担う補助サイト'], ['論理量子ビット', '複数物理量子ビットの集団']],
  }),
  cryostat: Object.freeze({
    mode: 'error', title: '希釈冷凍機', english: 'DILUTION CRYOSTAT',
    description: 'チップをミリケルビン領域へ冷やし、環境ノイズを抑えます。図の円筒と多段プレートは熱的役割を説明する模式図で、実機の構造ではありません。',
    specs: [['役割', '極低温・熱屏蔽'], ['温度', 'ミリケルビン領域（機器による）'], ['課題', '配線・冷却・制御の複雑化']],
  }),
});

export const RESEARCH_STATUS = Object.freeze({
  hardware: Object.freeze({ status: '実測・実験', kind: 'demonstrated', title: 'Willowチップ', detail: 'Googleは2024年12月、105物理量子ビットを持つWillowと、スケールに伴う誤り低減を発表しました。' }),
  correction: Object.freeze({ status: '実測・実験', kind: 'demonstrated', title: '量子誤り訂正', detail: '3×3、5×5、7×7の符号量子ビット配列で、拡大するほど論理誤りが半減する結果が報告されています。' }),
  benchmark: Object.freeze({ status: '実測・実験', kind: 'demonstrated', title: 'RCSベンチマーク', detail: 'random circuit samplingの結果です。Google自身も、既知の実用的な商用用途はまだ示されていないと説明しています。' }),
  useful: Object.freeze({ status: '研究', kind: 'concept', title: '実用的な量子計算', detail: '古典コンピュータを超え、かつ実社会に役立つ計算の実証が次の課題です。' }),
  faultTolerant: Object.freeze({ status: '研究・構想', kind: 'concept', title: '大規模な耐故障計算', detail: '多くの論理量子ビット、論理ゲート、継続的な復号を安定して動かす必要があります。' }),
});

export const COMPARISON = Object.freeze([
  Object.freeze({ term: '基本', classical: 'ビット 0/1', quantum: '振幅・位相' }),
  Object.freeze({ term: '誤り', classical: '論理反転', quantum: '復号で保護' }),
  Object.freeze({ term: '読み', classical: 'そのまま読む', quantum: '症例を読む' }),
  Object.freeze({ term: '規模', classical: 'ビット数', quantum: '物理 / 論理を区別' }),
]);

export const ARCHITECTURE = Object.freeze(['超伝導チップ', 'データ / 測定量子ビット', '共鳴器と読み出し', '希釈冷凍機', '古典復号器']);

export const BENEFITS = Object.freeze([
  '量子状態を利用した新しいアルゴリズムを研究できる',
  '誤り訂正で物理ノイズの影響を抑えられる可能性がある',
  '量子化学・材料・暗号などの問題を対象にできる',
  'スケール時の品質を定量評価できる',
]);

export const CHALLENGES = Object.freeze([
  '極低温、配線、制御、校正のシステムが大きい',
  '物理誤りは数種類あり、同時・連続的に起きる',
  '復号の速度と論理操作の品質が重要',
  '実用的な量子優位を特定用途で示す必要がある',
  'RCSの高速性を実用的な商用用途の証明と同一視できない',
]);

export const SPECIFICATIONS = Object.freeze([
  ['Willow', '105物理量子ビット', 'Googleが2024年12月に発表'],
  ['例', 'T1が約100µsへ接近', '励起状態が保たれる時間の指標'],
  ['モデル', '7×7 = 49サイト', 'データ25・測定24の教育用配置'],
  ['時間', '40秒ループ', '実際のゲート時間・冷却時間ではない'],
]);

export const SOURCES = Object.freeze([
  Object.freeze({ title: 'Google — Meet Willow, our state-of-the-art quantum chip', href: 'https://blog.google/technology/research/google-willow-quantum-chip/' }),
  Object.freeze({ title: 'Nature — Quantum error correction below the surface code threshold', href: 'https://www.nature.com/articles/s41586-024-08449-y' }),
  Object.freeze({ title: 'Google Research — Making quantum error correction work', href: 'https://research.google/blog/making-quantum-error-correction-work/' }),
]);

export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回、ホイールまたは+ / -キーでズームできます。',
  '5つのモードで、重ね合わせから論理量子ビットまでを切り替えます。',
  '再生 / 一時停止、0.5× / 1× / 2×、タイムラインで動作を観察できます。',
  '5つのホットスポットでチップ、量子ビット、共鳴器、符号、冷凍機に焦点を合わせます。',
  'Spaceで再生を切り替え、ダブルクリックで視点を戻します。',
]);
