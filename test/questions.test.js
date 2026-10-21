'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  SUBTESTS, LEGACY_IDS, questionsFor, publicQuestion, score, wibDay, dailyIds, byId,
} = require('../questions');

const all = questionsFor('utbk');

test('20 active UTBK questions, 5 per subtest', () => {
  assert.strictEqual(all.length, 20);
  for (const name of SUBTESTS) {
    assert.strictEqual(all.filter((q) => q.topic === name).length, 5, name);
  }
});

const answersFor = (n) => {
  const a = {};
  all.slice(0, n).forEach((q) => { a[q.id] = q.answer; });
  return a;
};

test('UTBK totals: 20 right 1000, 12 right 600 passes, 11 right 550 fails, blank 0', () => {
  assert.strictEqual(score('utbk', answersFor(20)).score, 1000);
  const s12 = score('utbk', answersFor(12));
  assert.strictEqual(s12.score, 600);
  assert.strictEqual(s12.passed, true);
  const s11 = score('utbk', answersFor(11));
  assert.strictEqual(s11.score, 550);
  assert.strictEqual(s11.passed, false);
  const blank = score('utbk', {});
  assert.strictEqual(blank.score, 0);
  assert.strictEqual(blank.empty, 20);
  assert.strictEqual(blank.correct, 0);
});

test('subtest scores are right', () => {
  const s = score('utbk', answersFor(13));
  assert.deepStrictEqual(s.subtests.map((x) => x.name), SUBTESTS);
  assert.strictEqual(s.subtests[0].correct, 5);
  assert.strictEqual(s.subtests[1].correct, 5);
  assert.strictEqual(s.subtests[2].correct, 3);
  assert.strictEqual(s.subtests[2].score, 600);
});

test('publicQuestion never leaks the key', () => {
  for (const q of all) {
    const p = publicQuestion(q);
    assert.ok(!('answer' in p) && !('weights' in p) && !('explanation' in p));
  }
  assert.ok(publicQuestion(all.find((q) => q.passage)).passage);
});

test('dailyIds: 5 unique ids covering all four subtests, eight days running', () => {
  const day0 = Date.parse('2026-10-21T00:00:00Z');
  for (let i = 0; i < 8; i++) {
    const day = new Date(day0 + i * 86400000).toISOString().slice(0, 10);
    const ids = dailyIds(day);
    assert.strictEqual(new Set(ids).size, 5);
    const topics = new Set(ids.map((id) => byId(id).topic));
    assert.deepStrictEqual([...topics].sort(), [...SUBTESTS].sort());
  }
});

test('wibDay rolls over at 17:00 UTC', () => {
  assert.strictEqual(wibDay(new Date('2026-10-21T16:59:00Z')), '2026-10-21');
  assert.strictEqual(wibDay(new Date('2026-10-21T17:00:00Z')), '2026-10-22');
});

test('legacy ids still score, and CPNS scoring is unchanged', () => {
  const legacy = score('utbk', { 'utbk-1': 'C', 'utbk-2': 'B', 'utbk-3': 'C' }, LEGACY_IDS.utbk);
  assert.strictEqual(legacy.score, 1000);
  assert.deepStrictEqual(legacy.subtests, []);
  const cpns = score('cpns', { 'cpns-1': 'B', 'cpns-2': 'C', 'cpns-3': 'B' });
  assert.strictEqual(cpns.score, 15);
  assert.strictEqual(cpns.passed, true);
  const partial = score('cpns', { 'cpns-1': 'B', 'cpns-2': 'A', 'cpns-3': 'D' });
  assert.strictEqual(partial.score, 9);
  assert.deepStrictEqual(partial.subtests, []);
});

test('daily is right answers out of five', () => {
  const ids = dailyIds('2026-10-21');
  const a = {};
  ids.slice(0, 4).forEach((id) => { a[id] = byId(id).answer; });
  const s = score('daily', a, ids);
  assert.strictEqual(s.score, 4);
  assert.strictEqual(s.maxScore, 5);
  assert.strictEqual(s.correct, 4);
  assert.strictEqual(s.empty, 1);
});
