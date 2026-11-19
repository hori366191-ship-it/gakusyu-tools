/*
 * app11-3d — 入力の解釈（純関数・DOM なし）
 *
 * ここには「どの操作がどのカメラ変更になるか」だけを置く。
 * DOM イベント・canvas・タイマーは app.js 側。
 *
 * Node では require、ブラウザでは window.RP3DInteraction。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DInteraction = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ORBIT_STEP = 12;
  var PAN_STEP = 46;
  var ZOOM_STEP = 1.18;

  function actionForKey(event) {
    if (!event || typeof event.key !== 'string') return null;
    var key = event.key;
    var shift = !!event.shiftKey;
    var ctrl = !!(event.ctrlKey || event.metaKey || event.altKey);
    if (ctrl) return null;

    // 矢印キーと WASD は「観測者（カメラ）の平行移動」。←/A はカメラが左へ、
    // →/D はカメラが右へ、↑/W はカメラが上へ、↓/S はカメラが下へ動く。
    // 固定した地図は逆方向へ流れる。ズーム・前後移動・オービットはしない。
    // Shift 併用のオービットは従来の向きを保つ。
    var hSign = 0;
    var vSign = 0;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') hSign = -1;
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') hSign = 1;
    else if (key === 'ArrowUp' || key === 'w' || key === 'W') vSign = -1;
    else if (key === 'ArrowDown' || key === 's' || key === 'S') vSign = 1;
    if (hSign || vSign) {
      if (shift) {
        // オービットは従来の符号のまま（パンの反転に巻き込まない）。
        return { type: 'orbit', dx: hSign * PAN_STEP * 0.18, dy: vSign * PAN_STEP * 0.18 };
      }
      // panCamera の引数は「内容が動く方向」。カメラ移動なので両軸とも反転する。
      return {
        type: 'pan',
        dx: hSign === 0 ? 0 : -hSign * PAN_STEP,
        dy: vSign === 0 ? 0 : -vSign * PAN_STEP
      };
    }
    if (key === '+' || key === '=') return { type: 'zoom', factor: 1 / ZOOM_STEP };
    if (key === '-' || key === '_') return { type: 'zoom', factor: ZOOM_STEP };
    if (key === 'r' || key === 'R' || key === '0') return { type: 'reset' };
    if (key === 'f' || key === 'F') return { type: 'focus' };
    if (key === 'l' || key === 'L') return { type: 'layer' };
    if (key === 'u' || key === 'U') return { type: 'unconnected' };
    if (key === '/') return { type: 'search' };
    if (key === '?' ) return { type: 'help' };
    if (key === 'Escape') return { type: 'escape' };
    return null;
  }

  // パンになるキーの「カメラ移動方向」（画面空間）。→ はカメラが右へ。
  function panDirectionForKey(key) {
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') return { x: -1, y: 0 };
    if (key === 'ArrowRight' || key === 'd' || key === 'D') return { x: 1, y: 0 };
    if (key === 'ArrowUp' || key === 'w' || key === 'W') return { x: 0, y: -1 };
    if (key === 'ArrowDown' || key === 's' || key === 'S') return { x: 0, y: 1 };
    return null;
  }

  // panCamera に渡す「地図の内容が動く方向」。カメラ移動の両軸とも逆。
  // （↑/W はカメラが上へ動くので、固定した地図は下へ流れる）
  function keyboardPanDirectionForKey(key) {
    var view = panDirectionForKey(key);
    if (!view) return null;
    return {
      x: view.x === 0 ? 0 : -view.x,
      y: view.y === 0 ? 0 : -view.y
    };
  }

  // キーボードパンの短い平滑化。OS のキーリピートには依存しない。
  // - 押した瞬間に 1 タップ分（stepPx）を目標へ足す
  // - 押し続けている間は速度（px/秒）で目標を伸ばす
  // - 現在値は目標へ指数的に寄る（time constant = smoothMs）
  // - 押していなくても目標との差が消えたら active=false（=rAF を止める）
  function createKeyboardPan(options) {
    options = options || {};
    var stepPx = options.stepPx == null ? PAN_STEP : options.stepPx;
    var speed = options.speedPxPerSec == null ? 520 : options.speedPxPerSec;
    var smoothMs = options.smoothMs == null ? 110 : options.smoothMs;
    var pressed = Object.create(null);
    var x = 0;
    var y = 0;
    var targetX = 0;
    var targetY = 0;
    var lastTs = null;

    function active() {
      if (Object.keys(pressed).length) return true;
      return Math.abs(targetX - x) > 0.4 || Math.abs(targetY - y) > 0.4;
    }
    function press(key) {
      var dir = keyboardPanDirectionForKey(key);
      if (!dir) return false;
      if (pressed[key]) return false; // OS のリピートは無視（保持中の移動は step が担当）
      pressed[key] = true;
      targetX += dir.x * stepPx;
      targetY += dir.y * stepPx;
      return true;
    }
    function release(key) {
      if (!pressed[key]) return false;
      delete pressed[key];
      return true;
    }
    function releaseAll() {
      pressed = Object.create(null);
    }
    function cancel() {
      pressed = Object.create(null);
      targetX = x;
      targetY = y;
      lastTs = null;
    }
    function step(timestamp) {
      var ts = typeof timestamp === 'number' ? timestamp : 0;
      if (lastTs == null) lastTs = ts;
      var dt = Math.max(0, Math.min(64, ts - lastTs)) / 1000;
      lastTs = ts;
      var vx = 0;
      var vy = 0;
      Object.keys(pressed).forEach(function (key) {
        var dir = keyboardPanDirectionForKey(key);
        if (dir) { vx += dir.x; vy += dir.y; }
      });
      vx = Math.max(-1, Math.min(1, vx));
      vy = Math.max(-1, Math.min(1, vy));
      targetX += vx * speed * dt;
      targetY += vy * speed * dt;
      var k = 1 - Math.exp(-dt * 1000 / Math.max(1, smoothMs));
      var nx = x + (targetX - x) * k;
      var ny = y + (targetY - y) * k;
      if (!Object.keys(pressed).length) {
        // タップの残りは短く収束させる（行き過ぎない）。
        if (Math.abs(targetX - nx) < 0.4) nx = targetX;
        if (Math.abs(targetY - ny) < 0.4) ny = targetY;
      }
      var dx = nx - x;
      var dy = ny - y;
      x = nx;
      y = ny;
      return { dx: dx, dy: dy, active: active() };
    }
    return {
      press: press,
      release: release,
      releaseAll: releaseAll,
      cancel: cancel,
      step: step,
      isActive: active,
      isPressed: function (key) { return !!pressed[key]; }
    };
  }

  function shouldHandleKey(event) {
    if (!event) return false;
    var target = event.target;
    if (!target) return true;
    var tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (target.isContentEditable) return false;
    return true;
  }

  function wheelZoomFactor(deltaY, deltaMode) {
    var scale = deltaMode === 1 ? 16 : (deltaMode === 2 ? 400 : 1);
    var normalized = deltaY * scale;
    var factor = Math.exp(normalized * 0.0012);
    return Math.max(0.6, Math.min(1.7, factor));
  }

  function pointerMode(event) {
    if (!event) return 'orbit';
    if (event.button === 2 || event.button === 1) return 'pan';
    if (event.shiftKey) return 'pan';
    return 'orbit';
  }

  // タッチ 1 本指のモード。UI の Move / Rotate トグルと一致させる。
  // 既定は回転（地図を眺める操作を優先）。移動は明示的に選んだときだけ。
  function touchMode(value) {
    return value === 'move' ? 'move' : 'rotate';
  }

  // 実際のポインタから 1 本指ドラッグの意味を決める。
  // マウスは従来どおり（左=回転 / 右・Shift=移動）。タッチはトグルに従う。
  function oneFingerMode(pointerType, mode, event) {
    if (pointerType === 'touch') return touchMode(mode) === 'rotate' ? 'orbit' : 'pan';
    return pointerMode(event || {});
  }

  function touchPoints(pointers) {
    return pointers.filter(function (p) { return p && p.active !== false; });
  }

  function pinchDistance(points) {
    if (!points || points.length < 2) return 0;
    var a = points[0];
    var b = points[1];
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pinchMidpoint(points) {
    if (!points || !points.length) return { x: 0, y: 0 };
    if (points.length < 2) return { x: points[0].x, y: points[0].y };
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
  }

  function pinchAngle(points) {
    if (!points || points.length < 2) return 0;
    return Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  }

  function normalizeAngleDelta(delta) {
    var twoPi = Math.PI * 2;
    var d = delta % twoPi;
    if (d > Math.PI) d -= twoPi;
    if (d < -Math.PI) d += twoPi;
    return d;
  }

  // 2 本指の前回値と今回値から、ズーム・パン・回転の量を返す。
  function pinchGesture(previous, current) {
    var prev = touchPoints(previous || []);
    var cur = touchPoints(current || []);
    if (prev.length < 2 || cur.length < 2) return null;
    var d0 = pinchDistance(prev);
    var d1 = pinchDistance(cur);
    var m0 = pinchMidpoint(prev);
    var m1 = pinchMidpoint(cur);
    var a0 = pinchAngle(prev);
    var a1 = pinchAngle(cur);
    return {
      zoomFactor: d0 > 4 ? Math.max(0.5, Math.min(2, d0 / Math.max(1, d1))) : 1,
      panDx: m1.x - m0.x,
      panDy: m1.y - m0.y,
      // 2 本指のひねりでは回転しない（意図しないツイストを避ける）。
      // 回転は 1 本指 Rotate モードとキーボード（Shift+矢印）で行う。
      orbitDx: 0,
      orbitDy: 0,
      twist: normalizeAngleDelta(a1 - a0)
    };
  }

  function searchNavigation(results, index, direction) {
    if (!results || !results.length) return -1;
    var current = index == null ? -1 : index;
    var next = current + (direction || 1);
    if (next < 0) next = results.length - 1;
    if (next >= results.length) next = 0;
    return next;
  }

  return {
    ORBIT_STEP: ORBIT_STEP,
    PAN_STEP: PAN_STEP,
    ZOOM_STEP: ZOOM_STEP,
    actionForKey: actionForKey,
    panDirectionForKey: panDirectionForKey,
    keyboardPanDirectionForKey: keyboardPanDirectionForKey,
    createKeyboardPan: createKeyboardPan,
    shouldHandleKey: shouldHandleKey,
    wheelZoomFactor: wheelZoomFactor,
    pointerMode: pointerMode,
    touchMode: touchMode,
    oneFingerMode: oneFingerMode,
    pinchDistance: pinchDistance,
    pinchMidpoint: pinchMidpoint,
    pinchAngle: pinchAngle,
    pinchGesture: pinchGesture,
    searchNavigation: searchNavigation
  };
});
