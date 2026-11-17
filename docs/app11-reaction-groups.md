# app11 反応グループ（同じ基質→生成物の重複反応を 1 表示にまとめる）

有機反応マップ（`site/app11`）で、条件だけが違う同じ変換（例: エタノール→エタナールの 3 反応）を
1 つのカード・1 つのラベルにまとめるための pure module。

- 実装: `site/app11/reaction-groups.js`（Node は `require`、ブラウザは `window.RPReactionGroups`）
- テスト: `scripts/tests/app11-reaction-groups.test.cjs`
- この文書: `docs/app11-reaction-groups.md`

この module は**グループ化だけ**を行う。座標・経路・反応式・マーカーは再計算も変更もしない。
`data.js` / `academic-data.js` / `proposed-layout-data.js` / `site-src/app11/*` は読み取り専用。

## グループ判定

- キーは `JSON.stringify([基質IDの昇順ユニーク配列, 生成物IDの昇順ユニーク配列])`。
- **向き固定**（基質→生成物）。逆向き（生成物→基質）は別グループ。
- **両側が非空**で、かつ**両側の集合が完全一致**したときだけ同じグループ。部分一致ではまとめない。
- 次はキーに含めない（各 member に元の値のまま残す）:
  条件（`conditions`）・試薬（`reagents`）・反応式の係数（`equation`）・
  `type` / `typeLabel` / `tier` / `state`・出典（`sources`）・ラベルやマーカーの座標。
- 基質または生成物が空の反応はグループ化せず、それぞれ単独グループ（`key: null`）。
- 入力配列・反応オブジェクトは変更しない（内部でコピーを作るだけ）。

## 代表（representative）

- グループ内を canonical 順（既定は入力配列の順、`canonicalOrder` を渡せばその順）に並べ、
  **ラベルを持つ最初の反応**を代表にする。ラベルが 1 つも無ければ**先頭**。
- 単独グループの代表は元の反応 ID のまま（`displayId` も元 ID を返す）。
- 代表はモードごとに変わらない。通常 162 反応の後ろに追加 152 反応を足しても、
  通常側で決まった 5 グループの代表は同じ。

## 表示名（typeLabel）

- 全 member の `typeLabel` が同じならその名前（例: `酸化`）。
- 欠けている member がある、または値が異なる場合は最小表示の `反応 N件`（N = member 数）。

## API

```js
const G = require('./site/app11/reaction-groups.js'); // ブラウザ: window.RPReactionGroups

G.groupKey(reaction);              // グループキー文字列。両側非空でなければ null
G.build(reactions, canonicalOrder); // => built（下記）
G.getGroup(built, reactionId);     // => グループ | null
G.displayId(built, reactionId);    // => 表示に使う代表 ID | null
G.normalizeSide(ids);              // 重複除去 + 昇順ソートした新しい配列
```

`canonicalOrder` は反応 ID（または `{ id }`）の配列。省略時は `reactions` の並び。
配列に無い ID は入力順で後ろに回る。

`build` の戻り値:

```js
{
  version: 1,
  groups: [{
    id,                 // グループ ID（キーから決まる。モードで変わらない）
    key,                // 判定キー。単独グループは null
    representativeId,
    memberIds,          // canonical 順
    members,            // 元の反応オブジェクト（参照。変更しない）
    size,
    typeLabel,
    substrateIds, productIds,
    types, tiers, states
  }],
  byReactionId,             // reactionId -> groupId
  groupById,                // groupId -> group
  representatives,          // group 順の代表 ID
  representativeByGroupId,  // groupId -> representativeId
  reactionCount, groupCount, collapsedCount
}
```

グループの並びは「canonical 順で最初に現れた member」の位置。
`build` は反応 ID の欠落・重複、配列でない入力を fail-closed で拒否する（例外）。

## 実データの件数

| データ | 反応数 | グループ数 | 統合で減る数 |
|---|---:|---:|---:|
| 通常（`data.js`） | 162 | **156** | 6 |
| アカデミック結合（通常 162 + 追加 152） | 314 | **308** | 6 |

通常データで複数 member になるのは次の 5 グループ（11 反応）だけ。

| 代表 ID | member |
|---|---|
| `methanol-oxidation-formaldehyde` | `methanol-oxidation-formaldehyde`, `methanol-cuo-oxidation` |
| `ethanol-oxidation-ethanal` | `ethanol-oxidation-ethanal`, `ethanol-cuo-oxidation`, `ethanol-dichromate-oxidation-ethanal` |
| `ethanol-oxidation-acetic` | `ethanol-oxidation-acetic`, `ethanol-dichromate-oxidation-acetic-acid` |
| `propan-2-ol-oxidation` | `propan-2-ol-oxidation`, `propan-2-ol-cuo-oxidation` |
| `acetic-acid-neutralization` | `acetic-acid-neutralization`, `acetic-acid-sodium-carbonate` |

- `ethanol-oxidation-acetic` グループは 2 件とも `label` が無い（secondary）ため、代表は canonical 先頭。
- 追加 152 反応は既存グループとキーが重ならず、単独グループだけを増やす（308 = 314 − 6）。

## 実行時の表示数（反応数とは別）

- 通常モード: 反応 162 → 表示グループ **156**。ラベルは primary の 80 → **75**。
- 新配置（normal-proposed）モード: 表示グループ **156**。
  既存の `proposed-layout-data.js` は 162 マーカーのまま変更しない。グループ表示は
  代表 ID のマーカー・座標をそのまま使い、残りの member は同じグループとして扱う。
- アカデミックモード: 反応 314 → 表示グループ **308**。

## 幾何 gate との違い

`scripts/app11/metrics.cjs` / `proposal-contract.js` / 各 label・connector テストなどの
既存の幾何 gate は、**通常データの個別反応（162 マーカー・ラベル・経路）**の衝突や契約を評価する。
この module のグループ表示（代表ラベルに集約したあとの見え方、`反応 N件` の合成ラベル）は
**実行時評価であり、既存 geometry gate の対象ではない**。グループ表示の見た目を検証する場合は
別途 UI 側のテストで確認する。

## テスト

```powershell
node --test scripts/tests/app11-reaction-groups.test.cjs
```

固定している内容:

- 通常 162→156、結合 314→308、統合は 5 グループ / 11 ID のみ。
- 5 グループの member と代表 ID、アカデミック結合でも代表・グループ ID が同じ。
- 逆向きは非統合。多入力多出力は順序・重複を無視し完全一致のみ。空の端は反応ごとに単独。
- 条件・係数・type/tier/出典・座標が違っても同一グループで、member の値は保持。
- typeLabel の同一 / 不一致（`反応 N件`）。
- 決定性、`canonicalOrder` による入力順非依存、入力不変（凍結入力でも動作）。
- 単独グループの `displayId` は元 ID。未知 ID は `null`。
