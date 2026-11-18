/**
 * app11-3d 投影・カメラの回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-projection.test.cjs
 *
 * 対象: site/app11/3d/projection.js
 *   - 曲線のない純粋なカメラ計算
 *   - オービット / ズーム / パン / フォーカスの距離・向き
 *   - 透視投影と奥行き順
 *   - カードが常に画面正対（軸平行・正の面積・ミラーなし）であること
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const P = require(path.join(ROOT, 'site', 'app11', '3d', 'projection.js'));

const VIEW = { width: 1280, height: 900 };

function near(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
}

test('[basis] right / up / forward は正規直交で、画面の向きが右手系', () => {
  const cam = P.createCamera({ target: { x: 3, y: -2, z: 5 }, distance: 80, azimuth: -35, elevation: 22, fov: 52 });
  const b = P.cameraBasis(cam);
  near(P.length(b.right), 1);
  near(P.length(b.up), 1);
  near(P.length(b.forward), 1);
  near(P.dot(b.right, b.up), 0);
  near(P.dot(b.right, b.forward), 0);
  near(P.dot(b.up, b.forward), 0);
  // right × up は -forward 側（screen x 右, screen y 上, 視線は forward）
  const crossed = P.cross(b.right, b.up);
  near(P.dot(crossed, b.forward), -1);
});

test('[project] target は画面中央、right は +x、up は -y に写る', () => {
  const cam = P.createCamera({ target: { x: 10, y: 20, z: -30 }, distance: 120, azimuth: 17, elevation: 31, fov: 50 });
  const center = P.cameraView(cam, cam.target, VIEW);
  assert.ok(center);
  near(center.x, VIEW.width / 2, 1e-6);
  near(center.y, VIEW.height / 2, 1e-6);
  assert.ok(center.z > 0);

  const b = P.cameraBasis(cam);
  const rightPoint = P.add(cam.target, P.mul(b.right, 10));
  const upPoint = P.add(cam.target, P.mul(b.up, 10));
  const pRight = P.cameraView(cam, rightPoint, VIEW);
  const pUp = P.cameraView(cam, upPoint, VIEW);
  assert.ok(pRight.x > center.x);
  assert.ok(pUp.y < center.y);
});

test('[project] カメラの後ろは投影されない', () => {
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 40, azimuth: 0, elevation: 0 });
  const b = P.cameraBasis(cam);
  const behind = P.add(b.eye, P.mul(b.forward, -30));
  assert.equal(P.cameraView(cam, behind, VIEW), null);
  assert.equal(P.isFrontFacing(cam, behind, VIEW), false);
  assert.equal(P.isFrontFacing(cam, cam.target, VIEW), true);
});

test('[orbit] 距離とターゲットを保ち、仰角は上下限で止まる', () => {
  const cam = P.createCamera({ target: { x: 4, y: 5, z: 6 }, distance: 90, azimuth: 0, elevation: 0 });
  const rotated = P.orbitCamera(cam, 120, -60);
  near(rotated.distance, 90);
  assert.deepEqual(rotated.target, cam.target);
  assert.ok(rotated.azimuth !== cam.azimuth);
  assert.ok(rotated.elevation > cam.elevation);

  const high = P.orbitCamera(rotated, 0, -100000);
  near(P.toDeg(high.elevation), P.MAX_ELEVATION, 1e-9);
  const low = P.orbitCamera(rotated, 0, 100000);
  near(P.toDeg(low.elevation), P.MIN_ELEVATION, 1e-9);
});

test('[zoom] 係数を掛け、上下限でクランプする', () => {
  const cam = P.createCamera({ distance: 100 });
  near(P.zoomCamera(cam, 0.5).distance, 50);
  near(P.zoomCamera(cam, 1.5).distance, 150);
  near(P.zoomCamera(cam, 0.00001).distance, P.MIN_DISTANCE);
  near(P.zoomCamera(cam, 100000).distance, P.MAX_DISTANCE);
});

test('[pan] ドラッグ方向にターゲットが動き、右ドラッグで地図が右へ付いてくる', () => {
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 100, azimuth: 0, elevation: 0 });
  const b = P.cameraBasis(cam);
  const moved = P.panCamera(cam, 60, 0, VIEW);
  const delta = P.sub(moved.target, cam.target);
  assert.ok(P.dot(delta, b.right) < 0);
  const down = P.panCamera(cam, 0, 40, VIEW);
  assert.ok(P.dot(P.sub(down.target, cam.target), b.up) > 0);
  near(P.distance(moved.target, cam.target), 60 * P.worldPerPixel(cam, VIEW), 1e-6);
});

test('[fit] 全点を含むターゲットと距離を返す', () => {
  const points = [
    { x: -100, y: -20, z: -50 },
    { x: 100, y: 30, z: 50 },
    { x: 0, y: 0, z: 0 }
  ];
  const cam = P.fitCamera(points, VIEW, { fov: 52, margin: 1.14, azimuth: -30, elevation: 20 });
  near(cam.target.x, 0);
  near(cam.target.y, 5);
  near(cam.target.z, 0);
  assert.ok(cam.distance > 100);
  assert.ok(cam.distance <= P.MAX_DISTANCE);
});

test('[focus] 対象点をターゲットにし、距離を有限に保つ', () => {
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 300, azimuth: 10, elevation: 15 });
  const point = { x: 42, y: -8, z: 17 };
  const focused = P.focusCamera(cam, point, 12);
  assert.deepEqual(focused.target, point);
  assert.ok(focused.distance >= P.MIN_DISTANCE && focused.distance <= P.MAX_DISTANCE);
  assert.equal(focused.azimuth, cam.azimuth);
  assert.equal(focused.elevation, cam.elevation);
});

test('[card] どの視点でも画面正対・正の面積・ミラーなし', () => {
  const camera = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 100, azimuth: 0, elevation: 0 });
  const cases = [
    { x: 320, y: 240 },
    { x: 640, y: 450 },
    { x: 1000, y: 700 }
  ];
  for (const screen of cases) {
    const quad = P.cardQuad(screen, 120, 26);
    near(quad.width, 120);
    near(quad.height, 26);
    near(P.quadArea(quad), 120 * 26, 1e-9);
    assert.ok(quad.corners[1].x > quad.corners[0].x);
    assert.ok(Math.abs(quad.corners[1].y - quad.corners[0].y) < 1e-9);
    assert.ok(quad.corners[2].y > quad.corners[1].y);
    // 反時計回り（スクリーン座標）で符号付き面積が正 = 裏返っていない
    const c = quad.corners;
    let signed = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      signed += a.x * b.y - b.x * a.y;
    }
    assert.ok(signed > 0);
  }

  // 真横・真上に近い視点でもカードの矩形は潰れない（投影点が前にある限り）
  for (const elevation of [-85, 0, 85]) {
    for (const azimuth of [-180, -90, 0, 90, 180]) {
      const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 100, azimuth, elevation });
      const p = P.cameraView(cam, cam.target, VIEW);
      if (!p) continue;
      const quad = P.cardQuad(p, 120, 26);
      near(P.quadArea(quad), 120 * 26, 1e-9);
      assert.ok(quad.corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y)));
    }
  }
});

test('[depth] 遠い順に並べ替える', () => {
  const items = [{ z: 3 }, { z: 10 }, { z: 1 }];
  assert.deepEqual(P.sortByDepth(items, (item) => item.z).map((item) => item.z), [10, 3, 1]);
});

test('[usable] 詳細パネル・ヘッダ・ツールバーを除いた最大領域を選ぶ（desktop 1440x900）', () => {
  const vp = { width: 1440, height: 900 };
  const panels = {
    header: { x: 0, y: 0, width: 1440, height: 104 },
    toolbar: { x: 18, y: 830, width: 520, height: 52 },
    detail: { x: 1050, y: 104, width: 372, height: 778 }
  };
  const usable = P.computeUsableViewport(vp, panels);
  assert.deepEqual(usable, { x: 0, y: 104, width: 1050, height: 726 });
  // パネルと重ならない（中心が詳細の裏ではない）
  const cx = usable.x + usable.width / 2;
  const cy = usable.y + usable.height / 2;
  assert.ok(cx < panels.detail.x);
  assert.ok(cy > panels.header.height);
  assert.ok(cy < panels.toolbar.y);
});

test('[usable] モバイル 390x844 は下部パネルを除いた領域を残す', () => {
  const vp = { width: 390, height: 844 };
  const panels = {
    header: { x: 0, y: 0, width: 390, height: 150 },
    toolbar: { x: 10, y: 774, width: 370, height: 60 },
    detail: { x: 10, y: 418, width: 370, height: 330 }
  };
  const usable = P.computeUsableViewport(vp, panels);
  assert.deepEqual(usable, { x: 0, y: 150, width: 390, height: 268 });
  assert.ok(usable.height >= 200, '地図の使える高さが確保されていない');
  assert.ok(usable.y + usable.height <= panels.detail.y);
});

test('[center] 選択点を実表示領域の中心へ置き、ズーム（距離）は変えない', () => {
  for (const scenario of [
    {
      vp: { width: 1440, height: 900 },
      usable: { x: 0, y: 104, width: 1050, height: 726 }
    },
    {
      vp: { width: 390, height: 844 },
      usable: { x: 0, y: 150, width: 390, height: 268 }
    }
  ]) {
    const basis = P.cameraBasis(P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth: -35, elevation: 22 }));
    // 画面のはるか外にある点ほど、確実に動く
    const point = { x: 400, y: 25, z: -300 };
    const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth: -35, elevation: 22 });
    const centered = P.centerCameraOnPoint(cam, point, scenario.vp, scenario.usable);
    const projected = P.cameraView(centered, point, scenario.vp);
    assert.ok(projected);
    near(projected.x, scenario.usable.x + scenario.usable.width / 2, 1e-6);
    near(projected.y, scenario.usable.y + scenario.usable.height / 2, 1e-6);
    // 距離・角度は不変（意図しないズームをしない）
    assert.equal(centered.distance, cam.distance);
    assert.equal(centered.azimuth, cam.azimuth);
    assert.equal(centered.elevation, cam.elevation);
    void basis;
  }
});

test('[center] 手動パン後は「まだ中心」でないので寄せ直さない判定になる', () => {
  const vp = { width: 1440, height: 900 };
  const usable = { x: 0, y: 104, width: 1050, height: 726 };
  const point = { x: 40, y: 10, z: -20 };
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth: -35, elevation: 22 });
  const centered = P.centerCameraOnPoint(cam, point, vp, usable);
  assert.equal(P.isPointCentered(centered, point, vp, usable, 1), true);
  const panned = P.panCamera(centered, 120, 0, vp);
  assert.equal(P.isPointCentered(panned, point, vp, usable, 1), false);
});

test('[startup] 起動は最小距離（最大ズーム）で、中心付近に実在カードが見える', () => {
  const vp = { width: 1440, height: 900 };
  const rect = { x: 0, y: 104, width: 1050, height: 726 };
  const points = [
    { id: 'centerish', x: 0.5, y: 0, z: -0.4 },
    { id: 'other', x: 40, y: 10, z: 30 }
  ];
  const center = { x: 0, y: 0, z: 0 };
  const startup = P.startupCamera(points, center, vp, rect, { fov: 52, azimuth: -35, elevation: 22 });
  near(startup.camera.distance, P.MIN_DISTANCE, 1e-12);
  near(startup.distance, P.MIN_DISTANCE, 1e-12);
  assert.equal(startup.distanceChanged, false);
  assert.equal(startup.exactCenter, true);
  assert.equal(startup.anchorId, null);
  // 中心付近に点が見える（距離を下げていない）
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let nearCenter = 0;
  for (const point of points) {
    const projected = P.cameraView(startup.camera, point, vp);
    if (!projected) continue;
    if (Math.hypot(projected.x - cx, projected.y - cy) <= Math.min(rect.width, rect.height) * 0.28) nearCenter++;
  }
  assert.ok(nearCenter >= 1);
});

test('[startup] 幾何中心にカードが無い場合は最寄りの実在物質を透明アンカーにする', () => {
  const vp = { width: 390, height: 844 };
  const rect = { x: 0, y: 150, width: 390, height: 268 };
  const points = [
    { id: 'a', x: 100, y: 0, z: 100 },
    { id: 'b', x: 140, y: 0, z: 120 }
  ];
  const center = { x: 0, y: 0, z: 0 };
  const startup = P.startupCamera(points, center, vp, rect, { fov: 52, azimuth: -35, elevation: 22 });
  near(startup.camera.distance, P.MIN_DISTANCE, 1e-12);
  assert.equal(startup.distanceChanged, false);
  assert.equal(startup.exactCenter, false);
  assert.equal(startup.anchorId, 'a');
  // アンカーは usableRect の中心へ投影される
  const projected = P.cameraView(startup.camera, startup.anchor, vp);
  near(projected.x, rect.x + rect.width / 2, 1e-6);
  near(projected.y, rect.y + rect.height / 2, 1e-6);
  // 選んだアンカーの実在カードが中心付近に見える
  assert.ok(Math.hypot(projected.x - (rect.x + rect.width / 2), projected.y - (rect.y + rect.height / 2)) < 1e-6);
});

test('[transition] プレビュー中は前のポーズ、その後は単調に進み、最後に正確に着地する', () => {
  const vp = { width: 1440, height: 900 };
  const rect = { x: 0, y: 104, width: 1050, height: 726 };
  const point = { x: 24, y: -8, z: 17 };
  const from = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 150, azimuth: -35, elevation: 22, fov: 52 });
  const to = P.centerCameraOnPoint(P.cameraAroundPoint(from, point), point, vp, rect);
  const preview = 130;
  const duration = 430;
  // プレビュー中は完全に from のまま
  for (const elapsed of [0, 1, 60, 129, 130]) {
    assert.equal(P.transitionProgress(elapsed, preview, duration), 0);
    const cam = P.interpolateCamera(from, to, 0);
    near(cam.target.x, from.target.x, 1e-12);
    near(cam.target.y, from.target.y, 1e-12);
    near(cam.target.z, from.target.z, 1e-12);
  }
  // 進捗は単調増加し、1 を超えない
  let previous = 0;
  let lastProgress = 0;
  for (let elapsed = 131; elapsed <= preview + duration; elapsed += 17) {
    const progress = P.transitionProgress(elapsed, preview, duration);
    assert.ok(progress >= previous, '進捗が逆転した: ' + elapsed);
    previous = progress;
    lastProgress = progress;
    const cam = P.interpolateCamera(from, to, progress);
    assert.ok(cam.target.z >= from.target.z - 1e-9);
  }
  assert.ok(lastProgress > 0.99);
  // 着地は to と一致（向き・倍率も保持）
  const landed = P.interpolateCamera(from, to, P.transitionProgress(preview + duration + 1, preview, duration));
  near(landed.target.x, to.target.x, 1e-9);
  near(landed.target.y, to.target.y, 1e-9);
  near(landed.target.z, to.target.z, 1e-9);
  near(landed.distance, from.distance, 1e-9);
  near(landed.azimuth, from.azimuth, 1e-12);
  near(landed.elevation, from.elevation, 1e-12);
  // 遷移中も pivot は中心へ近づき、着地で一致
  const pivotAtStart = P.cameraView(P.interpolateCamera(from, to, 0), point, vp);
  const pivotAtEnd = P.cameraView(P.interpolateCamera(from, to, 1), point, vp);
  near(pivotAtEnd.x, rect.x + rect.width / 2, 1e-6);
  near(pivotAtEnd.y, rect.y + rect.height / 2, 1e-6);
  assert.ok(Math.abs(pivotAtStart.x - pivotAtEnd.x) > 1, '遷移前後で見え方が変わっていない');
});

test('[transition] 初期位置への遷移は向き・対数距離・中心を滑らかに補間し、着地で一致する', () => {
  const from = P.createCamera({ target: { x: 30, y: 12, z: -20 }, distance: 170, azimuth: 170, elevation: 40, fov: 52 });
  const to = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: P.MIN_DISTANCE, azimuth: -170, elevation: 10, fov: 52 });
  const duration = 520;
  const at = (elapsed) => {
    const progress = P.transitionProgress(elapsed, 0, duration);
    return { progress, cam: P.interpolateCamera(from, to, progress) };
  };
  // 開始は現在のポーズそのもの（ページ初回はここを通らず直接初期ポーズ）
  const start = at(0);
  assert.equal(start.progress, 0);
  near(start.cam.target.x, from.target.x, 1e-12);
  near(start.cam.distance, from.distance, 1e-12);
  near(start.cam.azimuth, from.azimuth, 1e-12);
  // 距離は正のまま単調に縮み、中点は対数スケール sqrt(d0*d1)
  let previousDistance = from.distance;
  for (let elapsed = 40; elapsed < duration; elapsed += 40) {
    const cam = at(elapsed).cam;
    assert.ok(cam.distance > 0);
    assert.ok(cam.distance <= previousDistance + 1e-9, '距離が単調でない');
    previousDistance = cam.distance;
    const degrees = P.toDeg(cam.azimuth);
    assert.ok(degrees >= -180 && degrees <= 180);
  }
  const middle = at(duration / 2).cam;
  near(middle.distance, Math.sqrt(from.distance * to.distance), 1e-9);
  // 方位は短い方向（170° → -170° は +20° 経由で 180°）

  near(Math.abs(P.toDeg(middle.azimuth)), 180, 1e-6);
  // 着地は初期ポーズと完全一致し、距離は最小値（>0）
  const landed = at(duration).cam;
  near(landed.target.x, to.target.x, 1e-9);
  near(landed.target.y, to.target.y, 1e-9);
  near(landed.target.z, to.target.z, 1e-9);
  near(landed.distance, P.MIN_DISTANCE, 1e-9);
  near(landed.azimuth, to.azimuth, 1e-12);
  near(landed.elevation, to.elevation, 1e-12);
});

test('[transition] 連続再選択は現在の補間ポーズを次の開始点にできる', () => {
  const vp = { width: 1440, height: 900 };
  const rect = { x: 0, y: 104, width: 1050, height: 726 };
  const a = { x: -30, y: 4, z: 8 };
  const b = { x: 32, y: -6, z: -20 };
  let camera = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 160, azimuth: 10, elevation: 30 });
  const toA = P.centerCameraOnPoint(P.cameraAroundPoint(camera, a), a, vp, rect);
  const mid = P.interpolateCamera(camera, toA, P.transitionProgress(130 + 160, 130, 430));
  // 新しい選択は mid をそのまま開始点にする（ジャンプなし）
  const from2 = P.cloneCamera(mid);
  const toB = P.centerCameraOnPoint(P.cameraAroundPoint(from2, b), b, vp, rect);
  const start = P.interpolateCamera(from2, toB, 0);
  near(start.target.x, mid.target.x, 1e-12);
  near(start.target.y, mid.target.y, 1e-12);
  near(start.target.z, mid.target.z, 1e-12);
  const end = P.interpolateCamera(from2, toB, 1);
  near(end.target.x, toB.target.x, 1e-9);
  near(end.distance, mid.distance, 1e-9);
});

test('[lock] 固定点は usableRect の中心に留まり、オービットはその点を軸に回る', () => {
  for (const scenario of [
    { vp: { width: 1440, height: 900 }, rect: { x: 0, y: 104, width: 1050, height: 726 } },
    { vp: { width: 390, height: 844 }, rect: { x: 0, y: 150, width: 390, height: 268 } }
  ]) {
    const point = { x: 22, y: -6, z: 13 };
    let cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 130, azimuth: -35, elevation: 22, fov: 52 });
    cam = P.centerCameraOnPoint(cam, point, scenario.vp, scenario.rect);
    const distance = cam.distance;
    for (const [dx, dy] of [[40, 0], [0, 25], [-90, -35], [200, 80]]) {
      cam = P.orbitCameraAroundPoint(cam, point, dx, dy, scenario.vp, scenario.rect);
      const projected = P.cameraView(cam, point, scenario.vp);
      near(projected.x, scenario.rect.x + scenario.rect.width / 2, 1e-6);
      near(projected.y, scenario.rect.y + scenario.rect.height / 2, 1e-6);
      near(cam.distance, distance, 1e-9);
    }
  }
});

test('[lock] 固定点を軸にしたズームでも中心が動かず、距離だけクランプされる', () => {
  const vp = { width: 1440, height: 900 };
  const rect = { x: 0, y: 104, width: 1050, height: 726 };
  const point = { x: -28, y: 12, z: -33 };
  let cam = P.centerCameraOnPoint(
    P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 180, azimuth: 20, elevation: -35, fov: 52 }),
    point, vp, rect
  );
  const azimuth = cam.azimuth;
  const elevation = cam.elevation;
  for (let i = 0; i < 8; i++) {
    cam = P.zoomCameraAroundPoint(cam, point, 0.8, vp, rect);
    const projected = P.cameraView(cam, point, vp);
    near(projected.x, rect.x + rect.width / 2, 1e-6);
    near(projected.y, rect.y + rect.height / 2, 1e-6);
    near(cam.azimuth, azimuth, 1e-12);
    near(cam.elevation, elevation, 1e-12);
  }
  for (let i = 0; i < 30; i++) cam = P.zoomCameraAroundPoint(cam, point, 1.5, vp, rect);
  near(cam.distance, P.MAX_DISTANCE, 1e-9);
  const projected = P.cameraView(cam, point, vp);
  near(projected.x, rect.x + rect.width / 2, 1e-6);
  near(projected.y, rect.y + rect.height / 2, 1e-6);
});

test('[zoom-at] 画面座標の下の点を保ったままズームする（複数位置・向き・拡大縮小）', () => {
  const vp = { width: 1440, height: 900 };
  const cursors = [
    { x: 120, y: 80 },
    { x: 640, y: 450 },
    { x: 1100, y: 780 },
    { x: 1440, y: 0 }
  ];
  for (const cameraOptions of [
    { target: { x: 0, y: 0, z: 0 }, distance: 180, azimuth: -35, elevation: 22 },
    { target: { x: 5, y: 2, z: -3 }, distance: 60, azimuth: 110, elevation: -40 },
    { target: { x: -10, y: 8, z: 4 }, distance: 400, azimuth: 20, elevation: 65 }
  ]) {
    for (const cursor of cursors) {
      for (const factor of [0.8, 1.25]) {
        const cam = P.createCamera(cameraOptions);
        const anchor = P.screenToWorldOnTargetPlane(cam, cursor.x, cursor.y, vp);
        const before = P.cameraView(cam, anchor, vp);
        near(before.x, cursor.x, 1e-6);
        near(before.y, cursor.y, 1e-6);
        const next = P.zoomCameraAtScreen(cam, factor, cursor.x, cursor.y, vp);
        const after = P.cameraView(next, anchor, vp);
        near(after.x, cursor.x, 1e-6);
        near(after.y, cursor.y, 1e-6);
        near(next.distance, P.clamp(cam.distance * factor, P.MIN_DISTANCE, P.MAX_DISTANCE), 1e-9);
        // 回転・選択は変えない
        near(next.azimuth, cam.azimuth, 1e-12);
        near(next.elevation, cam.elevation, 1e-12);
      }
    }
  }
});

test('[zoom-at] 同じカーソルで繰り返してもドリフトせず、クランプ後も画面位置が保たれる', () => {
  const vp = { width: 1440, height: 900 };
  const cursor = { x: 980, y: 210 };
  let cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 260, azimuth: -35, elevation: 22 });
  const anchor = P.screenToWorldOnTargetPlane(cam, cursor.x, cursor.y, vp);
  for (let i = 0; i < 12; i++) {
    cam = P.zoomCameraAtScreen(cam, 0.85, cursor.x, cursor.y, vp);
    const projected = P.cameraView(cam, anchor, vp);
    near(projected.x, cursor.x, 1e-6);
    near(projected.y, cursor.y, 1e-6);
  }
  // ズームアウトで最大距離に達しても同じ画面位置
  for (let i = 0; i < 20; i++) {
    cam = P.zoomCameraAtScreen(cam, 1.5, cursor.x, cursor.y, vp);
  }
  near(cam.distance, P.MAX_DISTANCE, 1e-9);
  const projected = P.cameraView(cam, anchor, vp);
  near(projected.x, cursor.x, 1e-6);
  near(projected.y, cursor.y, 1e-6);
});

test('[zoom-at] カードの world アンカーでも同じ画面位置を保つ', () => {
  const vp = { width: 1440, height: 900 };
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth: -35, elevation: 22 });
  const anchor = { x: 30, y: 8, z: -20 };
  const projected = P.cameraView(cam, anchor, vp);
  assert.ok(projected);
  const next = P.zoomCameraAt(cam, 0.9, anchor, projected.x, projected.y, vp);
  const after = P.cameraView(next, anchor, vp);
  near(after.x, projected.x, 1e-6);
  near(after.y, projected.y, 1e-6);
  near(next.distance, cam.distance * 0.9, 1e-9);
});

test('[clip] 線分を矩形へ切り詰め、完全に外なら null', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  const clipped = P.clipSegment(-50, 50, 150, 50, rect);
  assert.deepEqual(clipped, { x1: 0, y1: 50, x2: 100, y2: 50 });
  assert.equal(P.clipSegment(-50, -50, -10, -10, rect), null);
  // 内側の線分はそのまま
  const inside = P.clipSegment(10, 20, 90, 80, rect);
  assert.deepEqual(inside, { x1: 10, y1: 20, x2: 90, y2: 80 });
});
