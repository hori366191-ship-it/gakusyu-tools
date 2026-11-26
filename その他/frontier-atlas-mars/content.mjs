export const ATLAS = Object.freeze({
  title: 'FRONTIER ATLAS', entryNumber: 5, catalogCount: 5, category: 'INTERPLANETARY EXPLORATION',
  endorsementNotice: 'SpaceX・NASAを出典としていますが、本ページは両者の承認・推奨を示しません。',
  modelNotice: 'Starship・地形・居住棟・ISRU・植物工場は教育用の模式図です。公式CAD、確定設計、実測写真ではありません。',
  simulationNotice: '距離・時間・速度・熱・塵・資源量を短縮・誇張しています。有人火星到達・定住の実現時期は断定しません。',
});

export const ENTRY = Object.freeze({
  id: 'earth-to-mars', title: 'BEYOND EARTH', japaneseTitle: '地球から火星へ', status: '探査実績 / 企業構想 / 未実現の定住',
  summary: '打ち上げ、地球と火星の間の遷移、突入、着陸、現地資源利用、居住棟まで。SpaceXの構想とNASAの探査・Artemisの文脈を分け、実現に向けた課題を学びます。',
});

export const MODES = Object.freeze([
  Object.freeze({ id: 'launch', label: '打ち上げ', english: 'LAUNCH', title: '地球を離れる最初の関門', summary: 'Starshipの構想では、再利用を目指す大型ロケットで宇宙へ運びます。模型は既存の教育用Starshipを再利用し、33+6エンジンを表示しますが、推力・上昇軌道・分離時刻は再現しません。', study: '打ち上げ・再利用・軌道給油・深宇宙運用には、まだ開発・実証すべき事項があります。構想を完成した運用実績として扱いません。', flow: [['01','点灯','エンジンが推力を生む'],['02','上昇','大気密度と重力を越える'],['03','段分離','boosterと上段を分ける'],['04','軌道へ','次の深宇宙運用へ']] }),
  Object.freeze({ id: 'transit', label: '地球―火星遷移', english: 'EARTH–MARS TRANSIT', title: '惑星の動きに合わせた長い旅', summary: '地球と火星はそれぞれ太陽を周回するため、出発時期と軌道設計が重要です。恒星間航行ではありません。モデルの直線は学習用の短縮表現で、実際には遷移軌道・通信遅延・航法・生命維持を考えます。', study: '「恒星間航行」ではなく、太陽系内の地球―火星間の移動です。数か月単位の旅行になりますが、具体的な日数や実現時期は本ページで断定しません。', flow: [['01','出発窓','惑星の位置関係を合わせる'],['02','遷移軌道','太陽の周りを横切る'],['03','長期間運用','放射線・補給・通信を管理'],['04','火星到着','減速と突入へ']] }),
  Object.freeze({ id: 'entry', label: '大気突入', english: 'ATMOSPHERIC ENTRY', title: '火星の大気で、いったん減速する', summary: '火星には地球より薄い大気があります。宇宙船は高速で突入し、熱シールドで空力加熱に耐え、大気の抵抗で速度を落とします。模型の炎はプラズマと加熱の可視化です。', study: '薄い大気は減速に使えますが、十分な減速と精密な着陸を両立する設計が課題です。模型の温度・熱流束・プラズマ形状は実測値ではありません。', flow: [['01','高速突入','大気へ進入'],['02','空力加熱','熱シールドが熱を防ぐ'],['03','抵抗で減速','大気の力を利用'],['04','降下へ','パラシュート / 推力制御へ']] }),
  Object.freeze({ id: 'landing', label: '着陸', english: 'LANDING', title: '薄い大気とエンジンで最後の減速', summary: '構想上の着陸では、大気による減速に加え、推力を使って低速まで落とし、地表に接地します。模型のlanding burn・脚・塵は教育用の簡略化です。', study: '火星の重力は地球より小さく、地表は岩・砂・傾斜に富みます。質量・推力・誘導・接地安定性を同時に満たす必要があります。', flow: [['01','降下','残った速度をさらに落とす'],['02','landing burn','エンジンで精密に減速'],['03','接地','脚と姿勢制御で安定化'],['04','塵の管理','噴流が地表を巻き上げる']] }),
  Object.freeze({ id: 'isru', label: 'ISRU', english: 'IN-SITU RESOURCE UTILIZATION', title: '現地の資源を、次の資源に', summary: 'ISRUは火星の大気・水氷・レゴリスなどを現地で利用する考え方です。大気のCO₂から酸素を作る実験はPerseveranceのMOXIEで実証されましたが、有人運用に必要な規模の酸素・燃料生産が実用化されたわけではありません。', study: 'MOXIEは小規模な技術実証です。模型のタンク・パイプ・資源粒子は、電力・採掘・精製・貯蔵をまとめた構想表現です。', flow: [['01','資源を集める','大気・水氷・レゴリス'],['02','変換・精製','酸素・燃料候補を作る'],['03','電力と熱','設備を継続的に動かす'],['04','貯蔵・利用','生命維持・推進・建設へ']] }),
  Object.freeze({ id: 'settlement', label: '居住棟', english: 'HABITAT & PLANT FACTORY', title: '基地は、閉じた循環を育てる', summary: '居住棟では、空気・水・食料・放射線・低重力・精神面への対応が必要です。植物工場は食料や循環の一部を担い得ますが、電力・照明・水処理・品種・故障まで含めた閉鎖循環は未解決の課題です。', study: '模型の植物・居住棟・自給率は実測値ではありません。限られた人員で長期運用する自己完結型の火星定住は、本ページでは構想としてのみ扱います。', flow: [['01','遮蔽・居住','放射線と気圧から守る'],['02','資源循環','水・空気・栄養を管理'],['03','植物工場','食料・酸素・心理的効果を狙う'],['04','保守・拡張','故障と長期運用に対応']] }),
]);
export const MODE_ORDER = Object.freeze(MODES.map(mode => mode.id));

export const HOTSPOTS = Object.freeze({
  starship: Object.freeze({ title: 'Starship', english: 'REUSABLE SPACECRAFT CONCEPT', mode: 'launch', description: '大型の上段とboosterを組み合わせるSpaceXの構想です。模型はステンレス鋼の胴体・フィン・エンジン・熱シールドを簡略化しています。', specs: [['区分','企業構想・開発'],['模型','upper stage + booster'],['課題','再利用・軌道給油・運用']] }),
  heatshield: Object.freeze({ title: '熱シールド', english: 'THERMAL PROTECTION', mode: 'entry', description: '大気突入の空力加熱から船体を守ります。模型の黒いタイルと発光は模式表現で、実際の材料・温度・寿命を再現しません。', specs: [['役割','熱から船体を守る'],['課題','繰り返し使用・点検'],['注意','模式タイル']] }),
  mars: Object.freeze({ title: '火星の大気と地形', english: 'MARS ENVIRONMENT', mode: 'landing', description: '薄い大気、低重力、砂・岩・傾斜が突入と着陸を左右します。塵は機器・太陽電池・生命維持にも影響します。', specs: [['大気','地球より薄い'],['地形','砂・岩・傾斜'],['課題','塵・着陸精度']] }),
  isru: Object.freeze({ title: 'ISRU設備', english: 'LOCAL RESOURCE PLANT', mode: 'isru', description: '火星の資源を酸素・燃料・資材へ変換する構想です。MOXIEの小規模実証と、定住規模の実用化は分けて考えます。', specs: [['実証例','MOXIEの酸素生成'],['構想','酸素・燃料・資材'],['課題','電力・採掘・貯蔵']] }),
  settlement: Object.freeze({ title: '居住棟と植物工場', english: 'HABITAT / PLANT FACTORY', mode: 'settlement', description: '空気・水・食料を循環させ、放射線や故障に備える長期居住の構想です。植物は閉鎖循環の一部を担いますが、単独で定住を支えません。', specs: [['目的','長期居住'],['循環','空気・水・栄養'],['課題','電力・放射線・保守']] }),
});

export const RESEARCH_STATUS = Object.freeze([
  Object.freeze({ title: '火星の無人探査・着陸', status: '実測・実績', detail: 'NASAの複数探査機が火星で観測・着陸を行い、PerseveranceはMOXIEによる現地酸素生成の実証も行いました。', tone: 'observed' }),
  Object.freeze({ title: 'SpaceXのStarship火星構想', status: '企業構想・開発', detail: 'SpaceXは火星移住の構想を示しています。打ち上げ・再利用・給油・着陸を含む運用全体の完成を、本ページは実績としません。', tone: 'planned' }),
  Object.freeze({ title: '有人火星移住・定住', status: '未実現の構想', detail: '実現時期・人数・自給率を断定しません。放射線、通信遅延、生命維持、資源生産、長期保守が課題です。', tone: 'open' }),
  Object.freeze({ title: 'NASA Artemis', status: '月探査プログラム', detail: 'NASAはArtemisを通じて月面運用の知見を積み、将来の有人火星ミッションの基盤にすると説明します。月と火星の環境は同一ではありません。', tone: 'observed' }),
]);

export const SPECIFICATIONS = Object.freeze([
  ['Starship','大型再利用ロケットの構想','booster・上段・熱シールドを模式化'],
  ['地球―火星遷移','太陽系内の長距離移動','実際の軌道・通信遅延を短縮'],
  ['ISRU','現地資源の利用','MOXIE実証と定住規模を区別'],
  ['居住棟','空気・水・食料の循環','電力・放射線・保守が課題'],
]);
export const BENEFITS = Object.freeze([
  '現地資源を利用できれば、地球から運ぶ物資を減らせる可能性がある',
  '火星の地形・大気・資源を調べ、地球や生命の歴史を学べる',
  '月・火星の運用知見は、より深い宇宙探査へつながり得る',
]);
export const CHALLENGES = Object.freeze([
  '打ち上げコスト、軌道給油、長距離航法、通信遅延',
  '放射線、薄い大気、低重力、心理・医学面の長期影響',
  '突入・着陸、精密誘導、火星の塵と地表',
  'ISRUと閉鎖循環の電力・規模・信頼性・保守',
]);
export const SOURCES = Object.freeze([
  Object.freeze({ label: 'SpaceX — Humanspaceflight: Mars', href: 'https://www.spacex.com/humansspaceflight/mars' }),
  Object.freeze({ label: 'NASA — Artemis', href: 'https://www.nasa.gov/humans-in-space/artemis/' }),
  Object.freeze({ label: 'NASA — Mars 2020 Perseverance / MOXIE', href: 'https://science.nasa.gov/mission/mars-2020-perseverance/' }),
]);
export const OPERATING_GUIDE = Object.freeze([
  'ドラッグまたは矢印キーで周回し、ホイール・ピンチ・+ / -キーでズームします。',
  '6モードで、打ち上げ、遷移、突入、着陸、ISRU、居住棟を確認できます。',
  'ラベルを選ぶと各部へ寄り、基本仕様を表示します。',
  'Spaceで再生 / 一時停止、Rでアニメーションと視点をリセットします。',
  'SpaceX構想、NASAの探査実績、未実現の定住を分けて読んでください。',
]);
