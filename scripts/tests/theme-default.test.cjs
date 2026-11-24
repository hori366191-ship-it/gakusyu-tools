'use strict';

// site/themes/theme.js の既定テーマ（ポップ）解決のオフライン回帰テスト。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'themes', 'theme.js'), 'utf8');

function run({ stored = null, search = '' } = {}) {
  const writes = [];
  const removes = [];
  const replaces = [];
  const attrs = {};
  const cards = [
    { href: './app1/', getAttribute() { return this.href; }, setAttribute(k, v) { this.href = v; } },
    { href: './app2/', getAttribute() { return this.href; }, setAttribute(k, v) { this.href = v; } }
  ];
  const storage = {
    getItem: (k) => (k === 'gakusyu-theme' ? stored : null),
    setItem: (k, v) => writes.push([k, v]),
    removeItem: (k) => removes.push(k)
  };
  const loc = {
    href: 'https://example.test/gakusyu-tools/' + search,
    search,
    pathname: '/gakusyu-tools/',
    hash: ''
  };
  const docEl = {
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; }
  };
  const document = {
    documentElement: docEl,
    readyState: 'complete',
    querySelectorAll: (sel) => (sel === 'a.card[href]' ? cards : []),
    addEventListener() {}
  };
  const listeners = {};
  const window = {
    addEventListener(type, fn) { listeners[type] = fn; },
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  const ctx = vm.createContext({
    localStorage: storage,
    location: loc,
    history: { replaceState: (_s, _t, url) => replaces.push(url) },
    document,
    window,
    URL,
    decodeURIComponent,
    CustomEvent: window.CustomEvent
  });
  vm.runInContext(SRC, ctx);
  return { attrs, cards, writes, removes, replaces, window, document, ctx, listeners };
}

test('未保存・param無し: data-theme=pop、localStorage/URL/カードを書き換えない', () => {
  const r = run();
  assert.equal(r.attrs['data-theme'], 'pop');
  assert.equal(r.writes.length, 0, '既定フォールバックでは保存しない');
  assert.equal(r.removes.length, 0);
  assert.equal(r.replaces.length, 0, 'URLを書き換えない');
  assert.deepEqual(r.cards.map((c) => c.href), ['./app1/', './app2/']);
});

test('保存値: default は属性なし、forest は forest、不正値は pop', () => {
  const d = run({ stored: 'default' });
  assert.equal(d.attrs['data-theme'], undefined);

  const f = run({ stored: 'forest' });
  assert.equal(f.attrs['data-theme'], 'forest');

  const bad = run({ stored: 'bogus-theme' });
  assert.equal(bad.attrs['data-theme'], 'pop');
  assert.equal(bad.writes.length, 0);
  assert.equal(bad.replaces.length, 0);
});

test('?theme=default は属性なし＋URL正規化、?theme=forest は forest', () => {
  const d = run({ search: '?theme=default' });
  assert.equal(d.attrs['data-theme'], undefined);
  assert.deepEqual(d.writes, [['gakusyu-theme', 'default']]);
  assert.equal(d.replaces.length, 1);
  assert.equal(d.replaces[0], '/gakusyu-tools/');

  const f = run({ search: '?theme=forest' });
  assert.equal(f.attrs['data-theme'], 'forest');
  assert.deepEqual(f.writes, [['gakusyu-theme', 'forest']]);
  assert.equal(f.replaces.length, 0, '既に正規化済みならURLを触らない');
  assert.equal(f.cards[0].href, './app1/?theme=forest');
});

test('保存済み pop はカードリンクへ ?theme=pop を付け、URLは触らない', () => {
  const r = run({ stored: 'pop' });
  assert.equal(r.attrs['data-theme'], 'pop');
  assert.equal(r.cards[0].href, './app1/?theme=pop');
  assert.equal(r.replaces.length, 0);
});

test('setGakusyuTheme(不正値) は pop にフォールバックする', () => {
  const r = run();
  const out = r.window.setGakusyuTheme('bogus');
  assert.equal(out, 'pop');
  assert.equal(r.attrs['data-theme'], 'pop');
  assert.equal(r.window.getGakusyuTheme(), 'pop');
});

test('storage のキー削除(newValue null)は既定の pop に戻す', () => {
  const r = run({ stored: 'forest' });
  assert.equal(r.attrs['data-theme'], 'forest');
  assert.equal(typeof r.listeners.storage, 'function');
  r.listeners.storage({ key: 'gakusyu-theme', newValue: null });
  assert.equal(r.attrs['data-theme'], 'pop');
});
