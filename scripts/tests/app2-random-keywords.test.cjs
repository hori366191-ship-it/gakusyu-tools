/**
 * site/app2「🎲 ランダムに3語」のオフライン回帰テスト
 * 実行: node --test scripts/tests/app2-random-keywords.test.cjs
 *
 * 外部API・GAS・Drive・CDNにはアクセスしない（fake fetch / fake DOM）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

function read(rel) {
  return fs.readFileSync(path.join(SITE, rel), 'utf8');
}

function extractBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('start marker not found: ' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(i + startMarker.length, j);
}

/** 開始マーカー自体を含めて切り出す（関数宣言ごと実行したいとき用） */
function sliceFrom(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('start marker not found: ' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(i, j);
}

function randomKeywordsBlock() {
  return extractBetween(
    read('app2/index.html'),
    '// TESTABLE-RANDOM-KEYWORDS-START',
    '// TESTABLE-RANDOM-KEYWORDS-END'
  );
}

function loadBlock(sandbox) {
  const block = randomKeywordsBlock();
  const ctx = vm.createContext(sandbox || {});
  vm.runInContext(block + '\n;globalThis.__rk = { rkValidatePool, rkPickKeywords, rkSetKey, rkFetchPool, rkCreateController };', ctx);
  return { block, api: ctx.__rk };
}

function createFakeTimers() {
  const timers = [];
  return {
    timers: timers,
    setTimeout: function (fn, ms) {
      const t = { fn: fn, ms: ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: function (t) { if (t) t.cleared = true; },
    pending: function () { return timers.filter(function (t) { return !t.cleared; }); }
  };
}

function makeAbortControllerClass(onCreate) {
  return function AbortController() {
    const ctrl = {
      signal: { aborted: false },
      aborted: false,
      abort: function () {
        ctrl.aborted = true;
        ctrl.signal.aborted = true;
      }
    };
    if (onCreate) onCreate(ctrl);
    return ctrl;
  };
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

const POOL = JSON.parse(read('app2/keyword-pool.json'));

function clonePool() {
  return JSON.parse(JSON.stringify(POOL));
}

function bandOf(word) {
  const hit = POOL.words.find(function (w) { return w.word === word; });
  return hit ? hit.band : '';
}

// ── データ ──────────────────────────────────────────────
test('keyword-pool.json: 手選定300語・lowercase3〜20字・重複なし・3band/10category', () => {
  const raw = JSON.parse(read('app2/keyword-pool.json'));
  assert.equal(raw.version, 1);
  assert.equal(raw.source, 'classroom-handpicked');
  assert.match(raw.note, /手選定/);
  assert.match(raw.note, /辞書データの転載ではなく/);
  assert.equal(raw.words.length, 300);

  const seen = new Set();
  const bands = new Set();
  const cats = new Map();
  for (const item of raw.words) {
    assert.match(item.word, /^[a-z]{3,20}$/, item.word);
    assert.ok(!seen.has(item.word), 'duplicate: ' + item.word);
    seen.add(item.word);
    bands.add(item.band);
    const per = cats.get(item.category) || { basic: 0, middle: 0, advanced: 0 };
    per[item.band]++;
    cats.set(item.category, per);
  }
  assert.deepEqual(Array.from(bands).sort(), ['advanced', 'basic', 'middle']);
  assert.equal(cats.size, 10);
  for (const entry of cats) {
    const category = entry[0];
    const per = entry[1];
    assert.ok(per.basic >= 3, category + ': basic が少なすぎる');
    assert.ok(per.middle >= 1, category + ': middle が無い');
    assert.ok(per.advanced >= 1, category + ': advanced が無い');
  }
});

// ── 検証 ────────────────────────────────────────────────
test('rkValidatePool: version/band/category/lowercase/長さ/重複/不足をfail-closedで拒否', () => {
  const api = loadBlock().api;
  assert.equal(api.rkValidatePool(POOL).ok, true);
  assert.equal(api.rkValidatePool(clonePool()).pool.words.length, 300);

  function rejects(mutate, error) {
    const raw = clonePool();
    mutate(raw);
    const result = api.rkValidatePool(raw);
    assert.equal(result.ok, false);
    if (error) assert.equal(result.error, error);
  }

  assert.equal(api.rkValidatePool(null).error, 'shape');
  assert.equal(api.rkValidatePool([]).error, 'shape');
  rejects(function (r) { r.version = 2; }, 'version');
  rejects(function (r) { delete r.version; }, 'version');
  rejects(function (r) { r.words = null; }, 'words');
  rejects(function (r) { r.words = {}; }, 'words');
  rejects(function (r) { r.words[0] = null; }, 'item');
  rejects(function (r) { r.words[0] = []; }, 'item');
  rejects(function (r) { r.words[0].word = 'Cat'; }, 'word');
  // 前後空白は正規化して重複判定する（プール内の cat と衝突）
  rejects(function (r) { r.words[0].word = ' cat'; }, 'duplicate');
  // String 強制変換で通る配列・オブジェクト・数値は拒否する
  rejects(function (r) { r.words[0].word = ['cat']; }, 'word');
  rejects(function (r) { r.words[0].word = 42; }, 'word');
  rejects(function (r) { r.words[0].word = { toString: function () { return 'cat'; } }; }, 'word');
  rejects(function (r) { r.words[0].word = new String('cat'); }, 'word');
  rejects(function (r) { r.words[0].band = ['basic']; }, 'band');
  rejects(function (r) { r.words[0].band = 1; }, 'band');
  rejects(function (r) { r.words[0].band = { toString: function () { return 'basic'; } }; }, 'band');
  rejects(function (r) { r.words[0].category = ['animals']; }, 'category');
  rejects(function (r) { r.words[0].category = 1; }, 'category');
  rejects(function (r) { r.words[0].category = { toString: function () { return 'animals'; } }; }, 'category');
  rejects(function (r) { delete r.words[0].category; }, 'category');
  rejects(function (r) { delete r.words[0].band; }, 'band');
  rejects(function (r) { r.words[0].word = 'ab'; }, 'word');
  rejects(function (r) { r.words[0].word = 'a'.repeat(21); }, 'word');
  rejects(function (r) { r.words[0].word = 'cat1'; }, 'word');
  rejects(function (r) { r.words[0].band = 'expert'; }, 'band');
  rejects(function (r) { r.words[0].category = 'unknown'; }, 'category');
  rejects(function (r) { r.words[1].word = r.words[0].word; }, 'duplicate');
  rejects(function (r) { r.words = r.words.slice(0, 2); }, 'short');
  rejects(function (r) { r.words = r.words.filter(function (w) { return w.category === 'animals'; }); }, 'categories');
  rejects(function (r) { r.words = r.words.filter(function (w) { return w.band !== 'advanced'; }); }, 'bands');
});

// ── 選定 ────────────────────────────────────────────────
test('rkPickKeywords: 別カテゴリ3語・上位はbasic混ぜ・未知の級はnull', () => {
  const api = loadBlock().api;

  for (const level of ['7級', '6級']) {
    const set = api.rkPickKeywords(POOL, { level: level, random: function () { return 0.42; } });
    assert.ok(set, level);
    assert.equal(set.length, 3);
    assert.equal(new Set(set.map(function (w) { return w.word; })).size, 3);
    assert.equal(new Set(set.map(function (w) { return w.category; })).size, 3);
    assert.ok(set.every(function (w) { return w.band === 'basic'; }), level + ' はbasicだけ');
  }

  for (const level of ['5級', '4級', '3級']) {
    const set = api.rkPickKeywords(POOL, { level: level, random: function () { return 0.73; } });
    assert.ok(set, level);
    assert.equal(set.length, 3);
    assert.equal(new Set(set.map(function (w) { return w.category; })).size, 3);
    assert.ok(set.some(function (w) { return w.band === 'basic'; }), level + ' はbasicを最低1語');
    assert.ok(set.every(function (w) { return w.band === 'basic' || w.band === 'middle'; }));
  }

  for (const level of ['準2級', '準2級プラス', '2級', '準1級', '1級']) {
    const set = api.rkPickKeywords(POOL, { level: level, random: function () { return 0.91; } });
    assert.ok(set, level);
    assert.equal(set.length, 3);
    assert.equal(new Set(set.map(function (w) { return w.word; })).size, 3);
    assert.equal(new Set(set.map(function (w) { return w.category; })).size, 3);
    assert.ok(set.some(function (w) { return w.band === 'basic'; }), level + ' はbasicを最低1語');
  }

  assert.equal(api.rkPickKeywords(POOL, { level: '不明' }), null);
  assert.equal(api.rkPickKeywords(POOL, { level: '' }), null);
  assert.equal(api.rkPickKeywords(null, { level: '3級' }), null);
  assert.equal(api.rkPickKeywords({ words: [] }, { level: '3級' }), null);
});

test('rkPickKeywords: 直前と同じ3語setを避け、極小プールでも有限に3語を返す', () => {
  const api = loadBlock().api;
  const fixed = function () { return 0; };
  const first = api.rkPickKeywords(POOL, { level: '3級', random: fixed });
  assert.ok(first);
  const second = api.rkPickKeywords(POOL, { level: '3級', random: fixed, previous: first });
  assert.ok(second);
  assert.notEqual(api.rkSetKey(second), api.rkSetKey(first), '直前と同じsetを避ける');

  const tiny = {
    words: [
      { word: 'cat', band: 'basic', category: 'animals' },
      { word: 'run', band: 'basic', category: 'actions' },
      { word: 'sun', band: 'basic', category: 'nature' }
    ]
  };
  const only = api.rkPickKeywords(tiny, { level: '7級', random: fixed });
  assert.equal(only.length, 3);
  const again = api.rkPickKeywords(tiny, { level: '7級', random: fixed, previous: only });
  assert.equal(again.length, 3, '代替が無い極小プールでも3語（無限ループにしない）');
});

// ── 取得 ────────────────────────────────────────────────
test('rkFetchPool: same-origin相対URLで取得し、HTTP/JSON失敗はreject', async () => {
  const api = loadBlock().api;
  const calls = [];
  const pool = await api.rkFetchPool(function (url, init) {
    calls.push({ url: url, init: init });
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(POOL); } });
  });
  assert.equal(pool.words.length, 300);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'keyword-pool.json', 'Pages同originの相対URL');
  assert.equal(calls[0].init.credentials, 'same-origin');

  let httpError = null;
  try {
    await api.rkFetchPool(function () { return Promise.resolve({ ok: false, status: 404 }); });
  } catch (e) { httpError = e; }
  assert.ok(httpError && /http 404/.test(httpError.message));

  let parseError = null;
  try {
    await api.rkFetchPool(function () {
      return Promise.resolve({ ok: true, json: function () { return Promise.reject(new Error('bad json')); } });
    });
  } catch (e) { parseError = e; }
  assert.ok(parseError && /bad json/.test(parseError.message));
});

test('rkFetchPool: 10秒timeoutで必ずreject・abort・timer後始末・遅延応答を捨てる', async () => {
  let abortCtrl = null;
  const api = loadBlock({ AbortController: makeAbortControllerClass(function (c) { abortCtrl = c; }) }).api;
  const timers = createFakeTimers();
  let resolveFetch = null;
  const promise = api.rkFetchPool(function (url, init) {
    assert.equal(init.credentials, 'same-origin');
    assert.ok(init.signal, 'AbortController の signal を渡す');
    return new Promise(function (resolve) { resolveFetch = resolve; });
  }, { timeoutMs: 10000, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });

  assert.equal(timers.timers.length, 1, '取得開始でtimeoutを1つ張る');
  assert.equal(timers.timers[0].ms, 10000, '約10秒');
  let timeoutError = null;
  const observed = promise.then(function () { return 'resolved'; }, function (e) { timeoutError = e; return 'rejected'; });
  timers.timers[0].fn();
  assert.equal(await observed, 'rejected', 'mockがabortを無視しても必ずreject');
  assert.match(timeoutError.message, /timeout/);
  assert.equal(timeoutError.code, 'keyword_pool_timeout');
  assert.equal(abortCtrl.aborted, true, 'timeoutでabortする');
  assert.equal(timers.pending().length, 0, 'timeout後にtimerを残さない');

  // 遅れて届いた応答は結果も状態も変えない
  resolveFetch({ ok: true, json: function () { return Promise.resolve(clonePool()); } });
  await flush();
  assert.match(timeoutError.message, /timeout/, '遅延応答で結果は変わらない');
  assert.equal(timers.pending().length, 0);
});

test('rkFetchPool: 成功/HTTP失敗でtimerをclearし、fetch無しは従来どおりreject', async () => {
  const api = loadBlock().api;
  const timers = createFakeTimers();
  const pool = await api.rkFetchPool(function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(POOL); } });
  }, { timeoutMs: 10000, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  assert.equal(pool.words.length, 300);
  assert.equal(timers.pending().length, 0, '成功時にtimerを残さない');

  const httpTimers = createFakeTimers();
  let httpError = null;
  try {
    await api.rkFetchPool(function () { return Promise.resolve({ ok: false, status: 503 }); },
      { timeoutMs: 10000, setTimeout: httpTimers.setTimeout, clearTimeout: httpTimers.clearTimeout });
  } catch (e) { httpError = e; }
  assert.match(httpError.message, /http 503/);
  assert.equal(httpTimers.pending().length, 0, '失敗時もtimerを残さない');

  let noFetch = null;
  try {
    await api.rkFetchPool(null, { timeoutMs: 10000, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  } catch (e) { noFetch = e; }
  assert.ok(noFetch && /fetch unavailable/.test(noFetch.message));
});

// ── コントローラ ────────────────────────────────────────
test('rkCreateController: 1回取得をキャッシュ・3語置換・busy/status・連打は1回だけ', async () => {
  const loaded = loadBlock();
  const api = loaded.api;
  let fetchCount = 0;
  const replaced = [];
  const statuses = [];
  const busy = [];
  const errors = [];
  const ctrl = api.rkCreateController({
    fetchPool: function () {
      fetchCount++;
      return Promise.resolve(clonePool());
    },
    getLevel: function () { return '3級'; },
    replaceKeywords: function (words) { replaced.push(words); },
    setBusy: function (on) { busy.push(on); },
    setStatus: function (msg) { statuses.push(msg); },
    onError: function (err) { errors.push(err); },
    random: function () { return 0.31; }
  });

  const p1 = ctrl.run();
  const p2 = ctrl.run();
  assert.equal(await p2, false, '連打は1操作にまとめる');
  assert.equal(await p1, true);
  assert.equal(fetchCount, 1);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].length, 3);
  assert.equal(new Set(replaced[0]).size, 3, '重複なし3語');
  assert.deepEqual(busy, [true, false]);
  assert.ok(statuses.indexOf('読み込み中…') !== -1);
  assert.ok(statuses.indexOf('3語に置き換えました') !== -1);
  assert.equal(errors.length, 0);

  assert.equal(await ctrl.run(), true);
  assert.equal(fetchCount, 1, '成功したプールはキャッシュ');
  assert.equal(replaced.length, 2);
  const a = replaced[0].slice().sort().join('|');
  const b = replaced[1].slice().sort().join('|');
  assert.notEqual(a, b, '連続押下で直前と同じsetを避ける');

  assert.equal(/\.focus\s*\(/.test(loaded.block), false, '入力欄へfocusしない');
  assert.equal(/innerHTML/.test(loaded.block), false, '候補はtextContent/valueだけ');
  assert.equal(/\bconfirm\s*\(/.test(loaded.block), false, '確認ダイアログは出さない');
});

test('rkCreateController: 取得/解析/検証の失敗は置換せず、次押下で再取得できる', async () => {
  const api = loadBlock().api;
  let mode = 'http';
  let fetchCount = 0;
  const replaced = [];
  const errors = [];
  const ctrl = api.rkCreateController({
    fetchPool: function () {
      fetchCount++;
      if (mode === 'http') return Promise.reject(new Error('keyword-pool http 503'));
      if (mode === 'parse') return Promise.reject(new Error('bad json'));
      if (mode === 'short') {
        return Promise.resolve({ version: 1, words: [{ word: 'cat', band: 'basic', category: 'animals' }] });
      }
      return Promise.resolve(clonePool());
    },
    getLevel: function () { return '3級'; },
    replaceKeywords: function (words) { replaced.push(words); },
    onError: function (err) { errors.push(err); }
  });

  assert.equal(await ctrl.run(), false);
  assert.equal(replaced.length, 0, '失敗時は既存入力を置換しない');
  assert.equal(errors.length, 1);
  assert.equal(ctrl.state.pool, null, '失敗はキャッシュしない');

  mode = 'parse';
  assert.equal(await ctrl.run(), false);
  mode = 'short';
  assert.equal(await ctrl.run(), false);
  assert.equal(replaced.length, 0);

  mode = 'ok';
  assert.equal(await ctrl.run(), true);
  assert.equal(fetchCount, 4, '失敗のたびに再取得');
  assert.equal(replaced.length, 1);
  assert.equal(ctrl.state.pool.words.length, 300);
});

test('rkCreateController: timeoutで入力保持・busy復帰・次押下retry、遅延応答はpool/入力を書き換えない', async () => {
  let abortCtrl = null;
  const api = loadBlock({ AbortController: makeAbortControllerClass(function (c) { abortCtrl = c; }) }).api;
  const timers = createFakeTimers();
  let call = 0;
  let resolveFirst = null;
  const replaced = [];
  const errors = [];
  const busy = [];
  const statuses = [];
  const ctrl = api.rkCreateController({
    fetchPool: function () {
      call++;
      if (call === 1) {
        return api.rkFetchPool(function () {
          return new Promise(function (resolve) { resolveFirst = resolve; });
        }, { timeoutMs: 10000, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
      }
      return api.rkFetchPool(function () {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(clonePool()); } });
      }, { timeoutMs: 10000, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    },
    getLevel: function () { return '3級'; },
    replaceKeywords: function (words) { replaced.push(words); },
    setBusy: function (on) { busy.push(on); },
    setStatus: function (msg) { statuses.push(msg); },
    onError: function (err) { errors.push(err); },
    random: function () { return 0.31; }
  });

  const p = ctrl.run();
  await flush();
  assert.equal(timers.timers.length, 1);
  timers.timers[0].fn();
  assert.equal(await p, false);
  assert.equal(replaced.length, 0, 'timeout時は既存入力を触らない');
  assert.equal(ctrl.state.pool, null, 'timeoutはキャッシュしない');
  assert.deepEqual(busy, [true, false], 'busyを戻す');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'keyword_pool_timeout');
  assert.equal(abortCtrl.aborted, true);
  assert.equal(statuses[statuses.length - 1], '', 'statusを読み込み中のままにしない');

  // timeout後に届いた応答でpool/入力が書き換わらない
  resolveFirst({ ok: true, json: function () { return Promise.resolve(clonePool()); } });
  await flush();
  assert.equal(ctrl.state.pool, null, '遅延応答でpoolを設定しない');
  assert.equal(replaced.length, 0, '遅延応答で入力を置換しない');

  // 次押下で再取得できる
  assert.equal(await ctrl.run(), true);
  assert.equal(call, 2);
  assert.equal(replaced.length, 1);
  assert.equal(ctrl.state.pool.words.length, 300);
  assert.equal(timers.pending().length, 0, '成功時にtimerを残さない');
});

test('rkCreateController: 読込中に級が変わったら最新の級で選び直す', async () => {
  const api = loadBlock().api;
  let level = '7級';
  let release = null;
  const replaced = [];
  const ctrl = api.rkCreateController({
    fetchPool: function () {
      return new Promise(function (resolve) { release = function () { resolve(clonePool()); }; });
    },
    getLevel: function () { return level; },
    replaceKeywords: function (words) { replaced.push(words); },
    random: (function () {
      const seq = [0.01, 0.97, 0.5];
      let i = 0;
      return function () { return seq[i++ % seq.length]; };
    })()
  });
  const p = ctrl.run();
  await new Promise(function (resolve) { setImmediate(resolve); });
  level = '1級';  // 読み込み中に級を変更
  release();
  assert.equal(await p, true);
  const bands = replaced[0].map(bandOf);
  assert.ok(bands.indexOf('advanced') !== -1, '旧いbasic級の結果ではなく最新級で再選択: ' + bands.join(','));
  assert.ok(bands.indexOf('basic') !== -1, 'basicを最低1語');
});

// ── 置換とUI契約 ────────────────────────────────────────
test('replaceKeywordRows: 既存6欄を全削除して3語だけ入れ、追加ボタン状態を更新', () => {
  const html = read('app2/index.html');
  const fnSource = sliceFrom(html, 'function replaceKeywordRows(words) {', '      const randomKeywords = rkCreateController(');
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push({ value: 'kw' + i });
  const list = {
    children: rows,
    get firstChild() { return this.children[0] || null; },
    removeChild: function (child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    }
  };
  const added = [];
  let updates = 0;
  const ctx = vm.createContext({
    document: { getElementById: function (id) { return id === 'keywordList' ? list : null; } },
    addKeywordRow: function (w) { added.push(w); list.children.push({ value: w }); },
    updateAddKeywordBtn: function () { updates++; }
  });
  vm.runInContext(fnSource + '\n;globalThis.__replace = replaceKeywordRows;', ctx);
  ctx.__replace(['cat', 'run', 'sun']);
  assert.deepEqual(added, ['cat', 'run', 'sun']);
  assert.equal(list.children.length, 3, '既存6欄を残さない');
  assert.equal(updates, 1, '追加ボタンのdisabledを再評価');
});

test('app2 wiring: type=button/aria-live/hint・max6/maxlength20/送信契約は不変', () => {
  const html = read('app2/index.html');
  assert.match(html, /id="randomKeywordBtn" type="button"/);
  assert.match(html, /現在のキーワードを置き換えます/);
  assert.match(html, /id="randomKeywordStatus" class="keyword-status" role="status" aria-live="polite"/);
  assert.match(html, /const RK_POOL_URL = 'keyword-pool\.json';/);
  assert.match(html, /const RK_FETCH_TIMEOUT_MS = 10000;/, '取得は約10秒で打ち切る');
  assert.match(html, /credentials: 'same-origin'/, 'same-origin取得を維持');
  assert.match(html, /const MAX_KEYWORDS = 6;/);
  assert.match(html, /const KEYWORD_MAXLEN = 20;/);
  assert.match(html, /keywords: readKeywords\(\)/);
  assert.match(html, /settings: payload \|\| \{\}/, 'generateText の settings 送信契約は不変');

  const wiring = extractBetween(html, "if (randomKeywordBtn) {", 'applyTextType();');
  assert.equal(/\bconfirm\s*\(/.test(wiring), false, '確認ダイアログ無し');
  assert.equal(/\.focus\s*\(/.test(wiring), false, '入力欄へfocusしない');
  assert.match(wiring, /randomKeywords\.run\(\)/);

  const config = extractBetween(html, 'const randomKeywords = rkCreateController({', 'if (randomKeywordBtn) {');
  assert.match(config, /fetchPool: function \(\) \{ return rkFetchPool\(\); \}/, '既定timeoutで取得');
  assert.match(config, /randomKeywordBtn\.disabled = !!on/, '読込中は連打を止める');
  assert.match(config, /setAttribute\('aria-busy'/);
  assert.match(config, /randomKeywordStatus\.textContent = msg/, 'aria-live は textContent で更新');
  assert.match(config, /getLevel: function \(\) \{ return document\.getElementById\('fLevel'\)\.value; \}/, '選択時に最新の級を読む');
  assert.match(config, /showToast\('キーワード候補を読み込めませんでした/, 'ロード失敗はtoast');
  assert.match(config, /replaceKeywords: replaceKeywordRows/);

  const replace = extractBetween(html, 'function replaceKeywordRows(words) {', 'const randomKeywords = rkCreateController(');
  assert.match(replace, /while \(list\.firstChild\)/);
  assert.match(replace, /addKeywordRow\(w\)/);
  assert.match(replace, /updateAddKeywordBtn\(\)/);
});

test('themes: 標準/pop/forestすべてにランダム3語UIのスタイルがある', () => {
  const html = read('app2/index.html');
  assert.match(html, /#randomKeywordBtn \{/);
  assert.match(html, /\.keyword-hint \{/);
  assert.match(html, /\.keyword-status \{/);
  for (const theme of ['pop', 'forest']) {
    const css = read('themes/' + theme + '.css');
    assert.match(css, new RegExp('html\\[data-theme="' + theme + '"\\] #randomKeywordBtn'), theme + ': random button');
    assert.match(css, new RegExp('html\\[data-theme="' + theme + '"\\] \\.keyword-hint'), theme + ': hint');
    assert.match(css, new RegExp('html\\[data-theme="' + theme + '"\\] \\.keyword-status'), theme + ': status');
  }
});
