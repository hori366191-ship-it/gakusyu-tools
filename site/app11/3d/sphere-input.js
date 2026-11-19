/*
 * app11/3d 球ビュー — ポインタ入力の状態機械（純関数・DOM なし）
 *
 * 目的:
 *   - マウス / 1本指タッチで「指の下の球面を掴む」ドラッグを行う
 *     （Google Earth のように、掴んだ面が指についてくる）
 *   - 2本指はピンチズームのみ。ピンチから1本指へ戻ったときは、残った指の
 *     現在位置でアンカーを取り直し、カメラが飛ばないようにする
 *   - 動いていないタップは選択（既存のクリック選択を壊さない）
 *   - モード切替・リサイズ・キャンセル・ズームでアンカーを残さない
 *
 * カメラの回転そのものは sphere-camera.js の createGrabAnchor /
 * dragSphereCamera に任せ、ここではイベントの並びとアンカーの寿命だけを扱う。
 *
 * Node では require、ブラウザでは window.RP3DSphereInput。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./sphere-camera.js')(require('./projection.js')),
      require('./interaction.js')
    );
  } else {
    root.RP3DSphereInput = factory(root.RP3DSphereCamera, root.RP3DInteraction);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, I) {
  'use strict';

  var MOVE_THRESHOLD = 4;

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isPrimaryButton(event) {
    // pointerup の touch は button が -1 のことがある。主ボタン扱いにする。
    return event.button == null || event.button < 0 || event.button === 0;
  }

  function createGestureController(options) {
    options = options || {};
    var pointers = new Map();
    var drag = {
      anchor: null,
      lastX: 0,
      lastY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      pinching: false,
      suppressTap: false,
      pinchPrev: null
    };

    function getCamera() { return options.getCamera ? options.getCamera() : null; }
    function getViewport() {
      return options.getViewport ? options.getViewport() : { width: 1, height: 1 };
    }
    function getCenter() {
      return options.getCenter ? options.getCenter() : (getCamera() || {}).target;
    }
    function getRadius() {
      if (options.getRadius) return options.getRadius();
      var camera = getCamera();
      return camera ? camera.radius : 0;
    }
    function getRect() {
      return options.getRect ? options.getRect() : { left: 0, top: 0 };
    }
    function pointerPosition(event) {
      if (options.pointerPosition) return options.pointerPosition(event);
      var rect = getRect();
      return {
        x: (event.clientX == null ? 0 : event.clientX) - (rect.left || 0),
        y: (event.clientY == null ? 0 : event.clientY) - (rect.top || 0)
      };
    }
    function pointerArray() {
      var out = [];
      pointers.forEach(function (p) {
        out.push({ x: p.x, y: p.y, type: p.type });
      });
      return out;
    }
    function firstPointer() {
      var first = null;
      pointers.forEach(function (p) { if (!first) first = p; });
      return first;
    }
    function beginGrab(pos) {
      var camera = getCamera();
      if (!camera) {
        drag.anchor = null;
        return null;
      }
      drag.anchor = C.createGrabAnchor(camera, pos.x, pos.y, getViewport(), {
        center: getCenter(),
        radius: getRadius()
      });
      return drag.anchor;
    }

    // アンカーが古くなっていないか（モード・ビューポート・半径）。
    function anchorStale() {
      if (!drag.anchor) return true;
      var camera = getCamera();
      if (!camera) return true;
      var vp = getViewport();
      if (drag.anchor.mode !== camera.mode) return true;
      if (drag.anchor.viewport &&
        (drag.anchor.viewport.width !== vp.width || drag.anchor.viewport.height !== vp.height)) {
        return true;
      }
      var radius = getRadius();
      if (radius > 0 && drag.anchor.radius && Math.abs(drag.anchor.radius - radius) > 1e-9) {
        return true;
      }
      return false;
    }

    function clearAnchor() {
      drag.anchor = null;
    }

    function resetGesture() {
      drag.anchor = null;
      drag.pinching = false;
      drag.pinchPrev = null;
      drag.moved = false;
      drag.suppressTap = false;
    }

    function pointerDown(event) {
      if (!event || event.pointerId == null) return false;
      if (event.pointerType === 'mouse' &&
        event.button !== 0 && event.button !== 1 && event.button !== 2) {
        return false;
      }
      var pos = pointerPosition(event);
      pointers.set(event.pointerId, { x: pos.x, y: pos.y, type: event.pointerType || 'mouse' });
      if (pointers.size === 1) {
        drag.lastX = pos.x;
        drag.lastY = pos.y;
        drag.startX = pos.x;
        drag.startY = pos.y;
        drag.moved = false;
        drag.pinching = false;
        drag.pinchPrev = null;
        drag.suppressTap = false;
        beginGrab(pos);
      } else if (pointers.size === 2) {
        drag.pinching = true;
        drag.moved = true;
        drag.suppressTap = true;
        drag.pinchPrev = pointerArray();
        // ピンチ中は掴まない（指の下の面が2つあるため）。
        clearAnchor();
      }
      return true;
    }

    function pointerMove(event) {
      if (!event || !pointers.has(event.pointerId)) return false;
      var pos = pointerPosition(event);
      var old = pointerArray();
      var previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, {
        x: pos.x,
        y: pos.y,
        type: event.pointerType || (previous && previous.type) || 'mouse'
      });

      if (pointers.size >= 2) {
        var current = pointerArray();
        var gesture = I && I.pinchGesture ? I.pinchGesture(drag.pinchPrev || old, current) : null;
        if (gesture && gesture.zoomFactor !== 1 && options.onPinch) {
          options.onPinch(gesture.zoomFactor);
        }
        drag.pinchPrev = current;
        drag.moved = true;
        return true;
      }

      var dx = pos.x - drag.lastX;
      var dy = pos.y - drag.lastY;
      if (Math.abs(pos.x - drag.startX) > MOVE_THRESHOLD ||
        Math.abs(pos.y - drag.startY) > MOVE_THRESHOLD) {
        drag.moved = true;
      }
      drag.lastX = pos.x;
      drag.lastY = pos.y;
      if (!dx && !dy) return true;

      // モード・ビューポートが変わっていたら古いアンカーを使わない。
      if (anchorStale()) {
        beginGrab(pos);
        return true;
      }

      var camera = getCamera();
      if (!camera) return true;
      var next = C.dragSphereCamera(camera, drag.anchor, pos.x, pos.y, getViewport(), {
        center: getCenter(),
        radius: getRadius()
      });
      if (options.onManipulate) options.onManipulate();
      if (options.setCamera) options.setCamera(next);
      return true;
    }

    function handleUp(event, cancelled) {
      if (!event || !pointers.has(event.pointerId)) return false;
      var pos = pointerPosition(event);
      var wasSingle = pointers.size === 1;
      pointers.delete(event.pointerId);

      if (!cancelled && wasSingle && !drag.moved && !drag.pinching &&
        !drag.suppressTap && isPrimaryButton(event) &&
        (!options.isInteractive || options.isInteractive()) && options.onTap) {
        options.onTap(pos);
      }
      if (cancelled) drag.suppressTap = true;

      if (pointers.size === 1) {
        // ピンチ → 1本指。残った指の現在位置でアンカーを取り直す。
        var remaining = firstPointer();
        drag.lastX = remaining.x;
        drag.lastY = remaining.y;
        drag.startX = remaining.x;
        drag.startY = remaining.y;
        drag.moved = false;
        drag.pinching = false;
        drag.pinchPrev = null;
        beginGrab(remaining);
      } else if (pointers.size === 0) {
        resetGesture();
      }
      return true;
    }

    function pointerUp(event) {
      return handleUp(event, false);
    }

    function pointerCancel(event) {
      return handleUp(event, true);
    }

    function cancelAll() {
      pointers.clear();
      resetGesture();
    }

    function getState() {
      return {
        pointerCount: pointers.size,
        anchor: drag.anchor,
        moved: !!drag.moved,
        pinching: !!drag.pinching,
        suppressTap: !!drag.suppressTap
      };
    }

    return {
      pointerDown: pointerDown,
      pointerMove: pointerMove,
      pointerUp: pointerUp,
      pointerCancel: pointerCancel,
      clearAnchor: clearAnchor,
      cancelAll: cancelAll,
      getState: getState
    };
  }

  return {
    MOVE_THRESHOLD: MOVE_THRESHOLD,
    createGestureController: createGestureController
  };
});
