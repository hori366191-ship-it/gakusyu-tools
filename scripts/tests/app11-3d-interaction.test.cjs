/**
 * app11-3d 入力解釈の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-interaction.test.cjs
 *
 * 対象: site/app11/3d/interaction.js
 *   - キーボードのパン / オービット / ズーム / リセット / フォーカス
 *   - ホイール・ピンチ・検索移動
 *   - 入力欄ではショートカットを奪わない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const I = require(path.join(ROOT, 'site', 'app11', '3d', 'interaction.js'));
const P = require(path.join(ROOT, 'site', 'app11', '3d', 'projection.js'));

test('[keyboard] 矢印はカメラ平行移動のパン、Shift+矢印は従来どおりのオービット', () => {
  // カメラ移動の逆が内容の移動: →/D はカメラ右＝内容は左（dx 負）。
  assert.deepEqual(I.actionForKey({ key: 'ArrowRight' }), { type: 'pan', dx: -I.PAN_STEP, dy: 0 });
  assert.deepEqual(I.actionForKey({ key: 'ArrowLeft' }), { type: 'pan', dx: I.PAN_STEP, dy: 0 });
  // 上下も同様: ↑/W はカメラ上＝内容は下（dy 正）。
  assert.deepEqual(I.actionForKey({ key: 'ArrowUp' }), { type: 'pan', dx: 0, dy: I.PAN_STEP });
  assert.deepEqual(I.actionForKey({ key: 'ArrowDown' }), { type: 'pan', dx: 0, dy: -I.PAN_STEP });
  // Shift+矢印のオービットは符号を変えない。
  const orbit = I.actionForKey({ key: 'ArrowLeft', shiftKey: true });
  assert.equal(orbit.type, 'orbit');
  assert.ok(orbit.dx < 0);
  assert.ok(I.actionForKey({ key: 'ArrowUp', shiftKey: true }).dy < 0);
});

test('[keyboard] WASD は矢印と同じカメラ平行移動（ズーム・前後移動ではない）', () => {
  assert.deepEqual(I.actionForKey({ key: 'w' }), { type: 'pan', dx: 0, dy: I.PAN_STEP });
  assert.deepEqual(I.actionForKey({ key: 'W' }), { type: 'pan', dx: 0, dy: I.PAN_STEP });
  assert.deepEqual(I.actionForKey({ key: 'a' }), { type: 'pan', dx: I.PAN_STEP, dy: 0 });
  assert.deepEqual(I.actionForKey({ key: 's' }), { type: 'pan', dx: 0, dy: -I.PAN_STEP });
  assert.deepEqual(I.actionForKey({ key: 'd' }), { type: 'pan', dx: -I.PAN_STEP, dy: 0 });
  // 内容座標（panCamera に渡す向き）でもカメラ移動の逆であることを明示
  assert.deepEqual(I.keyboardPanDirectionForKey('ArrowLeft'), { x: 1, y: 0 });
  assert.deepEqual(I.keyboardPanDirectionForKey('ArrowRight'), { x: -1, y: 0 });
  assert.deepEqual(I.keyboardPanDirectionForKey('ArrowUp'), { x: 0, y: 1 });
  assert.deepEqual(I.keyboardPanDirectionForKey('ArrowDown'), { x: 0, y: -1 });
  // 矢印と完全に同じ結果
  for (const [key, arrow] of [['w', 'ArrowUp'], ['a', 'ArrowLeft'], ['s', 'ArrowDown'], ['d', 'ArrowRight']]) {
    assert.deepEqual(I.actionForKey({ key }), I.actionForKey({ key: arrow }));
  }
  // 修飾キー付きのネイティブ操作は奪わない
  assert.equal(I.actionForKey({ key: 'w', ctrlKey: true }), null);
  assert.equal(I.actionForKey({ key: 'a', metaKey: true }), null);
  assert.equal(I.actionForKey({ key: 's', altKey: true }), null);
  assert.equal(I.actionForKey({ key: 'd', ctrlKey: true }), null);
  // 入力欄では発火しない
  assert.equal(I.shouldHandleKey({ key: 'w', target: { tagName: 'INPUT' } }), false);
  // Shift 併用は矢印と同じく視点回転
  assert.equal(I.actionForKey({ key: 'w', shiftKey: true }).type, 'orbit');
  assert.equal(I.actionForKey({ key: 'a', shiftKey: true }).type, 'orbit');
  assert.deepEqual(I.actionForKey({ key: 'w', shiftKey: true }), I.actionForKey({ key: 'ArrowUp', shiftKey: true }));
});

test('[keyboard-e2e] 8 キーともカメラの画面方向へ target が動き、固定点は逆へ流れる', () => {
  const vp = { width: 1440, height: 900 };
  // ヨー・ピッチに依存しないことを確認する。
  for (const azimuth of [-140, -35, 0, 20, 110, 180]) {
    for (const elevation of [-40, 0, 22, 60]) {
      const base = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth, elevation, fov: 52 });
      const point = { x: 10, y: 0, z: 0 };
      const before = P.cameraView(base, point, vp);
      assert.ok(before, 'azimuth ' + azimuth);
      const basis = P.cameraBasis(base);
      function after(key) {
        const action = I.actionForKey({ key });
        assert.equal(action.type, 'pan', key);
        const next = P.panCamera(base, action.dx, action.dy, vp);
        const screen = P.cameraView(next, point, vp);
        const delta = P.sub(next.target, base.target);
        return {
          screen,
          right: P.dot(delta, basis.right),
          up: P.dot(delta, basis.up)
        };
      }
      const ctx = ' (az ' + azimuth + ', el ' + elevation + ')';
      // カメラは右へ / 固定点は左へ
      for (const key of ['ArrowRight', 'd', 'D']) {
        const r = after(key);
        assert.ok(r.right > 0.01, key + ' でカメラが右へ動いていない' + ctx);
        assert.ok(r.screen.x < before.x - 1, key + ' で固定点が左へ流れていない' + ctx);
      }
      // カメラは左へ / 固定点は右へ
      for (const key of ['ArrowLeft', 'a', 'A']) {
        const r = after(key);
        assert.ok(r.right < -0.01, key + ' でカメラが左へ動いていない' + ctx);
        assert.ok(r.screen.x > before.x + 1, key + ' で固定点が右へ流れていない' + ctx);
      }
      // カメラは上へ / 固定点は下へ
      for (const key of ['ArrowUp', 'w', 'W']) {
        const r = after(key);
        assert.ok(r.up > 0.01, key + ' でカメラが上へ動いていない' + ctx);
        assert.ok(r.screen.y > before.y + 1, key + ' で固定点が下へ流れていない' + ctx);
      }
      // カメラは下へ / 固定点は上へ
      for (const key of ['ArrowDown', 's', 'S']) {
        const r = after(key);
        assert.ok(r.up < -0.01, key + ' でカメラが下へ動いていない' + ctx);
        assert.ok(r.screen.y < before.y - 1, key + ' で固定点が上へ流れていない' + ctx);
      }
      // 左右・上下が混ざらない（浮動小数の誤差は許容）
      assert.ok(Math.abs(after('ArrowLeft').screen.y - before.y) < 1e-6);
      assert.ok(Math.abs(after('ArrowUp').screen.x - before.x) < 1e-6);
    }
  }
  // Shift+矢印はこれまでどおり視点回転で、パン結果とは異なる
  const base = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 120, azimuth: -35, elevation: 22, fov: 52 });
  const orbit = I.actionForKey({ key: 'ArrowLeft', shiftKey: true });
  assert.equal(orbit.type, 'orbit');
  assert.ok(orbit.dx < 0);
  assert.notDeepEqual(orbit, I.actionForKey({ key: 'ArrowLeft' }));
  void base;
});

test('[keyboard-smooth] タップは複数フレームで滑らかに進み、止まると active=false', () => {
  const motion = I.createKeyboardPan({ stepPx: 46, speedPxPerSec: 520, smoothMs: 110 });
  assert.equal(motion.press('ArrowRight'), true);
  assert.equal(motion.press('ArrowRight'), false, 'OS リピート相当の再 press は無視');
  assert.equal(motion.release('ArrowRight'), true);
  let ts = 0;
  const first = motion.step(ts);
  assert.equal(first.dx, 0);
  assert.equal(first.active, true);
  let total = 0;
  let frames = 0;
  let last = first;
  for (let i = 0; i < 200 && last.active; i++) {
    ts += 16;
    last = motion.step(ts);
    total += last.dx;
    frames++;
  }
  assert.ok(frames >= 3, '複数フレームで進んでいない: ' + frames);
  assert.ok(frames < 100, 'いつまでも終わらない');
  // → は右側を見る=内容は左へ動く（負方向）
  assert.ok(Math.abs(total + 46) < 1.5, 'タップ距離が 1 ステップに収束しない: ' + total);
  assert.equal(last.active, false);
  // 止まった後は追加の移動も rAF 予約もない
  const idle = motion.step(ts + 16);
  assert.equal(idle.dx, 0);
  assert.equal(idle.active, false);
});

test('[keyboard-smooth] 保持中は OS リピートなしで一定速度、離すと短く収束して止まる', () => {
  const motion = I.createKeyboardPan({ stepPx: 46, speedPxPerSec: 600, smoothMs: 80 });
  motion.press('ArrowUp');
  let ts = 0;
  motion.step(ts);
  let total = 0;
  for (let i = 0; i < 60; i++) { // 約 1 秒
    ts += 16;
    total += motion.step(ts).dy;
  }
  // 初動ステップ 46 + 保持 600px 前後（イージング分だけ少し遅れる）
  assert.ok(total > 500 && total < 700, '保持中の移動量が想定外: ' + total);
  motion.release('ArrowUp');
  let remain = 0;
  let last = { active: true };
  for (let i = 0; i < 100 && last.active; i++) {
    ts += 16;
    last = motion.step(ts);
    remain += last.dy;
  }
  assert.ok(remain > 0, '離した後に残りが収束しない');
  assert.ok(remain < 60, '離した後の移動が大きすぎる: ' + remain);
  assert.equal(last.active, false);
});

test('[keyboard-smooth] cancel で即停止し、方向は左右上下が正しい', () => {
  const motion = I.createKeyboardPan({ stepPx: 46, speedPxPerSec: 520, smoothMs: 110 });
  motion.press('ArrowLeft');
  motion.press('w');
  let ts = 0;
  motion.step(ts);
  ts += 16;
  const moved = motion.step(ts);
  // カメラ移動: ← で内容は右へ（正）、↑ で内容は下へ（正）。
  assert.ok(moved.dx > 0, '左キーで内容が右へ流れていない');
  assert.ok(moved.dy > 0, '上キーで内容が下へ流れていない');
  motion.cancel();
  ts += 16;
  const stopped = motion.step(ts);
  assert.equal(stopped.dx, 0);
  assert.equal(stopped.dy, 0);
  assert.equal(stopped.active, false);
});

test('[keyboard] ズーム・リセット・フォーカス・層・未接続・検索', () => {
  assert.equal(I.actionForKey({ key: '+' }).type, 'zoom');
  assert.ok(I.actionForKey({ key: '+' }).factor < 1);
  assert.ok(I.actionForKey({ key: '-' }).factor > 1);
  assert.equal(I.actionForKey({ key: 'r' }).type, 'reset');
  assert.equal(I.actionForKey({ key: 'R' }).type, 'reset');
  assert.equal(I.actionForKey({ key: 'f' }).type, 'focus');
  assert.equal(I.actionForKey({ key: 'l' }).type, 'layer');
  assert.equal(I.actionForKey({ key: 'u' }).type, 'unconnected');
  assert.equal(I.actionForKey({ key: '/' }).type, 'search');
  assert.equal(I.actionForKey({ key: '?' }).type, 'help');
  assert.equal(I.actionForKey({ key: 'Escape' }).type, 'escape');
  assert.equal(I.actionForKey({ key: 'x' }), null);
});

test('[keyboard] 修飾キー付き・入力欄では発火しない', () => {
  assert.equal(I.actionForKey({ key: 'r', ctrlKey: true }), null);
  assert.equal(I.actionForKey({ key: 'r', metaKey: true }), null);
  assert.equal(I.shouldHandleKey({ key: 'r', target: { tagName: 'INPUT' } }), false);
  assert.equal(I.shouldHandleKey({ key: 'r', target: { tagName: 'TEXTAREA' } }), false);
  assert.equal(I.shouldHandleKey({ key: 'r', target: { tagName: 'BUTTON' } }), true);
  assert.equal(I.shouldHandleKey({ key: 'r', target: { isContentEditable: true } }), false);
});

test('[wheel] 下回転で縮小、上回転で拡大、係数はクランプ', () => {
  assert.ok(I.wheelZoomFactor(120) > 1);
  assert.ok(I.wheelZoomFactor(-120) < 1);
  assert.equal(I.wheelZoomFactor(100000), 1.7);
  assert.equal(I.wheelZoomFactor(-100000), 0.6);
});

test('[pointer] 左はオービット、右/Shift はパン', () => {
  assert.equal(I.pointerMode({ button: 0 }), 'orbit');
  assert.equal(I.pointerMode({ button: 2 }), 'pan');
  assert.equal(I.pointerMode({ button: 1 }), 'pan');
  assert.equal(I.pointerMode({ button: 0, shiftKey: true }), 'pan');
});

test('[pinch] 距離・中点・角度・ジェスチャー', () => {
  const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const b = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
  assert.equal(I.pinchDistance(a), 100);
  assert.deepEqual(I.pinchMidpoint(a), { x: 50, y: 0 });
  assert.equal(I.pinchAngle(a), 0);
  const gesture = I.pinchGesture(a, b);
  assert.ok(gesture);
  assert.equal(gesture.zoomFactor, 2);
  assert.equal(gesture.panDx, -25);
  assert.equal(gesture.panDy, 0);
  assert.equal(I.pinchGesture([], []), null);
  assert.equal(I.pinchGesture(a, [{ x: 0, y: 0 }]), null);
});

test('[touch] 1本指は移動/回転トグルに従い、マウスは従来どおり', () => {
  assert.equal(I.touchMode('rotate'), 'rotate');
  assert.equal(I.touchMode('move'), 'move');
  assert.equal(I.touchMode(undefined), 'rotate');
  assert.equal(I.touchMode(''), 'rotate');
  assert.equal(I.oneFingerMode('touch', 'move'), 'pan');
  assert.equal(I.oneFingerMode('touch', 'rotate'), 'orbit');
  assert.equal(I.oneFingerMode('mouse', 'rotate', { button: 0 }), 'orbit');
  assert.equal(I.oneFingerMode('mouse', 'move', { button: 0 }), 'orbit');
  assert.equal(I.oneFingerMode('mouse', 'move', { button: 2 }), 'pan');
  assert.equal(I.oneFingerMode('mouse', 'move', { button: 0, shiftKey: true }), 'pan');
});

test('[pinch] 2本指のひねりでは回転しない（両モード共通でズーム+中点移動）', () => {
  const prev = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const rotated = [{ x: 50, y: -50 }, { x: 50, y: 50 }];
  const gesture = I.pinchGesture(prev, rotated);
  assert.ok(gesture);
  assert.equal(gesture.orbitDx, 0);
  assert.equal(gesture.orbitDy, 0);
  assert.ok(Math.abs(gesture.twist) > 0.1);
  assert.equal(gesture.panDx, 0);
  assert.equal(gesture.panDy, 0);
  // ズームと中点移動は残る
  const moved = [{ x: 0, y: 0 }, { x: 40, y: 20 }];
  const g2 = I.pinchGesture(prev, moved);
  assert.ok(g2.zoomFactor > 1, '指を寄せると拡大係数 > 1');
  assert.equal(g2.panDx, -30);
  assert.equal(g2.panDy, 10);
});

test('[search] 結果の上下移動は端で循環する', () => {
  assert.equal(I.searchNavigation([1, 2, 3], 0, -1), 2);
  assert.equal(I.searchNavigation([1, 2, 3], 2, 1), 0);
  assert.equal(I.searchNavigation([1, 2, 3], 1, 1), 2);
  assert.equal(I.searchNavigation([], 0, 1), -1);
});
