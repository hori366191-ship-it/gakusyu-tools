/*
 * 有機化学ビルダー — 構造式SVG描画・構造検証
 *
 * 方針:
 * - 外部の化学描画ライブラリに依存せず、登録済みの構造データだけをSVGで描画する。
 * - 小さな分子は水素を明示した完全構造式、大きな分子は簡略構造式。
 * - ベンゼン環はケクレ式（交互の二重結合）を標準とする。
 * - グルコースはフィッシャー投影式とα/βハース投影式を専用描画する。
 * - 原子数・結合価・分子式を検証し、一致しない構造は表示対象にしない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OCDraw = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VALENCE = { C: 4, N: 3, O: 2, Cl: 1, Na: 1, S: 2, P: 3 };
  var SUB_DIGIT = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------
   * 基本ヘルパー
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function atom(el, x, y, h, extra) {
    var a = { el: el, x: x, y: y, h: h || 0 };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  function bond(a, b, order) {
    return { a: a, b: b, order: order || 1 };
  }

  function degToRad(d) { return d * Math.PI / 180; }

  function norm(a) {
    while (a < 0) a += TAU;
    while (a >= TAU) a -= TAU;
    return a;
  }

  function angDist(a, b) {
    var d = Math.abs(norm(a) - norm(b));
    return Math.min(d, TAU - d);
  }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function chainCoords(n, cx, cy, dx, amp) {
    cx = cx == null ? 180 : cx;
    cy = cy == null ? 120 : cy;
    dx = dx == null ? 70 : dx;
    amp = amp == null ? 22 : amp;
    if (n === 1) return [{ x: cx, y: cy }];
    if (n === 2) return [{ x: cx - dx / 2, y: cy }, { x: cx + dx / 2, y: cy }];
    var start = cx - (n - 1) * dx / 2;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: start + i * dx, y: cy + (i % 2 ? -amp : amp) });
    return out;
  }

  function chainBonds(n) {
    var out = [];
    for (var i = 0; i < n - 1; i++) out.push(bond(i, i + 1, 1));
    return out;
  }

  function ringCoords(n, cx, cy, r, startAngle) {
    cx = cx == null ? 180 : cx;
    cy = cy == null ? 130 : cy;
    r = r == null ? 62 : r;
    startAngle = startAngle == null ? -Math.PI / 2 : startAngle;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = startAngle + i * TAU / n;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return out;
  }

  function ringBonds(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(bond(i, (i + 1) % n, 1));
    return out;
  }

  function chainGraph(n, opts) {
    opts = opts || {};
    var pts = chainCoords(n, opts.cx, opts.cy, opts.dx, opts.amp);
    var hs = opts.h || [];
    var atoms = pts.map(function (p, i) {
      return atom('C', p.x, p.y, hs[i] == null ? 2 : hs[i]);
    });
    return {
      atoms: atoms,
      bonds: chainBonds(n),
      mode: opts.mode || 'condensed',
      width: opts.width || 400,
      height: opts.height || 260
    };
  }

  /* ------------------------------------------------------------------
   * 炭素骨格テンプレート
   * ------------------------------------------------------------------ */

  function benzeneGraph() {
    var pts = ringCoords(6, 200, 130, 62, 0);
    var center = { x: 200, y: 130 };
    var atoms = pts.map(function (p) { return atom('C', p.x, p.y, 1, { ring: true }); });
    var orders = [2, 1, 2, 1, 2, 1];
    var bonds = [];
    for (var i = 0; i < 6; i++) {
      var b = bond(i, (i + 1) % 6, orders[i]);
      b.ring = true;
      b.ringCenter = center;
      bonds.push(b);
    }
    return { atoms: atoms, bonds: bonds, mode: 'expanded', width: 400, height: 270, aromatic: true };
  }

  function naphthaleneGraph() {
    var xy = [
      [180, 95], [130, 67], [80, 95], [80, 165], [130, 193], [180, 165],
      [230, 193], [280, 165], [280, 95], [230, 67]
    ];
    var hs = [0, 1, 1, 1, 1, 0, 1, 1, 1, 1];
    var atoms = xy.map(function (p, i) { return atom('C', p[0], p[1], hs[i], { ring: true }); });
    var left = { x: 130, y: 127 };
    var right = { x: 230, y: 127 };
    function rb(a, b, order, center) {
      var x = bond(a, b, order);
      x.ring = true;
      x.ringCenter = center;
      return x;
    }
    var bonds = [
      rb(0, 1, 2, left), rb(1, 2, 1, left), rb(2, 3, 2, left), rb(3, 4, 1, left), rb(4, 5, 2, left),
      rb(5, 0, 1, left), rb(0, 9, 1, right), rb(9, 8, 2, right), rb(8, 7, 1, right), rb(7, 6, 2, right),
      rb(6, 5, 1, right)
    ];
    return { atoms: atoms, bonds: bonds, mode: 'expanded', width: 400, height: 300, aromatic: true };
  }

  var SKELETONS = (function () {
    var s = {};

    s.methane = {
      atoms: [atom('C', 180, 115, 4)], bonds: [], mode: 'expanded', width: 360, height: 230
    };
    s.ethane = {
      atoms: [atom('C', 130, 115, 3), atom('C', 230, 115, 3)],
      bonds: [bond(0, 1, 1)], mode: 'expanded', width: 360, height: 230
    };
    s.propane = chainGraph(3, { h: [3, 2, 3], mode: 'expanded', width: 380, height: 250 });
    s.butane = chainGraph(4, { h: [3, 2, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s.isobutane = {
      atoms: [
        atom('C', 180, 115, 1), atom('C', 110, 68, 3),
        atom('C', 250, 68, 3), atom('C', 180, 185, 3)
      ],
      bonds: [bond(0, 1, 1), bond(0, 2, 1), bond(0, 3, 1)],
      mode: 'condensed', width: 360, height: 260
    };
    s.pentane = chainGraph(5, { h: [3, 2, 2, 2, 3], mode: 'condensed', width: 420, height: 250 });
    s.isopentane = (function () {
      var g = chainGraph(4, { h: [3, 1, 2, 3], mode: 'condensed', width: 400, height: 270 });
      g.atoms.push(atom('C', 145, 32, 3));
      g.bonds.push(bond(1, 4, 1));
      return g;
    })();
    s.neopentane = {
      atoms: [
        atom('C', 180, 125, 0), atom('C', 110, 75, 3), atom('C', 250, 75, 3),
        atom('C', 110, 175, 3), atom('C', 250, 175, 3)
      ],
      bonds: [bond(0, 1, 1), bond(0, 2, 1), bond(0, 3, 1), bond(0, 4, 1)],
      mode: 'condensed', width: 360, height: 280
    };

    s.ethene = {
      atoms: [atom('C', 140, 115, 2), atom('C', 220, 115, 2)],
      bonds: [bond(0, 1, 2)], mode: 'expanded', width: 360, height: 230
    };
    s.propene = chainGraph(3, { h: [2, 1, 3], mode: 'expanded', width: 380, height: 250 });
    s.propene.bonds[0].order = 2;
    s['but-1-ene'] = chainGraph(4, { h: [2, 1, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-1-ene'].bonds[0].order = 2;
    s['but-2-ene'] = chainGraph(4, { h: [3, 1, 1, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-2-ene'].bonds[1].order = 2;
    s.isobutene = {
      atoms: [
        atom('C', 180, 115, 0), atom('C', 100, 115, 2),
        atom('C', 250, 68, 3), atom('C', 250, 162, 3)
      ],
      bonds: [bond(0, 1, 2), bond(0, 2, 1), bond(0, 3, 1)],
      mode: 'condensed', width: 360, height: 250
    };

    s.ethyne = {
      atoms: [atom('C', 140, 115, 1), atom('C', 220, 115, 1)],
      bonds: [bond(0, 1, 3)], mode: 'expanded', width: 360, height: 230
    };
    s.propyne = chainGraph(3, { h: [3, 0, 1], mode: 'expanded', width: 380, height: 250 });
    s.propyne.bonds[1].order = 3;
    s['but-1-yne'] = chainGraph(4, { h: [1, 0, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-1-yne'].bonds[0].order = 3;
    s['but-2-yne'] = chainGraph(4, { h: [3, 0, 0, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-2-yne'].bonds[1].order = 3;

    s.cyclopropane = (function () {
      var pts = ringCoords(3, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(3), mode: 'expanded', width: 360, height: 280
      };
    })();
    s.cyclobutane = (function () {
      var pts = ringCoords(4, 180, 140, 62, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(4), mode: 'expanded', width: 360, height: 280
      };
    })();
    s.cyclopentane = (function () {
      var pts = ringCoords(5, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(5), mode: 'condensed', width: 360, height: 280
      };
    })();
    s.cyclohexane = (function () {
      var pts = ringCoords(6, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(6), mode: 'condensed', width: 360, height: 280
      };
    })();

    s.benzene = benzeneGraph();
    s.naphthalene = naphthaleneGraph();

    return s;
  })();

  /* ------------------------------------------------------------------
   * 構造の組み立て（骨格 + 置換基）
   * ------------------------------------------------------------------ */

  function getSkeleton(id) {
    var t = SKELETONS[id];
    if (!t) throw new Error('未登録の炭素骨格: ' + id);
    return t;
  }

  function cloneSkeleton(id, spec) {
    var t = getSkeleton(id);
    var g = {
      atoms: t.atoms.map(function (a) { return Object.assign({}, a); }),
      bonds: t.bonds.map(function (b) { return Object.assign({}, b); }),
      mode: (spec && spec.mode) || t.mode,
      width: (spec && spec.width) || t.width,
      height: (spec && spec.height) || t.height,
      aromatic: !!t.aromatic
    };
    return g;
  }

  function bondAnglesOf(g, i) {
    var out = [];
    g.bonds.forEach(function (b) {
      var other = null;
      if (b.a === i) other = b.b;
      else if (b.b === i) other = b.a;
      if (other == null) return;
      var a = g.atoms[i], o = g.atoms[other];
      out.push(Math.atan2(o.y - a.y, o.x - a.x));
    });
    return out;
  }

  function centroidOf(g) {
    var sx = 0, sy = 0;
    g.atoms.forEach(function (a) { sx += a.x; sy += a.y; });
    return { x: sx / Math.max(1, g.atoms.length), y: sy / Math.max(1, g.atoms.length) };
  }

  function chooseDirection(g, atomIndex, distance, avoidPoints) {
    var a = g.atoms[atomIndex];
    var centroid = centroidOf(g);
    var bonds = bondAnglesOf(g, atomIndex);
    var outAngle = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    var best = null, bestScore = -Infinity;
    avoidPoints = avoidPoints || [];
    for (var deg = 0; deg < 360; deg += 5) {
      var rad = degToRad(deg);
      var clear = Math.PI;
      if (bonds.length) {
        clear = Math.min.apply(null, bonds.map(function (b) { return angDist(rad, b); }));
      }
      var outward = Math.cos(rad - outAngle);
      var px = a.x + distance * Math.cos(rad);
      var py = a.y + distance * Math.sin(rad);
      var collision = 0;
      g.atoms.forEach(function (o, j) {
        if (j === atomIndex) return;
        var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
        if (d < 30) collision += 120;
        else if (d < 46) collision += 28;
      });
      avoidPoints.forEach(function (o) {
        var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
        if (d < 26) collision += 80;
        else if (d < 40) collision += 18;
      });
      var edge = 0;
      if (px < 24 || px > g.width - 24 || py < 24 || py > g.height - 24) edge = 55;
      var score = Math.min(clear, Math.PI * 0.9) * 100 + (outward + 1) * 22 - collision - edge;
      if (score > bestScore) {
        bestScore = score;
        best = { angle: rad, x: px, y: py };
      }
    }
    return best;
  }

  function addGroup(g, atomIndex, group, fixedAngleDeg) {
    var a = g.atoms[atomIndex];
    if (!a) throw new Error('置換位置が不正です');
    if (a.h < 1) throw new Error('置換に使える水素がありません');
    var dir = fixedAngleDeg == null
      ? chooseDirection(g, atomIndex, 58)
      : { angle: degToRad(fixedAngleDeg), x: a.x + 58 * Math.cos(degToRad(fixedAngleDeg)), y: a.y + 58 * Math.sin(degToRad(fixedAngleDeg)) };
    var u = { x: Math.cos(dir.angle), y: Math.sin(dir.angle) };
    var v = { x: -u.y, y: u.x };
    var p = { x: dir.x, y: dir.y };

    function addAtom(el, x, y, h, extra) {
      g.atoms.push(atom(el, x, y, h, extra));
      return g.atoms.length - 1;
    }

    if (group === 'oh') {
      var o = addAtom('O', p.x, p.y, 1);
      g.bonds.push(bond(atomIndex, o, 1));
    } else if (group === 'cooh') {
      var c = addAtom('C', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, c, 1));
      var o1 = addAtom('O', p.x + 38 * v.x, p.y + 38 * v.y, 0);
      g.bonds.push(bond(c, o1, 2));
      var o2 = addAtom('O', p.x - 38 * v.x, p.y - 38 * v.y, 1);
      g.bonds.push(bond(c, o2, 1));
    } else if (group === 'cho') {
      var cc = addAtom('C', p.x, p.y, 1);
      g.bonds.push(bond(atomIndex, cc, 1));
      var oo = addAtom('O', p.x + 38 * v.x, p.y + 38 * v.y, 0);
      g.bonds.push(bond(cc, oo, 2));
    } else if (group === 'ch3') {
      var mc = addAtom('C', p.x, p.y, 3);
      g.bonds.push(bond(atomIndex, mc, 1));
    } else if (group === 'nh2') {
      var n = addAtom('N', p.x, p.y, 2);
      g.bonds.push(bond(atomIndex, n, 1));
    } else if (group === 'no2') {
      var nn = addAtom('N', p.x, p.y, 0, { charge: '+' });
      g.bonds.push(bond(atomIndex, nn, 1));
      var no1 = addAtom('O', p.x + 35 * v.x, p.y + 35 * v.y, 0);
      g.bonds.push(bond(nn, no1, 2));
      var no2 = addAtom('O', p.x - 35 * v.x, p.y - 35 * v.y, 0, { charge: '-' });
      g.bonds.push(bond(nn, no2, 1));
    } else if (group === 'cl') {
      var cl = addAtom('Cl', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, cl, 1));
    } else {
      throw new Error('未対応の置換基: ' + group);
    }
    a.h -= 1;
    return g;
  }

  function isGraphSpec(spec) {
    return spec && (spec.type === 'skeleton' || spec.type === 'sub' || spec.type === 'multi' || spec.type === 'custom');
  }

  function buildStructure(spec) {
    if (!spec || !spec.type) throw new Error('構造データがありません');
    if (spec.type === 'skeleton') return cloneSkeleton(spec.skeleton, spec);
    if (spec.type === 'sub') {
      var g = cloneSkeleton(spec.skeleton, spec);
      addGroup(g, spec.at, spec.group, spec.angle);
      return g;
    }
    if (spec.type === 'multi') {
      var gm = cloneSkeleton(spec.skeleton, spec);
      (spec.groups || []).forEach(function (item) {
        addGroup(gm, item.at, item.group, item.angle);
      });
      return gm;
    }
    if (spec.type === 'custom') {
      return {
        atoms: (spec.atoms || []).map(function (a) { return Object.assign({}, a); }),
        bonds: (spec.bonds || []).map(function (b) { return Object.assign({}, b); }),
        mode: spec.mode || 'condensed',
        width: spec.width || 420,
        height: spec.height || 260
      };
    }
    return spec;
  }

  /* ------------------------------------------------------------------
   * 水素の配置とSVG描画
   * ------------------------------------------------------------------ */

  function labelFor(a, mode) {
    if (a.label) return a.label;
    if (a.el === 'C') {
      if (mode !== 'condensed') return 'C';
      if (a.h >= 3) return 'CH₃';
      if (a.h === 2) return 'CH₂';
      if (a.h === 1) return 'CH';
      return 'C';
    }
    if (a.el === 'Cl') return 'Cl';
    if (a.el === 'Na') return 'Na';
    return a.el;
  }

  function estimateWidth(text, fontSize) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '₀' || ch === '₁' || ch === '₂' || ch === '₃' || ch === '₄' || ch === '₅' || ch === '₆' || ch === '₇' || ch === '₈' || ch === '₉') w += fontSize * 0.55;
      else if (/[A-Za-z0-9]/.test(ch)) w += fontSize * 0.62;
      else if (ch === '—' || ch === '–' || ch === '=') w += fontSize * 0.7;
      else w += fontSize;
    }
    return w;
  }

  function atomRadius(a, mode) {
    var label = labelFor(a, mode);
    var fs = mode === 'condensed' ? 19 : 23;
    return Math.max(8, estimateWidth(label, fs) / 2 + 3);
  }

  function hDirections(g, index) {
    var a = g.atoms[index];
    if (!a.h) return [];
    var centroid = centroidOf(g);
    var bonds = bondAnglesOf(g, index);
    var outAngle = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    var chosen = [];
    var chosenPoints = [];
    for (var k = 0; k < a.h; k++) {
      var best = null, bestScore = -Infinity;
      for (var deg = 0; deg < 360; deg += 5) {
        var rad = degToRad(deg);
        var clearBond = bonds.length ? Math.min.apply(null, bonds.map(function (b) { return angDist(rad, b); })) : Math.PI;
        var clearH = chosen.length ? Math.min.apply(null, chosen.map(function (b) { return angDist(rad, b); })) : Math.PI;
        var outward = Math.cos(rad - outAngle);
        var px = a.x + 42 * Math.cos(rad);
        var py = a.y + 42 * Math.sin(rad);
        var collision = 0;
        g.atoms.forEach(function (o, j) {
          if (j === index) return;
          var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
          if (d < 24) collision += 90;
          else if (d < 36) collision += 20;
        });
        chosenPoints.forEach(function (o) {
          var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
          if (d < 24) collision += 70;
        });
        var score = Math.min(clearBond, Math.PI * 0.9) * 90 + Math.min(clearH, Math.PI * 0.9) * 55 + (outward + 1) * 18 - collision;
        if (score > bestScore) {
          bestScore = score;
          best = { angle: rad, x: px, y: py };
        }
      }
      chosen.push(best.angle);
      chosenPoints.push({ x: best.x, y: best.y });
    }
    return chosenPoints;
  }

  function svgOpen(x, y, w, h, label, extra) {
    return '<svg class="oc-svg" viewBox="' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1) + '" role="img" aria-label="' +
      esc(label || '分子構造式') + '" preserveAspectRatio="xMidYMid meet" ' + (extra || '') + '>';
  }

  function textEl(x, y, content, cls, size, extra) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" class="' +
      (cls || 'oc-atom') + '" font-size="' + (size || 22) + '" ' + (extra || '') + '>' + esc(content) + '</text>';
  }

  function lineEl(x1, y1, x2, y2, cls, width) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
      '" class="' + (cls || 'oc-bond') + '" stroke-width="' + (width || 2.6) + '" stroke-linecap="round"/>';
  }

  function drawBondLine(a, b, order, trimA, trimB, cls) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    var x1 = a.x + ux * trimA, y1 = a.y + uy * trimA;
    var x2 = b.x - ux * trimB, y2 = b.y - uy * trimB;
    if (order === 1) return lineEl(x1, y1, x2, y2, cls);
    var offsets = order === 2 ? [-3.6, 3.6] : [-4.8, 0, 4.8];
    return offsets.map(function (off) {
      return lineEl(x1 + px * off, y1 + py * off, x2 + px * off, y2 + py * off, cls);
    }).join('');
  }

  function drawRingBond(a, b, order, center, cls, width) {
    if (!cls) cls = 'oc-bond';
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    // 二重結合の2本目は環の内側へ
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var toCenter = { x: center.x - mid.x, y: center.y - mid.y };
    var sign = (px * toCenter.x + py * toCenter.y) >= 0 ? 1 : -1;
    if (order === 1) return lineEl(a.x, a.y, b.x, b.y, cls, width || 2.6);
    var offs = order === 2 ? [0, 7 * sign] : [-7, 0, 7];
    return offs.map(function (off, idx) {
      var lineClass = cls;
      if (order === 2 && idx === 1) lineClass += ' oc-bond--inner';
      return lineEl(a.x + px * off, a.y + py * off, b.x + px * off, b.y + py * off, lineClass, width || 2.6);
    }).join('');
  }

  function trimPoint(from, toward, radius) {
    var dx = toward.x - from.x, dy = toward.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: from.x + dx / len * radius, y: from.y + dy / len * radius };
  }

  function renderGraph(g, label) {
    var mode = g.mode || 'condensed';
    var hPoints = g.atoms.map(function (a, i) {
      if (mode === 'condensed' && a.el === 'C') return [];
      return hDirections(g, i);
    });

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    g.atoms.forEach(function (a) {
      minX = Math.min(minX, a.x - 30); maxX = Math.max(maxX, a.x + 30);
      minY = Math.min(minY, a.y - 30); maxY = Math.max(maxY, a.y + 30);
    });
    hPoints.forEach(function (list) {
      list.forEach(function (p) {
        minX = Math.min(minX, p.x - 16); maxX = Math.max(maxX, p.x + 16);
        minY = Math.min(minY, p.y - 16); maxY = Math.max(maxY, p.y + 16);
      });
    });
    var pad = 14;
    var contentMinX = minX - pad, contentMaxX = maxX + pad;
    var contentMinY = minY - pad, contentMaxY = maxY + pad;
    var vbW = Math.max(g.width || 360, contentMaxX - contentMinX);
    var vbH = Math.max(g.height || 230, contentMaxY - contentMinY);
    var vbX = (contentMinX + contentMaxX) / 2 - vbW / 2;
    var vbY = (contentMinY + contentMaxY) / 2 - vbH / 2;

    var bonds = '';
    var graphCenter = centroidOf(g);
    g.bonds.forEach(function (b) {
      var a = g.atoms[b.a], c = g.atoms[b.b];
      if (b.ring) {
        var aa = trimPoint(a, c, atomRadius(a, mode));
        var cc = trimPoint(c, a, atomRadius(c, mode));
        bonds += drawRingBond(aa, cc, b.order, b.ringCenter || graphCenter);
      } else {
        bonds += drawBondLine(a, c, b.order, atomRadius(a, mode), atomRadius(c, mode));
      }
    });

    var hBonds = '', hLabels = '';
    g.atoms.forEach(function (a, i) {
      hPoints[i].forEach(function (p) {
        var dx = p.x - a.x, dy = p.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ax = a.x + dx / len * (atomRadius(a, mode) - 1);
        var ay = a.y + dy / len * (atomRadius(a, mode) - 1);
        var bx = p.x - dx / len * 8;
        var by = p.y - dy / len * 8;
        hBonds += lineEl(ax, ay, bx, by, 'oc-bond oc-bond--h', 2.1);
        hLabels += textEl(p.x, p.y, 'H', 'oc-h', 17, 'data-el="H"');
      });
    });

    var atoms = '';
    g.atoms.forEach(function (a) {
      var lab = labelFor(a, mode);
      var fs = mode === 'condensed' ? 19 : 23;
      atoms += textEl(a.x, a.y, lab, 'oc-atom', fs, 'data-el="' + esc(a.el) + '"');
      if (a.charge) {
        atoms += textEl(a.x + (fs * 0.55), a.y - (fs * 0.55), a.charge, 'oc-charge', 13, 'data-charge="' + esc(a.charge) + '"');
      }
    });

    return svgOpen(vbX, vbY, vbW, vbH, label, 'data-kind="graph"') +
      '<g class="oc-bond-layer">' + bonds + hBonds + '</g>' +
      '<g class="oc-atom-layer">' + atoms + hLabels + '</g>' +
      '</svg>';
  }

  /* ------------------------------------------------------------------
   * ベンゼン環＋置換基ラベル（個別化合物用）
   * ------------------------------------------------------------------ */

  function renderRingSub(spec, label) {
    var pts = ringCoords(6, 210, 135, 62, 0);
    var center = { x: 210, y: 135 };
    var orders = [2, 1, 2, 1, 2, 1];
    var out = '';
    var bonds = '';
    for (var i = 0; i < 6; i++) bonds += drawRingBond(pts[i], pts[(i + 1) % 6], orders[i], center);
    var subs = {};
    (spec.subs || []).forEach(function (s) { subs[s.at] = s.label; });
    var labels = '';
    for (var j = 0; j < 6; j++) {
      var angle = j * Math.PI / 3;
      var ux = Math.cos(angle), uy = Math.sin(angle);
      var x1 = pts[j].x, y1 = pts[j].y;
      var x2 = pts[j].x + ux * 50, y2 = pts[j].y + uy * 50;
      if (subs[j]) {
        labels += lineEl(x1, y1, x2, y2, 'oc-bond', 2.6);
        var anchor = ux > 0.3 ? 'start' : (ux < -0.3 ? 'end' : 'middle');
        var tx = x2 + (anchor === 'start' ? 4 : (anchor === 'end' ? -4 : 0));
        var ty = y2 + (anchor === 'middle' ? uy * 6 : 0);
        labels += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) +
          '" text-anchor="' + anchor + '" dominant-baseline="middle" class="oc-atom" font-size="18" data-sub="' +
          esc(subs[j]) + '">' + esc(subs[j]) + '</text>';
      } else {
        var hx2 = pts[j].x + ux * 42, hy2 = pts[j].y + uy * 42;
        labels += lineEl(x1, y1, hx2, hy2, 'oc-bond oc-bond--h', 2.1);
        labels += textEl(hx2 + ux * 8, hy2 + uy * 8, 'H', 'oc-h', 17, 'data-el="H"');
      }
    }
    var width = 460;
    return svgOpen(0, 0, width, 280, label, 'data-kind="ring-sub"') +
      '<g class="oc-bond-layer">' + bonds + '</g>' +
      '<g class="oc-atom-layer">' + labels + '</g></svg>';
  }

  /* ------------------------------------------------------------------
   * 簡略構造式・重合体・模式図
   * ------------------------------------------------------------------ */

  function renderCondensed(spec, label) {
    var lines = spec.lines || [];
    var maxLen = 0;
    lines.forEach(function (t) { maxLen = Math.max(maxLen, t.length); });
    var fs = maxLen > 30 ? 16 : (maxLen > 22 ? 18 : 20);
    var width = Math.max(360, maxLen * fs * 0.72 + 50);
    var height = Math.max(120, 52 + lines.length * 36);
    var content = lines.map(function (t, i) {
      return '<text x="' + (width / 2).toFixed(1) + '" y="' + (40 + i * 36).toFixed(1) +
        '" text-anchor="middle" dominant-baseline="middle" class="oc-condensed" font-size="' + fs + '">' + esc(t) + '</text>';
    }).join('');
    return svgOpen(0, 0, width, height, label, 'data-kind="condensed"') + content + '</svg>';
  }

  function renderTriglyceride(spec, label) {
    var W = 470, H = 270;
    var x = 92;
    var ys = [58, 128, 198];
    var labels = ['CH₂', 'CH', 'CH₂'];
    var out = '';
    // グリセリン骨格のC-C結合（3つの炭素を縦に明示）
    out += lineEl(x, ys[0] + 13, x, ys[1] - 13, 'oc-bond oc-bond--backbone', 2.8);
    out += lineEl(x, ys[1] + 13, x, ys[2] - 13, 'oc-bond oc-bond--backbone', 2.8);
    for (var i = 0; i < 3; i++) {
      out += textEl(x, ys[i], labels[i], 'oc-condensed', 19);
      out += lineEl(x + 13, ys[i], x + 42, ys[i], 'oc-bond', 2.6);
      out += '<text x="' + (x + 48) + '" y="' + ys[i] + '" text-anchor="start" dominant-baseline="middle" class="oc-condensed" font-size="17" data-chain="fatty-acid">' +
        esc('O—CO—C₁₇H₃₅') + '</text>';
    }
    out += textEl(W / 2, 242, 'グリセリン骨格と3本の脂肪酸鎖（簡略）', 'oc-projection-note', 12);
    return svgOpen(0, 0, W, H, label, 'data-kind="triglyceride"') + out + '</svg>';
  }

  function renderPolymer(spec, label) {
    var unit = spec.unit || '';
    var fs = unit.length > 34 ? 15 : (unit.length > 24 ? 17 : 19);
    var width = Math.max(400, unit.length * fs * 0.72 + 120);
    var height = 150;
    var cy = 70;
    var left = 46, right = width - 46;
    var content = lineEl(left + 8, cy - 32, left, cy - 32, 'oc-bracket', 2.4) +
      lineEl(left, cy - 32, left, cy + 32, 'oc-bracket', 2.4) +
      lineEl(left, cy + 32, left + 8, cy + 32, 'oc-bracket', 2.4) +
      lineEl(right - 8, cy - 32, right, cy - 32, 'oc-bracket', 2.4) +
      lineEl(right, cy - 32, right, cy + 32, 'oc-bracket', 2.4) +
      lineEl(right, cy + 32, right - 8, cy + 32, 'oc-bracket', 2.4) +
      '<text x="' + (width / 2).toFixed(1) + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" class="oc-condensed" font-size="' + fs + '">' + esc(unit) + '</text>' +
      '<text x="' + (right + 15).toFixed(1) + '" y="' + (cy + 34) + '" text-anchor="middle" class="oc-atom" font-size="16">n</text>';
    return svgOpen(0, 0, width, height, label, 'data-kind="polymer"') + content + '</svg>';
  }

  function renderSchematic(spec, label) {
    var kind = spec.kind;
    if (kind === 'sucrose' || kind === 'maltose' || kind === 'lactose') {
      var leftLabel = kind === 'sucrose' ? 'α-D-グルコース' : (kind === 'maltose' ? 'α-D-グルコース' : 'β-D-ガラクトース');
      var rightLabel = kind === 'sucrose' ? 'β-D-フルクトース' : 'D-グルコース';
      var link = kind === 'sucrose' ? 'α-1,2' : (kind === 'maltose' ? 'α-1,4' : 'β-1,4');
      var content = '<rect x="35" y="65" width="130" height="72" rx="12" class="oc-schematic-box"/>' +
        '<text x="100" y="101" text-anchor="middle" dominant-baseline="middle" class="oc-schematic-text" font-size="16">' + esc(leftLabel) + '</text>' +
        '<rect x="255" y="65" width="130" height="72" rx="12" class="oc-schematic-box"/>' +
        '<text x="320" y="101" text-anchor="middle" dominant-baseline="middle" class="oc-schematic-text" font-size="16">' + esc(rightLabel) + '</text>' +
        lineEl(165, 101, 200, 101, 'oc-bond', 2.6) +
        lineEl(220, 101, 255, 101, 'oc-bond', 2.6) +
        textEl(210, 101, 'O', 'oc-atom', 21) +
        textEl(210, 132, link, 'oc-schematic-note', 14);
      return svgOpen(0, 0, 420, 180, label, 'data-kind="schematic" data-sugar="' + esc(kind) + '"') + content + '</svg>';
    }
    // 多糖類: 繰り返し単位の模式図
    var unitLabel = spec.unitLabel || 'グルコース単位';
    var linkLabel = spec.linkLabel || '';
    var content2 = lineEl(60, 50, 42, 50, 'oc-bracket', 2.4) +
      lineEl(42, 50, 42, 125, 'oc-bracket', 2.4) +
      lineEl(42, 125, 60, 125, 'oc-bracket', 2.4) +
      '<rect x="80" y="55" width="190" height="66" rx="12" class="oc-schematic-box"/>' +
      '<text x="175" y="88" text-anchor="middle" dominant-baseline="middle" class="oc-schematic-text" font-size="16">' + esc(unitLabel) + '</text>' +
      lineEl(270, 88, 300, 88, 'oc-bond', 2.6) +
      lineEl(300, 50, 320, 50, 'oc-bracket', 2.4) +
      lineEl(320, 50, 320, 125, 'oc-bracket', 2.4) +
      lineEl(320, 125, 300, 125, 'oc-bracket', 2.4) +
      '<text x="336" y="122" text-anchor="middle" class="oc-atom" font-size="16">n</text>' +
      (linkLabel ? textEl(210, 158, linkLabel, 'oc-schematic-note', 14) : '');
    return svgOpen(0, 0, 380, 185, label, 'data-kind="schematic" data-sugar="' + esc(kind) + '"') + content2 + '</svg>';
  }

  /* ------------------------------------------------------------------
   * グルコース・フルクトースの投影式
   * ------------------------------------------------------------------ */

  function renderFischer(spec, label) {
    var sugar = spec.sugar || 'glucose';
    var W = 380, H = 360;
    var cxs = 190;
    var ys = [52, 98, 144, 190, 236, 282];
    var out = '';
    // 縦の炭素鎖
    out += lineEl(cxs, ys[0] + 12, cxs, ys[5] - 12, 'oc-bond', 2.4);
    // C1
    out += textEl(cxs, ys[0] - 8, sugar === 'glucose' ? 'CHO' : 'CH₂OH', 'oc-atom', 21);
    // C2
    if (sugar === 'glucose') {
      out += lineEl(125, ys[1], 255, ys[1], 'oc-bond', 2.2);
      out += textEl(275, ys[1], 'OH', 'oc-atom', 20);
      out += textEl(105, ys[1], 'H', 'oc-h', 19);
    } else {
      // フルクトースのC2は主鎖上の炭素。C=OのOは主鎖の外側に別描画する。
      var c2 = { x: cxs, y: ys[1] };
      var o2 = { x: cxs + 55, y: ys[1] };
      out += textEl(c2.x, c2.y, 'C', 'oc-atom', 21, 'data-carbonyl="C2"');
      out += drawBondLine(c2, o2, 2, 12, 4, 'oc-bond');
      out += textEl(o2.x + 8, o2.y, 'O', 'oc-atom', 20, 'data-el="O"');
    }
    // C3-C5
    var pattern = [{ oh: 'left', h: 'right' }, { oh: 'right', h: 'left' }, { oh: 'right', h: 'left' }];
    // グルコース・フルクトースとも C3 OH左, C4 OH右, C5 OH右
    for (var i = 0; i < 3; i++) {
      var y = ys[i + 2];
      out += lineEl(125, y, 255, y, 'oc-bond', 2.2);
      var ohRight = pattern[i].oh === 'right';
      out += textEl(ohRight ? 275 : 105, y, 'OH', 'oc-atom', 20);
      out += textEl(ohRight ? 105 : 275, y, 'H', 'oc-h', 19);
    }
    // C6
    out += textEl(cxs, ys[5] + 14, 'CH₂OH', 'oc-atom', 21);
    out += textEl(cxs, 335, 'フィッシャー投影式', 'oc-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="fischer" data-sugar="' + esc(sugar) + '"') + out + '</svg>';
  }

  function renderHaworth(spec, label) {
    var anomer = spec.anomer || 'alpha';
    var stereo = spec.stereo || {};
    var W = 470, H = 320;
    var O = { x: 270, y: 70 };
    var C1 = { x: 345, y: 105 };
    var C2 = { x: 325, y: 180 };
    var C3 = { x: 238, y: 205 };
    var C4 = { x: 160, y: 180 };
    var C5 = { x: 140, y: 105 };
    var out = '';
    // 環の結合（前側は太線）
    out += lineEl(O.x, O.y, C1.x, C1.y, 'oc-bond', 2.3);
    out += lineEl(C1.x, C1.y, C2.x, C2.y, 'oc-bond', 2.3);
    out += lineEl(C2.x, C2.y, C3.x, C3.y, 'oc-bond oc-bond--front', 4.4);
    out += lineEl(C3.x, C3.y, C4.x, C4.y, 'oc-bond oc-bond--front', 4.4);
    out += lineEl(C4.x, C4.y, C5.x, C5.y, 'oc-bond', 2.3);
    out += lineEl(C5.x, C5.y, O.x, O.y, 'oc-bond', 2.3);
    out += textEl(O.x, O.y, 'O', 'oc-atom', 21, 'data-ring-atom="O"');
    // 環の炭素番号
    out += textEl(C1.x - 18, C1.y - 12, '1', 'oc-ring-num', 12);
    out += textEl(C2.x - 16, C2.y - 13, '2', 'oc-ring-num', 12);
    out += textEl(C3.x, C3.y - 16, '3', 'oc-ring-num', 12);
    out += textEl(C4.x + 16, C4.y - 13, '4', 'oc-ring-num', 12);
    out += textEl(C5.x + 18, C5.y - 12, '5', 'oc-ring-num', 12);

    function sub(x, y, dx, dy, text, cls) {
      var tx = x + dx, ty = y + dy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ax = x + dx / len * 14, ay = y + dy / len * 14;
      var bx = tx - dx / len * 10, by = ty - dy / len * 10;
      return lineEl(ax, ay, bx, by, 'oc-bond', 2.0) + textEl(tx, ty, text, cls || 'oc-atom', 18);
    }

    // C1: αは下、βは上（stereo.c1があれば優先）
    var c1Down = (stereo.c1 || (anomer === 'alpha' ? 'down' : 'up')) === 'down';
    out += sub(C1.x, C1.y, 34, c1Down ? 48 : -48, 'OH', 'oc-atom oc-anomer');
    out += sub(C1.x, C1.y, -22, c1Down ? -40 : 40, 'H', 'oc-h');
    // C2 OH下 / H上（stereoに従う）
    var c2Down = (stereo.c2 || 'down') === 'down';
    out += sub(C2.x, C2.y, 0, c2Down ? 46 : -46, 'OH', 'oc-atom');
    out += sub(C2.x, C2.y, -20, c2Down ? -38 : 38, 'H', 'oc-h');
    // C3 OH上 / H下
    var c3Up = (stereo.c3 || 'up') === 'up';
    out += sub(C3.x, C3.y, 0, c3Up ? -46 : 46, 'OH', 'oc-atom');
    out += sub(C3.x, C3.y, 0, c3Up ? 44 : -44, 'H', 'oc-h');
    // C4 OH下 / H上
    var c4Down = (stereo.c4 || 'down') === 'down';
    out += sub(C4.x, C4.y, 0, c4Down ? 46 : -46, 'OH', 'oc-atom');
    out += sub(C4.x, C4.y, c4Down ? 20 : -20, c4Down ? -38 : 38, 'H', 'oc-h');
    // C5 CH2OH上 / H下
    var c5Up = (stereo.c5ch2oh || 'up') === 'up';
    if (c5Up) {
      out += lineEl(C5.x, C5.y, 108, 62, 'oc-bond', 2.0);
      out += textEl(92, 52, 'CH₂OH', 'oc-atom', 18);
      out += sub(C5.x, C5.y, 14, 40, 'H', 'oc-h');
    } else {
      out += lineEl(C5.x, C5.y, 108, 148, 'oc-bond', 2.0);
      out += textEl(92, 158, 'CH₂OH', 'oc-atom', 18);
      out += sub(C5.x, C5.y, 14, -40, 'H', 'oc-h');
    }
    out += textEl(W / 2, 292, 'ハース投影式', 'oc-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="haworth" data-anomer="' + esc(anomer) + '" data-c1oh="' + (c1Down ? 'down' : 'up') +
      '" data-c2oh="' + (c2Down ? 'down' : 'up') + '" data-c3oh="' + (c3Up ? 'up' : 'down') +
      '" data-c4oh="' + (c4Down ? 'down' : 'up') + '" data-c5ch2oh="' + (c5Up ? 'up' : 'down') + '"') + out + '</svg>';
  }

  /* ------------------------------------------------------------------
   * 構造の分子式・検証
   * ------------------------------------------------------------------ */

  function addCount(counts, el, n) {
    counts[el] = (counts[el] || 0) + n;
  }

  function formulaFromCounts(counts) {
    var order = [];
    if (counts.C) order.push('C');
    if (counts.H) order.push('H');
    Object.keys(counts).sort().forEach(function (el) {
      if (el !== 'C' && el !== 'H' && counts[el]) order.push(el);
    });
    return order.map(function (el) {
      return el + (counts[el] === 1 ? '' : counts[el]);
    }).join('');
  }

  function formulaOfGraph(g) {
    var counts = {};
    g.atoms.forEach(function (a) {
      addCount(counts, a.el, 1);
      if (a.h) addCount(counts, 'H', a.h);
    });
    return formulaFromCounts(counts);
  }

  function formulaFromComposition(comp) {
    var counts = {};
    Object.keys(comp || {}).forEach(function (el) { counts[el] = comp[el]; });
    return formulaFromCounts(counts);
  }

  function formulaOfStructure(spec) {
    if (!spec) return null;
    if (isGraphSpec(spec)) return formulaOfGraph(buildStructure(spec));
    if (spec.type === 'ring-sub' || spec.type === 'condensed' || spec.type === 'projection' || spec.type === 'schematic' || spec.type === 'triglyceride') {
      return formulaFromComposition(spec.composition);
    }
    if (spec.type === 'polymer') return spec.formulaReference || spec.unitFormula || null;
    return null;
  }

  function unitFormula(formula) {
    if (!formula) return formula;
    var m = String(formula).match(/^\((.+)\)n$/);
    return m ? m[1] : String(formula);
  }

  function formulaMatches(computed, declared) {
    if (!computed || !declared) return false;
    return computed === unitFormula(declared);
  }

  function checkValence(g) {
    var errors = [];
    g.atoms.forEach(function (a, i) {
      if (!VALENCE[a.el]) return;
      var valence = VALENCE[a.el];
      if (a.charge === '+') valence += 1;
      if (a.charge === '-') valence -= 1;
      var sum = 0;
      g.bonds.forEach(function (b) {
        if (b.a === i || b.b === i) sum += b.order;
      });
      if (sum + (a.h || 0) !== valence) {
        errors.push('原子' + i + '(' + a.el + ')の結合価が不正: ' + (sum + (a.h || 0)) + ' != ' + valence);
      }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function verificationForSpec(spec, formulaStatus) {
    if (!spec) return { level: 'unknown', short: '未確認', label: '構造データ未確認' };
    if (formulaStatus === 'variable') {
      return { level: 'composition', short: '一般式', label: '一般式（R依存）の基準単位と登録データの整合' };
    }
    if (isGraphSpec(spec)) {
      return { level: 'atom', short: '原子レベル', label: '原子数・結合価・分子式' };
    }
    if (spec.type === 'ring-sub') {
      return { level: 'composition', short: '分子式整合', label: '環＋置換ラベルの分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'projection') {
      return { level: 'composition', short: '投影式', label: '投影式の分子式・立体情報整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'condensed') {
      return { level: 'composition', short: '簡略式', label: '簡略式の分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'triglyceride') {
      return { level: 'composition', short: '構造式', label: 'トリグリセリドの分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'polymer') {
      return { level: 'composition', short: '重合体', label: '繰り返し単位の一般式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'schematic') {
      return { level: 'composition', short: '模式図', label: '模式図の分子式整合（描画の見た目は自動検証の対象外）' };
    }
    return { level: 'unknown', short: '未確認', label: '構造データ未確認' };
  }

  function validate(compound) {
    var errors = [];
    if (!compound) return { ok: false, errors: ['化合物データがありません'], verification: verificationForSpec(null, 'fixed') };
    if (compound.verified === false) errors.push('出典・構造の確認が未完了');
    var variableFormula = !!compound.formulaVariable;
    var figures = compound.figures && compound.figures.length
      ? compound.figures
      : [{ structure: compound.structure }];
    if (!figures.length || !figures[0].structure) errors.push('構造データがありません');
    var computed = null;
    var formulaStatus = variableFormula ? 'variable' : 'fixed';
    figures.forEach(function (fig, idx) {
      var s = fig.structure;
      if (!s) { errors.push('図' + (idx + 1) + 'の構造データがありません'); return; }
      var f;
      try {
        f = formulaOfStructure(s);
      } catch (e) {
        errors.push('図' + (idx + 1) + ': ' + e.message);
        return;
      }
      if (!computed) computed = f;
      if (variableFormula) {
        var reference = compound.formulaReference || (s.type === 'polymer' ? (s.formulaReference || s.unitFormula) : null);
        if (!reference) {
          errors.push('図' + (idx + 1) + ': 一般式の基準単位が未登録');
        } else if (f !== reference) {
          errors.push('図' + (idx + 1) + 'の一般式の基準単位が不一致: ' + f + ' != ' + reference);
        }
      } else if (!formulaMatches(f, compound.formula)) {
        errors.push('図' + (idx + 1) + 'の分子式が不一致: ' + f + ' != ' + compound.formula);
      }
      if (isGraphSpec(s)) {
        try {
          var v = checkValence(buildStructure(s));
          if (!v.ok) errors.push.apply(errors, v.errors);
        } catch (e2) {
          errors.push('図' + (idx + 1) + ': ' + e2.message);
        }
      }
    });
    var firstSpec = figures[0] && figures[0].structure;
    return {
      ok: errors.length === 0,
      computed: computed,
      declared: compound.formula,
      formulaStatus: formulaStatus,
      verification: verificationForSpec(firstSpec, formulaStatus),
      errors: errors
    };
  }

  function validateAll(compounds) {
    var out = {};
    Object.keys(compounds || {}).forEach(function (id) {
      out[id] = validate(compounds[id]);
    });
    return out;
  }

  /* ------------------------------------------------------------------
   * 公開レンダリング
   * ------------------------------------------------------------------ */

  function renderStructure(spec, label) {
    try {
      if (isGraphSpec(spec)) return renderGraph(buildStructure(spec), label);
      if (spec.type === 'ring-sub') return renderRingSub(spec, label);
      if (spec.type === 'condensed') return renderCondensed(spec, label);
      if (spec.type === 'triglyceride') return renderTriglyceride(spec, label);
      if (spec.type === 'polymer') return renderPolymer(spec, label);
      if (spec.type === 'schematic') return renderSchematic(spec, label);
      if (spec.type === 'projection') {
        if (spec.kind === 'fischer') return renderFischer(spec, label);
        if (spec.kind === 'haworth') return renderHaworth(spec, label);
      }
      return '<svg class="oc-svg" viewBox="0 0 360 120" role="img" aria-label="' + esc(label || '構造式') + '"><text x="180" y="60" text-anchor="middle" class="oc-atom" font-size="16">構造データ未登録</text></svg>';
    } catch (e) {
      return '<svg class="oc-svg" viewBox="0 0 360 120" role="img" aria-label="構造式を表示できません" data-error="1"><text x="180" y="60" text-anchor="middle" class="oc-atom" font-size="15">構造式を表示できません</text></svg>';
    }
  }

  function renderCompound(compound, opts) {
    opts = opts || {};
    var figures = compound.figures && compound.figures.length
      ? compound.figures
      : [{ structure: compound.structure, label: '', note: '' }];
    return figures.map(function (fig, idx) {
      var name = compound.name || '';
      var figLabel = fig.label ? name + '（' + fig.label + '）' : name;
      var svg = renderStructure(fig.structure, figLabel + 'の構造式');
      var autoNote = '';
      if (!fig.note && fig.structure) {
        if (fig.structure.type === 'condensed') autoNote = '簡略構造式（すべての原子・結合を線で示したものではありません）。';
        else if (fig.structure.type === 'triglyceride') autoNote = 'グリセリン骨格と脂肪酸鎖を簡略化して表示しています。';
        else if (fig.structure.type === 'polymer') autoNote = '繰り返し単位と一般式で表示しています。重合度 n は特定しません。';
        else if (fig.structure.type === 'schematic') autoNote = '模式図です。立体配置の詳細は省略しています。';
      }
      var note = fig.note || autoNote;
      return '<figure class="oc-fig" data-fig="' + idx + '">' + svg +
        (fig.label ? '<figcaption class="oc-fig__caption">' + esc(fig.label) + '</figcaption>' : '') +
        (note ? '<p class="oc-fig__note">' + esc(note) + '</p>' : '') +
        '</figure>';
    }).join('');
  }

  function formatFormula(plain) {
    if (!plain) return '情報未登録';
    var out = '';
    for (var i = 0; i < plain.length; i++) {
      var ch = plain[i];
      if (/[0-9]/.test(ch) && i > 0 && /[A-Za-z)0-9]/.test(plain[i - 1])) {
        out += SUB_DIGIT[Number(ch)];
      } else if (ch === 'n' && i > 0 && plain[i - 1] === ')') {
        out += 'ₙ';
      } else {
        out += ch;
      }
    }
    return out;
  }

  function buildGroupPreview(groupId, label) {
    if (groupId === 'none') {
      return '<svg class="oc-svg oc-group-svg" viewBox="0 0 220 100" role="img" aria-label="追加なし"><text x="110" y="50" text-anchor="middle" dominant-baseline="middle" class="oc-group-none" font-size="18">追加なし</text></svg>';
    }
    var g = { atoms: [atom('C', 55, 55, 1, { label: 'R' })], bonds: [], mode: 'condensed', width: 220, height: 100 };
    addGroup(g, 0, groupId, 0);
    // 左端は「炭素骨格との結合位置」を表すR。Hは描かない。
    g.atoms[0].label = 'R';
    return renderGraph(g, label || '官能基');
  }

  return {
    SKELETONS: SKELETONS,
    buildStructure: buildStructure,
    formulaOfStructure: formulaOfStructure,
    formulaOfGraph: formulaOfGraph,
    formulaFromComposition: formulaFromComposition,
    formulaFromCounts: formulaFromCounts,
    formulaMatches: formulaMatches,
    unitFormula: unitFormula,
    validate: validate,
    validateAll: validateAll,
    renderStructure: renderStructure,
    renderCompound: renderCompound,
    formatFormula: formatFormula,
    renderGroupPreview: buildGroupPreview,
    // テスト用
    _internal: {
      chooseDirection: chooseDirection,
      hDirections: hDirections,
      checkValence: checkValence,
      labelFor: labelFor
    }
  };
});
