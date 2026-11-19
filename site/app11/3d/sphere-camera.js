/*
 * app11/3d 球ビュー — カメラ（球の外 / 球の中）
 *
 * 公開版 projection.js を置き換えずに「拡張」する。ブラウザでは
 * RP3DProjection をこの拡張版で置き換え、公開 renderer.js がそのまま
 * inside カメラを扱えるようにする（renderer は読み込み時の P を保持するため、
 * renderer.js より先に読み込む）。
 *
 * モード:
 *   - outside: 球の外から中心を見る。オービットは球の周り、ズームは距離だけ。
 *     距離は常に radius より外側（球の中へ入らない）。パンは持たない。
 *   - inside: 視線の原点は球の中心。ドラッグで視線（方位・仰角）を回し、
 *     ズームは画角（FOV）だけ。位置は動かない（平行移動なし）。
 *
 * 選択点のフレーミング:
 *   - どちらのモードも「選択点の外向き法線」へ視線を向ける。
 *   - 詳細パネル等を除いた実測 usableRect の中心に投影が来るよう、
 *     projection の主点を screenOffset でずらす（距離・FOV は変えない）。
 *
 * Node では require（extend 関数を返す）、ブラウザでは
 * window.RP3DSphereCamera（拡張済み API）と window.RP3DProjection を公開。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    // app からは拡張済み API を使い、renderer には同じオブジェクトを
    // RP3DProjection として渡す（読み込み順は index.html 側で保証）。
    root.RP3DSphereCameraExtend = factory;
    root.RP3DSphereCamera = factory(root.RP3DProjection);
    root.RP3DProjection = root.RP3DSphereCamera;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Base) {
  'use strict';

  if (!Base || typeof Base.cameraBasis !== 'function') {
    throw new TypeError('RP3DSphereCamera: RP3DProjection が必要');
  }

  var DEG = Math.PI / 180;
  var WORLD_UP = { x: 0, y: 1, z: 0 };
  // スロットの最大 |y| は 1 - 1/n（約 0.9977 → 仰角 86.1°）。
  // 極の選択点もフレーミングできるよう、上限は 88° にする。
  var MIN_ELEVATION = -88;
  var MAX_ELEVATION = 88;
  var INSIDE_FOV_MIN = 22;
  var INSIDE_FOV_MAX = 110;
  var OUTSIDE_FOV_MIN = 20;
  var OUTSIDE_FOV_MAX = 90;
  // 球の外に留まる最小距離（半径の何倍か）。ズームで球へ入らない。
  var OUTSIDE_MIN_FACTOR = 1.08;
  var OUTSIDE_MAX_FACTOR = 12;
  var DEFAULT_INSIDE_FOV = 72;
  var DEFAULT_OUTSIDE_FOV = 50;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function toRad(deg) { return deg * DEG; }
  function toDeg(rad) { return rad / DEG; }

  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function mul(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
  function negate(a) { return { x: -a.x, y: -a.y, z: -a.z }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalize(a) {
    var len = length(a);
    if (!(len > 1e-9)) return { x: 0, y: 0, z: 1 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  function normalizeAngle(rad) {
    var twoPi = Math.PI * 2;
    var value = rad % twoPi;
    if (value > Math.PI) value -= twoPi;
    if (value < -Math.PI) value += twoPi;
    return value;
  }

  // ---------------- 全方向の姿勢（frame）とクォータニオン ----------------
  //
  // ドラッグは「指の下の球面を掴み、その点を新しい指の位置へ運ぶ」操作なので、
  // 方位・仰角だけでは表せないロール（画面の回転）が発生する。カメラに
  // 正規直交基底 frame を持たせ、最短弧のクォータニオンで運ぶ。
  // frame が無いときは従来どおり方位・仰角から正規直交基底を作る。

  function isFrame(frame) {
    return !!(frame && frame.right && frame.up && frame.forward);
  }

  function orthonormalizeFrame(right, up, forward) {
    var f = normalize(forward);
    var r = normalize(cross(f, up));
    if (!(length(r) > 1e-9)) {
      r = normalize(cross(f, Math.abs(f.y) > 0.9 ? { x: 1, y: 0, z: 0 } : WORLD_UP));
    }
    var u = normalize(cross(r, f));
    return { right: r, up: u, forward: f };
  }

  // 方位・仰角から、その時点で一意な（ロール 0 の）基底を作る。
  function canonicalFrame(camera) {
    var dir;
    if (camera.mode === 'inside') {
      dir = directionFor(camera.azimuth, camera.elevation);
    } else {
      dir = negate(directionFor(camera.azimuth, camera.elevation));
    }
    var crossUp = cross(dir, WORLD_UP);
    if (!(length(crossUp) > 1e-6)) {
      // 極では WORLD_UP と平行になり外積が消える。少しだけ極から離した
      // 同じ方位の基底を使い、特異点で NaN を作らない。
      var poleEl = camera.elevation >= 0 ? Math.PI / 2 - 1e-4 : -Math.PI / 2 + 1e-4;
      dir = directionFor(camera.azimuth, poleEl);
      if (camera.mode !== 'inside') dir = negate(dir);
      crossUp = cross(dir, WORLD_UP);
    }
    var right = normalize(crossUp);
    var up = normalize(cross(right, dir));
    return { right: right, up: up, forward: dir };
  }

  function frameOf(camera) {
    if (isFrame(camera.frame)) {
      return orthonormalizeFrame(camera.frame.right, camera.frame.up, camera.frame.forward);
    }
    return canonicalFrame(camera);
  }

  // 方位・仰角を frame の forward から同期する（frame を正とする）。
  function syncAnglesFromFrame(camera) {
    var frame = frameOf(camera);
    var view = frame.forward;
    var v = camera.mode === 'inside' ? view : negate(view);
    var ce = Math.hypot(v.x, v.z);
    if (ce > 1e-9) {
      camera.azimuth = normalizeAngle(Math.atan2(v.x, v.z));
    }
    camera.elevation = Math.asin(clamp(v.y, -1, 1));
    return camera;
  }

  function quatFromUnitVectors(from, to) {
    var a = normalize(from);
    var b = normalize(to);
    var d = clamp(dot(a, b), -1, 1);
    if (d >= 1 - 1e-12) return { w: 1, x: 0, y: 0, z: 0 };
    if (d <= -1 + 1e-12) {
      var axis = normalize(cross(a, Math.abs(a.y) > 0.9 ? { x: 1, y: 0, z: 0 } : WORLD_UP));
      return { w: 0, x: axis.x, y: axis.y, z: axis.z };
    }
    var c = cross(a, b);
    var q = { w: 1 + d, x: c.x, y: c.y, z: c.z };
    var n = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
  }

  function normalizeQuat(q) {
    var n = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    if (!(n > 1e-12)) return { w: 1, x: 0, y: 0, z: 0 };
    return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
  }

  function rotateVector(q, v) {
    var u = { x: q.x, y: q.y, z: q.z };
    var t = cross(u, v);
    t = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
    var t2 = cross(u, t);
    return {
      x: v.x + q.w * t.x + t2.x,
      y: v.y + q.w * t.y + t2.y,
      z: v.z + q.w * t.z + t2.z
    };
  }

  function slerpQuat(a, b, t) {
    var d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    var to = b;
    if (d < 0) {
      d = -d;
      to = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    }
    if (d > 0.9995) {
      return normalizeQuat({
        w: a.w + (to.w - a.w) * t,
        x: a.x + (to.x - a.x) * t,
        y: a.y + (to.y - a.y) * t,
        z: a.z + (to.z - a.z) * t
      });
    }
    var theta0 = Math.acos(clamp(d, -1, 1));
    var theta = theta0 * t;
    var sin0 = Math.sin(theta0);
    var s0 = Math.sin(theta0 - theta) / sin0;
    var s1 = Math.sin(theta) / sin0;
    return normalizeQuat({
      w: a.w * s0 + to.w * s1,
      x: a.x * s0 + to.x * s1,
      y: a.y * s0 + to.y * s1,
      z: a.z * s0 + to.z * s1
    });
  }

  // frame を回転行列（列: right, up, -forward）としてクォータニオンへ。
  function quatFromFrame(frame) {
    var r = frame.right;
    var u = frame.up;
    var f = frame.forward;
    var m00 = r.x, m01 = u.x, m02 = -f.x;
    var m10 = r.y, m11 = u.y, m12 = -f.y;
    var m20 = r.z, m21 = u.z, m22 = -f.z;
    var trace = m00 + m11 + m22;
    var q;
    if (trace > 0) {
      var s = Math.sqrt(trace + 1) * 2;
      q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
    } else if (m00 > m11 && m00 > m22) {
      var s1 = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q = { w: (m21 - m12) / s1, x: 0.25 * s1, y: (m01 + m10) / s1, z: (m02 + m20) / s1 };
    } else if (m11 > m22) {
      var s2 = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q = { w: (m02 - m20) / s2, x: (m01 + m10) / s2, y: 0.25 * s2, z: (m12 + m21) / s2 };
    } else {
      var s3 = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q = { w: (m10 - m01) / s3, x: (m02 + m20) / s3, y: (m12 + m21) / s3, z: 0.25 * s3 };
    }
    return normalizeQuat(q);
  }

  function frameFromQuat(q) {
    var xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
    var xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
    var wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
    var right = { x: 1 - 2 * (yy + zz), y: 2 * (xy + wz), z: 2 * (xz - wy) };
    var up = { x: 2 * (xy - wz), y: 1 - 2 * (xx + zz), z: 2 * (yz + wx) };
    var back = { x: 2 * (xz + wy), y: 2 * (yz - wx), z: 1 - 2 * (xx + yy) };
    return orthonormalizeFrame(right, up, negate(back));
  }

  // 画面座標 -> ワールド方向。screenOffset（主点のずらし）も打ち消す。
  function screenRay(camera, screenX, screenY, viewport, basis) {
    var b = basis || cameraBasis(camera);
    var vp = viewport && viewport.width > 0 && viewport.height > 0
      ? viewport
      : { width: 1, height: 1 };
    var offset = camera && camera.screenOffset ? camera.screenOffset : { x: 0, y: 0 };
    var sx = screenX - offset.x;
    var sy = screenY - offset.y;
    var aspect = vp.width / vp.height;
    var ndcX = (sx / vp.width) * 2 - 1;
    var ndcY = 1 - (sy / vp.height) * 2;
    return normalize({
      x: b.forward.x + b.right.x * ndcX * b.tanHalfFov * aspect + b.up.x * ndcY * b.tanHalfFov,
      y: b.forward.y + b.right.y * ndcX * b.tanHalfFov * aspect + b.up.y * ndcY * b.tanHalfFov,
      z: b.forward.z + b.right.z * ndcX * b.tanHalfFov * aspect + b.up.z * ndcY * b.tanHalfFov
    });
  }

  // 光線と球の交点（outside の可視側）。当たらなければ null。
  function raySphereHit(origin, direction, center, radius) {
    var oc = sub(origin, center);
    var b = dot(oc, direction);
    var c = dot(oc, oc) - radius * radius;
    var disc = b * b - c;
    if (!(disc >= 0)) return null;
    var root = Math.sqrt(disc);
    var t = -b - root;
    if (t > 1e-6) return add(origin, mul(direction, t));
    t = -b + root;
    if (t > 1e-6) return add(origin, mul(direction, t));
    return null;
  }

  // 光線が球を外したときの「最も近い球面上の点」。縁での連続性を保つ。
  function closestSpherePoint(origin, direction, center, radius) {
    var t = dot(sub(center, origin), direction);
    if (t < 0) t = 0;
    var foot = add(origin, mul(direction, t));
    var off = sub(foot, center);
    if (!(length(off) > 1e-9)) {
      var helper = Math.abs(direction.y) > 0.9 ? { x: 1, y: 0, z: 0 } : WORLD_UP;
      off = normalize(cross(direction, helper));
    } else {
      off = normalize(off);
    }
    return add(center, mul(off, radius));
  }

  function surfacePointForRay(camera, direction, center, radius) {
    if (camera.mode === 'inside') {
      return add(center, mul(direction, radius));
    }
    var basis = cameraBasis(camera);
    var hit = raySphereHit(basis.eye, direction, center, radius);
    return hit || closestSpherePoint(basis.eye, direction, center, radius);
  }

  // ポインタ位置の球面アンカー。outside は可視側、inside は中心からの方向。
  function createGrabAnchor(camera, screenX, screenY, viewport, options) {
    if (!camera) return null;
    options = options || {};
    var center = options.center || camera.target;
    var radius = options.radius == null ? camera.radius : options.radius;
    if (!(radius > 0)) return null;
    var basis = cameraBasis(camera);
    var direction = screenRay(camera, screenX, screenY, viewport, basis);
    var point = surfacePointForRay(camera, direction, center, radius);
    return {
      mode: camera.mode,
      center: { x: center.x, y: center.y, z: center.z },
      radius: radius,
      point: { x: point.x, y: point.y, z: point.z },
      screen: { x: screenX, y: screenY },
      viewport: { width: viewport && viewport.width, height: viewport && viewport.height }
    };
  }

  function rotateCameraAboutCenter(camera, center, q) {
    var frame = frameOf(camera);
    var next = cloneCamera(camera);
    next.frame = orthonormalizeFrame(
      rotateVector(q, frame.right),
      rotateVector(q, frame.up),
      rotateVector(q, frame.forward)
    );
    syncAnglesFromFrame(next);
    return next;
  }

  // 掴んだ球面点を新しいポインタ位置へ運ぶ。
  // outside は距離一定のまま中心まわりにオービット、inside は中心固定のまま視線を回す。
  function dragSphereCamera(camera, anchor, screenX, screenY, viewport, options) {
    if (!camera || !anchor) return camera ? cloneCamera(camera) : camera;
    options = options || {};
    if (anchor.mode && camera.mode !== anchor.mode) return cloneCamera(camera);
    var center = options.center || anchor.center || camera.target;
    var radius = options.radius == null ? anchor.radius : options.radius;
    if (!(radius > 0)) return cloneCamera(camera);
    var basis = cameraBasis(camera);
    var direction = screenRay(camera, screenX, screenY, viewport, basis);
    var hit = surfacePointForRay(camera, direction, center, radius);
    var p0 = normalize(sub(anchor.point, center));
    var p1 = normalize(sub(hit, center));
    var q = quatFromUnitVectors(p1, p0);
    return rotateCameraAboutCenter(camera, center, q);
  }

  function directionFor(azimuth, elevation) {
    var ce = Math.cos(elevation);
    return {
      x: ce * Math.sin(azimuth),
      y: Math.sin(elevation),
      z: ce * Math.cos(azimuth)
    };
  }

  function cloneCamera(camera) {
    var next = {
      mode: camera.mode,
      target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
      distance: camera.distance,
      azimuth: camera.azimuth,
      elevation: camera.elevation,
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      radius: camera.radius,
      screenOffset: {
        x: camera.screenOffset ? camera.screenOffset.x : 0,
        y: camera.screenOffset ? camera.screenOffset.y : 0
      }
    };
    if (isFrame(camera.frame)) {
      next.frame = {
        right: { x: camera.frame.right.x, y: camera.frame.right.y, z: camera.frame.right.z },
        up: { x: camera.frame.up.x, y: camera.frame.up.y, z: camera.frame.up.z },
        forward: { x: camera.frame.forward.x, y: camera.frame.forward.y, z: camera.frame.forward.z }
      };
    } else {
      next.frame = null;
    }
    return next;
  }

  function outsideDistanceRange(radius) {
    return {
      min: radius * OUTSIDE_MIN_FACTOR,
      max: radius * OUTSIDE_MAX_FACTOR
    };
  }

  // 球全体が収まる距離（マージン込み）。
  function fitDistance(radius, fovDeg, margin) {
    var fov = fovDeg == null ? DEFAULT_OUTSIDE_FOV : fovDeg;
    var m = margin == null ? 1.18 : margin;
    return radius / Math.sin(toRad(fov) / 2) * m;
  }

  function createOutsideCamera(center, radius, options) {
    options = options || {};
    var fov = clamp(options.fov == null ? DEFAULT_OUTSIDE_FOV : options.fov, OUTSIDE_FOV_MIN, OUTSIDE_FOV_MAX);
    var range = outsideDistanceRange(radius);
    var distance = options.distance == null ? fitDistance(radius, fov) : options.distance;
    return {
      mode: 'outside',
      target: { x: center.x, y: center.y, z: center.z },
      distance: clamp(distance, range.min, range.max),
      azimuth: normalizeAngle(toRad(options.azimuth == null ? -35 : options.azimuth)),
      elevation: clamp(toRad(options.elevation == null ? 18 : options.elevation), toRad(MIN_ELEVATION), toRad(MAX_ELEVATION)),
      fov: toRad(fov),
      near: 0.5,
      far: radius * 60,
      radius: radius,
      screenOffset: { x: 0, y: 0 }
    };
  }

  function createInsideCamera(center, radius, options) {
    options = options || {};
    var fov = clamp(options.fov == null ? DEFAULT_INSIDE_FOV : options.fov, INSIDE_FOV_MIN, INSIDE_FOV_MAX);
    return {
      mode: 'inside',
      target: { x: center.x, y: center.y, z: center.z },
      distance: 0,
      azimuth: normalizeAngle(toRad(options.azimuth == null ? 0 : options.azimuth)),
      elevation: clamp(toRad(options.elevation == null ? 0 : options.elevation), toRad(MIN_ELEVATION), toRad(MAX_ELEVATION)),
      fov: toRad(fov),
      near: 0.5,
      far: radius * 60,
      radius: radius,
      screenOffset: { x: 0, y: 0 }
    };
  }

  // 基底を返す。frame（ドラッグで生じたロールを含む姿勢）があればそれを正とし、
  // 無ければ従来どおり方位・仰角から作る。
  function basisFromFrame(camera, frame) {
    var forward = frame.forward;
    var eye;
    if (camera.mode === 'inside') {
      eye = { x: camera.target.x, y: camera.target.y, z: camera.target.z };
    } else {
      // outside の eye は forward の逆方向に distance だけ離れる。
      eye = {
        x: camera.target.x - forward.x * camera.distance,
        y: camera.target.y - forward.y * camera.distance,
        z: camera.target.z - forward.z * camera.distance
      };
    }
    return {
      eye: eye,
      forward: forward,
      right: frame.right,
      up: frame.up,
      tanHalfFov: Math.tan(camera.fov / 2)
    };
  }

  // 球の外向き視線（outside の eye 方向 / inside の視線方向）。
  function cameraBasis(camera) {
    if (!camera) return Base.cameraBasis(camera);
    if (isFrame(camera.frame)) return basisFromFrame(camera, frameOf(camera));
    if (camera.mode !== 'inside') return Base.cameraBasis(camera);
    var dir = directionFor(camera.azimuth, camera.elevation);
    var forward = dir; // 中心から外へ見る
    var right = normalize(cross(forward, WORLD_UP));
    var up = normalize(cross(right, forward));
    return {
      eye: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
      forward: forward,
      right: right,
      up: up,
      tanHalfFov: Math.tan(camera.fov / 2)
    };
  }

  // 主点オフセット（usableRect の中心へ投影の中心をずらす）。
  function cameraViewWithBasis(camera, basis, point, viewport) {
    var view = Base.cameraViewWithBasis(camera, basis, point, viewport);
    if (!view) return null;
    if (camera && camera.screenOffset &&
      (camera.screenOffset.x !== 0 || camera.screenOffset.y !== 0)) {
      view.x += camera.screenOffset.x;
      view.y += camera.screenOffset.y;
    }
    return view;
  }

  function cameraView(camera, point, viewport) {
    return cameraViewWithBasis(camera, cameraBasis(camera), point, viewport);
  }

  // キーボード用のオービット（方位・仰角）。ドラッグは dragSphereCamera を使う。
  function orbitCamera(camera, dxPx, dyPx, sensitivityDeg) {
    var sens = sensitivityDeg == null ? 0.3 : sensitivityDeg;
    var next = cloneCamera(camera);
    // 方位・仰角を明示的に動かすので、frame のロールは破棄して正準基底へ戻す。
    next.frame = null;
    next.azimuth = normalizeAngle(next.azimuth - dxPx * sens * DEG);
    next.elevation = clamp(
      next.elevation - dyPx * sens * DEG,
      toRad(MIN_ELEVATION),
      toRad(MAX_ELEVATION)
    );
    return next;
  }

  // ズーム。outside は距離（球の外にクランプ）、inside は FOV（位置は不変）。
  function zoomCamera(camera, factor, options) {
    options = options || {};
    var next = cloneCamera(camera);
    if (next.mode === 'inside') {
      var fovDeg = clamp(toDeg(next.fov) * factor, INSIDE_FOV_MIN, INSIDE_FOV_MAX);
      next.fov = toRad(fovDeg);
      next.distance = 0;
      return next;
    }
    var radius = options.radius == null ? next.radius : options.radius;
    var range = outsideDistanceRange(radius);
    next.distance = clamp(next.distance * factor, range.min, range.max);
    return next;
  }

  // usableRect の中心へ投影中心をずらす screenOffset。
  function screenOffsetForRect(rect, viewport) {
    if (!rect || !viewport) return { x: 0, y: 0 };
    return {
      x: rect.x + rect.width / 2 - viewport.width / 2,
      y: rect.y + rect.height / 2 - viewport.height / 2
    };
  }

  function withUsableRect(camera, rect, viewport) {
    var next = cloneCamera(camera);
    next.screenOffset = screenOffsetForRect(rect, viewport);
    return next;
  }

  // 選択点の外向き法線へ視線を向ける。位置（outside の距離 / inside の中心）は変えない。
  function facePoint(camera, point, center, options) {
    options = options || {};
    var next = cloneCamera(camera);
    // 明示的なフレーミングは正準基底（ロール 0）へ戻す。
    next.frame = null;
    var dir = normalize(sub(point, center));
    next.azimuth = normalizeAngle(Math.atan2(dir.x, dir.z));
    next.elevation = clamp(
      Math.asin(clamp(dir.y, -1, 1)),
      toRad(MIN_ELEVATION),
      toRad(MAX_ELEVATION)
    );
    if (next.mode === 'inside') {
      next.distance = 0;
      if (options.fov != null) {
        next.fov = toRad(clamp(options.fov, INSIDE_FOV_MIN, INSIDE_FOV_MAX));
      }
    } else {
      var radius = options.radius == null ? next.radius : options.radius;
      var range = outsideDistanceRange(radius);
      if (options.focusDistance != null) {
        next.distance = clamp(options.focusDistance, range.min, range.max);
      } else {
        next.distance = clamp(next.distance, range.min, range.max);
      }
    }
    return next;
  }

  // 選択点を usableRect の中心へ置くカメラ。
  function framePoint(camera, point, center, rect, viewport, options) {
    return withUsableRect(facePoint(camera, point, center, options), rect, viewport);
  }

  // モード切替の目標カメラ。位置は飛ぶが、直後に短いフェードで隠す
  // （球面を横切る補間は特異点になるため行わない）。
  function switchModeCamera(camera, mode, options) {
    options = options || {};
    var center = options.center || camera.target;
    var radius = options.radius == null ? camera.radius : options.radius;
    var next;
    if (mode === 'inside') {
      next = createInsideCamera(center, radius, {
        azimuth: toDeg(camera.azimuth),
        elevation: toDeg(camera.elevation),
        fov: options.fov == null ? DEFAULT_INSIDE_FOV : options.fov
      });
    } else {
      next = createOutsideCamera(center, radius, {
        azimuth: toDeg(camera.azimuth),
        elevation: toDeg(camera.elevation),
        fov: options.fov == null ? toDeg(camera.fov || toRad(DEFAULT_OUTSIDE_FOV)) : options.fov,
        distance: options.distance
      });
    }
    if (options.point) {
      next = facePoint(next, options.point, center, {
        radius: radius,
        fov: options.pointFov
      });
    }
    if (options.rect && options.viewport) {
      next = withUsableRect(next, options.rect, options.viewport);
    }
    return next;
  }

  // 同一モード内の補間（方位は最短回り、距離は対数、FOV は線形）。
  function interpolateCamera(from, to, t) {
    var k = clamp(t, 0, 1);
    if (!from || !to || from.mode !== to.mode) {
      return to ? cloneCamera(to) : (from ? cloneCamera(from) : null);
    }
    var next = cloneCamera(from);
    next.target = {
      x: from.target.x + (to.target.x - from.target.x) * k,
      y: from.target.y + (to.target.y - from.target.y) * k,
      z: from.target.z + (to.target.z - from.target.z) * k
    };
    var deltaAzimuth = normalizeAngle(to.azimuth - from.azimuth);
    next.azimuth = normalizeAngle(from.azimuth + deltaAzimuth * k);
    next.elevation = from.elevation + (to.elevation - from.elevation) * k;
    next.fov = from.fov + (to.fov - from.fov) * k;
    if (next.mode === 'outside') {
      if (from.distance > 0 && to.distance > 0) {
        next.distance = Math.exp(
          Math.log(from.distance) + (Math.log(to.distance) - Math.log(from.distance)) * k
        );
      } else {
        next.distance = from.distance + (to.distance - from.distance) * k;
      }
    } else {
      next.distance = 0;
    }
    next.screenOffset = {
      x: (from.screenOffset ? from.screenOffset.x : 0) +
        ((to.screenOffset ? to.screenOffset.x : 0) - (from.screenOffset ? from.screenOffset.x : 0)) * k,
      y: (from.screenOffset ? from.screenOffset.y : 0) +
        ((to.screenOffset ? to.screenOffset.y : 0) - (from.screenOffset ? from.screenOffset.y : 0)) * k
    };
    // ドラッグで生じたロールがあるときは、姿勢そのものを slerp する。
    // どちらにも frame が無ければ従来の方位・仰角補間のまま。
    if (isFrame(from.frame) || isFrame(to.frame)) {
      var q = slerpQuat(quatFromFrame(frameOf(from)), quatFromFrame(frameOf(to)), k);
      next.frame = frameFromQuat(q);
      syncAnglesFromFrame(next);
    }
    return next;
  }

  // モード切替のフェード時間（reduced-motion では 0）。
  function switchTiming(reduced) {
    if (reduced) return { fadeOut: 0, hold: 0, fadeIn: 0 };
    return { fadeOut: 140, hold: 60, fadeIn: 180 };
  }

  // 外部から見た「球の外にいるか」の検証用。
  function isOutside(camera, radius) {
    if (!camera || camera.mode !== 'outside') return false;
    var r = radius == null ? camera.radius : radius;
    return camera.distance >= r * OUTSIDE_MIN_FACTOR - 1e-9;
  }

  var api = {};
  // 公開 projection の API を引き継ぎ、必要なものだけ差し替える。
  Object.keys(Base).forEach(function (key) { api[key] = Base[key]; });
  api.MODE_OUTSIDE = 'outside';
  api.MODE_INSIDE = 'inside';
  api.INSIDE_FOV_MIN = INSIDE_FOV_MIN;
  api.INSIDE_FOV_MAX = INSIDE_FOV_MAX;
  api.OUTSIDE_MIN_FACTOR = OUTSIDE_MIN_FACTOR;
  api.OUTSIDE_MAX_FACTOR = OUTSIDE_MAX_FACTOR;
  api.DEFAULT_INSIDE_FOV = DEFAULT_INSIDE_FOV;
  api.cameraBasis = cameraBasis;
  api.cameraView = cameraView;
  api.cameraViewWithBasis = cameraViewWithBasis;
  api.cloneCamera = cloneCamera;
  api.fitDistance = fitDistance;
  api.outsideDistanceRange = outsideDistanceRange;
  api.createOutsideCamera = createOutsideCamera;
  api.createInsideCamera = createInsideCamera;
  api.orbitCamera = orbitCamera;
  api.zoomCamera = zoomCamera;
  api.screenOffsetForRect = screenOffsetForRect;
  api.withUsableRect = withUsableRect;
  api.facePoint = facePoint;
  api.framePoint = framePoint;
  api.switchModeCamera = switchModeCamera;
  api.interpolateCamera = interpolateCamera;
  api.switchTiming = switchTiming;
  api.isOutside = isOutside;
  api.cameraFrame = frameOf;
  api.canonicalFrame = canonicalFrame;
  api.screenRay = screenRay;
  api.createGrabAnchor = createGrabAnchor;
  api.dragSphereCamera = dragSphereCamera;
  api.rotateCameraAboutCenter = rotateCameraAboutCenter;
  api.quatFromUnitVectors = quatFromUnitVectors;
  api.rotateVector = rotateVector;
  api.directionFor = directionFor;

  return api;
});
