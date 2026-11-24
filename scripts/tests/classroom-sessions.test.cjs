'use strict';

// 教室セッション永続基盤の回帰テスト（オフライン / node:sqlite 実SQL）
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const modPromise = import('../../site-worker/classroom-sessions.mjs');
let classroomSessions;
let IDLE_TTL_SECONDS;
let ABSOLUTE_TTL_SECONDS;

before(async () => {
  ({ classroomSessions, IDLE_TTL_SECONDS, ABSOLUTE_TTL_SECONDS } = await modPromise);
});

const DAY = 24 * 60 * 60;
const T0 = 1_700_000_000; // epoch 秒

function loadSchema(sqlite) {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../site-worker/session-migrations/0001_classroom_sessions.sql'),
    'utf8',
  );
  sqlite.exec(sql);
}

/** node:sqlite を D1 風インターフェースで包む（実SQLを実行）。 */
function d1(sqlite, { sessions = [] } = {}) {
  function wrap(sql) {
    return {
      bind(...params) {
        return {
          async first() {
            return sqlite.prepare(sql).get(...params) ?? null;
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...params) };
          },
          async run() {
            const r = sqlite.prepare(sql).run(...params);
            return { success: true, meta: { changes: Number(r.changes) } };
          },
        };
      },
    };
  }
  const db = {
    prepare: wrap,
    withSession(constraint) {
      sessions.push(constraint);
      return db;
    },
  };
  return db;
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  loadSchema(sqlite);
  let clockMs = T0 * 1000;
  const sessions = [];
  const store = classroomSessions(d1(sqlite, { sessions }), { now: () => clockMs });
  const advance = (seconds) => {
    clockMs += seconds * 1000;
  };
  return { sqlite, store, sessions, advance };
}

function countRows(sqlite) {
  return Number(sqlite.prepare('SELECT COUNT(*) AS n FROM classroom_sessions').get().n);
}

test('create pins a verified subject and stores only the hashed handle', async () => {
  const { sqlite, store } = setup();
  const created = await store.createForVerifiedSubject('google-sub-1');

  assert.equal(created.subject, 'google-sub-1');
  assert.equal(created.createdAt, T0);
  assert.equal(created.idleExpiresAt, T0 + IDLE_TTL_SECONDS);
  assert.equal(created.absoluteExpiresAt, T0 + ABSOLUTE_TTL_SECONDS);
  assert.equal(typeof created.handle, 'string');
  assert.ok(created.handle.length >= 64);

  const row = sqlite.prepare('SELECT * FROM classroom_sessions').get();
  assert.notEqual(row.handle_hash, created.handle);
  assert.match(row.handle_hash, /^[0-9a-f]{64}$/);
  assert.equal(row.subject, 'google-sub-1');
  assert.equal(row.revoked_at, null);
  assert.equal(countRows(sqlite), 1);

  assert.rejects(() => store.createForVerifiedSubject(''), TypeError);
  assert.rejects(() => store.createForVerifiedSubject(null), TypeError);
});

test('read returns the session and never extends it (probe/display path)', async () => {
  const { store, advance } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-read');

  advance(10 * DAY);
  const read = await store.read(handle);
  assert.deepEqual(read, {
    subject: 'sub-read',
    createdAt: T0,
    idleExpiresAt: T0 + IDLE_TTL_SECONDS,
    absoluteExpiresAt: T0 + ABSOLUTE_TTL_SECONDS,
  });

  advance(20 * DAY);
  assert.equal(await store.read(handle), null);
});

test('extendAfterSuccess moves idle deadline only for confirmed target operations', async () => {
  const { store, advance } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-ext');

  advance(10 * DAY);
  const extended = await store.extendAfterSuccess(handle, 'sub-ext', 'classroom-print', { ok: true });
  assert.deepEqual(extended, {
    subject: 'sub-ext',
    createdAt: T0,
    idleExpiresAt: T0 + 40 * DAY,
    absoluteExpiresAt: T0 + ABSOLUTE_TTL_SECONDS,
  });

  advance(30 * DAY); // t0+40日 = 延長後のアイドル期限ちょうど
  assert.equal(await store.read(handle), null); // 40日で失効している

  const generated = await store.createForVerifiedSubject('sub-gen');
  advance(5 * DAY);
  const gen = await store.extendAfterSuccess(generated.handle, 'sub-gen', 'generate-text', { ok: true });
  assert.equal(gen.idleExpiresAt, T0 + 75 * DAY);
});

test('no extension for non-target operations, failures, replay/recovered or subject mismatch', async () => {
  const { store, advance } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-deny');
  const expectedIdle = T0 + IDLE_TTL_SECONDS;

  advance(DAY);
  const denies = [
    ['probe', { ok: true }],
    ['read', { ok: true }],
    ['classroom-print', { ok: false }],
    ['classroom-print', {}],
    ['classroom-print', null],
    ['classroom-print', { ok: true, replayed: true }],
    ['generate-text', { ok: true, recovered: true }],
  ];
  for (const [operation, result] of denies) {
    const out = await store.extendAfterSuccess(handle, 'sub-deny', operation, result);
    assert.equal(out, null, `${operation} ${JSON.stringify(result)} must not extend`);
  }

  const other = await store.extendAfterSuccess(handle, 'someone-else', 'classroom-print', { ok: true });
  assert.equal(other, null);

  const session = await store.read(handle);
  assert.equal(session.idleExpiresAt, expectedIdle);
});

test('absolute 90-day cap bounds every extension via SQL max/min', async () => {
  const { sqlite, store, advance } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-cap');

  const capped = await store.createForVerifiedSubject('sub-cap2', {
    idleTtlSeconds: 999 * DAY,
    absoluteTtlSeconds: 999 * DAY,
  });
  assert.equal(capped.idleExpiresAt, T0 + IDLE_TTL_SECONDS);
  assert.equal(capped.absoluteExpiresAt, T0 + ABSOLUTE_TTL_SECONDS);

  for (let i = 0; i < 8; i += 1) {
    advance(10 * DAY);
    assert.ok(await store.extendAfterSuccess(handle, 'sub-cap', 'classroom-print', { ok: true }));
  }
  const extended = await store.read(handle);
  assert.equal(extended.idleExpiresAt, T0 + ABSOLUTE_TTL_SECONDS);

  const row = sqlite.prepare('SELECT idle_expires_at, absolute_expires_at FROM classroom_sessions WHERE subject = ?')
    .get('sub-cap');
  assert.equal(row.idle_expires_at, row.absolute_expires_at);

  advance(10 * DAY); // 絶対期限ちょうど
  assert.equal(await store.read(handle), null);
  assert.equal(await store.extendAfterSuccess(handle, 'sub-cap', 'classroom-print', { ok: true }), null);
});

test('revocation is permanent: revoked handle cannot be read, extended or revived', async () => {
  const { store, advance } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-logout');

  assert.equal(await store.revoke(handle), true);
  assert.equal(await store.revoke(handle), false);

  advance(DAY);
  assert.equal(await store.read(handle), null);
  assert.equal(await store.extendAfterSuccess(handle, 'sub-logout', 'classroom-print', { ok: true }), null);
});

test('revokeForSubject invalidates every session of that subject only', async () => {
  const { store, advance } = setup();
  const a = await store.createForVerifiedSubject('subject-a');
  const b = await store.createForVerifiedSubject('subject-a');
  const c = await store.createForVerifiedSubject('subject-b');

  advance(DAY);
  assert.equal(await store.revokeForSubject('subject-a'), 2);
  assert.equal(await store.read(a.handle), null);
  assert.equal(await store.read(b.handle), null);
  assert.equal((await store.read(c.handle)).subject, 'subject-b');
});

test('purgeExpired removes expired and revoked rows without resurrecting handles', async () => {
  const { sqlite, store, advance } = setup();
  const live = await store.createForVerifiedSubject('sub-live');
  const idle = await store.createForVerifiedSubject('sub-idle');
  const revoked = await store.createForVerifiedSubject('sub-revoked');

  advance(10 * DAY);
  await store.revoke(revoked.handle);
  advance(30 * DAY); // sub-idle は t0+30日で失効、sub-live は 30日延長... されていないため同じく失効
  assert.equal(await store.purgeExpired(), 3);
  assert.equal(countRows(sqlite), 0);
  assert.equal(await store.read(idle.handle), null);
  assert.equal(await store.read(live.handle), null);
});

test('DB failures fail closed with a typed store error', async () => {
  const broken = {
    prepare() {
      throw new Error('d1 unavailable');
    },
  };
  const store = classroomSessions(broken, { now: () => T0 * 1000 });

  await assert.rejects(
    () => store.read('a'.repeat(64)),
    (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED',
  );
  await assert.rejects(
    () => store.createForVerifiedSubject('sub'),
    (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED',
  );
  await assert.rejects(
    () => store.extendAfterSuccess('a'.repeat(64), 'sub', 'classroom-print', { ok: true }),
    (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED',
  );
  await assert.rejects(() => store.revoke('a'.repeat(64)), (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED');
  await assert.rejects(() => store.revokeForSubject('sub'), (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED');
  await assert.rejects(() => store.purgeExpired(), (error) => error.code === 'CLASSROOM_SESSION_STORE_FAILED');
});

test('reads and writes use D1 first-primary sessions', async () => {
  const { store, sessions } = setup();
  const { handle } = await store.createForVerifiedSubject('sub-primary');
  sessions.length = 0;

  await store.read(handle);
  await store.extendAfterSuccess(handle, 'sub-primary', 'classroom-print', { ok: true });
  await store.revoke(handle);

  assert.equal(sessions.length, 3);
  assert.ok(sessions.every((constraint) => constraint === 'first-primary'));
});

test('malformed handles are rejected without touching the database', async () => {
  let touched = 0;
  const db = { prepare() { touched += 1; return { bind() { return {}; } }; } };
  const store = classroomSessions(db, { now: () => T0 * 1000 });

  assert.equal(await store.read(''), null);
  assert.equal(await store.read(null), null);
  assert.equal(await store.read('x'.repeat(513)), null);
  assert.equal(await store.read(123), null);
  assert.equal(await store.extendAfterSuccess('', 'sub', 'classroom-print', { ok: true }), null);
  assert.equal(await store.revoke(''), false);
  assert.equal(touched, 0);
});
