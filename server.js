const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const {
  EXAMS, SUBTESTS, LEGACY_IDS, questionsFor, byId, publicQuestion, score, wibDay, dailyIds,
} = require('./questions');
const ai = require('./ai');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

// Visitors with no Homeroom account ("guests") may look around this app at
// its own address, read-only (every public app). The platform marks
// them with a token of their own: ES256, signed by a key of its own (its
// public half is USERNODE_GUEST_JWT_PUBLIC_KEY), this audience, `pur:
// 'guest'`, `guest: true`, and no id or username. Such a visitor is
// `req.guest`, never `req.user`, and every write they try is answered 401
// `account_required`, which the bridge turns into "Make an account to
// continue".
const GUEST_AUDIENCE = APP_AUDIENCE ? APP_AUDIENCE + ':guest' : null;
const GUEST_PUBLIC_KEY = (process.env.USERNODE_GUEST_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

app.use(express.json());

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process (a per-app Ingress rule on
// Kubernetes, the wildcard site's matcher on the docker runtime). This
// handler is what makes the same relative paths work under a plain
// `node server.js`, where there is no edge in front of the app at all.
//
// Registered BEFORE the auth middleware because these three files are
// public: the platform serves them anonymously from any app origin, and a
// login redirect arriving where a <script> was expected is exactly the
// failure a relative path is meant to avoid.
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file: a baked-in one is what left
// the whole fleet pointing at a domain the platform had moved away from.
// Unset only outside the platform (a plain local `node server.js`) — set
// USERNODE_PLATFORM_ORIGIN there too if you want the hosted assets locally.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');
// This project's address on the platform (/app/<slug>), from the variable the
// platform injects, and not written in here either: every project made from
// the same starter is then the same code. Unset only outside the platform.
const APP_SLUG = process.env.USERNODE_APP_SLUG || '';

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

// Homeroom's requests about one person's data: erase it when they delete
// their account, export it when they ask for a copy. Mounted BEFORE the
// sign-in check because they carry a platform token of their own, which
// usernode-user-data.js verifies. When you add a table, check that file's
// OWNED_BY and SKIP lists ("Your people's data" in the platform conventions).
require('./usernode-user-data').mount(app, pool);

// "Now" for this request, as a Date: `req.now`, set for every request by
// the middleware below. Read the day and the time through it (and
// `usernode.now()` in the page), never `new Date()` or SQL's NOW(),
// wherever they decide what shows: a reminder, a rota, a deadline.
// Production always gets the real time. A staging preview may be shown as of
// a chosen moment: the platform opens it with `?un-now=<ISO time>`, and the
// page sends `usernode.now()` on as the `x-usernode-now` header. Only a
// staging container reads either. See "Time-dependent features" in the
// platform conventions.
const IS_STAGING = process.env.USERNODE_ENV === 'staging';
const PREVIEW_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function requestNow(req) {
  const raw = IS_STAGING ? (req.headers['x-usernode-now'] || req.query['un-now']) : null;
  return typeof raw === 'string' && PREVIEW_NOW.test(raw) ? new Date(raw) : new Date();
}

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  req.now = requestNow(req);
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }
  if (!req.user && token && GUEST_PUBLIC_KEY && GUEST_AUDIENCE) {
    try {
      const guest = jwt.verify(token, GUEST_PUBLIC_KEY, {
        algorithms: ['ES256'],
        issuer: 'usernode',
        audience: GUEST_AUDIENCE,
      });
      if (guest && guest.pur === 'guest' && guest.guest === true) req.guest = true;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet. A guest may READ: every GET,
  // `/api/*` included, so read routes must not assume req.user (use
  // `req.user ? req.user.id : null`). Every write needs an account.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user && req.guest) {
      if (req.method === 'GET' || req.method === 'HEAD') return next();
      return res.status(401).json({ error: 'account_required' });
    }
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// The app's icon, the same PNG index.html links as its favicon. Browsers
// that ignore the <link rel="icon"> and probe /favicon.ico anyway (older
// ones, direct visits) get the image rather than a 401 from the
// auth-gated catch-all.
app.get('/favicon.ico', (_req, res) => {
  res.type('image/png').sendFile(path.join(__dirname, 'public', 'icon.png'));
});

// ── SiapUjian data ──────────────────────────────────────────────────────────
// Two tables. Both key a person's rows by `user_id` and are marked
// staging:private, so usernode-user-data.js covers them as is.
async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS profiles (
    user_id text PRIMARY KEY,
    name text NOT NULL DEFAULT '',
    target_exam text NOT NULL DEFAULT 'utbk',
    target_goal text,
    demo_seeded boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS attempts (
    id serial PRIMARY KEY,
    user_id text NOT NULL,
    mode text NOT NULL,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    score int NOT NULL,
    max_score int NOT NULL,
    passed boolean NOT NULL,
    timed_out boolean NOT NULL DEFAULT false,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS attempts_user_created ON attempts (user_id, created_at DESC)');
  // Forward-only columns added with the 20-question bank: the profile's
  // target campus, major and score, the demo reseed marker, and the ids and
  // time an attempt was taken on. Null question_ids means an old
  // three-question attempt.
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_campus text');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_major text');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_score int');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS demo_version int NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_ids jsonb');
  await pool.query('ALTER TABLE attempts ADD COLUMN IF NOT EXISTS duration_sec int');
  await pool.query(`COMMENT ON TABLE profiles IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE attempts IS 'staging:private'`);
  // Tanya AI's two tables (chat history per question, the daily counter),
  // both staging:private and keyed by user_id.
  await ai.migrate(pool);
}

const wantsDemo = (req) => IS_STAGING && req.query.demo === '1';
const userIdOf = (req) => (req.user ? String(req.user.id) : null);

function defaultProfile(req) {
  return {
    name: req.user && req.user.username ? req.user.username : 'Tamu',
    target_exam: 'utbk',
    target_goal: null,
    target_campus: null,
    target_major: null,
    target_score: null,
  };
}

// The ids of one whole UTBK try out, in order.
const UTBK_IDS = questionsFor('utbk').map((q) => q.id);

// A demo answer sheet with `n` right answers in each subtest: the first n
// questions of that subtest are right and the rest are left blank.
function demoAnswers(perSubtest) {
  const answers = {};
  SUBTESTS.forEach((name, s) => {
    const ids = UTBK_IDS.filter((id) => byId(id).topic === name);
    ids.slice(0, perSubtest[s] || 0).forEach((id) => { answers[id] = byId(id).answer; });
  });
  return answers;
}

// Fake finished try outs for the viewer's own preview (?demo=1 on staging),
// dated relative to req.now. Five UTBK try outs score 650, 500, 550, 450 and
// 400; Literasi Bahasa Inggris stays the weakest subtest.
const DEMO_ATTEMPTS = [
  { mode: 'utbk', daysAgo: 2, at: [20, 5], answers: demoAnswers([4, 4, 4, 1]), durationSec: 1880 },
  { mode: 'utbk', daysAgo: 7, at: [16, 40], answers: demoAnswers([3, 3, 3, 1]), durationSec: 2200 },
  { mode: 'utbk', daysAgo: 12, at: [9, 0], answers: demoAnswers([3, 3, 4, 1]), durationSec: 2400 },
  { mode: 'utbk', daysAgo: 17, at: [19, 30], answers: demoAnswers([3, 3, 2, 1]), durationSec: 2400 },
  { mode: 'utbk', daysAgo: 22, at: [8, 15], answers: demoAnswers([2, 3, 2, 1]), durationSec: 2100 },
  { mode: 'cpns', daysAgo: 3, at: [16, 15], answers: { 'cpns-1': 'B', 'cpns-2': 'C', 'cpns-3': 'C' }, durationSec: 1500 },
  { mode: 'cpns', daysAgo: 10, at: [10, 0], answers: { 'cpns-1': 'B', 'cpns-2': 'A', 'cpns-3': 'D' }, durationSec: 1700 },
];

async function seedDemo(req, userId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // One seed at a time per person, even on two tabs at once.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['demo:' + userId]);
    const found = await db.query(
      'SELECT demo_seeded, demo_version FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (found.rows.length && found.rows[0].demo_version >= 2) {
      await db.query('COMMIT');
      return;
    }
    if (!found.rows.length) {
      const name = req.user && req.user.username ? req.user.username : 'Tamu';
      await db.query(
        `INSERT INTO profiles (user_id, name, target_exam, demo_seeded, demo_version, updated_at)
         VALUES ($1, $2, 'utbk', true, 2, $3)`,
        [userId, name, req.now]
      );
    } else {
      await db.query(
        'UPDATE profiles SET demo_seeded = true, demo_version = 2, updated_at = $2 WHERE user_id = $1',
        [userId, req.now]);
      // Only this person's own demo rows: a reseed never touches real ones.
      await db.query('DELETE FROM attempts WHERE user_id = $1 AND is_demo = true', [userId]);
    }
    // Dates are written as the Jakarta wall clock (WIB is UTC+7, no DST), so
    // the demo rows land on the same calendar days the streak and Progres read.
    function at(daysAgo, hh, mm) {
      const day = wibDay(new Date(req.now.getTime() - daysAgo * 86400000));
      return new Date(Date.parse(day + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00Z') - 7 * 3600000);
    }
    for (const d of DEMO_ATTEMPTS) {
      const s = score(d.mode, d.answers);
      const ids = d.mode === 'utbk' ? UTBK_IDS : questionsFor('cpns').map((q) => q.id);
      await db.query(
        `INSERT INTO attempts (user_id, mode, answers, score, max_score, passed, timed_out, is_demo, created_at, question_ids, duration_sec)
         VALUES ($1, $2, $3, $4, $5, $6, false, true, $7, $8, $9)`,
        [userId, d.mode, JSON.stringify(d.answers), s.score, s.maxScore, s.passed, at(d.daysAgo, d.at[0], d.at[1]), JSON.stringify(ids), d.durationSec]
      );
    }
    // Yesterday's Daily 5: 4 of 5 right, so the streak runs three days.
    const yDay = wibDay(new Date(req.now.getTime() - 86400000));
    const yIds = dailyIds(yDay);
    const dAnswers = {};
    yIds.forEach((id, i) => { if (i < 4) dAnswers[id] = byId(id).answer; });
    const ds = score('daily', dAnswers, yIds);
    await db.query(
      `INSERT INTO attempts (user_id, mode, answers, score, max_score, passed, timed_out, is_demo, created_at, question_ids, duration_sec)
       VALUES ($1, 'daily', $2, $3, $4, $5, false, true, $6, $7, $8)`,
      [userId, JSON.stringify(dAnswers), ds.score, ds.maxScore, ds.passed, at(1, 19, 40), JSON.stringify(yIds), 400]
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

app.get('/api/me', async (req, res) => {
  const userId = userIdOf(req);
  const fallback = defaultProfile(req);
  if (!userId) return res.json(fallback);
  try {
    const { rows } = await pool.query(
      `SELECT name, target_exam, target_goal, target_campus, target_major, target_score
         FROM profiles WHERE user_id = $1`, [userId]);
    if (!rows.length) return res.json(fallback);
    const r = rows[0];
    res.json({
      name: r.name || fallback.name,
      target_exam: r.target_exam === 'cpns' ? 'cpns' : 'utbk',
      target_goal: r.target_goal || null,
      target_campus: r.target_campus || null,
      target_major: r.target_major || null,
      target_score: r.target_score == null ? null : r.target_score,
    });
  } catch (err) {
    console.error('GET /api/me failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.put('/api/me', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'account_required' });
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const targetExam = body.target_exam === 'cpns' ? 'cpns' : body.target_exam === 'utbk' ? 'utbk' : null;
  const goalRaw = typeof body.target_goal === 'string' ? body.target_goal.trim() : '';
  if (!name || name.length > 60) return res.status(400).json({ error: 'invalid_name' });
  if (!targetExam) return res.status(400).json({ error: 'invalid_target' });
  if (goalRaw.length > 80) return res.status(400).json({ error: 'invalid_goal' });
  const campusRaw = typeof body.target_campus === 'string' ? body.target_campus.trim() : '';
  const majorRaw = typeof body.target_major === 'string' ? body.target_major.trim() : '';
  if (campusRaw.length > 80) return res.status(400).json({ error: 'invalid_campus' });
  if (majorRaw.length > 80) return res.status(400).json({ error: 'invalid_major' });
  const scoreRaw = body.target_score;
  let targetScore = null;
  if (scoreRaw !== undefined && scoreRaw !== null && String(scoreRaw).trim() !== '') {
    targetScore = Number(scoreRaw);
    if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 1000) {
      return res.status(400).json({ error: 'invalid_target_score' });
    }
  }
  const goal = goalRaw || null;
  try {
    await pool.query(
      `INSERT INTO profiles (user_id, name, target_exam, target_goal, target_campus, target_major, target_score, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE
         SET name = EXCLUDED.name, target_exam = EXCLUDED.target_exam,
             target_goal = EXCLUDED.target_goal, target_campus = EXCLUDED.target_campus,
             target_major = EXCLUDED.target_major, target_score = EXCLUDED.target_score,
             updated_at = EXCLUDED.updated_at`,
      [userId, name, targetExam, goal, campusRaw || null, majorRaw || null, targetScore, req.now]
    );
    res.json({
      name, target_exam: targetExam, target_goal: goal,
      target_campus: campusRaw || null, target_major: majorRaw || null, target_score: targetScore,
    });
  } catch (err) {
    console.error('PUT /api/me failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

function todayInJakarta(req) {
  return wibDay(req.now);
}

app.get('/api/exams/:mode', (req, res) => {
  const exam = EXAMS[req.params.mode];
  if (!exam) return res.status(404).json({ error: 'not_found' });
  let ids = null;
  let day = null;
  if (exam.mode === 'daily') {
    day = todayInJakarta(req);
    ids = dailyIds(day);
  }
  const questions = (ids ? ids.map(byId) : questionsFor(exam.mode)).map(publicQuestion);
  res.json({
    mode: exam.mode,
    name: exam.name,
    durationMin: exam.durationMin,
    passingGrade: exam.passingGrade,
    maxScore: exam.maxScore,
    subtests: SUBTESTS,
    day,
    questions,
  });
});

app.post('/api/attempts', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'account_required' });
  const body = req.body || {};
  const mode = body.mode;
  if (!EXAMS[mode]) return res.status(400).json({ error: 'invalid_mode' });
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
    ? body.answers : {};
  const timedOut = body.timedOut === true;
  // The question set is chosen here, never by the client.
  let ids = questionsFor(mode).map((q) => q.id);
  let day = null;
  if (mode === 'daily') {
    day = typeof body.day === 'string' ? body.day : '';
    const today = wibDay(req.now);
    const yesterday = wibDay(new Date(req.now.getTime() - 86400000));
    // A set started before midnight may still be submitted after it.
    if (day !== today && day !== yesterday) return res.status(400).json({ error: 'invalid_day' });
    ids = dailyIds(day);
  }
  const maxSec = EXAMS[mode].durationMin * 60;
  let durationSec = null;
  if (body.durationSec != null && Number.isFinite(Number(body.durationSec))) {
    durationSec = Math.min(maxSec, Math.max(0, Math.round(Number(body.durationSec))));
  }
  if (timedOut) durationSec = maxSec;
  const s = score(mode, answers, ids);
  try {
    const { rows } = await pool.query(
      `INSERT INTO attempts (user_id, mode, answers, score, max_score, passed, timed_out, is_demo, created_at, question_ids, duration_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [userId, mode, JSON.stringify(answers), s.score, s.maxScore, s.passed, timedOut, wantsDemo(req),
        req.now, JSON.stringify(ids), durationSec]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('POST /api/attempts failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/attempts', async (req, res) => {
  const userId = userIdOf(req);
  const demo = wantsDemo(req);
  if (!userId) return res.json({ attempts: [] });
  try {
    if (demo) await seedDemo(req, userId);
    const { rows } = await pool.query(
      `SELECT id, mode, score, max_score, passed, timed_out, created_at
         FROM attempts
        WHERE user_id = $1 AND ($2::boolean OR is_demo = false)
        ORDER BY created_at DESC, id DESC`,
      [userId, demo]
    );
    res.json({ attempts: rows });
  } catch (err) {
    console.error('GET /api/attempts failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/attempts/:id', async (req, res) => {
  const userId = userIdOf(req);
  const id = Number(req.params.id);
  if (!userId || !Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await pool.query(
      `SELECT id, mode, answers, score, max_score, passed, timed_out, created_at, question_ids, duration_sec
         FROM attempts WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const attempt = rows[0];
    const exam = EXAMS[attempt.mode];
    const answers = attempt.answers || {};
    const legacy = !Array.isArray(attempt.question_ids) || !attempt.question_ids.length;
    let ids;
    if (legacy) {
      ids = attempt.mode === 'utbk' ? LEGACY_IDS.utbk : questionsFor(attempt.mode).map((q) => q.id);
    } else {
      ids = attempt.question_ids;
    }
    const qs = ids.map(byId).filter(Boolean);
    const questions = qs.map((q) => ({
      ...publicQuestion(q),
      answer: q.answer || null,
      weights: q.weights || null,
      explanation: q.explanation,
      given: typeof answers[q.id] === 'string' ? answers[q.id] : null,
    }));
    const breakdown = score(attempt.mode, answers, ids);
    res.json({
      attempt,
      exam: {
        mode: exam.mode,
        name: exam.name,
        maxScore: exam.maxScore,
        passingGrade: exam.passingGrade,
        durationMin: exam.durationMin,
      },
      breakdown: {
        correct: breakdown.correct,
        wrong: breakdown.wrong,
        empty: breakdown.empty,
        subtests: breakdown.subtests,
      },
      legacy,
      questions,
    });
  } catch (err) {
    console.error('GET /api/attempts/:id failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// The dashboard, Progres and the profile gap in one read: streak, today's
// Latihan harian, the latest UTBK try out, the last ten UTBK scores and the
// weakest subtest. All worked out from the stored answers.
app.get('/api/summary', async (req, res) => {
  const userId = userIdOf(req);
  const demo = wantsDemo(req);
  const empty = {
    streak: { days: 0, doneToday: false },
    daily: null,
    latestUtbk: null,
    trend: [],
    weakest: null,
  };
  if (!userId) return res.json(empty);
  try {
    if (demo) await seedDemo(req, userId);
    const { rows } = await pool.query(
      `SELECT id, mode, answers, score, max_score, created_at, question_ids
         FROM attempts
        WHERE user_id = $1 AND ($2::boolean OR is_demo = false)
        ORDER BY created_at DESC, id DESC`,
      [userId, demo]
    );
    const today = wibDay(req.now);
    const yesterday = wibDay(new Date(req.now.getTime() - 86400000));
    const days = new Set(rows.map((r) => wibDay(new Date(r.created_at))));
    let streak = 0;
    let cursor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
    while (cursor && days.has(cursor)) {
      streak += 1;
      cursor = wibDay(new Date(Date.parse(cursor + 'T00:00:00Z') - 86400000));
    }

    const dailyRow = rows.find((r) => r.mode === 'daily' && wibDay(new Date(r.created_at)) === today);
    const utbkRows = rows.filter((r) => r.mode === 'utbk');
    const latest = utbkRows[0] || null;
    const trend = utbkRows.slice(0, 10).reverse().map((r) => ({ id: r.id, score: r.score, created_at: r.created_at }));

    const totals = {};
    SUBTESTS.forEach((name) => { totals[name] = { name, correct: 0, total: 0 }; });
    rows.forEach((r) => {
      if (r.mode !== 'utbk' && r.mode !== 'daily') return;
      if (!Array.isArray(r.question_ids) || !r.question_ids.length) return;
      const answers = r.answers || {};
      r.question_ids.forEach((id) => {
        const q = byId(id);
        if (!q || SUBTESTS.indexOf(q.topic) < 0) return;
        const t = totals[q.topic];
        t.total += 1;
        if (answers[id] === q.answer) t.correct += 1;
      });
    });
    let weakest = null;
    if (rows.some((r) => (r.mode === 'utbk' || r.mode === 'daily') && Array.isArray(r.question_ids) && r.question_ids.length)) {
      const list = SUBTESTS.map((name) => {
        const t = totals[name];
        return { name, correct: t.correct, total: t.total, pct: t.total ? Math.round((t.correct / t.total) * 100) : 0 };
      });
      // A tie goes to the subtest listed first.
      let low = list[0];
      list.forEach((s) => { if (s.pct < low.pct) low = s; });
      weakest = { subtests: list, name: low.name };
    }

    res.json({
      streak: { days: streak, doneToday: days.has(today) },
      daily: dailyRow ? { id: dailyRow.id, score: dailyRow.score, max: dailyRow.max_score } : null,
      latestUtbk: latest ? { id: latest.id, score: latest.score } : null,
      trend,
      weakest,
    });
  } catch (err) {
    console.error('GET /api/summary failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/attempts/:id', async (req, res) => {
  const userId = userIdOf(req);
  const id = Number(req.params.id);
  if (!userId || !Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: 'not_found' });
  try {
    const r = await pool.query('DELETE FROM attempts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/attempts/:id failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Tanya AI: the chat screen's routes. Mounted with the app's other API
// routes so they sit behind the sign-in middleware, and before the static
// handler and the HTML catch-all.
ai.mount(app, pool);

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Homeroom" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user && !req.guest) {
    // Deep-link pass-through (platform #743): carry the visited
    // path+query into the chromeless view so share links land on the
    // shared screen, not Home. The clean platform route stores `path`
    // as one encoded query value so an inner ?, &, or = survives. The
    // shell decodes and validates it as relative-only before use. The
    // character test keeps the
    // value attribute-safe for the landing anchor below — anything
    // unusual falls back to the bare link.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    const appPath = APP_SLUG ? '/app/' + encodeURIComponent(APP_SLUG) + '/full' + deepPath : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + appPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}${appPath}" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let httpServer = null;
let shuttingDown = false;

// Stop accepting connections, drain for about three seconds, close the pool.
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  const finish = () => pool.end().catch(() => {}).finally(() => process.exit(0));
  if (!httpServer) return finish();
  httpServer.close(finish);
  setTimeout(() => {
    if (httpServer.closeAllConnections) httpServer.closeAllConnections();
    finish();
  }, 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  await migrate();
  httpServer = app.listen(port, () => console.log(`Listening on :${port}`));
  // Let Envoy retire idle upstream connections at 60s, with a 15s margin.
  httpServer.keepAliveTimeout = 75_000;
}

start().catch(err => { console.error(err); process.exit(1); });
