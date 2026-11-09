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

  // 原子価は複数の値を許容する（S は 2/4/6、P は 3/5）。ハロゲンも同じ表で扱う。
  var VALENCES = {
    C: [4], N: [3], O: [2], F: [1], Cl: [1], Br: [1], I: [1],
    Na: [1], S: [2, 4, 6], P: [3, 5], Si: [4], B: [3]
  };
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
    s.hexane = chainGraph(6, { h: [3, 2, 2, 2, 2, 3], mode: 'condensed', width: 460, height: 250 });
    s['2-methylpentane'] = {
      atoms: [
        atom('C', 40, 142, 3), atom('C', 110, 98, 1), atom('C', 180, 142, 2),
        atom('C', 250, 98, 2), atom('C', 320, 142, 3), atom('C', 110, 30, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(3, 4, 1), bond(1, 5, 1)],
      mode: 'condensed', width: 420, height: 260
    };
    s['3-methylpentane'] = {
      atoms: [
        atom('C', 40, 142, 3), atom('C', 110, 98, 2), atom('C', 180, 142, 1),
        atom('C', 250, 98, 2), atom('C', 320, 142, 3), atom('C', 180, 214, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(3, 4, 1), bond(2, 5, 1)],
      mode: 'condensed', width: 420, height: 280
    };
    s['2,2-dimethylbutane'] = {
      atoms: [
        atom('C', 60, 120, 3), atom('C', 140, 120, 0), atom('C', 220, 120, 2),
        atom('C', 300, 120, 3), atom('C', 140, 42, 3), atom('C', 140, 198, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(1, 4, 1), bond(1, 5, 1)],
      mode: 'condensed', width: 400, height: 280
    };
    s['2,3-dimethylbutane'] = {
      atoms: [
        atom('C', 50, 120, 3), atom('C', 120, 80, 1), atom('C', 200, 80, 1),
        atom('C', 270, 120, 3), atom('C', 120, 168, 3), atom('C', 200, 168, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(1, 4, 1), bond(2, 5, 1)],
      mode: 'condensed', width: 400, height: 280
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
    } else if (group === 'br') {
      var br = addAtom('Br', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, br, 1));
    } else if (group === 'i') {
      var io = addAtom('I', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, io, 1));
    } else if (group === 'cn') {
      var cy = addAtom('C', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, cy, 1));
      var ni = addAtom('N', p.x + 44 * u.x, p.y + 44 * u.y, 0);
      g.bonds.push(bond(cy, ni, 3));
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
        height: spec.height || 260,
        skeletal: !!spec.skeletal
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

  function chargeLabel(charge) {
    var map = { '+': '⁺', '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return String(charge == null ? '' : charge).split('').map(function (ch) { return map[ch] || ch; }).join('');
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

  function drawBondLine(a, b, order, trimA, trimB, cls, coordinate) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    var x1 = a.x + ux * trimA, y1 = a.y + uy * trimA;
    var x2 = b.x - ux * trimB, y2 = b.y - uy * trimB;
    if (coordinate) {
      // 金属—配位原子の結合は三重結合ではなく、点線の配位結合として描く。
      return lineEl(x1, y1, x2, y2, (cls || 'oc-bond') + ' oc-bond--coordinate', 2.2);
    }
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
    var skeletal = !!g.skeletal;
    function radiusOf(a) {
      if (skeletal && a.el === 'C' && !a.charge && !a.label) return 0;
      if (skeletal && a.el !== 'C') return Math.max(atomRadius(a, mode), 17);
      return atomRadius(a, mode);
    }
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
        var aa = trimPoint(a, c, radiusOf(a));
        var cc = trimPoint(c, a, radiusOf(c));
        bonds += drawRingBond(aa, cc, b.order, b.ringCenter || graphCenter);
      } else {
        bonds += drawBondLine(a, c, b.order, radiusOf(a), radiusOf(c), null, b.coordinate);
      }
    });

    var hBonds = '', hLabels = '';
    g.atoms.forEach(function (a, i) {
      hPoints[i].forEach(function (p) {
        var dx = p.x - a.x, dy = p.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ax = a.x + dx / len * (radiusOf(a) - 1);
        var ay = a.y + dy / len * (radiusOf(a) - 1);
        var bx = p.x - dx / len * 8;
        var by = p.y - dy / len * 8;
        hBonds += lineEl(ax, ay, bx, by, 'oc-bond oc-bond--h', 2.1);
        hLabels += textEl(p.x, p.y, 'H', 'oc-h', 17, 'data-el="H"');
      });
    });

    var atoms = '';
    g.atoms.forEach(function (a) {
      if (skeletal && a.el === 'C' && !a.charge && !a.label) return;
      var lab = labelFor(a, mode);
      var fs = (skeletal || mode !== 'condensed') ? 23 : 19;
      atoms += textEl(a.x, a.y, lab, 'oc-atom', fs, 'data-el="' + esc(a.el) + '"');
      if (a.charge) {
        atoms += textEl(a.x + (fs * 0.55), a.y - (fs * 0.55), chargeLabel(a.charge), 'oc-charge', 13, 'data-charge="' + esc(a.charge) + '"');
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
    var chains = spec.chains && spec.chains.length === 3
      ? spec.chains
      : ['C₁₇H₃₅', 'C₁₇H₃₅', 'C₁₇H₃₅'];
    var out = '';
    // グリセリン骨格のC-C結合（3つの炭素を縦に明示）
    out += lineEl(x, ys[0] + 13, x, ys[1] - 13, 'oc-bond oc-bond--backbone', 2.8);
    out += lineEl(x, ys[1] + 13, x, ys[2] - 13, 'oc-bond oc-bond--backbone', 2.8);
    for (var i = 0; i < 3; i++) {
      out += textEl(x, ys[i], labels[i], 'oc-condensed', 19);
      out += lineEl(x + 13, ys[i], x + 42, ys[i], 'oc-bond', 2.6);
      out += '<text x="' + (x + 48) + '" y="' + ys[i] + '" text-anchor="start" dominant-baseline="middle" class="oc-condensed" font-size="17" data-chain="fatty-acid">' +
        esc('O—CO—' + chains[i]) + '</text>';
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

  function renderVinylon(spec, label) {
    var W = 480, H = 220;
    var out = '';
    // 部分ホルマール化PVAの模式図（アセタール環と残存OH）
    out += lineEl(50, 130, 130, 130, 'oc-bond', 2.6);
    out += lineEl(250, 130, 300, 155, 'oc-bond', 2.6);
    out += lineEl(300, 155, 360, 130, 'oc-bond', 2.6);
    out += lineEl(360, 130, 410, 130, 'oc-bond', 2.6);
    // 6員アセタール環: C1-C2-C3-O-CH2-O
    out += lineEl(130, 130, 190, 95, 'oc-bond', 2.6);
    out += lineEl(190, 95, 250, 130, 'oc-bond', 2.6);
    out += lineEl(250, 130, 250, 65, 'oc-bond', 2.6);
    out += lineEl(250, 65, 190, 30, 'oc-bond', 2.6);
    out += lineEl(190, 30, 130, 65, 'oc-bond', 2.6);
    out += lineEl(130, 65, 130, 130, 'oc-bond', 2.6);
    out += textEl(130, 130, 'CH', 'oc-condensed', 17);
    out += textEl(190, 95, 'CH₂', 'oc-condensed', 17);
    out += textEl(250, 130, 'CH', 'oc-condensed', 17);
    out += textEl(250, 65, 'O', 'oc-atom', 19);
    out += textEl(190, 30, 'CH₂', 'oc-condensed', 17);
    out += textEl(130, 65, 'O', 'oc-atom', 19);
    out += textEl(300, 155, 'CH₂', 'oc-condensed', 17);
    out += textEl(360, 130, 'CH', 'oc-condensed', 17);
    // 残存OH（右側の閉括弧と接触しないよう環の内側上方へ配置）
    out += lineEl(360, 130, 382, 105, 'oc-bond', 2.2);
    out += textEl(392, 92, 'OH', 'oc-atom', 18);
    out += textEl(50, 130, '—', 'oc-condensed', 18);
    // 括弧と重合度
    out += lineEl(40, 70, 28, 70, 'oc-bracket', 2.4);
    out += lineEl(28, 70, 28, 170, 'oc-bracket', 2.4);
    out += lineEl(28, 170, 40, 170, 'oc-bracket', 2.4);
    out += lineEl(420, 70, 432, 70, 'oc-bracket', 2.4);
    out += lineEl(432, 70, 432, 170, 'oc-bracket', 2.4);
    out += lineEl(432, 170, 420, 170, 'oc-bracket', 2.4);
    out += textEl(444, 166, 'n', 'oc-atom', 16);
    out += textEl(W / 2, 205, '部分ホルマール化PVA（アセタール環＋残存OH）', 'oc-projection-note', 12);
    return svgOpen(0, 0, W, H, label, 'data-kind="schematic" data-sugar="vinylon"') + out + '</svg>';
  }

  function schematicSugarRing(cx, cy, r, oIndex) {
    var pts = ringCoords(6, cx, cy, r, 0);
    var out = '';
    for (var i = 0; i < 6; i++) {
      var a = pts[i], b = pts[(i + 1) % 6];
      out += lineEl(a.x, a.y, b.x, b.y, 'oc-bond oc-schematic-ring', 2.2);
    }
    out += textEl(pts[oIndex].x, pts[oIndex].y, 'O', 'oc-atom', 18);
    return out;
  }

  function schematicFuranoseRing() {
    var C2 = { x: 255, y: 101 };
    var O = { x: 300, y: 60 };
    var C5 = { x: 345, y: 101 };
    var C4 = { x: 320, y: 160 };
    var C3 = { x: 270, y: 150 };
    var out = '';
    out += lineEl(C2.x, C2.y, O.x, O.y, 'oc-bond oc-schematic-ring', 2.2);
    out += lineEl(O.x, O.y, C5.x, C5.y, 'oc-bond oc-schematic-ring', 2.2);
    out += lineEl(C5.x, C5.y, C4.x, C4.y, 'oc-bond oc-schematic-ring', 2.2);
    out += lineEl(C4.x, C4.y, C3.x, C3.y, 'oc-bond oc-schematic-ring', 2.2);
    out += lineEl(C3.x, C3.y, C2.x, C2.y, 'oc-bond oc-schematic-ring', 2.2);
    out += textEl(O.x, O.y, 'O', 'oc-atom', 18);
    return out;
  }

  function renderSchematic(spec, label) {
    var kind = spec.kind;
    if (kind === 'nucleotide-atp') {
      // ATPはアデニン—リボース—三リン酸の模式図。糖環の連続図には落とさない。
      // 三リン酸は P—O—P—O—P で接続し、各PのP=OとO⁻を明示する（ATP⁴⁻）。
      var atp = '';
      atp += textEl(78, 62, 'アデニン', 'oc-schematic-text', 14);
      atp += textEl(78, 84, '（塩基）', 'oc-schematic-note', 11);
      atp += lineEl(120, 78, 166, 78, 'oc-bond', 2.4);
      atp += textEl(207, 62, 'リボース', 'oc-schematic-text', 14);
      atp += textEl(207, 84, '（五炭糖）', 'oc-schematic-note', 11);
      atp += lineEl(244, 78, 286, 78, 'oc-bond', 2.4);
      atp += textEl(300, 72, 'O', 'oc-atom', 17);
      atp += lineEl(314, 78, 338, 78, 'oc-bond', 2.4);
      // P1
      atp += textEl(356, 78, 'P', 'oc-atom', 19);
      atp += lineEl(352, 62, 352, 44, 'oc-bond', 2.2);
      atp += lineEl(360, 62, 360, 44, 'oc-bond', 2.2);
      atp += textEl(356, 32, 'O', 'oc-atom', 15);
      atp += lineEl(356, 94, 356, 112, 'oc-bond', 2.2);
      atp += textEl(356, 128, 'O⁻', 'oc-schematic-note', 12);
      // O bridge
      atp += lineEl(370, 78, 394, 78, 'oc-bond', 2.4);
      atp += textEl(406, 72, 'O', 'oc-atom', 17);
      atp += lineEl(420, 78, 444, 78, 'oc-bond', 2.4);
      // P2
      atp += textEl(462, 78, 'P', 'oc-atom', 19);
      atp += lineEl(458, 62, 458, 44, 'oc-bond', 2.2);
      atp += lineEl(466, 62, 466, 44, 'oc-bond', 2.2);
      atp += textEl(462, 32, 'O', 'oc-atom', 15);
      atp += lineEl(462, 94, 462, 112, 'oc-bond', 2.2);
      atp += textEl(462, 128, 'O⁻', 'oc-schematic-note', 12);
      // O bridge
      atp += lineEl(476, 78, 500, 78, 'oc-bond', 2.4);
      atp += textEl(512, 72, 'O', 'oc-atom', 17);
      atp += lineEl(526, 78, 550, 78, 'oc-bond', 2.4);
      // P3 terminal
      atp += textEl(568, 78, 'P', 'oc-atom', 19);
      atp += lineEl(564, 62, 564, 44, 'oc-bond', 2.2);
      atp += lineEl(572, 62, 572, 44, 'oc-bond', 2.2);
      atp += textEl(568, 32, 'O', 'oc-atom', 15);
      atp += lineEl(568, 94, 568, 112, 'oc-bond', 2.2);
      atp += textEl(568, 128, 'O⁻', 'oc-schematic-note', 12);
      atp += lineEl(580, 78, 604, 78, 'oc-bond', 2.2);
      atp += textEl(620, 72, 'O⁻', 'oc-schematic-note', 12);
      atp += textEl(330, 166, '三リン酸鎖（P—O—P—O—P、各PにP=O）', 'oc-schematic-note', 13);
      atp += textEl(330, 190, '生理的pHでは ATP⁴⁻（O⁻ 4個）として存在し、Mg²⁺と錯体をつくる', 'oc-schematic-note', 12);
      return svgOpen(0, 0, 680, 220, label, 'data-kind="schematic" data-nucleotide="atp" data-phosphate-chain="P-O-P-O-P" data-phosphate-charge="4-"') + atp + '</svg>';
    }
    if (kind === 'cyclohexane-hexachloride') {
      // C6H6Cl6 は1,2,3,4,5,6-六置換体の立体異性体群。特定異性体の構造を描いたと誤解させない。
      var hch = '';
      hch += textEl(210, 54, 'C₆H₆Cl₆', 'oc-schematic-text', 24);
      hch += textEl(210, 86, 'ベンゼンへの塩素付加で生じる1,2,3,4,5,6-六置換体', 'oc-schematic-note', 13);
      hch += textEl(210, 110, 'α・β・γ等は立体異性体（γ-異性体＝リンデンを含む）', 'oc-schematic-note', 12);
      hch += textEl(210, 134, '六置換の位置は共通で、特定の1立体異性体を表す図ではない', 'oc-schematic-note', 12);
      return svgOpen(0, 0, 420, 160, label, 'data-kind="schematic" data-isomer-class="hch"') + hch + '</svg>';
    }
    if (kind === 'vinylon') return renderVinylon(spec, label);
    if (kind === 'dna' || kind === 'rna') {
      var isDna = kind === 'dna';
      var bases = isDna ? ['A', 'T', 'G', 'C'] : ['A', 'U', 'G', 'C'];
      var complement = isDna ? { A: 'T', T: 'A', G: 'C', C: 'G' } : { A: 'U', U: 'A', G: 'C', C: 'G' };
      var content = '';
      // 2本の糖—リン酸鎖（模式）と塩基対
      content += lineEl(55, 72, 365, 72, 'oc-bond oc-bond--backbone', 3.2);
      content += lineEl(55, 128, 365, 128, 'oc-bond oc-bond--backbone', 3.2);
      content += textEl(35, 72, '5′', 'oc-schematic-note', 13);
      content += textEl(382, 72, '3′', 'oc-schematic-note', 13);
      content += textEl(35, 128, '3′', 'oc-schematic-note', 13);
      content += textEl(382, 128, '5′', 'oc-schematic-note', 13);
      for (var i = 0; i < 4; i++) {
        var x = 110 + i * 60;
        content += lineEl(x, 78, x, 122, 'oc-bond oc-bond--h', 2.0);
        content += textEl(x, 62, bases[i], 'oc-atom', 17);
        content += textEl(x, 142, complement[bases[i]], 'oc-atom', 17);
      }
      content += textEl(210, 172, isDna ? 'デオキシリボース—リン酸鎖／塩基 A-T, G-C' : 'リボース—リン酸鎖／塩基 A-U, G-C', 'oc-schematic-note', 13);
      return svgOpen(0, 0, 420, 195, label, 'data-kind="schematic" data-sugar="' + esc(kind) + '"') + content + '</svg>';
    }
    if (kind === 'isomaltose') {
      // α-1,6: 左をdonor、右をacceptorとして縦にずらす。
      // donor C5（環頂点）→CH2OH up、donor C1（環頂点）→グリコシドO down
      // →acceptor C6（環外CH2）→acceptor C5（環頂点）。
      // 六員環の頂点定義: index0=右, 1=右下, 2=左下, 3=左,
      // 4=左上, 5=右上。両環ともOはindex5。
      var donorC = ringCoords(6, 140, 130, 90, 0);
      var acceptC = ringCoords(6, 385, 346, 90, 0);
      var donorC1 = donorC[0];       // (230,130)
      var donorC5 = donorC[4];       // (95,52)
      var acceptC5 = acceptC[4];     // (340,268)
      var ch2oh = { x: 95, y: 10 };
      var glyO = { x: 230, y: 220 };
      var acceptC6 = { x: 340, y: 220 };
      var iso = schematicSugarRing(140, 130, 90, 5) + schematicSugarRing(385, 346, 90, 5);
      // donor C5からCH2OHを上向きに
      iso += lineEl(donorC5.x, donorC5.y, ch2oh.x, ch2oh.y + 12, 'oc-bond', 2.4);
      iso += textEl(ch2oh.x, ch2oh.y, 'CH₂OH', 'oc-condensed', 16);
      // donor C1からグリコシドOを下向きに（α-DのC1置換基down）
      iso += lineEl(donorC1.x, donorC1.y, glyO.x, glyO.y - 12, 'oc-bond', 2.4);
      iso += textEl(glyO.x, glyO.y, 'O', 'oc-atom', 19);
      // Oからacceptorの環外C6へ、C6から環頂点C5へ
      iso += lineEl(glyO.x + 12, glyO.y, acceptC6.x - 12, acceptC6.y, 'oc-bond', 2.4);
      iso += textEl(acceptC6.x, acceptC6.y, 'CH₂', 'oc-condensed', 17);
      iso += lineEl(acceptC6.x, acceptC6.y + 12, acceptC5.x, acceptC5.y, 'oc-bond', 2.4);
      iso += textEl(donorC5.x - 14, donorC5.y - 10, 'C5', 'oc-ring-num', 12);
      iso += textEl(donorC1.x + 12, donorC1.y - 10, 'C1', 'oc-ring-num', 12);
      iso += textEl(glyO.x + 18, glyO.y - 60, 'α', 'oc-anomer', 16);
      iso += textEl(acceptC5.x + 18, acceptC5.y + 10, 'C5', 'oc-ring-num', 12);
      iso += textEl(acceptC6.x + 18, acceptC6.y - 10, 'C6', 'oc-ring-num', 12);
      iso += textEl(280, 455, 'α-1,6（donor C1↓—O—acceptor C6—C5）。受容体の還元末端C1はα/βを特定しない。', 'oc-schematic-note', 12);
      return svgOpen(0, 0, 560, 470, label, 'data-kind="schematic" data-sugar="isomaltose" data-linkage="alpha-1,6" data-anomer="alpha" data-exocyclic-c6="1" data-glycosidic="α-1,6" data-donor-c1="230,130" data-donor-c5="95,52" data-donor-ch2oh="95,10" data-glycosidic-o="230,220" data-acceptor-c6="340,220" data-acceptor-c5="340,268"') + iso + '</svg>';
    }
    if (kind === 'sucrose' || kind === 'maltose' || kind === 'lactose' || kind === 'cellobiose' || kind === 'trehalose') {
      var dis = {
        sucrose: { left: 'α-D-グルコース', right: 'β-D-フルクトフラノース', link: 'α-1,2', furanose: true, anomer: true, reducing: 'no' },
        maltose: { left: 'α-D-グルコース', right: 'D-グルコース', link: 'α-1,4', anomer: false, reducing: 'yes' },
        lactose: { left: 'β-D-ガラクトース', right: 'D-グルコース', link: 'β-1,4', anomer: false, reducing: 'yes' },
        cellobiose: { left: 'β-D-グルコース', right: 'β-D-グルコース', link: 'β-1,4', anomer: true, reducing: 'yes' },
        trehalose: { left: 'α-D-グルコース', right: 'α-D-グルコース', link: 'α,α-1,1', anomer: true, reducing: 'no' },
        isomaltose: { left: 'α-D-グルコース', right: 'D-グルコース', link: 'α-1,6', anomer: false, reducing: 'yes' }
      }[kind];
      var isSucrose = kind === 'sucrose';
      var content = schematicSugarRing(100, 101, 65, 1) +
        (dis.furanose ? schematicFuranoseRing() : schematicSugarRing(320, 101, 65, 5)) +
        '<text x="100" y="18" text-anchor="middle" class="oc-schematic-text" font-size="13">' + esc(dis.left) + '</text>' +
        '<text x="320" y="18" text-anchor="middle" class="oc-schematic-text" font-size="13">' + esc(dis.right) + '</text>' +
        lineEl(165, 101, 200, 101, 'oc-bond', 2.6) +
        lineEl(220, 101, 255, 101, 'oc-bond', 2.6) +
        textEl(210, 101, 'O', 'oc-atom', 21) +
        (dis.anomer ? textEl(180, 82, kind === 'trehalose' ? 'α' : (kind === 'cellobiose' ? 'β' : 'α'), 'oc-schematic-note', 14) +
          textEl(240, 82, kind === 'trehalose' ? 'α' : (kind === 'cellobiose' ? 'β' : 'β'), 'oc-schematic-note', 14) : '') +
        textEl(210, 132, dis.link, 'oc-schematic-note', 14) +
        textEl(210, 152, dis.reducing === 'yes' ? '還元性あり' : '非還元性', 'oc-schematic-note', 12);
      return svgOpen(0, 0, 420, 180, label, 'data-kind="schematic" data-sugar="' + esc(kind) +
        '" data-ring-count="2" data-glycosidic="' + esc(dis.link) + '" data-reducing="' + esc(dis.reducing) + '"' +
        (dis.furanose ? ' data-fructose-ring="furanose" data-anomer-glucose="alpha" data-anomer-fructose="beta"' :
          (kind === 'cellobiose' ? ' data-anomer="beta"' : (kind === 'trehalose' ? ' data-anomer="alpha,alpha"' : '')))) + content + '</svg>';
    }
    if (kind.indexOf('protein') === 0) {
      // タンパク質・酵素はアミノ酸配列と重合度で組成が変わるため、
      // 主鎖と側鎖Rの模式図だけを示し、固定の分子式は主張しない。
      var plabel = spec.unitLabel || 'アミノ酸単位 —NH—CH(R)—CO—';
      var pcontent = '';
      pcontent += lineEl(70, 100, 120, 70, 'oc-bond', 2.4);
      pcontent += lineEl(120, 70, 170, 100, 'oc-bond', 2.4);
      pcontent += lineEl(170, 100, 220, 70, 'oc-bond', 2.4);
      pcontent += lineEl(220, 70, 270, 100, 'oc-bond', 2.4);
      pcontent += lineEl(270, 100, 320, 70, 'oc-bond', 2.4);
      pcontent += textEl(95, 78, 'NH', 'oc-atom', 15);
      pcontent += textEl(145, 92, 'CO', 'oc-atom', 15);
      pcontent += textEl(195, 78, 'NH', 'oc-atom', 15);
      pcontent += textEl(245, 92, 'CO', 'oc-atom', 15);
      pcontent += textEl(120, 52, 'R', 'oc-atom', 15);
      pcontent += textEl(220, 52, 'R', 'oc-atom', 15);
      pcontent += textEl(195, 132, plabel, 'oc-schematic-note', 13);
      pcontent += textEl(195, 154, '側鎖R・配列・重合度に依存（組成不定）', 'oc-schematic-note', 12);
      pcontent += lineEl(50, 50, 34, 50, 'oc-bracket', 2.4);
      pcontent += lineEl(34, 50, 34, 140, 'oc-bracket', 2.4);
      pcontent += lineEl(34, 140, 50, 140, 'oc-bracket', 2.4);
      pcontent += lineEl(340, 50, 356, 50, 'oc-bracket', 2.4);
      pcontent += lineEl(356, 50, 356, 140, 'oc-bracket', 2.4);
      pcontent += lineEl(356, 140, 340, 140, 'oc-bracket', 2.4);
      return svgOpen(0, 0, 390, 175, label, 'data-kind="schematic" data-protein="1"') + pcontent + '</svg>';
    }
    // 多糖類: 糖環がグリコシド酸素で連なる模式図
    var unitLabel = spec.unitLabel || 'グルコース単位';
    var linkLabel = spec.linkLabel || '';
    var content2 = schematicSugarRing(80, 100, 38, 1) +
      schematicSugarRing(190, 100, 38, 1) +
      schematicSugarRing(300, 100, 38, 1) +
      lineEl(118, 100, 130, 100, 'oc-bond', 2.4) +
      textEl(135, 100, 'O', 'oc-atom', 18) +
      lineEl(140, 100, 152, 100, 'oc-bond', 2.4) +
      lineEl(228, 100, 240, 100, 'oc-bond', 2.4) +
      textEl(245, 100, 'O', 'oc-atom', 18) +
      lineEl(250, 100, 262, 100, 'oc-bond', 2.4) +
      '<text x="190" y="18" text-anchor="middle" class="oc-schematic-text" font-size="13">' + esc(unitLabel) + '</text>' +
      lineEl(60, 50, 42, 50, 'oc-bracket', 2.4) +
      lineEl(42, 50, 42, 150, 'oc-bracket', 2.4) +
      lineEl(42, 150, 60, 150, 'oc-bracket', 2.4) +
      lineEl(320, 50, 338, 50, 'oc-bracket', 2.4) +
      lineEl(338, 50, 338, 150, 'oc-bracket', 2.4) +
      lineEl(338, 150, 320, 150, 'oc-bracket', 2.4) +
      '<text x="352" y="146" text-anchor="middle" class="oc-atom" font-size="16">n</text>' +
      (linkLabel ? textEl(190, 168, linkLabel, 'oc-schematic-note', 13) : '');
    return svgOpen(0, 0, 380, 185, label, 'data-kind="schematic" data-sugar="' + esc(kind) +
      '" data-ring-count="3" data-glycosidic="' + esc(linkLabel) + '"') + content2 + '</svg>';
  }

  /* ------------------------------------------------------------------
   * グルコース・フルクトースの投影式
   * ------------------------------------------------------------------ */

  var FISCHER_STEREO = {
    glucose: { c2: 'right', c3: 'left', c4: 'right', c5: 'right' },
    galactose: { c2: 'right', c3: 'left', c4: 'left', c5: 'right' },
    mannose: { c2: 'left', c3: 'left', c4: 'right', c5: 'right' },
    ribose: { c2: 'right', c3: 'right', c4: 'right' },
    deoxyribose: { c2: 'none', c3: 'right', c4: 'right' },
    fructose: { c3: 'left', c4: 'right', c5: 'right' }
  };

  function fischerStereo(spec) {
    var sugar = spec.sugar || 'glucose';
    var base = FISCHER_STEREO[sugar] || FISCHER_STEREO.glucose;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(spec.stereo || {}).forEach(function (k) { out[k] = spec.stereo[k]; });
    return out;
  }

  function renderFischer(spec, label) {
    var sugar = spec.sugar || 'glucose';
    var ketose = !!spec.ketose || sugar === 'fructose';
    var carbons = spec.carbons || (sugar === 'ribose' || sugar === 'deoxyribose' ? 5 : 6);
    var stereo = fischerStereo(spec);
    var W = 380;
    var top = 52;
    var gap = 46;
    var ys = [];
    for (var i = 0; i < carbons; i++) ys.push(top + i * gap);
    var H = ys[carbons - 1] + 78;
    var cxs = 190;
    var out = '';
    // 縦の炭素鎖
    out += lineEl(cxs, ys[0] + 12, cxs, ys[carbons - 1] - 12, 'oc-bond', 2.4);
    // C1（アルドースは CHO、ケトースは CH₂OH）
    out += textEl(cxs, ys[0] - 8, ketose ? 'CH₂OH' : 'CHO', 'oc-atom', 21);
    // C2（ケトースは C=O）
    if (ketose) {
      var c2 = { x: cxs, y: ys[1] };
      var o2 = { x: cxs + 55, y: ys[1] };
      out += textEl(c2.x, c2.y, 'C', 'oc-atom', 21, 'data-carbonyl="C2"');
      out += drawBondLine(c2, o2, 2, 12, 4, 'oc-bond');
      out += textEl(o2.x + 8, o2.y, 'O', 'oc-atom', 20, 'data-el="O"');
    }
    var stereoAttrs = '';
    var start = ketose ? 2 : 1;
    for (var j = start; j < carbons - 1; j++) {
      var y = ys[j];
      var key = 'c' + (j + 1);
      var dir = stereo[key] || (j === 1 ? 'right' : (j % 2 === 0 ? 'right' : 'left'));
      out += lineEl(125, y, 255, y, 'oc-bond', 2.2);
      stereoAttrs += ' data-oh-' + key + '="' + esc(dir) + '"';
      if (dir === 'none') {
        out += textEl(105, y, 'H', 'oc-h', 19);
        out += textEl(275, y, 'H', 'oc-h', 19);
      } else {
        var ohRight = dir === 'right';
        out += textEl(ohRight ? 275 : 105, y, 'OH', 'oc-atom', 20);
        out += textEl(ohRight ? 105 : 275, y, 'H', 'oc-h', 19);
      }
    }
    // 末端の CH₂OH
    out += textEl(cxs, ys[carbons - 1] + 14, 'CH₂OH', 'oc-atom', 21);
    out += textEl(cxs, H - 25, 'フィッシャー投影式', 'oc-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="fischer" data-sugar="' + esc(sugar) +
      '" data-carbons="' + carbons + '"' + stereoAttrs) + out + '</svg>';
  }

  function renderFuranose(spec, label) {
    var anomer = spec.anomer || 'alpha';
    var stereo = spec.stereo || {};
    var W = 470, H = 330;
    var O = { x: 250, y: 78 };
    var C2 = { x: 330, y: 112 };
    var C3 = { x: 300, y: 188 };
    var C4 = { x: 200, y: 193 };
    var C5 = { x: 150, y: 118 };
    var out = '';
    out += lineEl(O.x, O.y, C2.x, C2.y, 'oc-bond', 2.3);
    out += lineEl(C2.x, C2.y, C3.x, C3.y, 'oc-bond', 2.3);
    out += lineEl(C3.x, C3.y, C4.x, C4.y, 'oc-bond oc-bond--front', 4.4);
    out += lineEl(C4.x, C4.y, C5.x, C5.y, 'oc-bond oc-bond--front', 4.4);
    out += lineEl(C5.x, C5.y, O.x, O.y, 'oc-bond', 2.3);
    out += textEl(O.x, O.y, 'O', 'oc-atom', 21, 'data-ring-atom="O"');
    out += textEl(C2.x + 12, C2.y - 14, '2', 'oc-ring-num', 12);
    out += textEl(C3.x + 14, C3.y - 8, '3', 'oc-ring-num', 12);
    out += textEl(C4.x - 18, C4.y - 8, '4', 'oc-ring-num', 12);
    out += textEl(C5.x - 16, C5.y - 12, '5', 'oc-ring-num', 12);

    function sub(x, y, dx, dy, text, cls) {
      var tx = x + dx, ty = y + dy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ax = x + dx / len * 14, ay = y + dy / len * 14;
      var bx = tx - dx / len * 10, by = ty - dy / len * 10;
      return lineEl(ax, ay, bx, by, 'oc-bond', 2.0) + textEl(tx, ty, text, cls || 'oc-atom', 18);
    }

    // C1（C2に結合する CH₂OH）と C6（C5に結合する CH₂OH）
    var c1Up = (stereo.c1ch2oh || (anomer === 'alpha' ? 'up' : 'down')) === 'up';
    if (c1Up) {
      out += lineEl(C2.x, C2.y, 388, 66, 'oc-bond', 2.0);
      out += textEl(408, 56, 'CH₂OH', 'oc-atom', 17);
    } else {
      out += lineEl(C2.x, C2.y, 388, 160, 'oc-bond', 2.0);
      out += textEl(408, 174, 'CH₂OH', 'oc-atom', 17);
    }
    out += lineEl(C5.x, C5.y, 104, 64, 'oc-bond', 2.0);
    out += textEl(78, 52, 'CH₂OH', 'oc-atom', 17);
    out += sub(C5.x, C5.y, 12, 42, 'H', 'oc-h');

    // C2 アノマーOH: αは下、βは上。C2はアノマー炭素でHはもたない。
    var c2Down = (stereo.c2 || (anomer === 'alpha' ? 'down' : 'up')) === 'down';
    out += sub(C2.x, C2.y, 42, c2Down ? 40 : -40, 'OH', 'oc-atom oc-anomer');
    // C3 OH上 / H下（D-フルクトフラノース）
    var c3Up = (stereo.c3 || 'up') === 'up';
    out += sub(C3.x, C3.y, 0, c3Up ? -44 : 44, 'OH', 'oc-atom');
    out += sub(C3.x, C3.y, 16, c3Up ? 38 : -38, 'H', 'oc-h');
    // C4 OH下 / H上
    var c4Down = (stereo.c4 || 'down') === 'down';
    out += sub(C4.x, C4.y, 0, c4Down ? 44 : -44, 'OH', 'oc-atom');
    out += sub(C4.x, C4.y, -16, c4Down ? -38 : 38, 'H', 'oc-h');
    out += textEl(W / 2, 292, 'フルクトフラノース（ハース投影式）', 'oc-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="haworth" data-ring="furanose" data-anomer="' + esc(anomer) +
      '" data-c1ch2oh="' + (c1Up ? 'up' : 'down') + '" data-c2oh="' + (c2Down ? 'down' : 'up') +
      '" data-c3oh="' + (c3Up ? 'up' : 'down') +
      '" data-c4oh="' + (c4Down ? 'down' : 'up') + '" data-c5ch2oh="up"') + out + '</svg>';
  }

  function renderHaworth(spec, label) {
    if (spec.ring === 'furanose') return renderFuranose(spec, label);
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
    if (!comp) return null;
    var counts = {};
    Object.keys(comp).forEach(function (el) { counts[el] = comp[el]; });
    return formulaFromCounts(counts);
  }

  function formulaOfStructure(spec) {
    if (!spec) return null;
    if (isGraphSpec(spec)) return formulaOfGraph(buildStructure(spec));
    if (spec.type === 'ring-sub' || spec.type === 'condensed' || spec.type === 'projection' || spec.type === 'triglyceride') {
      return formulaFromComposition(spec.composition);
    }
    if (spec.type === 'schematic') {
      return spec.composition ? formulaFromComposition(spec.composition) : null;
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
      // 金属配位結合など、通常の原子価の数え方が当てはまらない原子は明示的に除外する。
      if (a.skipValence) return;
      var allowed = VALENCES[a.el];
      if (!allowed) return;
      var sum = 0;
      g.bonds.forEach(function (b) {
        if (b.a === i || b.b === i) {
          if (!b.coordinate) sum += b.order;
        }
      });
      var total = sum + (a.h || 0);
      var charge = a.charge === '+' ? 1 : (a.charge === '-' ? -1 : 0);
      var ok = allowed.some(function (v) { return total === v + charge; });
      if (!ok) {
        errors.push('原子' + i + '(' + a.el + ')の結合価が不正: ' + total +
          '（許容: ' + allowed.map(function (v) { return v + charge; }).join('/') + '）');
      }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function hasCoordination(spec) {
    return !!(spec && spec.bonds && spec.bonds.some(function (b) { return b.coordinate; }));
  }

  function verificationForSpec(spec, formulaStatus) {
    if (!spec) return { level: 'unknown', short: '未確認', label: '構造データ未確認' };
    if (hasCoordination(spec)) {
      return { level: 'coordination', short: '配位結合（原子価検証対象外）', label: '配位結合を含むため原子価の自動検証対象外（分子式・組成のみ確認）' };
    }
    if (formulaStatus === 'variable') {
      if (spec.type === 'schematic') {
        return { level: 'none', short: '模式図（可変組成）', label: '模式図・可変組成（原子レベルの検証対象外。表示式のみ）' };
      }
      if (spec.type === 'polymer' && !(spec.formulaReference || spec.unitFormula)) {
        return { level: 'none', short: '可変組成（原子検証対象外）', label: '可変組成（原子レベルの検証対象外。表示式のみ）' };
      }
      return { level: 'composition', short: '一般式', label: '一般式の基準単位と登録データの整合' };
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
        if (reference) {
          if (f !== reference) {
            errors.push('図' + (idx + 1) + 'の一般式の基準単位が不一致: ' + f + ' != ' + reference);
          }
        } else if (!compound.formulaDisplay) {
          errors.push('図' + (idx + 1) + ': 可変組成の表示式が未登録');
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
      coordination: hasCoordination(firstSpec),
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
        else if (fig.structure.type === 'custom' && fig.structure.skeletal) autoNote = '炭素骨格は頂点で示し、炭素の元素記号を省略しています。ヘテロ原子と電荷は明示しています。';
      }
      var note = fig.note || autoNote;
      var longCondensed = !!(fig.structure && fig.structure.type === 'condensed' &&
        (fig.structure.lines || []).some(function (t) { return t.length > 44; }));
      var figAttrs = 'class="oc-fig' + (fig.structure && fig.structure.skeletal ? ' oc-fig--skeletal' : '') +
        (longCondensed ? ' oc-fig--scroll' : '') + '" data-fig="' + idx + '"';
      if (longCondensed) figAttrs += ' tabindex="0" aria-label="長い構造式です。枠内を横スクロールできます。"';
      return '<figure ' + figAttrs + '>' + svg +
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
