import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemoryStore,
  getChallengeStats,
  getDailyHistory,
  getMenagerie,
  getOrCreateSession,
  getPlayerProfile,
  listCommunityChallenges,
  listCreatorAnalytics,
  recordCompletion,
  resolveChallengeDefinition,
  saveCommunityChallenge,
  saveSession,
  toPublicChallenge,
  type StoredCommunityChallenge,
} from './redisStore.ts';
import { getDailyChallengeForDayKey } from '../../shared/engine/dailyCatalog.ts';
import { certifyChallenge } from '../../shared/engine/fairness.ts';
import { atomColor, atomPattern, atomShape, ruleAnd, ruleNot } from '../../shared/engine/rules.ts';
import {
  applyExamSubmission,
  applyExperiment,
  applyHypothesis,
  createInitialSession,
  type ChallengeDefinition,
} from '../../shared/engine/session.ts';
import { evaluateRule } from '../../shared/engine/rules.ts';
import { getSnackById } from '../../shared/engine/snacks.ts';

function toChallengeDef(dayKey: string): ChallengeDefinition {
  const daily = getDailyChallengeForDayKey(dayKey);
  return {
    id: daily.id,
    kind: 'daily',
    dayKey: daily.dayKey,
    dayNumber: daily.dayNumber,
    name: daily.name,
    personality: daily.personality,
    habitatNote: daily.habitatNote,
    appearance: daily.appearance,
    rule: daily.rule,
    fairness: daily.fairness,
  };
}

function solveChallengeForUser(challenge: ChallengeDefinition) {
  let session = createInitialSession(challenge.id);
  const s1 = challenge.fairness.benchSnackIds[0];
  const s2 = challenge.fairness.benchSnackIds[1];
  if (!s1 || !s2) throw new Error('Missing bench snacks');
  const r1 = applyExperiment(challenge, session, s1);
  if (!r1.ok) throw new Error(r1.error);
  session = r1.session;

  const r2 = applyExperiment(challenge, session, s2);
  if (!r2.ok) throw new Error(r2.error);
  session = r2.session;

  const hyp = applyHypothesis(challenge, session, challenge.rule);
  if (!hyp.ok) throw new Error(hyp.error);
  session = hyp.session;

  const predictions: Record<string, boolean> = {};
  for (const examId of challenge.fairness.examSnackIds) {
    const snack = getSnackById(examId);
    if (!snack) throw new Error('Missing exam snack');
    predictions[examId] = evaluateRule(challenge.rule, snack);
  }
  const exam = applyExamSubmission(challenge, session, predictions, 1700000000000);
  if (!exam.ok) throw new Error(exam.error);
  return exam;
}

void describe('Persistence, Concurrency, Streaks, & Creator Analytics', () => {
  void it('persists mid-investigation session across reloads and preserves returning user progress', async () => {
    const store = createMemoryStore();
    const challenge = toChallengeDef('2026-11-18');
    const initial = await getOrCreateSession(store, 't2_user1', challenge.id);
    const firstSnack = challenge.fairness.benchSnackIds[0];
    if (!firstSnack) throw new Error('Missing snack');

    const exp = applyExperiment(challenge, initial, firstSnack);
    assert.equal(exp.ok, true);
    if (!exp.ok) return;
    await saveSession(store, 't2_user1', exp.session);

    // Reload session from store
    const reloaded = await getOrCreateSession(store, 't2_user1', challenge.id);
    assert.equal(reloaded.experiments.length, 1);
    assert.equal(reloaded.experiments[0]?.snackId, firstSnack);
  });

  void it('tracks consecutive daily streaks, resets after skipped day, and guards duplicate completions', async () => {
    const store = createMemoryStore();
    const day1 = toChallengeDef('2026-11-17');
    const day2 = toChallengeDef('2026-11-18');
    const day4 = toChallengeDef('2026-11-20'); // skipped Nov 19

    const solve1 = solveChallengeForUser(day1);
    const out1 = await recordCompletion(store, {
      userId: 't2_alice',
      username: 'alice',
      challenge: day1,
      session: solve1.session,
      solved: true,
      exactDeduction: true,
      examCorrectCount: 6,
      confusedSnackIds: [],
      nowMs: 1000,
    });
    assert.equal(out1.profile.streak, 1);
    assert.equal(out1.profile.bestStreak, 1);
    assert.equal(out1.newlyAddedToMenagerie, true);

    // Duplicate completion attempt for same day must not double-count stats or streak
    const dup = await recordCompletion(store, {
      userId: 't2_alice',
      username: 'alice',
      challenge: day1,
      session: solve1.session,
      solved: true,
      exactDeduction: true,
      examCorrectCount: 6,
      confusedSnackIds: [],
      nowMs: 2000,
    });
    assert.equal(dup.countedAsFirstAttempt, false);
    assert.equal(dup.newlyAddedToMenagerie, false);
    assert.equal(dup.stats.attempts, 1);
    assert.equal(dup.profile.totalSolved, 1);

    // Consecutive day 2 -> streak becomes 2
    const solve2 = solveChallengeForUser(day2);
    const out2 = await recordCompletion(store, {
      userId: 't2_alice',
      username: 'alice',
      challenge: day2,
      session: solve2.session,
      solved: true,
      exactDeduction: true,
      examCorrectCount: 6,
      confusedSnackIds: [],
      nowMs: 3000,
    });
    assert.equal(out2.profile.streak, 2);
    assert.equal(out2.profile.bestStreak, 2);
    assert.equal(out2.menagerie.length, 2);

    // Skipped day 3 -> day 4 resets current streak to 1 while preserving bestStreak = 2
    const solve4 = solveChallengeForUser(day4);
    const out4 = await recordCompletion(store, {
      userId: 't2_alice',
      username: 'alice',
      challenge: day4,
      session: solve4.session,
      solved: true,
      exactDeduction: true,
      examCorrectCount: 6,
      confusedSnackIds: [],
      nowMs: 4000,
    });
    assert.equal(out4.profile.streak, 1);
    assert.equal(out4.profile.bestStreak, 2);
    assert.equal(out4.menagerie.length, 3);

    const history = await getDailyHistory(store, 't2_alice');
    assert.equal(history.length, 3);
  });

  void it('publishes community monsters, never leaks secret rules publicly, and aggregates concurrent player analytics', async () => {
    const store = createMemoryStore();
    const rule = ruleAnd(atomShape('square'), ruleNot(atomColor('red')));
    const fairness = certifyChallenge({ rule, mode: 'community' });
    assert.equal(fairness.verdict, 'fair_verified');

    const stored: StoredCommunityChallenge = {
      id: 'ch_test_1',
      kind: 'community',
      name: 'Bloop',
      personality: 'Collects crisp cool squares.',
      habitatNote: 'Lives behind the bookshelf.',
      creatorUserId: 't2_creator',
      creatorUsername: 'creator_one',
      createdAt: 1700000000000,
      appearance: {
        bodyShape: 'blob',
        bodyColor: 'sky',
        bellyPattern: 'spots',
        eyeStyle: 'big-round',
        mouthStyle: 'wavy',
        accessory: 'antenna',
      },
      rule,
      fairness,
    };

    await saveCommunityChallenge(store, stored);

    // Verify public listing strips secret rule
    const listing = await listCommunityChallenges(store, 10);
    assert.equal(listing.length, 1);
    const listed = listing[0];
    assert.ok(listed);
    assert.equal('rule' in listed, false);

    const resolved = await resolveChallengeDefinition(store, stored.id);
    if (!resolved) throw new Error('Expected community challenge to resolve');
    const pub = toPublicChallenge(resolved.def, await getChallengeStats(store, stored.id));
    assert.equal('rule' in pub, false);

    // Concurrent attempts from 3 different Redditors (2 solves, 1 fail with confused snacks & wrong hypothesis)
    const solveA = solveChallengeForUser(resolved.def);
    const solveB = solveChallengeForUser(resolved.def);

    // Player C submits wrong hypothesis + misses 2 exam snacks
    let sessC = createInitialSession(resolved.def.id);
    const bench0 = resolved.def.fairness.benchSnackIds[0];
    if (!bench0) throw new Error('Missing bench snack');
    const expC = applyExperiment(resolved.def, sessC, bench0);
    if (!expC.ok) throw new Error(expC.error);
    sessC = expC.session;

    const hypC = applyHypothesis(resolved.def, sessC, atomPattern('striped'));
    if (!hypC.ok) throw new Error(hypC.error);
    sessC = hypC.session;

    const wrongPreds: Record<string, boolean> = {};
    const firstExamId = resolved.def.fairness.examSnackIds[0];
    if (!firstExamId) throw new Error('Missing exam snack');
    for (const examId of resolved.def.fairness.examSnackIds) {
      const snack = getSnackById(examId);
      if (!snack) throw new Error('Missing snack');
      const actual = evaluateRule(resolved.def.rule, snack);
      wrongPreds[examId] = examId === firstExamId ? !actual : actual;
    }
    const failC = applyExamSubmission(resolved.def, sessC, wrongPreds, 5000);
    if (!failC.ok) throw new Error(failC.error);

    await Promise.all([
      recordCompletion(store, {
        userId: 't2_p1',
        username: 'p1',
        challenge: resolved.def,
        session: solveA.session,
        solved: true,
        exactDeduction: true,
        examCorrectCount: 6,
        confusedSnackIds: [],
        nowMs: 5001,
      }),
      recordCompletion(store, {
        userId: 't2_p2',
        username: 'p2',
        challenge: resolved.def,
        session: solveB.session,
        solved: true,
        exactDeduction: true,
        examCorrectCount: 6,
        confusedSnackIds: [],
        nowMs: 5002,
      }),
      recordCompletion(store, {
        userId: 't2_p3',
        username: 'p3',
        challenge: resolved.def,
        session: failC.session,
        solved: false,
        exactDeduction: false,
        examCorrectCount: 5,
        confusedSnackIds: failC.confusedSnackIds,
        nowMs: 5003,
      }),
    ]);

    const analytics = await listCreatorAnalytics(store, 't2_creator');
    assert.equal(analytics.length, 1);
    const a = analytics[0];
    if (!a) throw new Error('Missing creator analytics');
    assert.equal(a.attempts, 3);
    assert.equal(a.solves, 2);
    assert.equal(a.solveRatePct, 67);
    assert.equal(a.confusingSnacks[0]?.snackId, firstExamId);
    assert.equal(a.confusingSnacks[0]?.misses, 1);
    assert.equal(a.commonWrongHypotheses[0]?.hypothesis, 'Eats striped snacks');

    const creatorProfile = await getPlayerProfile(store, 't2_creator', 'creator_one');
    assert.equal(creatorProfile.createdCount, 1);

    const p1Menagerie = await getMenagerie(store, 't2_p1');
    assert.equal(p1Menagerie.length, 1);
    assert.equal(p1Menagerie[0]?.name, 'Bloop');
    assert.ok(p1Menagerie[0]?.favoriteSnackId, 'Expected favoriteSnackId saved on resident');
    const favSnack = p1Menagerie[0]?.favoriteSnackId
      ? getSnackById(p1Menagerie[0].favoriteSnackId)
      : undefined;
    if (!favSnack) throw new Error('Expected valid favorite snack');
    assert.equal(evaluateRule(rule, favSnack), true);

    // Featured sort returns highest fairness score first
    const featured = await listCommunityChallenges(store, 10, 'featured');
    assert.equal(featured.length, 1);
    assert.equal(featured[0]?.id, stored.id);
  });
});
