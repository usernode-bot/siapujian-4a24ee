'use strict';

// Tanya AI: the chat storage, the daily quota and the calls to the platform's
// Claude proxy (see "App LLM access" in the platform conventions).
//
// Production containers get USERNODE_LLM_PROXY_URL and
// USERNODE_LLM_PROXY_TOKEN. Staging previews and standalone runs get neither,
// so AI_ENABLED is false there and every route answers with the clearly
// labelled sample reply from ai-content.js. The feature itself is the same in
// both environments: same routes, same quota, same stored history.

const {
  TOPICS,
  askSystem,
  studySystem,
  practiceSystem,
  splitShortDetail,
  parsePractice,
  sampleAnswer,
  sampleStudyPlan,
  samplePractice,
  inferIntent,
  truncate,
} = require('./ai-content');
const { EXAMS, QUESTIONS } = require('./questions');

const DAILY_LIMIT = 10;
// The daily counter resets at midnight in the app's own zone. SiapUjian's
// audience is Indonesian, so the plan and the quota both use WIB.
const TIME_ZONE = 'Asia/Jakarta';
const LLM_MODEL = 'claude-sonnet-5-5';
const AI_ENABLED = !!(process.env.USERNODE_LLM_PROXY_URL && process.env.USERNODE_LLM_PROXY_TOKEN);
const MAX_MESSAGE_CHARS = 1000;
const MAX_STORED_MESSAGES = 80;

const userIdOf = (req) => (req.user ? String(req.user.id) : null);
const userTokenOf = (req) => req.headers['x-usernode-token'] || req.query.token || '';

async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_chats (
    id serial PRIMARY KEY,
    user_id text NOT NULL,
    context_key text NOT NULL DEFAULT 'umum',
    title text NOT NULL DEFAULT 'Percakapan',
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS ai_chats_user_context ON ai_chats (user_id, context_key)');
  await pool.query('CREATE INDEX IF NOT EXISTS ai_chats_user_updated ON ai_chats (user_id, updated_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage (
    user_id text NOT NULL,
    day date NOT NULL,
    used int NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )`);
  // Both hold one person's private conversations and their usage, so both are
  // copied to staging as schema only. Both key their rows by user_id, so
  // usernode-user-data.js covers them as is.
  await pool.query(`COMMENT ON TABLE ai_chats IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE ai_usage IS 'staging:private'`);
}

// The viewer's local calendar day (Asia/Jakarta), as YYYY-MM-DD.
function dayKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

function usagePayload(used) {
  return {
    used: used,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
    timeZone: TIME_ZONE,
  };
}

// Adds one to today's counter, but only while there is room. A null result
// means the limit is reached.
async function reserveQuestion(pool, userId, day) {
  const { rows } = await pool.query(
    `INSERT INTO ai_usage (user_id, day, used) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET used = ai_usage.used + 1
       WHERE ai_usage.used < $3
     RETURNING used`,
    [userId, day, DAILY_LIMIT]
  );
  return rows.length ? rows[0].used : null;
}

async function refundQuestion(pool, userId, day) {
  await pool.query(
    'UPDATE ai_usage SET used = GREATEST(used - 1, 0) WHERE user_id = $1 AND day = $2',
    [userId, day]
  ).catch(() => {});
}

async function usedToday(pool, userId, day) {
  const { rows } = await pool.query(
    'SELECT used FROM ai_usage WHERE user_id = $1 AND day = $2', [userId, day]);
  return rows.length ? rows[0].used : 0;
}

function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

// Builds the context a chat is about. With an attemptId (the review screen's
// "Tanya AI") the correct answer and the app's own explanation are attached
// only after checking the attempt belongs to this viewer. Without an attempt
// the answer key is left out: it only ever leaves this app for the viewer's
// own finished attempt.
async function buildContext(pool, userId, body) {
  const q = body && body.questionId ? questionById(String(body.questionId)) : null;
  let given = null;
  let attempt = null;
  if (q && body.attemptId) {
    const id = Number(body.attemptId);
    if (Number.isSafeInteger(id) && id > 0) {
      const { rows } = await pool.query(
        'SELECT id, answers FROM attempts WHERE id = $1 AND user_id = $2', [id, userId]);
      if (rows.length) {
        attempt = rows[0].id;
        const answers = rows[0].answers || {};
        const g = answers[q.id];
        if (typeof g === 'string' && q.options.some((o) => o.letter === g)) given = g;
      }
    }
  }
  if (!q) return { key: 'umum', label: 'Pertanyaan umum', question: null };
  return {
    key: 'q:' + q.id,
    label: q.topic + ' · ' + truncate(q.prompt, 48),
    question: {
      id: q.id,
      mode: q.mode,
      topic: q.topic,
      type: q.type || 'pilihan',
      prompt: q.prompt,
      options: q.options,
    },
    given: given,
    answer: attempt ? (q.answer || null) : null,
    weights: attempt ? (q.weights || null) : null,
    explanation: attempt ? q.explanation : null,
    attempt: attempt,
  };
}

function titleFor(context) {
  if (context.question) return truncate(context.question.topic + ': ' + context.question.prompt, 72);
  return 'Pertanyaan umum';
}

async function openChat(pool, userId, context, now) {
  const { rows } = await pool.query(
    `INSERT INTO ai_chats (user_id, context_key, title, context, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, context_key) DO UPDATE
       SET context = EXCLUDED.context, updated_at = EXCLUDED.updated_at
     RETURNING id, context_key, title, context, messages, updated_at`,
    [userId, context.key, titleFor(context), JSON.stringify(context), now]
  );
  return rows[0];
}

async function loadChat(pool, userId, chatId) {
  const id = Number(chatId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { rows } = await pool.query(
    `SELECT id, context_key, title, context, messages, updated_at
       FROM ai_chats WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows.length ? rows[0] : null;
}

async function appendMessages(pool, chatId, messages, now) {
  const { rows } = await pool.query(
    `UPDATE ai_chats
        SET messages = (messages || $2::jsonb), updated_at = $3
      WHERE id = $1 RETURNING messages`,
    [chatId, JSON.stringify(messages), now]
  );
  const stored = rows.length ? rows[0].messages : [];
  if (stored.length > MAX_STORED_MESSAGES) {
    const trimmed = stored.slice(stored.length - MAX_STORED_MESSAGES);
    await pool.query('UPDATE ai_chats SET messages = $2::jsonb WHERE id = $1',
      [chatId, JSON.stringify(trimmed)]);
    return trimmed;
  }
  return stored;
}

// ── The platform's Claude proxy ────────────────────────────────────────────

function llmBase() {
  return (process.env.USERNODE_LLM_PROXY_URL || '').replace(/\/+$/, '');
}

async function callLlm(userToken, { system, messages, maxTokens }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch(llmBase() + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-usernode-app-token': process.env.USERNODE_LLM_PROXY_TOKEN || '',
        'x-usernode-user-token': userToken || '',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: maxTokens || 700,
        system: system,
        messages: messages,
      }),
      signal: controller.signal,
    });
    let data = null;
    try { data = await resp.json(); } catch {}
    if (!resp.ok) {
      const err = new Error('llm ' + resp.status);
      err.status = resp.status;
      err.code = (data && data.code) || 'ai_unavailable';
      throw err;
    }
    const text = ((data && data.content) || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) {
      const err = new Error('llm empty response');
      err.status = 502;
      err.code = 'ai_unavailable';
      throw err;
    }
    return text;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('llm timeout');
      e.status = 504;
      e.code = 'ai_unavailable';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Sends the app's error code back to the page. grant_required makes the page
// ask for the user's AI consent and retry; the two 429s tell it to stop.
function sendLlmError(res, err) {
  const code = err && err.code;
  if (err && err.status === 403 && code === 'grant_required') {
    return res.status(403).json({ error: 'grant_required' });
  }
  if (err && err.status === 429) {
    const known = code === 'app_cap_exceeded' || code === 'budget_exceeded' || code === 'rate_limited';
    return res.status(429).json({ error: known ? code : 'app_cap_exceeded' });
  }
  if (code === 'grant_required') return res.status(403).json({ error: 'grant_required' });
  console.error('Tanya AI proxy failed: ' + (err && err.message));
  return res.status(502).json({ error: 'ai_unavailable' });
}

// The conversation as Anthropic messages: the last few turns, assistant
// replies with their detail, practice messages as their summary line.
function toLlmMessages(messages) {
  return messages
    .slice(-12)
    .map((m) => {
      if (m.role === 'user') return { role: 'user', content: String(m.text || '') };
      const content = [m.text, m.detail].filter(Boolean).join('\n\n');
      return { role: 'assistant', content: content || 'Soal latihan sudah dibuat.' };
    })
    .filter((m) => m.content);
}

// ── Study plan input: the viewer's weakest subtests ────────────────────────

async function weakestTopics(pool, userId, targetExam) {
  const mode = targetExam === 'cpns' ? 'cpns' : 'utbk';
  const { rows } = await pool.query(
    `SELECT mode, answers FROM attempts
      WHERE user_id = $1 AND mode = $2
      ORDER BY created_at DESC LIMIT 20`,
    [userId, mode]
  );
  const stats = new Map();
  for (const row of rows) {
    const answers = row.answers || {};
    for (const q of QUESTIONS.filter((item) => item.mode === mode)) {
      const given = answers[q.id];
      if (typeof given !== 'string' || !q.options.some((o) => o.letter === given)) continue;
      let points = 0;
      if (q.type === 'tkp') points = ((q.weights && q.weights[given]) || 0) / 5;
      else points = given === q.answer ? 1 : 0;
      const cur = stats.get(q.topic) || { topic: q.topic, points: 0, total: 0 };
      cur.points += points;
      cur.total += 1;
      stats.set(q.topic, cur);
    }
  }
  const list = Array.from(stats.values())
    .map((t) => ({ topic: t.topic, ratio: t.total ? t.points / t.total : 0, total: t.total }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3);
  if (list.length) return list;
  return TOPICS[mode].map((topic) => ({ topic: topic, ratio: 0, total: 0 }));
}

async function targetExamOf(pool, userId) {
  const { rows } = await pool.query('SELECT target_exam FROM profiles WHERE user_id = $1', [userId]);
  return rows.length && rows[0].target_exam === 'cpns' ? 'cpns' : 'utbk';
}

// ── Routes ─────────────────────────────────────────────────────────────────

function mount(app, pool) {
  app.get('/api/ai/status', async (req, res) => {
    const userId = userIdOf(req);
    const day = dayKey(req.now);
    let used = 0;
    if (userId) {
      try { used = await usedToday(pool, userId, day); } catch (err) {
        console.error('GET /api/ai/status failed: ' + err.message);
      }
    }
    res.json(Object.assign({
      enabled: AI_ENABLED,
      member: !!userId,
      topics: TOPICS,
    }, usagePayload(used)));
  });

  app.get('/api/ai/chats', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.json({ chats: [] });
    try {
      const { rows } = await pool.query(
        `SELECT id, title, context_key, context->>'label' AS label,
                jsonb_array_length(messages) AS message_count, updated_at
           FROM ai_chats
          WHERE user_id = $1 AND jsonb_array_length(messages) > 0
          ORDER BY updated_at DESC, id DESC
          LIMIT 50`,
        [userId]
      );
      res.json({ chats: rows });
    } catch (err) {
      console.error('GET /api/ai/chats failed: ' + err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/ai/chats/:id', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'account_required' });
    try {
      const chat = await loadChat(pool, userId, req.params.id);
      if (!chat) return res.status(404).json({ error: 'not_found' });
      const status = await usedToday(pool, userId, dayKey(req.now));
      res.json({ chat: chat, usage: usagePayload(status) });
    } catch (err) {
      console.error('GET /api/ai/chats/:id failed: ' + err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Opens (or continues) the chat about one question, or the general chat.
  app.post('/api/ai/chats', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'account_required' });
    try {
      const context = await buildContext(pool, userId, req.body || {});
      const chat = await openChat(pool, userId, context, req.now);
      const status = await usedToday(pool, userId, dayKey(req.now));
      res.json({ chat: chat, usage: usagePayload(status) });
    } catch (err) {
      console.error('POST /api/ai/chats failed: ' + err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // One question. Reserves a slot from the daily quota first and gives it back
  // if the model call fails.
  app.post('/api/ai/chat', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'account_required' });
    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'empty_message' });
    if (message.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: 'message_too_long' });

    const day = dayKey(req.now);
    let chat = null;
    try {
      chat = body.chatId ? await loadChat(pool, userId, body.chatId) : null;
      if (!chat) {
        const context = await buildContext(pool, userId, body);
        chat = await openChat(pool, userId, context, req.now);
      }
    } catch (err) {
      console.error('POST /api/ai/chat (chat) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }

    let used;
    try {
      used = await reserveQuestion(pool, userId, day);
    } catch (err) {
      console.error('POST /api/ai/chat (quota) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }
    if (used === null) {
      const status = await usedToday(pool, userId, day).catch(() => DAILY_LIMIT);
      return res.status(429).json(Object.assign({ error: 'daily_limit' }, usagePayload(status)));
    }

    const intent = typeof body.intent === 'string' ? body.intent : inferIntent(message);
    const history = Array.isArray(chat.messages) ? chat.messages : [];
    let reply;
    try {
      if (AI_ENABLED) {
        const raw = await callLlm(userTokenOf(req), {
          system: askSystem(chat.context || {}),
          messages: toLlmMessages(history).concat([{ role: 'user', content: message }]),
          maxTokens: 700,
        });
        const parts = splitShortDetail(raw);
        reply = { text: parts.text, detail: parts.detail, sample: false };
      } else {
        const parts = sampleAnswer({ intent: intent, message: message, ctx: chat.context || {} });
        reply = { text: parts.text, detail: parts.detail, sample: true };
      }
    } catch (err) {
      await refundQuestion(pool, userId, day);
      return sendLlmError(res, err);
    }

    const now = req.now;
    const userMessage = { role: 'user', text: message, at: now.toISOString() };
    const assistantMessage = {
      role: 'assistant',
      text: reply.text,
      detail: reply.detail || null,
      sample: reply.sample,
      intent: intent,
      at: new Date(now.getTime() + 1).toISOString(),
    };
    try {
      await appendMessages(pool, chat.id, [userMessage, assistantMessage], now);
    } catch (err) {
      console.error('POST /api/ai/chat (save) failed: ' + err.message);
      await refundQuestion(pool, userId, day);
      return res.status(500).json({ error: 'server_error' });
    }
    res.json({
      chatId: chat.id,
      reply: assistantMessage,
      usage: usagePayload(used),
    });
  });

  // Three practice questions on a topic. Answers stay hidden in the page
  // until the viewer taps "Tampilkan jawaban".
  app.post('/api/ai/practice', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'account_required' });
    const body = req.body || {};
    const day = dayKey(req.now);
    let chat = null;
    try {
      chat = body.chatId ? await loadChat(pool, userId, body.chatId) : null;
      if (!chat) {
        const context = await buildContext(pool, userId, body);
        chat = await openChat(pool, userId, context, req.now);
      }
    } catch (err) {
      console.error('POST /api/ai/practice (chat) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }

    const ctx = chat.context || {};
    const topic = truncate(
      typeof body.topic === 'string' && body.topic.trim()
        ? body.topic.trim()
        : ((ctx.question && ctx.question.topic) || 'campuran'),
      60
    );

    let used;
    try {
      used = await reserveQuestion(pool, userId, day);
    } catch (err) {
      console.error('POST /api/ai/practice (quota) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }
    if (used === null) {
      const status = await usedToday(pool, userId, day).catch(() => DAILY_LIMIT);
      return res.status(429).json(Object.assign({ error: 'daily_limit' }, usagePayload(status)));
    }

    let practice;
    let sample = false;
    try {
      if (AI_ENABLED) {
        const raw = await callLlm(userTokenOf(req), {
          system: practiceSystem(topic),
          messages: [{ role: 'user', content: 'Buat 3 soal latihan tentang "' + topic + '".' }],
          maxTokens: 1400,
        });
        practice = parsePractice(raw);
        if (!practice) {
          const err = new Error('practice json invalid');
          err.status = 502;
          err.code = 'practice_failed';
          throw err;
        }
      } else {
        sample = true;
        practice = samplePractice(topic, (ctx.question && ctx.question.mode) || 'utbk');
      }
    } catch (err) {
      await refundQuestion(pool, userId, day);
      if (err.code === 'practice_failed') {
        return res.status(502).json({ error: 'practice_failed' });
      }
      return sendLlmError(res, err);
    }

    const now = req.now;
    const userMessage = { role: 'user', text: 'Buat 3 soal latihan tentang ' + topic + '.', at: now.toISOString() };
    const assistantMessage = {
      role: 'assistant',
      text: 'Ini 3 soal latihan tentang ' + topic + '. Kerjakan dulu, lalu buka jawabannya.',
      detail: null,
      practice: practice,
      sample: sample,
      intent: 'practice',
      at: new Date(now.getTime() + 1).toISOString(),
    };
    try {
      await appendMessages(pool, chat.id, [userMessage, assistantMessage], now);
    } catch (err) {
      console.error('POST /api/ai/practice (save) failed: ' + err.message);
      await refundQuestion(pool, userId, day);
      return res.status(500).json({ error: 'server_error' });
    }
    res.json({ chatId: chat.id, reply: assistantMessage, usage: usagePayload(used) });
  });

  // A 7-day study plan built from the viewer's weakest subtests.
  app.post('/api/ai/study-plan', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'account_required' });
    const body = req.body || {};
    const day = dayKey(req.now);
    let chat = null;
    try {
      chat = body.chatId ? await loadChat(pool, userId, body.chatId) : null;
      if (!chat) {
        const context = await buildContext(pool, userId, body);
        chat = await openChat(pool, userId, context, req.now);
      }
    } catch (err) {
      console.error('POST /api/ai/study-plan (chat) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }

    let used;
    try {
      used = await reserveQuestion(pool, userId, day);
    } catch (err) {
      console.error('POST /api/ai/study-plan (quota) failed: ' + err.message);
      return res.status(500).json({ error: 'server_error' });
    }
    if (used === null) {
      const status = await usedToday(pool, userId, day).catch(() => DAILY_LIMIT);
      return res.status(429).json(Object.assign({ error: 'daily_limit' }, usagePayload(status)));
    }

    let reply;
    try {
      const mode = await targetExamOf(pool, userId);
      const weakest = await weakestTopics(pool, userId, mode);
      const data = { examName: EXAMS[mode].name, weakest: weakest, mode: mode };
      if (AI_ENABLED) {
        const raw = await callLlm(userTokenOf(req), {
          system: studySystem(data),
          messages: [{ role: 'user', content: 'Buat rencana belajar 7 hari untukku.' }],
          maxTokens: 600,
        });
        reply = { text: raw.trim(), detail: null, sample: false };
      } else {
        const parts = sampleStudyPlan(data);
        reply = { text: parts.text, detail: parts.detail, sample: true };
      }
    } catch (err) {
      await refundQuestion(pool, userId, day);
      return sendLlmError(res, err);
    }

    const now = req.now;
    const userMessage = { role: 'user', text: 'Bantu aku belajar. Buat rencana 7 hari.', at: now.toISOString() };
    const assistantMessage = {
      role: 'assistant',
      text: reply.text,
      detail: reply.detail || null,
      sample: reply.sample,
      intent: 'study',
      at: new Date(now.getTime() + 1).toISOString(),
    };
    try {
      await appendMessages(pool, chat.id, [userMessage, assistantMessage], now);
    } catch (err) {
      console.error('POST /api/ai/study-plan (save) failed: ' + err.message);
      await refundQuestion(pool, userId, day);
      return res.status(500).json({ error: 'server_error' });
    }
    res.json({ chatId: chat.id, reply: assistantMessage, usage: usagePayload(used) });
  });
}

module.exports = { mount, migrate, dayKey, DAILY_LIMIT, TIME_ZONE, AI_ENABLED };
