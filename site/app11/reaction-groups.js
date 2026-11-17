/*
 * 有機反応マップ（app11）— 反応の重複グループ化（pure module）
 *
 * 同じ「基質の集合 → 生成物の集合」を持つ反応を 1 グループにまとめる。
 * 条件・試薬・反応式の係数・種類（type/tier）・出典・座標はグループ判定に使わず、
 * 各 member（元の反応オブジェクト）にそのまま残す。
 *
 * 依存なし・DOM なし・乱数なし。Node では require、ブラウザでは window.RPReactionGroups。
 * 入力配列・反応オブジェクトは変更しない（コピーだけを作る）。
 * 座標・幾何の再計算は一切しない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPReactionGroups = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var GROUP_ID_PREFIX = 'group:';

  // 基質/生成物の ID 列を「重複除去 → 昇順ソート」した新しい配列にする。
  function normalizeSide(list) {
    var out = [];
    var seen = Object.create(null);
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      if (typeof id !== 'string' || id === '') continue;
      if (seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    out.sort();
    return out;
  }

  // グループ判定キー。両側が非空のときだけ JSON.stringify([基質, 生成物]) を返す。
  // 向き（基質→生成物）が固定なので、逆向きの反応は別キーになる。
  // 集合が完全一致したときだけ同じキーになる（部分一致ではまとめない）。
  function groupKey(reaction) {
    if (!reaction || typeof reaction !== 'object') return null;
    var substrates = normalizeSide(reaction.substrates);
    var products = normalizeSide(reaction.products);
    if (!substrates.length || !products.length) return null;
    return JSON.stringify([substrates, products]);
  }

  function canonicalIndex(reactions, canonicalOrder) {
    var index = Object.create(null);
    var next = 0;
    if (canonicalOrder && typeof canonicalOrder.length === 'number') {
      for (var i = 0; i < canonicalOrder.length; i++) {
        var item = canonicalOrder[i];
        var id = typeof item === 'string' ? item : (item && typeof item.id === 'string' ? item.id : '');
        if (!id || index[id] != null) continue;
        index[id] = next++;
      }
    }
    for (var j = 0; j < reactions.length; j++) {
      var rid = reactions[j].id;
      if (index[rid] == null) index[rid] = next++;
    }
    return index;
  }

  function groupIdFor(key, reactionId) {
    return key === null ? GROUP_ID_PREFIX + 'single:' + reactionId : GROUP_ID_PREFIX + key;
  }

  // 全 member の typeLabel が同じならその名前、欠け/不一致なら「反応 N件」。
  function groupTypeLabel(members) {
    var first = null;
    var uniform = true;
    for (var i = 0; i < members.length; i++) {
      var raw = members[i].typeLabel;
      var label = typeof raw === 'string' ? raw : '';
      if (i === 0) first = label;
      if (label === '' || label !== first) uniform = false;
    }
    if (uniform && first) return first;
    return '反応 ' + members.length + '件';
  }

  // 代表は canonical 順で最初の「ラベルを持つ反応」。無ければ先頭。
  // モードを切り替えても同じ並びなら代表は変わらない。
  function pickRepresentativeId(members) {
    for (var i = 0; i < members.length; i++) {
      if (members[i].label) return members[i].id;
    }
    return members.length ? members[0].id : null;
  }

  function uniqueValues(members, field) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < members.length; i++) {
      var v = members[i][field];
      if (v == null) continue;
      var key = String(v);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(v);
    }
    return out;
  }

  /*
   * build(reactions, canonicalOrder?) -> {
   *   groups: [{ id, key, representativeId, memberIds, members,
   *              size, typeLabel, substrateIds, productIds, types, tiers, states }],
   *   byReactionId: { reactionId: groupId },
   *   groupById: { groupId: group },
   *   representatives: [representativeId...],
   *   representativeByGroupId: { groupId: representativeId },
   *   reactionCount, groupCount, collapsedCount
   * }
   *
   * canonicalOrder は反応 ID（または {id}）の配列。省略時は reactions の並び。
   * グループは canonical 順で最初に現れた member の位置に並ぶ。
   */
  function build(reactions, canonicalOrder) {
    if (!Array.isArray(reactions)) throw new TypeError('RPReactionGroups.build: reactions が配列でない');
    var seenIds = Object.create(null);
    for (var i = 0; i < reactions.length; i++) {
      var r = reactions[i];
      if (!r || typeof r.id !== 'string' || r.id === '') {
        throw new TypeError('RPReactionGroups.build: id のない反応がある');
      }
      if (seenIds[r.id]) throw new TypeError('RPReactionGroups.build: 反応 ID が重複している: ' + r.id);
      seenIds[r.id] = true;
    }

    var index = canonicalIndex(reactions, canonicalOrder);
    var ordered = reactions.map(function (reaction, position) {
      return { reaction: reaction, position: position };
    }).sort(function (a, b) {
      return (index[a.reaction.id] - index[b.reaction.id]) || (a.position - b.position);
    });

    var groups = [];
    var groupById = Object.create(null);
    var byReactionId = Object.create(null);
    var byMapKey = Object.create(null);

    for (var oi = 0; oi < ordered.length; oi++) {
      var reaction = ordered[oi].reaction;
      var key = groupKey(reaction);
      // 両側が非空でない反応は、他の反応とまとめず単独グループにする。
      var mapKey = key === null ? '\u0000single:' + reaction.id : key;
      var group = byMapKey[mapKey];
      if (!group) {
        group = {
          id: groupIdFor(key, reaction.id),
          key: key,
          representativeId: null,
          memberIds: [],
          members: [],
          size: 0,
          typeLabel: '',
          substrateIds: normalizeSide(reaction.substrates),
          productIds: normalizeSide(reaction.products),
          types: [],
          tiers: [],
          states: []
        };
        byMapKey[mapKey] = group;
        groups.push(group);
      }
      group.memberIds.push(reaction.id);
      group.members.push(reaction);
      byReactionId[reaction.id] = group.id;
    }

    var representatives = [];
    var representativeByGroupId = Object.create(null);
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      g.size = g.memberIds.length;
      g.representativeId = pickRepresentativeId(g.members);
      g.typeLabel = groupTypeLabel(g.members);
      g.types = uniqueValues(g.members, 'type');
      g.tiers = uniqueValues(g.members, 'tier');
      g.states = uniqueValues(g.members, 'state');
      groupById[g.id] = g;
      representativeByGroupId[g.id] = g.representativeId;
      representatives.push(g.representativeId);
    }

    return {
      version: VERSION,
      groups: groups,
      byReactionId: byReactionId,
      groupById: groupById,
      representatives: representatives,
      representativeByGroupId: representativeByGroupId,
      reactionCount: reactions.length,
      groupCount: groups.length,
      collapsedCount: reactions.length - groups.length
    };
  }

  // 反応 ID → グループ（未知の ID は null）。表示用の補助。
  function getGroup(built, reactionId) {
    if (!built || !built.byReactionId || !built.groupById) return null;
    var groupId = built.byReactionId[reactionId];
    if (!groupId) return null;
    return built.groupById[groupId] || null;
  }

  // 反応 ID → 画面に出す代表 ID。単独グループは元の ID のまま。
  function displayId(built, reactionId) {
    var group = getGroup(built, reactionId);
    return group ? group.representativeId : null;
  }

  return {
    VERSION: VERSION,
    GROUP_ID_PREFIX: GROUP_ID_PREFIX,
    normalizeSide: normalizeSide,
    groupKey: groupKey,
    build: build,
    getGroup: getGroup,
    displayId: displayId
  };
});
