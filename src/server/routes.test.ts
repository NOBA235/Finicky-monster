import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

import type {
  CommunityChallengesResponse,
  CreateChallengeResponse,
  DailyArchiveResponse,
  ExamSubmitResponse,
  ExperimentResponse,
  GameInitResponse,
  HypothesisResponse,
  ValidateRuleResponse,
} from '../shared/api.ts';
import { getDailyChallengeForDayKey } from '../shared/engine/dailyCatalog.ts';
import {
  atomColor,
  atomPattern,
  atomShape,
  evaluateRule,
  ruleAnd,
  ruleNot,
} from '../shared/engine/rules.ts';
import { getSnackById } from '../shared/engine/snacks.ts';
import { createChallengeRoutes } from './routes/challenges.ts';
import { createGameRoutes } from './routes/game.ts';
import { createMemoryStore } from './storage/redisStore.ts';

function createTestServer() {
  const store = createMemoryStore();
  let currentActor = { userId: 't2_detective', username: 'detective_one' };
  const fixedDate = new Date('2026-11-19T12:00:00Z');
  const submittedComments: string[] = [];

  const app = new Hono();
  app.route(
    '/api',
    createGameRoutes({
      store,
      getActor: async () => currentActor,
      getPostContext: () => ({
        postId: 't3_testpost',
        subredditName: 'fickeymonster_test',
        postData: undefined,
      }),
      now: () => fixedDate,
      submitComment: async (opts) => {
        submittedComments.push(opts.text);
        return { url: 'https://reddit.com/r/fickeymonster_test/comments/t3_testpost/c1' };
      },
    })
  );
  app.route(
    '/api/challenges',
    createChallengeRoutes({
      store,
      getActor: async () => currentActor,
      getSubredditName: () => 'fickeymonster_test',
      nowMs: () => fixedDate.getTime(),
      createPost: async () => {
        throw new Error('Reddit post creation disabled in unit test');
      },
    })
  );

  return {
    app,
    setActor(userId: string, username: string) {
      currentActor = { userId, username };
    },
    submittedComments,
  };
}

void describe('Hono API Integration & Server Authority', () => {
  void it('runs a complete HTTP discovery -> hypothesis -> exam -> menagerie -> spoiler-free comment flow without leaking rules', async () => {
    const { app, submittedComments } = createTestServer();

    // 1. Init daily game — secret rule MUST NOT be present
    const initRes = await app.request('/api/init');
    assert.equal(initRes.status, 200);
    const initJson: GameInitResponse = await initRes.json();
    assert.equal(initJson.todayDayKey, '2026-11-19');
    assert.equal('rule' in initJson.activeChallenge, false);
    assert.equal(initJson.reveal, null);

    // 2. Archive returns recent daily monsters
    const archRes = await app.request('/api/daily-archive');
    assert.equal(archRes.status, 200);
    const archJson: DailyArchiveResponse = await archRes.json();
    assert.ok(archJson.items.length >= 10);
    assert.equal(archJson.items[0]?.isToday, true);

    // 3. Reject invalid snackId & sealed exam snack
    const badSnack = await app.request('/api/session/experiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id, snackId: 'not-a-snack' }),
    });
    assert.equal(badSnack.status, 400);

    const sealedExamSnack = initJson.activeChallenge.examSnackIds[0];
    if (!sealedExamSnack) throw new Error('Expected exam snack');
    const cheatExp = await app.request('/api/session/experiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: initJson.activeChallenge.id,
        snackId: sealedExamSnack,
      }),
    });
    assert.equal(cheatExp.status, 400);

    // 4. Perform valid bench experiment
    const bench0 = initJson.activeChallenge.benchSnackIds[0];
    if (!bench0) throw new Error('Expected bench snack');
    const expRes = await app.request('/api/session/experiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id, snackId: bench0 }),
    });
    assert.equal(expRes.status, 200);
    const expJson: ExperimentResponse = await expRes.json();
    assert.equal(expJson.session.experiments.length, 1);

    // 5. Submit exact hypothesis (server validates against true rule without exposing it yet)
    const dailyDef = getDailyChallengeForDayKey('2026-11-19');
    const hypRes = await app.request('/api/session/hypothesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: initJson.activeChallenge.id,
        hypothesisRule: dailyDef.rule,
      }),
    });
    assert.equal(hypRes.status, 200);
    const hypJson: HypothesisResponse = await hypRes.json();
    assert.equal(hypJson.consistentWithEvidence, true);
    assert.equal(hypJson.session.phase, 'exam');

    // 6. Cannot share spoiler-free comment before finishing exam
    const earlyComment = await app.request('/api/share-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id }),
    });
    assert.equal(earlyComment.status, 400);

    // 7. Submit perfect unseen exam
    const predictions: Record<string, boolean> = {};
    for (const examId of initJson.activeChallenge.examSnackIds) {
      const snack = getSnackById(examId);
      if (!snack) throw new Error('Missing snack');
      predictions[examId] = evaluateRule(dailyDef.rule, snack);
    }
    const examRes = await app.request('/api/session/exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id, predictions }),
    });
    assert.equal(examRes.status, 200);
    const examJson: ExamSubmitResponse = await examRes.json();
    assert.equal(examJson.reveal.solved, true);
    assert.equal(examJson.reveal.exactDeduction, true);
    assert.equal(examJson.newlyAddedToMenagerie, true);
    assert.equal(examJson.profile.streak, 1);
    assert.equal(examJson.menagerie.length, 1);

    // 8. Duplicate exam submission rejected
    const replayRes = await app.request('/api/session/exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id, predictions }),
    });
    assert.equal(replayRes.status, 400);

    // 9. Share spoiler-free comment succeeds and never includes the secret rule text
    const shareRes = await app.request('/api/share-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: initJson.activeChallenge.id, asUser: true }),
    });
    assert.equal(shareRes.status, 200);
    assert.equal(submittedComments.length, 1);
    assert.ok(!submittedComments[0]?.includes(examJson.reveal.trueRuleText));
  });

  void it('enforces Fairness Certificate on server-side challenge creation and lists verified community puzzles', async () => {
    const { app, setActor } = createTestServer();

    const appearance = {
      bodyShape: 'blob',
      bodyColor: 'coral',
      bellyPattern: 'spots',
      eyeStyle: 'big-round',
      mouthStyle: 'wavy',
      accessory: 'bow',
    };

    // Reject trivial single-trait rule (too_easy)
    const easyRes = await app.request('/api/challenges/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TooSimple',
        personality: 'Loves circles only and nothing else.',
        appearance,
        rule: atomShape('circle'),
      }),
    });
    assert.equal(easyRes.status, 400);

    // Reject contradictory rule (invalid)
    const invalidRes = await app.request('/api/challenges/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Impossible',
        personality: 'Never eats any snack in existence.',
        appearance,
        rule: ruleAnd(atomColor('red'), atomColor('blue')),
      }),
    });
    assert.equal(invalidRes.status, 400);

    // Validate endpoint returns deterministic FairnessReport
    const validRule = ruleAnd(atomShape('circle'), ruleNot(atomPattern('striped')));
    const valRes = await app.request('/api/challenges/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: validRule }),
    });
    assert.equal(valRes.status, 200);
    const valJson: ValidateRuleResponse = await valRes.json();
    assert.equal(valJson.report.verdict, 'fair_verified');

    // Create verified community challenge
    const createRes = await app.request('/api/challenges/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Marmalade',
        personality: 'Sniffs biscuits carefully and hides from stripes.',
        appearance,
        rule: validRule,
        publishAsPost: false,
      }),
    });
    assert.equal(createRes.status, 201);
    const created: CreateChallengeResponse = await createRes.json();
    assert.equal(created.challenge.name, 'Marmalade');
    assert.equal('rule' in created.challenge, false);

    // Second player lists challenges sorted by featured fairness score
    setActor('t2_player2', 'player_two');
    const listRes = await app.request('/api/challenges?sort=featured');
    assert.equal(listRes.status, 200);
    const listJson: CommunityChallengesResponse = await listRes.json();
    assert.equal(listJson.challenges.length, 1);
    assert.equal(listJson.challenges[0]?.id, created.challenge.id);
    assert.equal('rule' in (listJson.challenges[0] ?? {}), false);
  });
});
