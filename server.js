const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const {
  EXAMS,
  SUBTESTS,
  questionsFor,
  legacyQuestionsFor,
  publicQuestion,
  questionSnapshot,
  examMeta,
  examMetas,
  score,
  practiceQuestions,
} = require('./questions');

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
// Three tables. All key a person's rows by `user_id` and are marked
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
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_campus text NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_major text NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_score int NOT NULL DEFAULT 600`);
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
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS flagged jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS time_used_sec int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS correct int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wrong int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS blank int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_practices (
    id serial PRIMARY KEY,
    user_id text NOT NULL,
    day date NOT NULL,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    correct int NOT NULL DEFAULT 0,
    total int NOT NULL DEFAULT 5,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, day)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS attempts_user_created ON attempts (user_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS daily_practices_user_day ON daily_practices (user_id, day DESC)');
  await pool.query(`COMMENT ON TABLE profiles IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE attempts IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE daily_practices IS 'staging:private'`);
}

const wantsDemo = (req) => IS_STAGING && req.query.demo === '1';
const userIdOf = (req) => (req.user ? String(req.user.id) : null);

// The app's days (streak, daily practice) turn over at midnight in Jakarta.
// Read "now" through req.now, never new Date() or SQL NOW(), so a staging
// preview opened at ?un-now= sees the right day.
const APP_TIME_ZONE = 'Asia/Jakarta';
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function appDay(date) {
  return DAY_FORMAT.format(date);
}
function dayNumber(day) {
  const parts = String(day).split('-').map(Number);
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
}

function defaultProfile(req) {
  return {
    name: req.user && req.user.username ? req.user.username : 'Tamu',
    target_exam: 'utbk',
    target_campus: '',
    target_major: '',
    target_score: 600,
    latest_utbk: null,
  };
}

// A wrong but valid letter for a demo answer, so a seeded blank stays blank
// and a seeded wrong answer is really wrong.
function wrongLetter(q) {
  const other = q.options.find((o) => o.letter !== q.answer);
  return other ? other.letter : null;
}

// Demo answers with a chosen number of correct answers per subtest.
function demoAnswers(perSubtest) {
  const answers = {};
  for (const st of SUBTESTS) {
    const qs = questionsFor('utbk').filter((q) => q.subtest === st.key);
    const want = perSubtest[st.key] || 0;
    qs.forEach((q, i) => {
      answers[q.id] = i < want ? q.answer : wrongLetter(q);
    });
  }
  return answers;
}

// Demo try outs for the viewer's own preview (?demo=1 on staging). Inserted
// once per person, dated relative to req.now, scored by the same score() as
// a real attempt. Deleted rows stay deleted.
const DEMO_ATTEMPTS = [
  { mode: 'utbk', daysAgo: 20, answers: demoAnswers({ pu: 3, pk: 2, lbi: 1, lbe: 3 }) },
  { mode: 'utbk', daysAgo: 16, answers: demoAnswers({ pu: 3, pk: 3, lbi: 1, lbe: 3 }) },
  { mode: 'utbk', daysAgo: 12, answers: demoAnswers({ pu: 3, pk: 3, lbi: 2, lbe: 3 }) },
  { mode: 'utbk', daysAgo: 8, answers: demoAnswers({ pu: 3, pk: 3, lbi: 2, lbe: 4 }) },
  { mode: 'utbk', daysAgo: 4, answers: demoAnswers({ pu: 4, pk: 3, lbi: 2, lbe: 4 }) },
  { mode: 'utbk', daysAgo: 0.4, answers: demoAnswers({ pu: 4, pk: 4, lbi: 2, lbe: 4 }) },
  { mode: 'cpns', daysAgo: 1, answers: { 'cpns-1': 'B', 'cpns-2': 'A', 'cpns-3': 'D' } },
  { mode: 'cpns', daysAgo: 7, answers: { 'cpns-1': 'B', 'cpns-2': 'C', 'cpns-3': 'C' } },
  { mode: 'cpns', daysAgo: 15, answers: { 'cpns-1': 'A', 'cpns-2': 'B', 'cpns-3': 'A' } },
];

async function seedDemo(req, userId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // One seed at a time per person, even on two tabs at once.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['demo:' + userId]);
    const found = await db.query('SELECT demo_seeded FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (found.rows.length && found.rows[0].demo_seeded) {
      await db.query('COMMIT');
      return;
    }
    if (!found.rows.length) {
      const name = req.user && req.user.username ? req.user.username : 'Tamu';
      await db.query(
        `INSERT INTO profiles (user_id, name, target_exam, target_campus, target_major, target_score, demo_seeded, updated_at)
         VALUES ($1, $2, 'utbk', 'Universitas Indonesia', 'Kedokteran', 720, true, $3)
         ON CONFLICT (user_id) DO UPDATE SET demo_seeded = true`,
        [userId, name, req.now]
      );
    } else {
      await db.query('UPDATE profiles SET demo_seeded = true, updated_at = $2 WHERE user_id = $1', [userId, req.now]);
    }
    for (const d of DEMO_ATTEMPTS) {
      const s = score(d.mode, d.answers);
      const created = new Date(req.now.getTime() - d.daysAgo * 1440 * 60000);
      const duration = EXAMS[d.mode].durationMin * 60;
      const used = Math.max(0, duration - 180 - Math.round(d.daysAgo * 7));
      await db.query(
        `INSERT INTO attempts (user_id, mode, answers, score, max_score, passed, timed_out, is_demo,
           created_at, flagged, time_used_sec, breakdown, correct, wrong, blank, questions)
         VALUES ($1, $2, $3, $4, $5, $6, false, true, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          userId, d.mode, JSON.stringify(d.answers), s.score, s.maxScore, s.passed, created,
          JSON.stringify([]), used, JSON.stringify(s.breakdown), s.correct, s.wrong, s.blank,
          JSON.stringify(questionsFor(d.mode).map(questionSnapshot)),
        ]
      );
    }
    // Four consecutive practice days ending today, so Beruntun shows 4.
    for (let back = 3; back >= 0; back -= 1) {
      const created = new Date(req.now.getTime() - back * 1440 * 60000);
      const day = appDay(created);
      const dayQs = practiceQuestions(day);
      const answers = {};
      dayQs.forEach((q, i) => {
        answers[q.id] = i < 4 ? q.answer : wrongLetter(q);
      });
      const s = dayQs.reduce((sum, q) => sum + (answers[q.id] === q.answer ? 1 : 0), 0);
      await db.query(
        `INSERT INTO daily_practices (user_id, day, answers, correct, total, is_demo, created_at)
         VALUES ($1, $2, $3, $4, 5, true, $5)
         ON CONFLICT (user_id, day) DO NOTHING`,
        [userId, day, JSON.stringify(answers), s, created]
      );
    }
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
    // The dashboard asks for the profile and the attempts at the same time;
    // seeding here too means the demo's target line is there on the first
    // load, not only after the attempts call has created it.
    if (wantsDemo(req)) await seedDemo(req, userId);
    const { rows } = await pool.query(
      `SELECT name, target_exam, target_campus, target_major, target_score
         FROM profiles WHERE user_id = $1`, [userId]);
    const latest = await pool.query(
      `SELECT score, created_at FROM attempts
        WHERE user_id = $1 AND mode = 'utbk' AND ($2::boolean OR is_demo = false)
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [userId, wantsDemo(req)]
    );
    const latestUtbk = latest.rows.length
      ? { score: latest.rows[0].score, created_at: latest.rows[0].created_at }
      : null;
    if (!rows.length) return res.json(Object.assign({}, fallback, { latest_utbk: latestUtbk }));
    const r = rows[0];
    res.json({
      name: r.name || fallback.name,
      target_exam: r.target_exam === 'cpns' ? 'cpns' : 'utbk',
      target_campus: r.target_campus || '',
      target_major: r.target_major || '',
      target_score: Number.isFinite(r.target_score) ? r.target_score : 600,
      latest_utbk: latestUtbk,
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
  const campus = typeof body.target_campus === 'string' ? body.target_campus.trim() : '';
  const major = typeof body.target_major === 'string' ? body.target_major.trim() : '';
  const rawTarget = body.target_score;
  const targetScore = rawTarget === undefined || rawTarget === null || rawTarget === '' ? 600 : Number(rawTarget);
  if (!name || name.length > 60) return res.status(400).json({ error: 'invalid_name' });
  if (!targetExam) return res.status(400).json({ error: 'invalid_target' });
  if (campus.length > 60) return res.status(400).json({ error: 'invalid_campus' });
  if (major.length > 60) return res.status(400).json({ error: 'invalid_major' });
  if (!Number.isInteger(targetScore) || targetScore < 0 || targetScore > 1000) {
    return res.status(400).json({ error: 'invalid_target_score' });
  }
  try {
    await pool.query(
      `INSERT INTO profiles (user_id, name, target_exam, target_campus, target_major, target_score, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
         SET name = EXCLUDED.name, target_exam = EXCLUDED.target_exam,
             target_campus = EXCLUDED.target_campus, target_major = EXCLUDED.target_major,
             target_score = EXCLUDED.target_score, updated_at = EXCLUDED.updated_at`,
      [userId, name, targetExam, campus, major, targetScore, req.now]
    );
    res.json({
      name,
      target_exam: targetExam,
      target_campus: campus,
      target_major: major,
      target_score: targetScore,
    });
  } catch (err) {
    console.error('PUT /api/me failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/exams', (_req, res) => {
  res.json({ exams: examMetas() });
});

app.get('/api/exams/:mode', (req, res) => {
  const meta = examMeta(req.params.mode);
  if (!meta) return res.status(404).json({ error: 'not_found' });
  res.json(Object.assign({}, meta, {
    questions: questionsFor(meta.mode).map(publicQuestion),
  }));
});

app.post('/api/attempts', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'account_required' });
  const body = req.body || {};
  const mode = body.mode;
  if (!EXAMS[mode]) return res.status(400).json({ error: 'invalid_mode' });
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
    ? body.answers : {};
  const validIds = new Set(questionsFor(mode).map((q) => q.id));
  const flagged = Array.isArray(body.flagged)
    ? body.flagged.filter((id) => typeof id === 'string' && validIds.has(id))
    : [];
  const timedOut = body.timedOut === true;
  const limit = EXAMS[mode].durationMin * 60;
  const reported = Number(body.timeUsedSec);
  const timeUsed = Number.isFinite(reported) ? Math.max(0, Math.min(limit, Math.round(reported))) : 0;
  const s = score(mode, answers);
  try {
    const { rows } = await pool.query(
      `INSERT INTO attempts (user_id, mode, answers, score, max_score, passed, timed_out, is_demo, created_at,
         flagged, time_used_sec, breakdown, correct, wrong, blank, questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [
        userId, mode, JSON.stringify(answers), s.score, s.maxScore, s.passed, timedOut, wantsDemo(req), req.now,
        JSON.stringify(flagged), timeUsed, JSON.stringify(s.breakdown), s.correct, s.wrong, s.blank,
        JSON.stringify(questionsFor(mode).map(questionSnapshot)),
      ]
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
      `SELECT id, mode, score, max_score, passed, timed_out, time_used_sec, created_at
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
      `SELECT id, mode, answers, flagged, score, max_score, passed, timed_out, time_used_sec,
              breakdown, correct, wrong, blank, questions, created_at
         FROM attempts WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const attempt = rows[0];
    const exam = examMeta(attempt.mode);
    const answers = attempt.answers || {};
    const flagged = Array.isArray(attempt.flagged) ? attempt.flagged : [];
    const snapshot = Array.isArray(attempt.questions) ? attempt.questions : [];
    // An attempt saved before the 20-question bank has no snapshot; its three
    // old questions still live in LEGACY_QUESTIONS, keyed by the same ids.
    const source = snapshot.length ? snapshot : legacyQuestionsFor(attempt.mode);
    const questions = source.map((q) => ({
      id: q.id,
      subtest: q.subtest || null,
      subtestName: q.subtestName || null,
      topic: q.topic,
      type: q.type || 'pilihan',
      passage: q.passage || null,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer || null,
      weights: q.weights || null,
      explanation: q.explanation || [],
      given: typeof answers[q.id] === 'string' ? answers[q.id] : null,
      flagged: flagged.indexOf(q.id) !== -1,
    }));
    const breakdown = attempt.breakdown && Object.keys(attempt.breakdown).length
      ? attempt.breakdown : null;
    res.json({
      attempt: {
        id: attempt.id,
        mode: attempt.mode,
        score: attempt.score,
        max_score: attempt.max_score,
        passed: attempt.passed,
        timed_out: attempt.timed_out,
        time_used_sec: attempt.time_used_sec,
        correct: attempt.correct,
        wrong: attempt.wrong,
        blank: attempt.blank,
        created_at: attempt.created_at,
      },
      exam,
      breakdown,
      legacy: snapshot.length === 0,
      questions,
    });
  } catch (err) {
    console.error('GET /api/attempts/:id failed: ' + err.message);
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

// ── Streak, progress and daily practice ────────────────────────────────────
function isoDay(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function streakFrom(dayStrings, today) {
  const set = new Set(dayStrings.map(dayNumber));
  const t = dayNumber(today);
  const start = set.has(t) ? t : set.has(t - 1) ? t - 1 : null;
  let current = 0;
  if (start !== null) {
    let d = start;
    while (set.has(d)) {
      current += 1;
      d -= 1;
    }
  }
  const sorted = Array.from(set).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = n;
  }
  const recent = [];
  for (let i = 6; i >= 0; i -= 1) {
    const n = t - i;
    recent.push({ day: isoDay(n), done: set.has(n) });
  }
  return { current, longest, todayDone: set.has(t), recent };
}

async function completedDays(userId, demo) {
  const { rows } = await pool.query(
    `SELECT to_char(created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day
       FROM attempts WHERE user_id = $1 AND ($2::boolean OR is_demo = false)
     UNION
     SELECT to_char(day, 'YYYY-MM-DD') AS day
       FROM daily_practices WHERE user_id = $1 AND ($2::boolean OR is_demo = false)`,
    [userId, demo, APP_TIME_ZONE]
  );
  return rows.map((r) => r.day);
}

async function practicePayload(req, userId) {
  const day = appDay(req.now);
  const demo = wantsDemo(req);
  const dayQuestions = practiceQuestions(day);
  let stored = null;
  if (userId) {
    const found = await pool.query(
      `SELECT answers, correct, total FROM daily_practices
        WHERE user_id = $1 AND day = $2 AND ($3::boolean OR is_demo = false)`,
      [userId, day, demo]
    );
    stored = found.rows[0] || null;
  }
  const publicQs = dayQuestions.map(publicQuestion);
  if (stored) {
    const answers = stored.answers || {};
    return {
      day,
      done: true,
      correct: stored.correct,
      total: stored.total,
      answers,
      questions: publicQs.map((pq, i) => Object.assign({}, pq, {
        answer: dayQuestions[i].answer || null,
        weights: dayQuestions[i].weights || null,
        explanation: dayQuestions[i].explanation || [],
        given: typeof answers[pq.id] === 'string' ? answers[pq.id] : null,
      })),
    };
  }
  return { day, done: false, correct: 0, total: publicQs.length, answers: {}, questions: publicQs };
}

app.get('/api/streak', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.json(streakFrom([], appDay(req.now)));
  try {
    const demo = wantsDemo(req);
    if (demo) await seedDemo(req, userId);
    const days = await completedDays(userId, demo);
    res.json(streakFrom(days, appDay(req.now)));
  } catch (err) {
    console.error('GET /api/streak failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/progress', async (req, res) => {
  const mode = req.query.mode === 'cpns' ? 'cpns' : 'utbk';
  const userId = userIdOf(req);
  const demo = wantsDemo(req);
  const empty = {
    mode,
    count: 0,
    best: null,
    average: null,
    targetScore: null,
    weakest: null,
    perSubtest: [],
    trend: [],
    attempts: [],
  };
  if (!userId) return res.json(empty);
  try {
    if (demo) await seedDemo(req, userId);
    const { rows } = await pool.query(
      `SELECT id, mode, score, max_score, passed, timed_out, time_used_sec, breakdown,
              correct, wrong, blank, created_at
         FROM attempts
        WHERE user_id = $1 AND mode = $2 AND ($3::boolean OR is_demo = false)
        ORDER BY created_at ASC, id ASC`,
      [userId, mode, demo]
    );
    if (!rows.length) return res.json(empty);
    const profile = await pool.query('SELECT target_score FROM profiles WHERE user_id = $1', [userId]);
    const targetScore = profile.rows.length ? Number(profile.rows[0].target_score) : 600;
    const sum = rows.reduce((acc, r) => acc + r.score, 0);
    const averages = new Map();
    for (const r of rows) {
      const breakdown = r.breakdown || {};
      for (const key of Object.keys(breakdown)) {
        const item = breakdown[key];
        if (!averages.has(key)) {
          averages.set(key, { key, name: item.name || key, total: 0, count: 0, max: item.max || 0 });
        }
        const acc = averages.get(key);
        acc.total += item.score || 0;
        acc.count += 1;
        acc.max = item.max || acc.max;
      }
    }
    const order = SUBTESTS.map((s) => s.key);
    const perSubtest = Array.from(averages.values())
      .map((a) => ({ key: a.key, name: a.name, average: Math.round(a.total / a.count), max: a.max, count: a.count }))
      .sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    let weakest = null;
    if (mode === 'utbk') {
      for (const item of perSubtest) {
        if (!weakest || item.average < weakest.average) weakest = item;
      }
    }
    res.json({
      mode,
      count: rows.length,
      best: Math.max.apply(null, rows.map((r) => r.score)),
      average: Math.round(sum / rows.length),
      targetScore: mode === 'utbk' ? targetScore : null,
      weakest,
      perSubtest,
      trend: rows.slice(-12).map((r) => ({
        id: r.id,
        score: r.score,
        maxScore: r.max_score,
        created_at: r.created_at,
      })),
      attempts: rows.slice().reverse().map((r) => ({
        id: r.id,
        mode: r.mode,
        score: r.score,
        max_score: r.max_score,
        passed: r.passed,
        timed_out: r.timed_out,
        time_used_sec: r.time_used_sec,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/progress failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/practice', async (req, res) => {
  const userId = userIdOf(req);
  try {
    if (wantsDemo(req)) {
      if (userId) await seedDemo(req, userId);
    }
    const payload = await practicePayload(req, userId);
    if (userId) {
      const days = await completedDays(userId, wantsDemo(req));
      payload.streak = streakFrom(days, appDay(req.now));
    }
    res.json(payload);
  } catch (err) {
    console.error('GET /api/practice failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/practice', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'account_required' });
  const body = req.body || {};
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
    ? body.answers : {};
  const day = appDay(req.now);
  const dayQuestions = practiceQuestions(day);
  let correct = 0;
  for (const q of dayQuestions) {
    if (answers[q.id] === q.answer) correct += 1;
  }
  try {
    await pool.query(
      `INSERT INTO daily_practices (user_id, day, answers, correct, total, is_demo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, day) DO NOTHING`,
      [userId, day, JSON.stringify(answers), correct, dayQuestions.length, wantsDemo(req), req.now]
    );
    const payload = await practicePayload(req, userId);
    const days = await completedDays(userId, wantsDemo(req));
    payload.streak = streakFrom(days, day);
    res.status(201).json(payload);
  } catch (err) {
    console.error('POST /api/practice failed: ' + err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

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
