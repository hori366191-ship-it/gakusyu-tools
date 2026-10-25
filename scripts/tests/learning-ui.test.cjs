/**
 * 学習ツール（site/app1,3,4,6,7,8）の再発防止テスト
 *
 * 実行: node --test scripts/tests/learning-ui.test.cjs
 *
 * テスト名の接頭辞:
 *   [実行]  対象HTMLから実際の関数を抽出し、小さな fake DOM / fake Canvas 上で実行する
 *   [helper] 対象HTMLから抽出した純粋関数・数式helperの入出力を検証する
 *   [静的]  ソース・HTML・CSSの構造や呼び出し箇所を文字列で確認する（挙動の証明ではない）
 *
 * 外部API・ブラウザ・CDNには接続しない。app1のサニタイザ全体（DOM挙動・悪性/正常
 * Markdownの通過）は実ブラウザのtest agentで確認済みで、ここでは呼び出し配線と
 * helper単体だけを扱う。新規DOMライブラリやHTMLパーサは追加しない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

function read(relPath) {
    return fs.readFileSync(path.join(SITE, relPath), 'utf8');
}

/**
 * 定義済み関数のソースを波括弧の対応で切り出す。
 * 対象関数は文字列・コメント内に波括弧を含まない前提（テスト対象を限定している）。
 * async 関数は async を含めて返す。
 * @param {string} source
 * @param {string} name
 * @returns {string}
 */
function extractFunction(source, name) {
    const marker = 'function ' + name + '(';
    let start = source.indexOf(marker);
    assert.ok(start >= 0, `function ${name} が見つかりません`);
    if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
    const braceStart = source.indexOf('{', start);
    assert.ok(braceStart >= 0, `${name} の本体開始が見つかりません`);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`${name} の終端が見つかりません`);
}

/**
 * `var G={...};` のようなオブジェクトリテラル本体を切り出す。
 * 対象はテストで使うGオブジェクトに限定し、文字列内の波括弧を含まない前提。
 * @param {string} source
 * @param {string} assignment 例: 'var G='
 * @returns {string} `{` から対応する `}` まで
 */
function extractObjectLiteral(source, assignment) {
    const marker = source.indexOf(assignment);
    assert.ok(marker >= 0, `${assignment} が見つかりません`);
    const braceStart = source.indexOf('{', marker + assignment.length);
    assert.ok(braceStart >= 0, `${assignment} の開始が見つかりません`);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(braceStart, i + 1);
        }
    }
    throw new Error(`${assignment} の終端が見つかりません`);
}

/**
 * 関数を依存値注入つきで評価する
 * @param {string} source
 * @param {string} name
 * @param {Record<string, *>} deps
 */
function evalFunction(source, name, deps = {}) {
    const body = extractFunction(source, name);
    const keys = Object.keys(deps);
    const factory = new Function(...keys, 'return (' + body + ');');
    return factory(...keys.map((k) => deps[k]));
}

function countOccurrences(source, needle) {
    let count = 0;
    let index = 0;
    while ((index = source.indexOf(needle, index)) >= 0) {
        count++;
        index += needle.length;
    }
    return count;
}

function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function flushMicrotasks() {
    return new Promise((resolve) => setImmediate(resolve));
}

/* ------------------------------------------------------------------ */
/* app1: async fallback / MathJax stale / サニタイザ配線               */
/* ------------------------------------------------------------------ */

const app1 = read('app1/index.html');
const app1Load = extractFunction(app1, 'loadMarkdownContent');
const app1Render = extractFunction(app1, 'renderFromBundle');

/**
 * loadMarkdownContent を fake DOM で実行するハーネス
 * @param {() => Promise<boolean>} renderImpl
 */
function createApp1LoadHarness(renderImpl) {
    const contentBody = {};
    const searchInput = { value: 'before' };
    const calls = { fetch: [], clear: 0, count: 0, scroll: 0, alert: 0 };
    const fakeDocument = {
        getElementById(id) {
            if (id === 'content-body') return contentBody;
            if (id === 'search-input') return searchInput;
            return null;
        }
    };
    const factory = new Function(
        'document', 'renderFromBundle', 'fetchContentFromApi',
        'clearSearch', 'updateSearchCount', 'resetScrollPosition', 'alert',
        'console',
        'let currentContentId = null;\n' +
        'let contentRequestSeq = 0;\n' +
        app1Load + '\n' +
        'return { load: loadMarkdownContent, getSeq: () => contentRequestSeq, getId: () => currentContentId };'
    );
    const api = factory(
        fakeDocument,
        renderImpl,
        (id) => calls.fetch.push(id),
        () => { calls.clear++; },
        () => { calls.count++; },
        () => { calls.scroll++; },
        () => { calls.alert++; },
        { error() {} }
    );
    return { api, calls, contentBody, searchInput };
}

/**
 * renderFromBundle を fake DOM / fake MathJax で実行するハーネス
 */
function createApp1RenderHarness({ seq = 1, typesetPromise }) {
    const contentBody = { innerHTML: '' };
    const fakeDocument = {
        getElementById(id) { return id === 'content-body' ? contentBody : null; }
    };
    const counters = { process: 0, reset: 0, typeset: 0 };
    const marked = { parse: (md) => '<p>' + md + '</p>' };
    const MathJax = {
        typesetPromise() {
            counters.typeset++;
            return typesetPromise;
        }
    };
    const factory = new Function(
        'document', 'currentBundle', 'contentRequestSeq', 'sanitizeMarkdownHtml',
        'marked', 'MathJax', 'resetScrollPosition', 'processContentForMemorization',
        app1Render + '\n' +
        'return { render: renderFromBundle, setSeq: (v) => { contentRequestSeq = v; } };'
    );
    const currentBundle = { files: [{ id: 'A', content: 'alpha' }] };
    const api = factory(
        fakeDocument,
        currentBundle,
        seq,
        (html) => html,
        marked,
        MathJax,
        () => { counters.reset++; },
        () => { counters.process++; }
    );
    return { api, contentBody, counters };
}

test('[静的] app1: loadMarkdownContent は async で renderFromBundle を await し、呼出し側に catch がある', () => {
    assert.match(app1Load, /^async function loadMarkdownContent/);
    assert.match(app1Load, /const rendered = await renderFromBundle\(fileId, seq\);/);
    assert.match(app1Load, /if \(rendered\) return;/);
    assert.match(app1Load, /catch \(error\)/);
    assert.ok(!/if\s*\(\s*renderFromBundle\s*\(/.test(app1Load),
        'async 関数を if で直接 truthy 判定してはいけない');
    assert.match(app1, /renderFromBundle\(currentContentId\)\.catch\(/);
    assert.match(app1, /loadMarkdownContent\(fileId\)\.catch\(/);
});

test('[実行] app1: loadMarkdownContent は bundle 未処理・例外時に API フォールバックする', async () => {
    const missing = createApp1LoadHarness(() => Promise.resolve(false));
    await missing.api.load('docA');
    assert.deepEqual(missing.calls.fetch, ['docA']);
    assert.equal(missing.api.getId(), 'docA');
    assert.equal(missing.searchInput.value, '');
    assert.equal(missing.calls.clear, 1);
    assert.equal(missing.calls.scroll, 1);

    const handled = createApp1LoadHarness(() => Promise.resolve(true));
    await handled.api.load('docB');
    assert.deepEqual(handled.calls.fetch, []);

    const rejected = createApp1LoadHarness(() => Promise.reject(new Error('bundle broken')));
    await rejected.api.load('docC');
    assert.deepEqual(rejected.calls.fetch, ['docC']);
});

test('[実行] app1: renderFromBundle は MathJax 待機中に要求が変わったら後処理・スクロールをしない', async () => {
    const staleTypeset = makeDeferred();
    const stale = createApp1RenderHarness({ seq: 1, typesetPromise: staleTypeset.promise });
    const stalePromise = stale.api.render('A', 1);
    assert.equal(stale.contentBody.innerHTML, '<p>alpha</p>');
    assert.equal(stale.counters.reset, 1, 'MathJax前のスクロールは1回');
    stale.api.setSeq(2);
    staleTypeset.resolve();
    assert.equal(await stalePromise, true);
    assert.equal(stale.counters.process, 0, 'stale後に暗記前処理をしてはいけない');
    assert.equal(stale.counters.reset, 1, 'stale後にスクロールを上書きしてはいけない');

    const currentTypeset = makeDeferred();
    const current = createApp1RenderHarness({ seq: 1, typesetPromise: currentTypeset.promise });
    const currentPromise = current.api.render('A', 1);
    currentTypeset.resolve();
    assert.equal(await currentPromise, true);
    assert.equal(current.counters.process, 1);
    assert.equal(current.counters.reset, 2);

    const entryTypeset = makeDeferred();
    const entryStale = createApp1RenderHarness({ seq: 2, typesetPromise: entryTypeset.promise });
    assert.equal(await entryStale.api.render('A', 1), true);
    assert.equal(entryStale.contentBody.innerHTML, '');
    assert.equal(entryStale.counters.typeset, 0);
    assert.equal(entryStale.counters.process, 0);
});

test('[静的] app1: marked.parse は sanitizeMarkdownHtml 経由でのみ innerHTML に代入される（XSS全体の証明ではない）', () => {
    // 許可リストの完全性・DOM上の消毒結果はここでは検証しない。
    // full sanitizer behaviour is covered by the test agent's browser run.
    assert.equal(countOccurrences(app1, 'sanitizeMarkdownHtml(marked.parse('), 2,
        'バンドル経路とAPI経路の両方で消毒すること');
    assert.ok(!/innerHTML\s*=\s*marked\.parse\(/.test(app1),
        '消毒していない marked.parse の直接代入が残っている');
    assert.ok(!/\.replace\s*\(\s*\//.test(extractFunction(app1, 'sanitizeMarkdownHtml')),
        '文字列の正規表現置換によるサニタイズは禁止');
    assert.match(app1, /const MD_DROP_TAGS = new Set\(\[/);
});

test('[helper] app1: URL/style/class helper は危険プロトコル・危険style・危険class文字を拒否する', () => {
    const urlFn = evalFunction(app1, 'isSafeMarkdownUrl');
    const classFn = evalFunction(app1, 'isSafeClassValue');
    const alignConst = app1.match(/const MD_ALIGN_VALUES = new Set\(\[[^\]]*\]\);/)[0];
    const styleConst = app1.match(/const MD_STYLE_PROPS = \{[\s\S]*?\n\s*\};/)[0];
    const styleFnSrc = extractFunction(app1, 'sanitizeMarkdownStyle');
    const styleFn = new Function(alignConst + '\n' + styleConst + '\nreturn (' + styleFnSrc + ');')();

    assert.equal(urlFn('https://example.com/a', true, 'https://example.com/'), true);
    assert.equal(urlFn('/app1/', true, 'https://example.com/'), true);
    assert.equal(urlFn('mailto:teacher@example.com', true, 'https://example.com/'), true);
    assert.equal(urlFn('mailto:teacher@example.com', false, 'https://example.com/'), false);
    assert.equal(urlFn('javascript:alert(1)', true, 'https://example.com/'), false);
    assert.equal(urlFn('java\nscript:alert(1)', true, 'https://example.com/'), false);
    assert.equal(urlFn('data:text/html,<script>alert(1)</script>', false, 'https://example.com/'), false);

    assert.equal(classFn('tag-maniac'), true);
    assert.equal(classFn('memorize-target is-revealed'), true);
    assert.equal(classFn('x" onclick="alert(1)'), false);

    assert.equal(styleFn('text-align: center'), 'text-align: center');
    assert.equal(styleFn('text-align:center; background: url(javascript:x)'), 'text-align: center');
    assert.equal(styleFn('position: fixed'), '');
});

/* ------------------------------------------------------------------ */
/* app3: 統計表示の更新先分離 / モバイルgeometry / 実simulation       */
/* ------------------------------------------------------------------ */

const app3 = read('app3/index.html');
const app3Stats = extractFunction(app3, 'updateStats');
const galtonLayoutSrc = extractFunction(app3, 'galtonLayout');
const galtonObjectSrc = extractObjectLiteral(app3, 'var G=');

/**
 * 実アプリの galtonLayout と G オブジェクトを再評価する
 * @param {number} W
 * @param {number} H
 * @param {number} rows
 */
function createGaltonHarness(W, H, rows, options = {}) {
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const factory = new Function(
        'W', 'H', 'clamp',
        galtonLayoutSrc + '\nvar G=' + galtonObjectSrc + ';\nreturn G;'
    );
    const G = factory(W, H, clamp);
    G.rows = rows;
    G.p = options.p === undefined ? 0.5 : options.p;
    G.spawnRate = 100;
    G.timeScale = 1;
    G.ballSize = options.ballSize || 3;
    G.maxBalls = options.maxBalls || 400;
    G.build(false);
    return G;
}

/**
 * W/Hを後から変更できる（resizeを再現できる）Gハーネス
 */
function createResizableGaltonHarness(initialW, initialH, rows, options = {}) {
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const factory = new Function(
        'clamp', 'initialW', 'initialH',
        'let W = initialW, H = initialH;\n' +
        galtonLayoutSrc + '\n' +
        'var G=' + galtonObjectSrc + ';\n' +
        'return { G, setSize(w, h) { W = w; H = h; G.build(true); } };'
    );
    const api = factory(clamp, initialW, initialH);
    const G = api.G;
    G.rows = rows;
    G.p = options.p === undefined ? 0.5 : options.p;
    G.spawnRate = 100;
    G.timeScale = 1;
    G.ballSize = options.ballSize || 3;
    G.maxBalls = options.maxBalls || 400;
    G.build(false);
    return { G, setSize: api.setSize };
}

function makeSeededRandom(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function withSeededRandom(seed, fn) {
    const original = Math.random;
    Math.random = makeSeededRandom(seed);
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

function simulateGalton(G, frames) {
    for (let i = 0; i < frames; i++) G.update(1 / 60);
}

function galtonStats(G) {
    const n = G.counts.reduce((a, b) => a + b, 0);
    const mean = n ? G.counts.reduce((a, c, i) => a + c * i, 0) / n : 0;
    const sd = n
        ? Math.sqrt(G.counts.reduce((a, c, i) => a + c * (i - mean) * (i - mean), 0) / n)
        : 0;
    return { n, mean, sd };
}

/**
 * 全玉が床・左右壁の内側にあり、座標/速度が有限であることを確認する
 */
function assertBallsInside(G, W, label) {
    for (const b of G.balls) {
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `${label}: 座標が有限`);
        assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy), `${label}: 速度が有限`);
        assert.ok(b.x - b.r >= 24 - 1e-9, `${label}: 左壁 x=${b.x}, r=${b.r}`);
        assert.ok(b.x + b.r <= W - 24 + 1e-9, `${label}: 右壁 x=${b.x}, r=${b.r}, W=${W}`);
        assert.ok(b.y + b.r <= G.floorY + 1e-9,
            `${label}: 床貫通 y+r=${b.y + b.r}, floor=${G.floorY}`);
    }
}

function makeGaltonLayout() {
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    return new Function('clamp', 'return (' + galtonLayoutSrc + ');')(clamp);
}

test('[helper] app3: galtonLayout はデスクトップ従来値を保ち、モバイルで binTop を床の上に収める', () => {
    const layout = makeGaltonLayout();
    const desktop = layout(866, 649.5, 12);
    assert.equal(desktop.rowDY, 26);
    assert.equal(desktop.binW, 26);
    assert.ok(Math.abs(desktop.pegR - 3.38) < 1e-9);
    assert.equal(desktop.ballR, 5.2);
    assert.ok(Math.abs(desktop.binTop - 361.58) < 1e-9);
    assert.equal(desktop.floorY, 611.5);

    for (const [W, H] of [[334, 250.5], [332, 249]]) {
        for (const rows of [4, 12, 24]) {
            const L = layout(W, H, rows);
            assert.ok(L.binTop < L.floorY,
                `${W}x${H} rows=${rows}: binTop < floorY`);
            assert.ok(L.binTop <= L.floorY - 20,
                `${W}x${H} rows=${rows}: 集計境界と床の必要margin`);
            assert.ok(L.binLeft >= 24 - 1e-9 && L.binRight <= W - 24 + 1e-9,
                `${W}x${H} rows=${rows}: ビンが玉の可動域内`);
            assert.ok(L.binW * L.nBins <= W - 100 + 1e-9,
                `${W}x${H} rows=${rows}: ビン合計幅がキャンバス内`);
            assert.ok(L.ballR <= Math.min(5.2, L.binW * 0.22) + 1e-9,
                `${W}x${H} rows=${rows}: 玉半径がビン幅に対して過大`);
            assert.ok(L.ballR <= L.rowDY * 0.5 + 1e-9,
                `${W}x${H} rows=${rows}: 玉直径が段間隔に収まらない`);
            assert.ok(L.pegR < L.binW / 2 && L.ballR < L.binW / 2,
                `${W}x${H} rows=${rows}: 半径がビン幅に対して過大`);
            assert.ok(L.rowDY >= 2, `${W}x${H} rows=${rows}: 段間隔が潰れすぎない`);
        }
    }
});

test('[静的] app3: χ² / KS は親要素の textContent を書き換えず専用の子要素を更新する', () => {
    assert.match(app3, /id="gChi"><span id="gChiText">/);
    assert.match(app3, /id="rKs"><span id="rKsText">/);
    assert.ok(!app3.includes("T('gChi',"));
    assert.ok(!app3.includes("T('rKs',"));
    assert.ok(countOccurrences(app3Stats, "T('gChiText'") >= 2);
    assert.ok(countOccurrences(app3Stats, "T('rKsText'") >= 2);
});

test('[静的] app3: 欠落要素でも frame の統計更新が例外を投げない構造になっている', () => {
    const tFn = extractFunction(app3, 'T');
    assert.match(tFn, /getElementById\(id\)/);
    assert.match(tFn, /if\(el\)el\.textContent=v;/);
    const verdictFn = extractFunction(app3, 'setVerdict');
    assert.match(verdictFn, /if\(!el\)return;/);
});

test('[実行] app3: updateStats は親 #gChi / #rKs ではなく専用テキストを更新する', () => {
    const makeHarness = (active, stats) => {
        const writes = [];
        const verdicts = [];
        const els = { '#gChiV': { textContent: '' }, '#rKsV': { textContent: '' } };
        const updateStats = evalFunction(app3, 'updateStats', {
            active,
            G: { rows: 4, p: 0.5, computeStats: () => stats },
            R: { N: 10, computeStats: () => stats },
            fmt: (v) => String(v),
            $: (sel) => els[sel] || null,
            T: (id, v) => writes.push([id, v]),
            setVerdict: (el, cls, text) => {
                verdicts.push([cls, text]);
                if (el) { el.className = cls; el.textContent = text; }
            }
        });
        updateStats();
        return { writes, verdicts };
    };

    const galton = makeHarness('galton', {
        n: 10, mean: 0, sd: 1, theoSd: 1, skew: 0, kurt: 0, chi: 1, df: 2, pv: 0.5
    });
    assert.ok(galton.writes.some(([id]) => id === 'gChiText'));
    assert.ok(!galton.writes.some(([id]) => id === 'gChi'));

    const rw = makeHarness('rw', {
        N: 10, t: 3, mean: 0, sd: 1, th: { sd: 1 }, skew: 0, kurt: 0, D: 0.1, pv: 0.5
    });
    assert.ok(rw.writes.some(([id]) => id === 'rKsText'));
    assert.ok(!rw.writes.some(([id]) => id === 'rKs'));
});

test('[実行] app3: モバイル寸法の実G.updateで dropped が増え、段数4/12/24で分岐分布が成立する', () => {
    const cases = [
        { seed: 11, W: 334, H: 250.5, rows: 12, meanMin: 4.8, meanMax: 7.2, sdMin: 1.3, sdMax: 3.0 },
        { seed: 12, W: 332, H: 249, rows: 12, meanMin: 4.8, meanMax: 7.2, sdMin: 1.3, sdMax: 3.0 },
        { seed: 13, W: 334, H: 250.5, rows: 24, meanMin: 10.5, meanMax: 13.5, sdMin: 1.5, sdMax: 3.5 },
        { seed: 14, W: 334, H: 250.5, rows: 4, meanMin: 1.0, meanMax: 3.0, sdMin: 0.5, sdMax: 1.8 }
    ];
    for (const c of cases) {
        withSeededRandom(c.seed, () => {
            const G = createGaltonHarness(c.W, c.H, c.rows);
            assert.ok(G.binTop <= G.floorY - 20,
                `${c.W}x${c.H} rows=${c.rows}: binTop=${G.binTop}, floor=${G.floorY}`);
            simulateGalton(G, 240);
            const s = galtonStats(G);
            assert.ok(G.spawned > 0, '玉が生成される');
            assert.ok(G.dropped > 20, `rows=${c.rows}: dropped=${G.dropped} が増える`);
            assert.equal(s.n, G.dropped, 'counts合計とdroppedが一致');
            assert.ok(s.mean >= c.meanMin && s.mean <= c.meanMax,
                `rows=${c.rows}: 平均 ${s.mean.toFixed(2)} が二項分布の中心付近`);
            assert.ok(s.sd >= c.sdMin && s.sd <= c.sdMax,
                `rows=${c.rows}: 標準偏差 ${s.sd.toFixed(2)} が二項分布相当`);
            assert.ok(G.balls.every((b) => b.r <= G.ballR + 1e-9),
                '実際の玉半径がレイアウト上限を超えない');
            assert.ok(G.balls.every((b) => !b.counted || Number.isInteger(b.bin)),
                '集計済み玉はlogical binを持つ');
            assertBallsInside(G, c.W, `rows=${c.rows} 240frame`);
        });
    }
});

test('[実行] app3: ball-ball重なり補正の後も床・左右壁の制約が最終的に成立する', () => {
    const W = 334;
    const G = createGaltonHarness(W, 250.5, 12);
    const r = 4;
    const floor = G.floorY;
    G.balls = [
        { x: G.cx, y: floor - r - 0.2, vx: 0, vy: 0, r, dr: 0, row: G.rows, counted: false, bin: null, asleep: false, sleepT: 0, settleT: 0, settled: false, py: floor - r - 0.2, i: 0 },
        { x: G.cx + 0.5, y: floor - r - 0.2, vx: 0, vy: 0, r, dr: 0, row: G.rows, counted: false, bin: null, asleep: false, sleepT: 0, settleT: 0, settled: false, py: floor - r - 0.2, i: 1 }
    ];
    for (let i = 0; i < 40; i++) {
        G.step();
        assertBallsInside(G, W, `overlap step ${i}`);
    }
    assert.ok(G.balls.every((b) => Math.abs(b.vy) <= 9.01 && Math.abs(b.vx) <= 9.01),
        '補正後の速度が発散しない');
});

test('[実行] app3: ビン外帯でbinTopを跨いだ未集計玉も端ビンへ一度だけ集計される', () => {
    const W = 334;
    const G = createGaltonHarness(W, 250.5, 12);
    const r = 4;
    const makeBall = (i, x) => ({
        x, y: G.binTop + 1, vx: 0, vy: 0, r, dr: 0, row: G.rows, counted: false,
        bin: null, asleep: false, sleepT: 0, settleT: 0, settled: false, py: G.binTop - 1, i
    });
    G.balls = [makeBall(0, 24 + r), makeBall(1, W - 24 - r)];
    G.step();
    assert.equal(G.dropped, 2, '外周gapでも到達後に集計される');
    assert.equal(G.counts[0], 1, '左外側は端ビン0');
    assert.equal(G.counts[G.nBins - 1], 1, '右外側は最終ビン');
    for (let i = 0; i < 10; i++) G.step();
    assert.equal(G.dropped, 2, '同じ玉を二重集計しない');
});

test('[実行] app3: 未集計のasleep玉は再wakeされ最終的に集計される', () => {
    withSeededRandom(41, () => {
        const G = createGaltonHarness(334, 250.5, 12);
        const ball = {
            x: G.cx, y: G.topY + 2, vx: 0, vy: 0, r: 4, dr: 0, row: 0,
            counted: false, bin: null, asleep: true, sleepT: 99, settleT: 0, settled: false,
            py: G.topY + 2, i: 0
        };
        G.balls = [ball];
        for (let i = 0; i < 300 && !ball.counted; i++) G.step();
        assert.equal(ball.asleep, false, '未集計玉は眠ったまま固定されない');
        assert.equal(ball.counted, true);
        assert.equal(G.dropped, 1);
        assert.equal(G.counts[G.binOf(ball.x)], 1);
    });
});

test('[実行] app3: desktop→mobile resizeで確定済みcounts/平均/SDが不変で、未集計玉も後に集計される', () => {
    withSeededRandom(31, () => {
        const h = createResizableGaltonHarness(866, 649.5, 12, { maxBalls: 400 });
        const G = h.G;
        simulateGalton(G, 300);
        assert.ok(G.dropped > 20 && G.dropped < 400, `resize前に途中経過がある dropped=${G.dropped}`);
        const beforeCounts = G.counts.slice();
        const beforeDropped = G.dropped;
        const before = galtonStats(G);
        assert.ok(G.balls.filter((b) => b.counted).every((b) => Number.isInteger(b.bin)),
            '集計時のlogical binが保存されている');

        h.setSize(334, 250.5);
        assert.deepEqual(G.counts, beforeCounts, 'resizeでcountsが変化しない');
        assert.equal(G.dropped, beforeDropped, 'resizeでdroppedが変化しない');
        const after = galtonStats(G);
        assert.equal(after.mean, before.mean, 'resizeで平均が変化しない');
        assert.equal(after.sd, before.sd, 'resizeでSDが変化しない');
        assertBallsInside(G, 334, 'resize直後');

        let frames = 0;
        while (frames < 2400 && G.dropped < 400) {
            G.update(1 / 60);
            frames++;
        }
        assert.equal(G.dropped, 400, 'resize後もNまで集計が進む');
        beforeCounts.forEach((c, i) => {
            assert.ok(G.counts[i] >= c, `resize前のbin${i}の結果が減らない`);
        });
        assertBallsInside(G, 334, 'resize後 N完了');
    });
});

test('[実行] app3: 外周p=0/1・最大半径・rows4/24でもNまで集計される', () => {
    let seed = 51;
    for (const rows of [4, 24]) {
        for (const p of [0, 1]) {
            withSeededRandom(seed++, () => {
                const N = 300;
                const G = createGaltonHarness(334, 250.5, rows, { maxBalls: N, ballSize: 5.2, p });
                let frames = 0;
                while (frames < 1800 && G.dropped < N) {
                    G.update(1 / 60);
                    frames++;
                }
                assert.equal(G.dropped, N,
                    `rows=${rows} p=${p}: 外周でも全玉が集計される`);
                const edge = p === 0 ? 0 : G.nBins - 1;
                assert.equal(G.counts[edge], N, `rows=${rows} p=${p}: 端ビンに集まる`);
                assert.equal(G.counts.reduce((a, b) => a + b, 0), N);
                assert.ok(G.balls.every((b) => b.counted));
                assertBallsInside(G, 334, `rows=${rows} p=${p} 完了時`);
            });
        }
    }
});

test('[実行] app3: モバイル12段/24段で default N=1000・max N=1500 の全玉が集計される', () => {
    const cases = [
        { seed: 21, rows: 12, N: 1000, meanMin: 4.5, meanMax: 7.5, sdMin: 1.2, sdMax: 3.0 },
        { seed: 22, rows: 12, N: 1500, meanMin: 4.5, meanMax: 7.5, sdMin: 1.2, sdMax: 3.0 },
        { seed: 23, rows: 24, N: 1000, meanMin: 10.0, meanMax: 14.0, sdMin: 1.5, sdMax: 3.5 }
    ];
    for (const c of cases) {
        withSeededRandom(c.seed, () => {
            const G = createGaltonHarness(334, 250.5, c.rows, { maxBalls: c.N });
            let frames = 0;
            while (frames < 2400 && G.dropped < c.N) {
                G.update(1 / 60);
                frames++;
                if (frames % 100 === 0) assertBallsInside(G, 334, `rows=${c.rows} N=${c.N} ${frames}frame`);
            }
            assert.equal(G.dropped, c.N,
                `rows=${c.rows} N=${c.N}: ${frames}frame で全玉が物理的に集計される（未集計=${G.balls.filter((b) => !b.counted).length}）`);
            const s = galtonStats(G);
            assert.equal(s.n, c.N);
            assert.ok(s.mean >= c.meanMin && s.mean <= c.meanMax,
                `rows=${c.rows} N=${c.N}: 平均 ${s.mean.toFixed(2)}`);
            assert.ok(s.sd >= c.sdMin && s.sd <= c.sdMax,
                `rows=${c.rows} N=${c.N}: 標準偏差 ${s.sd.toFixed(2)}`);
            assertBallsInside(G, 334, `rows=${c.rows} N=${c.N} 完了時`);
        });
    }
});

test('[実行] app3: resize相当の build(true) と reset 後もビン集計が整合する', () => {
    const G = createGaltonHarness(334, 250.5, 12);
    simulateGalton(G, 120);
    assert.ok(G.dropped > 0);

    G.build(true);
    assert.equal(G.dropped, G.counts.reduce((a, b) => a + b, 0));
    assert.ok(G.binTop <= G.floorY - 20);
    assert.ok(G.balls.every((b) => b.r <= G.ballR + 1e-9));

    G.build(false);
    assert.equal(G.spawned, 0);
    assert.equal(G.dropped, 0);
    assert.ok(G.counts.every((n) => n === 0));
    assert.ok(G.binTop <= G.floorY - 20);
});

/* ------------------------------------------------------------------ */
/* app4: resize のバッファ再確保                                       */
/* ------------------------------------------------------------------ */

const app4 = read('app4/index.html');

function createResizeHarness({ width = 333.6, height = 250.4, dpr = 2 } = {}) {
    let widthSets = 0;
    let heightSets = 0;
    const canvas = {
        _width: 0,
        _height: 0,
        rect: { width, height },
        getBoundingClientRect() { return this.rect; }
    };
    Object.defineProperty(canvas, 'width', {
        get() { return this._width; },
        set(v) { this._width = v; widthSets++; }
    });
    Object.defineProperty(canvas, 'height', {
        get() { return this._height; },
        set(v) { this._height = v; heightSets++; }
    });
    const ctx = {
        transforms: [],
        setTransform(...args) { this.transforms.push(args); }
    };
    const win = { devicePixelRatio: dpr };
    const factory = new Function(
        'cv', 'ctx', 'window',
        'var lastCvW=0,lastCvH=0,lastCvDpr=0;\n' +
        extractFunction(app4, 'resize') + '\n' +
        'return { resize };'
    );
    const api = factory(canvas, ctx, win);
    return {
        api, canvas, ctx, win,
        getSets: () => ({ widthSets, heightSets })
    };
}

test('[実行] app4: resize は同寸法ではcanvasバッファを再設定せず、寸法/DPR変更時だけ再設定する', () => {
    const h = createResizeHarness({ dpr: 1 });
    assert.equal(h.api.resize(), true);
    assert.equal(h.canvas.width, Math.round(333.6 * 1));
    assert.equal(h.canvas.height, Math.round(250.4 * 1));
    assert.deepEqual(h.getSets(), { widthSets: 1, heightSets: 1 });
    assert.equal(h.ctx.transforms.length, 1);

    assert.equal(h.api.resize(), false);
    assert.deepEqual(h.getSets(), { widthSets: 1, heightSets: 1 });
    assert.equal(h.ctx.transforms.length, 1);

    h.canvas.rect.width = 400.4;
    assert.equal(h.api.resize(), true);
    assert.deepEqual(h.getSets(), { widthSets: 2, heightSets: 2 });
    assert.equal(h.ctx.transforms.length, 2);
    assert.equal(h.canvas.width, Math.round(400.4 * 1));

    h.win.devicePixelRatio = 2;
    assert.equal(h.api.resize(), true);
    assert.deepEqual(h.getSets(), { widthSets: 3, heightSets: 3 });
    assert.equal(h.ctx.transforms.length, 3);
    assert.deepEqual(h.ctx.transforms[2], [2, 0, 0, 2, 0, 0]);
});

/* ------------------------------------------------------------------ */
/* app6: n の整数化とリーマン和の右端                                 */
/* ------------------------------------------------------------------ */

const app6 = read('app6/index.html');
const stepConst = app6.match(/var N_MIN=2,N_MAX=120,N_INITIAL=8;/)[0];
const normalizeStepCount = new Function(stepConst + '\nreturn (' + extractFunction(app6, 'normalizeStepCount') + ');')();
const riemannEdges = evalFunction(app6, 'riemannEdges', { normalizeStepCount });

test('[helper] app6: 分割数 n は常に 2〜120 の整数', () => {
    assert.equal(normalizeStepCount(8), 8);
    assert.equal(normalizeStepCount('8'), 8);
    assert.equal(normalizeStepCount(8.6), 9);
    assert.equal(normalizeStepCount(119.4), 119);
    assert.equal(normalizeStepCount(0), 2);
    assert.equal(normalizeStepCount(-5), 2);
    assert.equal(normalizeStepCount(999), 120);
    assert.equal(normalizeStepCount(NaN), 2);
    assert.equal(normalizeStepCount(undefined), 2);
});

test('[helper] app6: リーマン和の区間は最後が必ず b に一致し、区間外を作らない', () => {
    const edges = riemannEdges(-3, 3, 7);
    assert.equal(edges.length, 8);
    assert.equal(edges[0], -3);
    assert.equal(edges[7], 3);
    for (let i = 1; i < edges.length; i++) {
        assert.ok(edges[i] > edges[i - 1]);
    }
    const fractional = riemannEdges(-1.3, 2.7, 7.4);
    assert.equal(fractional.length, 8, '小数 n は整数 7 に丸める');
    assert.equal(fractional[0], -1.3);
    assert.equal(fractional[7], 2.7);
});

test('[静的] app6: frame は小数進行度を別に持ち、n を直接小数化しない', () => {
    assert.match(app6, /nProg:8/);
    assert.match(app6, /var N_MIN=2,N_MAX=120,N_INITIAL=8;/);
    assert.ok(!app6.includes('state.n=Math.min(120,state.n+dt*30)'));
    assert.match(app6, /state\.nProg=Math\.min\(N_MAX/);
    assert.match(app6, /state\.n=normalizeStepCount\(state\.nProg\)/);
    assert.match(app6, /normalizeStepCount\(state\.n\),edges=riemannEdges\(a,b,n\)/);
});

test('[静的] app6: アニメ終了値からの再クリックで開始値をリセットする', () => {
    assert.match(app6, /if\(state\.h<=0\.0201\)\{[\s\S]*?\$\('hSlider'\)\.max/);
    assert.match(app6, /if\(state\.n>=N_MAX\)state\.n=N_INITIAL;/);
    assert.match(app6, /function setTab\(t\)\{[\s\S]*?syncStepProgress\(\);/);
    assert.match(app6, /state\.anim=null;updateAnimBtns\(\);\s*\n\s*state\.n=normalizeStepCount\(this\.value\);state\.nProg=state\.n;/);
});

/* ------------------------------------------------------------------ */
/* app7: reverse の月専用化と日付表示                                  */
/* ------------------------------------------------------------------ */

const app7 = read('app7/index.html');
const displayDay = evalFunction(app7, 'displayDay');
const app7Frame = extractFunction(app7, 'frame');
const app7SetMode = extractFunction(app7, 'setMode');
const app7MoonBranch = app7Frame.slice(app7Frame.indexOf("if(state.mode==='moon'"), app7Frame.indexOf("if(state.mode==='const'"));
const app7ConstBranch = app7Frame.slice(app7Frame.indexOf("if(state.mode==='const'"));

test('[helper] app7: displayDay は表示用の整数日付を返す', () => {
    assert.equal(displayDay(172.6), 173);
    assert.equal(displayDay(0.2), 1);
    assert.equal(displayDay(365.9), 365);
    assert.equal(displayDay(NaN), 1);
});

test('[静的] app7: 星座の年周運動は reverse の影響を受けない', () => {
    assert.match(app7MoonBranch, /state\.reverse \? -1 : 1/);
    assert.ok(!app7ConstBranch.includes('state.reverse'));
    assert.match(app7ConstBranch, /state\.date \+= dt \* \(365\/18\) \* state\.speed;/);
});

test('[静的] app7: モード切替時に全再生を止めて表示を同期する', () => {
    assert.match(app7SetMode, /stopAllPlayback\(\)/);
    assert.match(app7, /function stopAllPlayback\(\)\{[\s\S]*?state\.playing=false;[\s\S]*?state\.playYear=false;[\s\S]*?state\.playDay=false;[\s\S]*?syncPlayButtons\(\);/);
    assert.match(app7, /function syncPlayButtons\(\)\{/);
});

test('[静的] app7: reverse ボタンは月モード専用', () => {
    const reverseHandler = app7.slice(app7.indexOf("$('btnReverse')"), app7.indexOf("document.querySelectorAll('[data-speed]')"));
    assert.match(reverseHandler, /if\(state\.mode!=='moon'\) return;/);
    assert.ok(!reverseHandler.includes("state.mode==='const' && !state.playYear"));
});

test('[静的] app7: 年周の日付表示は整数化される', () => {
    assert.match(app7, /var day = displayDay\(state\.date\);/);
    assert.match(app7, /day\+'日目（'\+fmtDate\(day\)\+'）'/);
    assert.ok(!app7.includes("state.date+'日目（'"));
});

/* ------------------------------------------------------------------ */
/* app8: Wh 主語の動詞一致 / What の生成可否 / guard                  */
/* ------------------------------------------------------------------ */

const app8 = read('app8/index.html');
const conjugateWhoVerb = evalFunction(app8, 'conjugateWhoVerb');
const whoVerbFor = evalFunction(app8, 'whoVerbFor', { conjugateWhoVerb });
const whBlockReason = evalFunction(app8, 'whBlockReason');
const app8PlayWh = extractFunction(app8, 'playWh');
const app8Guard = extractFunction(app8, 'guard');

function makeFakeButton(kind, value) {
    const dataset = kind === 'act' ? { act: value } : { wh: value };
    return {
        disabled: false,
        dataset,
        title: '',
        attrs: {},
        setAttribute(name, val) { this.attrs[name] = val; }
    };
}

/**
 * syncActionButtons と guard を fake DOM で実行する
 */
function createWhUi(cards) {
    const actButtons = [makeFakeButton('act', 'neg'), makeFakeButton('act', 'q')];
    const whButtons = ['where', 'what', 'who', 'when'].map((k) => makeFakeButton('wh', k));
    const hint = {
        textContent: '',
        classList: {
            show: false,
            toggle(name, on) { if (name === 'show') this.show = !!on; }
        }
    };
    const fakeDocument = {
        querySelectorAll(sel) {
            if (sel === '[data-act]') return actButtons;
            if (sel === '[data-wh]') return whButtons;
            if (sel === '.act-btn') return actButtons.concat(whButtons);
            return [];
        },
        getElementById(id) { return id === 'whHint' ? hint : null; }
    };
    const NODES = [{ id: 'wh', sentences: [{ cards }] }];
    const factory = new Function(
        'NODES', 'document', 'whBlockReason',
        'let curNode = 0, curSent = 0, busy = false;\n' +
        extractFunction(app8, 'syncActionButtons') + '\n' +
        app8Guard + '\n' +
        'return { sync: syncActionButtons, guard, getBusy: () => busy };'
    );
    const api = factory(NODES, fakeDocument, whBlockReason);
    return { api, actButtons, whButtons, hint, NODES };
}

test('[helper] app8: Who 置換後の動詞を主語に一致させる', () => {
    assert.equal(conjugateWhoVerb({ t: 'were', be: true, past: true }), 'was');
    assert.equal(conjugateWhoVerb({ t: 'is', be: true }), 'is');
    assert.equal(conjugateWhoVerb({ t: 'played', past: true }), 'played');
    assert.equal(conjugateWhoVerb({ t: 'watches', stem: 'watch', suffix: 'es' }), 'watches');
    assert.equal(conjugateWhoVerb({ t: 'play', stem: 'play' }), 'plays');
    assert.equal(conjugateWhoVerb({ t: 'watch', stem: 'watch' }), 'watches');
    assert.equal(whoVerbFor({ whoVerb: 'was', cards: [] }), 'was');
    assert.equal(whoVerbFor({ cards: [{ role: 'verb', t: 'were', be: true, past: true }] }), 'was');
});

test('[helper] app8: 目的語のない例文では What を許可しない', () => {
    assert.equal(whBlockReason({ cards: [{ role: 'subj' }, { role: 'verb' }] }, 'what'), '目的語のない例文');
    assert.equal(whBlockReason({ cards: [{ role: 'subj' }, { role: 'verb' }, { role: 'obj' }] }, 'what'), '');
    assert.equal(whBlockReason({ cards: [{ role: 'subj' }, { role: 'verb' }] }, 'where'), '');
});

test('[静的] app8: 例文定義に whoVerb があり、目的語なし例文に whWhat を残さない', () => {
    assert.ok(countOccurrences(app8, 'whoVerb:') >= 6);
    assert.match(app8, /whoVerb:'was'/);
    const whStart = app8.indexOf("id:'wh'");
    const whEnd = app8.indexOf('/* ---------------- state', whStart);
    const sentenceChunks = app8.slice(whStart, whEnd).split('cards:[').slice(1).filter((c) => c.includes('whoVerb:'));
    assert.equal(sentenceChunks.length, 6, 'Wh例文は6件');
    let noObjCount = 0;
    sentenceChunks.forEach((chunk) => {
        const cardsPart = chunk.slice(0, chunk.indexOf('whoVerb:'));
        if (cardsPart.includes("role:'obj'")) return;
        noObjCount++;
        const jaStart = chunk.indexOf('ja:{');
        const jaPart = chunk.slice(jaStart, chunk.indexOf('}', jaStart) + 1);
        assert.ok(!jaPart.includes('whWhat'), '目的語なし例文に What の訳を残さない');
    });
    assert.ok(noObjCount >= 3);
    assert.match(app8PlayWh, /if \(whBlockReason\(sent, kind\)\) return;/);
    assert.match(app8, /<span class="wh-hint" id="whHint"/);
});

test('[実行] app8: syncActionButtons は可否と理由を反映し、guard の finally も不適切な What を有効化しない', async () => {
    const withObj = createWhUi([{ role: 'subj' }, { role: 'verb' }, { role: 'obj' }]);
    withObj.api.sync();
    assert.ok(withObj.whButtons.every((b) => !b.disabled), '目的語ありは全Wh有効');
    assert.equal(withObj.hint.classList.show, false);

    const noObj = createWhUi([{ role: 'subj' }, { role: 'verb' }]);
    noObj.api.sync();
    const what = noObj.whButtons.find((b) => b.dataset.wh === 'what');
    const where = noObj.whButtons.find((b) => b.dataset.wh === 'where');
    assert.equal(what.disabled, true);
    assert.match(what.title, /目的語のない例文/);
    assert.equal(what.attrs['aria-disabled'], 'true');
    assert.equal(where.disabled, false);
    assert.equal(noObj.hint.classList.show, true);
    assert.match(noObj.hint.textContent, /目的語のない例文/);

    const deferred = makeDeferred();
    noObj.api.guard(() => deferred.promise);
    assert.equal(noObj.api.getBusy(), true);
    assert.ok(noObj.actButtons.every((b) => b.disabled), 'guard中は通常ボタンも無効');
    deferred.resolve();
    await flushMicrotasks();
    assert.equal(noObj.api.getBusy(), false);
    assert.equal(what.disabled, true, 'finallyでWhatを再有効化しない');
    assert.equal(where.disabled, false);
    assert.ok(noObj.actButtons.every((b) => !b.disabled));
});

/* ------------------------------------------------------------------ */
/* テーマCSS: hover / transition が英文カードの WAAPI を壊さない       */
/* ------------------------------------------------------------------ */

for (const theme of ['pop', 'forest']) {
    const css = read(`themes/${theme}.css`);

    test(`[静的] ${theme}.css: hover はポータルのカードに限定し、教材カードの transform を上書きしない`, () => {
        assert.ok(!new RegExp(`html\\[data-theme="${theme}"\\] \\.card:hover\\s*\\{`).test(css));
        assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\] a\\.card:hover`));
        assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\] \\.cards > \\.card:hover`));
        assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\] a\\.card:hover \\.card__btn`));
    });

    test(`[静的] ${theme}.css: 英文 .row .card の transition 干渉を除去し、transform:none!important を当てない`, () => {
        assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\] \\.row \\.card \\{ transition: none !important; \\}`));
        assert.ok(!/\.row \.card[^{]*\{[^}]*transform:\s*none\s*!important/.test(css));
    });
}

/* ------------------------------------------------------------------ */
/* HTML の最低限の構造確認                                             */
/* ------------------------------------------------------------------ */

test('[静的] 対象HTMLは対応するscript/style読み込みを維持している', () => {
    for (const app of ['app1', 'app3', 'app4', 'app6', 'app7', 'app8']) {
        const html = read(`${app}/index.html`);
        assert.match(html, /themes\/theme\.js/);
        assert.match(html, /themes\/pop\.css/);
        assert.match(html, /themes\/forest\.css/);
    }
});
