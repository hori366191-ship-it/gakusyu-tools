/*
 * app11-3d — 画面モデル（純関数・DOM なし）
 *
 * 入力:
 *   - site/app11/data.js        （通常層 427 物質 / 162 反応）
 *   - academic-facts.js（大学レベル追加反応の事実データ。座標なし）
 *   - site/app11/reaction-groups.js（同じ「基質集合 → 生成物集合」の重複グループ化）
 *
 * 出力:
 *   - 物質索引・検索・反応グループ・有向エッジ・層ごとの可視判定
 *
 * 事実の扱い:
 *   - 反応の向きは groupKey と同じく基質→生成物で固定。逆向きは別グループ。
 *   - 条件・試薬・係数・出典は member に残し、グループ化では捨てない。
 *   - 座標（x / y）は読まない（2D の暫定レイアウトに依存しない）。
 *
 * Node では require、ブラウザでは window.RP3DScene。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DScene = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIER_SCORE = { primary: 2, secondary: 1, isolated: 0, academic: 1 };
  var REGION_LABELS = {};

  function uniq(list) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var value = list[i];
      if (value == null) continue;
      var key = String(value);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(value);
    }
    return out;
  }

  function isAcademicMember(member) {
    return !!(member && (member.academic === true || member.tier === 'academic' || member.state === 'academic'));
  }

  function normalizeText(value) {
    var text = String(value == null ? '' : value);
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text.toLowerCase().replace(/[\s\u3000]+/g, '');
  }

  function aliasesOf(compound) {
    var raw = [compound.label, compound.name].filter(Boolean).join('／');
    return uniq(raw.split(/[\/／、,，]/)).filter(function (s) { return s !== ''; });
  }

  function searchScore(compound, query) {
    if (!query) return 0;
    var q = query;
    var id = normalizeText(compound.id);
    var formula = normalizeText(compound.formula);
    var category = normalizeText(compound.category);
    var region = normalizeText(compound.region);
    var score = 0;
    if (id === q) score = Math.max(score, 1000);
    if (formula === q) score = Math.max(score, 760);
    var aliases = compound._searchAliases || [];
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i];
      if (alias === q) score = Math.max(score, 950);
      else if (alias.indexOf(q) === 0) score = Math.max(score, 820);
      else if (alias.indexOf(q) >= 0) score = Math.max(score, 620);
    }
    if (id.indexOf(q) >= 0) score = Math.max(score, 560);
    if (formula && formula.indexOf(q) >= 0) score = Math.max(score, 520);
    if (category && category.indexOf(q) >= 0) score = Math.max(score, 300);
    if (region && region.indexOf(q) >= 0) score = Math.max(score, 260);
    return score;
  }

  function createModel(normalData, academicData, groupModule) {
    if (!normalData || !Array.isArray(normalData.compounds)) {
      throw new TypeError('RP3DScene: normalData.compounds がない');
    }
    if (!groupModule || typeof groupModule.build !== 'function') {
      throw new TypeError('RP3DScene: reaction-groups モジュールがない');
    }

    var normalReactions = Array.isArray(normalData.reactions) ? normalData.reactions : [];
    var academicReactions = academicData && Array.isArray(academicData.reactions) ? academicData.reactions : [];

    var compounds = [];
    var byId = Object.create(null);
    var regionNames = Object.create(null);
    (normalData.regions || []).forEach(function (region) {
      regionNames[region.id] = region.name;
      REGION_LABELS[region.id] = region.name;
    });

    for (var i = 0; i < normalData.compounds.length; i++) {
      var source = normalData.compounds[i];
      if (!source || typeof source.id !== 'string' || source.id === '') {
        throw new TypeError('RP3DScene: id のない物質がある');
      }
      if (byId[source.id]) throw new TypeError('RP3DScene: 物質 ID が重複している: ' + source.id);
      var compound = {
        id: source.id,
        name: source.name || source.label || source.id,
        label: source.label || source.name || source.id,
        formula: source.formula || '',
        formulaDisplay: source.formulaDisplay || '',
        region: source.region || '',
        regionName: regionNames[source.region] || source.region || '',
        category: source.category || '',
        tier: source.tier || 'isolated',
        hub: !!source.hub,
        incoming: source.incoming || 0,
        outgoing: source.outgoing || 0,
        pathState: source.pathState || '',
        curriculum: !!source.curriculum,
        structure: source.structure || null,
        figures: source.figures || null,
        recordState: source.recordState || '',
        builder: source.builder || null
      };
      compound._searchAliases = aliasesOf(compound).map(normalizeText);
      compounds.push(compound);
      byId[compound.id] = compound;
    }

    var combined = normalReactions.concat(academicReactions);
    var canonicalOrder = normalReactions.map(function (r) { return r.id; })
      .concat(academicReactions.map(function (r) { return r.id; }));
    var built = groupModule.build(combined, canonicalOrder);

    var warnings = [];
    var unknown = Object.create(null);
    academicReactions.forEach(function (reaction) {
      (reaction.substrates || []).concat(reaction.products || []).forEach(function (id) {
        if (!byId[id]) unknown[id] = true;
      });
    });
    var unknownIds = Object.keys(unknown).sort();
    if (unknownIds.length) {
      warnings.push({ code: 'unknown-academic-compound', ids: unknownIds });
    }

    var groups = [];
    var groupById = Object.create(null);
    var edges = [];
    var edgeById = Object.create(null);
    var compoundGroupIds = Object.create(null);
    var compoundEdges = Object.create(null);
    Object.keys(byId).forEach(function (id) {
      compoundGroupIds[id] = [];
      compoundEdges[id] = { in: [], out: [], groupIds: [] };
    });

    function noteCompoundGroup(compoundId, groupId) {
      if (!compoundGroupIds[compoundId]) compoundGroupIds[compoundId] = [];
      if (compoundGroupIds[compoundId].indexOf(groupId) === -1) {
        compoundGroupIds[compoundId].push(groupId);
      }
      var bucket = compoundEdges[compoundId];
      if (bucket && bucket.groupIds.indexOf(groupId) === -1) bucket.groupIds.push(groupId);
    }

    for (var gi = 0; gi < built.groups.length; gi++) {
      var rawGroup = built.groups[gi];
      var academicCount = 0;
      var normalCount = 0;
      rawGroup.members.forEach(function (member) {
        if (isAcademicMember(member)) academicCount++;
        else normalCount++;
      });
      var academicOnly = academicCount > 0 && normalCount === 0;
      var hasAcademic = academicCount > 0;
      var hasNormal = normalCount > 0;
      var group = {
        id: rawGroup.id,
        key: rawGroup.key,
        representativeId: rawGroup.representativeId,
        memberIds: rawGroup.memberIds.slice(),
        size: rawGroup.size,
        typeLabel: rawGroup.typeLabel,
        substrateIds: rawGroup.substrateIds.slice(),
        productIds: rawGroup.productIds.slice(),
        types: rawGroup.types.slice(),
        tiers: rawGroup.tiers.slice(),
        states: rawGroup.states.slice(),
        academicOnly: academicOnly,
        hasAcademic: hasAcademic,
        hasNormal: hasNormal,
        academicCount: academicCount,
        normalCount: normalCount,
        members: rawGroup.members.map(function (member) {
          return {
            id: member.id,
            typeLabel: member.typeLabel || '',
            tier: member.tier || '',
            state: member.state || '',
            conditions: member.conditions || '',
            note: member.note || '',
            sources: (member.sources || []).slice(),
            academic: isAcademicMember(member),
            equation: member.equation || null
          };
        })
      };
      groups.push(group);
      groupById[group.id] = group;

      // 基質 × 生成物の有向エッジ。グループ化で向きは反転しない。
      var pairSeen = Object.create(null);
      group.substrateIds.forEach(function (from) {
        group.productIds.forEach(function (to) {
          if (!byId[from] || !byId[to] || from === to) return;
          var pairKey = from + '\u0000' + to;
          if (pairSeen[pairKey]) return;
          pairSeen[pairKey] = true;
          var edge = {
            id: group.id + '|' + from + '|' + to,
            groupId: group.id,
            from: from,
            to: to,
            academicOnly: group.academicOnly,
            hasNormal: group.hasNormal,
            hasAcademic: group.hasAcademic,
            typeLabel: group.typeLabel,
            tier: group.academicOnly ? 'academic' : (group.tiers[0] || 'primary')
          };
          edges.push(edge);
          edgeById[edge.id] = edge;
          compoundEdges[from].out.push(edge);
          compoundEdges[to].in.push(edge);
          noteCompoundGroup(from, group.id);
          noteCompoundGroup(to, group.id);
        });
      });
      // 端が空のグループでも、物質側の所属は記録する。
      group.substrateIds.concat(group.productIds).forEach(function (id) {
        if (byId[id]) noteCompoundGroup(id, group.id);
      });
    }

    var normalGroups = groups.filter(function (g) { return g.hasNormal; });
    var academicGroups = groups.slice();
    var normalEdges = edges.filter(function (e) { return e.hasNormal; });
    var allEdges = edges.slice();

    function edgesForLayer(layer) {
      return layer === 'academic' ? allEdges : normalEdges;
    }
    function groupsForLayer(layer) {
      return layer === 'academic' ? academicGroups : normalGroups;
    }
    // 接続済み = 可視グループの基質・生成物に現れる物質。
    // 生成物が空のグループ（例: protein-hydrolysis）でも、反応に関与していれば
    // 「未接続」とは呼ばない。data.js の connectedCount と同じ数え方に合わせる。
    function connectedSet(layer) {
      var set = Object.create(null);
      groupsForLayer(layer).forEach(function (group) {
        group.substrateIds.concat(group.productIds).forEach(function (id) {
          if (byId[id]) set[id] = true;
        });
      });
      return set;
    }
    var connectedCache = Object.create(null);
    function connectedIds(layer) {
      var key = layer === 'academic' ? 'academic' : 'normal';
      if (!connectedCache[key]) connectedCache[key] = connectedSet(key);
      return connectedCache[key];
    }

    function groupsForCompound(id, layer) {
      var ids = compoundGroupIds[id] || [];
      var visible = layer === 'academic' ? null : normalGroups;
      var visibleSet = null;
      if (visible) {
        visibleSet = Object.create(null);
        visible.forEach(function (g) { visibleSet[g.id] = true; });
      }
      var out = [];
      ids.forEach(function (groupId) {
        if (visibleSet && !visibleSet[groupId]) return;
        var group = groupById[groupId];
        if (group) out.push(group);
      });
      out.sort(function (a, b) {
        if (a.size !== b.size) return b.size - a.size;
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      return out;
    }

    function visibleEdgesForCompound(id, layer) {
      var allowed = Object.create(null);
      groupsForCompound(id, layer).forEach(function (group) { allowed[group.id] = true; });
      return edgesForLayer(layer).filter(function (edge) {
        return allowed[edge.groupId] && (edge.from === id || edge.to === id);
      });
    }

    function search(query, limit) {
      var q = normalizeText(query);
      var max = limit == null ? 10 : limit;
      if (!q) return [];
      var results = [];
      for (var ci = 0; ci < compounds.length; ci++) {
        var compound = compounds[ci];
        var score = searchScore(compound, q);
        if (score <= 0) continue;
        results.push({ id: compound.id, compound: compound, score: score });
      }
      results.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.compound.hub !== b.compound.hub) return a.compound.hub ? -1 : 1;
        var ta = TIER_SCORE[a.compound.tier] || 0;
        var tb = TIER_SCORE[b.compound.tier] || 0;
        if (tb !== ta) return tb - ta;
        var la = a.compound.label.length;
        var lb = b.compound.label.length;
        if (la !== lb) return la - lb;
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      return results.slice(0, Math.max(0, max));
    }

    function stats(layer) {
      var visible = groupsForLayer(layer);
      var edgeList = edgesForLayer(layer);
      var connected = connectedIds(layer);
      var connectedCount = Object.keys(connected).length;
      return {
        layer: layer,
        compounds: compounds.length,
        groups: visible.length,
        edges: edgeList.length,
        connected: connectedCount,
        unconnected: compounds.length - connectedCount,
        academicGroups: visible.filter(function (g) { return g.academicOnly; }).length,
        mixedGroups: visible.filter(function (g) { return g.hasAcademic && g.hasNormal; }).length
      };
    }

    return {
      version: 1,
      compounds: compounds,
      byId: byId,
      groups: groups,
      groupById: groupById,
      normalGroups: normalGroups,
      academicGroups: academicGroups,
      edges: allEdges,
      normalEdges: normalEdges,
      edgeById: edgeById,
      compoundGroupIds: compoundGroupIds,
      compoundEdges: compoundEdges,
      warnings: warnings,
      reactionCount: combined.length,
      groupCount: groups.length,
      collapsedCount: built.collapsedCount,
      groupsForLayer: groupsForLayer,
      edgesForLayer: edgesForLayer,
      groupsForCompound: groupsForCompound,
      visibleEdgesForCompound: visibleEdgesForCompound,
      connectedIds: connectedIds,
      search: search,
      stats: stats,
      regionName: function (regionId) { return regionNames[regionId] || regionId; },
      normalizeText: normalizeText
    };
  }

  return {
    createModel: createModel,
    normalizeText: normalizeText,
    searchScore: searchScore,
    isAcademicMember: isAcademicMember
  };
});
