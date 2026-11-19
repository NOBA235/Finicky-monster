import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_UNIVERSE_MASK,
  SNACK_UNIVERSE,
  countBits,
  getSnackById,
  snacksFromMask,
} from '../shared/engine/snacks.ts';
import {
  areRulesEquivalent,
  atomColor,
  atomPattern,
  atomShape,
  compileVisualRuleDraft,
  computeRuleMask,
  evaluateRule,
  getAcceptedSnacks,
  ruleAnd,
  ruleNot,
  ruleOr,
  ruleToNaturalLanguage,
  validateRuleNode,
} from '../shared/engine/rules.ts';
import {
  analyzeEvidenceTrail,
  certifyChallenge,
  getHypothesisSpace,
} from '../shared/engine/fairness.ts';
import {
  CURATED_DAILY_MONSTERS,
  getDailyChallengeForDayKey,
  getDayNumberForDayKey,
  getRecentDailyArchiveKeys,
} from '../shared/engine/dailyCatalog.ts';
import {
  computeCollectionMilestones,
  evaluateCreatorRecognition,
} from '../shared/engine/recognition.ts';
import {
  applyExamSubmission,
  applyExperiment,
  applyHypothesis,
  createInitialSession,
  type ChallengeDefinition,
} from '../shared/engine/session.ts';

void describe('Snack Universe', () => {
  void it('enumerates all 27 deterministic snacks with unique IDs and bits', () => {
    assert.equal(SNACK_UNIVERSE.length, 27);
    const ids = new Set(SNACK_UNIVERSE.map((s) => s.id));
    assert.equal(ids.size, 27);

    let combinedMask = 0;
    for (const snack of SNACK_UNIVERSE) {
      assert.equal(getSnackById(snack.id)?.index, snack.index);
      assert.equal(combinedMask & snack.bit, 0);
      combinedMask |= snack.bit;
    }
    assert.equal(combinedMask, FULL_UNIVERSE_MASK);
    assert.equal(countBits(FULL_UNIVERSE_MASK), 27);
    assert.equal(snacksFromMask(FULL_UNIVERSE_MASK).length, 27);
  });
});

void describe('Formal Rule Engine', () => {
  void it('evaluates attribute, NOT, AND, OR, and nested conditions accurately', () => {
    const redStripedCircle = getSnackById('red-striped-circle');
    const bluePlainCircle = getSnackById('blue-plain-circle');
    const yellowSpottedSquare = getSnackById('yellow-spotted-square');
    const redPlainTriangle = getSnackById('red-plain-triangle');
    if (!redStripedCircle || !bluePlainCircle || !yellowSpottedSquare || !redPlainTriangle) {
      throw new Error('Expected core snacks to exist');
    }

    const circlesNotStriped = ruleAnd(atomShape('circle'), ruleNot(atomPattern('striped')));
    assert.equal(evaluateRule(circlesNotStriped, redStripedCircle), false);
    assert.equal(evaluateRule(circlesNotStriped, bluePlainCircle), true);
    assert.equal(evaluateRule(circlesNotStriped, yellowSpottedSquare), false);
    assert.equal(getAcceptedSnacks(circlesNotStriped).length, 6);

    const trianglesOrSpottedSquares = ruleOr(
      atomShape('triangle'),
      ruleAnd(atomPattern('spotted'), atomShape('square'))
    );
    assert.equal(evaluateRule(trianglesOrSpottedSquares, redPlainTriangle), true);
    assert.equal(evaluateRule(trianglesOrSpottedSquares, yellowSpottedSquare), true);
    assert.equal(evaluateRule(trianglesOrSpottedSquares, bluePlainCircle), false);
    assert.equal(getAcceptedSnacks(trianglesOrSpottedSquares).length, 12);
  });

  void it('detects semantic equivalence across the full 27-snack universe', () => {
    const redOrBlue = ruleOr(atomColor('red'), atomColor('blue'));
    const notYellow = ruleNot(atomColor('yellow'));
    assert.equal(areRulesEquivalent(redOrBlue, notYellow), true);
    assert.equal(computeRuleMask(redOrBlue), computeRuleMask(notYellow));
  });

  void it('rejects malformed, invalid-attribute, empty, and overly deep ASTs', () => {
    assert.equal(validateRuleNode(null).valid, false);
    assert.equal(validateRuleNode({ kind: 'eval', code: 'true' }).valid, false);
    assert.equal(validateRuleNode({ kind: 'attr', attr: 'color', value: 'purple' }).valid, false);
    assert.equal(validateRuleNode({ kind: 'and', children: [] }).valid, false);

    // Nesting depth > 4
    const deep = ruleNot(ruleNot(ruleNot(ruleNot(atomColor('red')))));
    assert.equal(validateRuleNode(deep).valid, false);
  });

  void it('compiles visual rule drafts into valid ASTs and clean natural language', () => {
    const compiled = compileVisualRuleDraft({
      clauses: [
        {
          shape: { mode: 'is', value: 'triangle' },
          color: { mode: 'any' },
          pattern: { mode: 'any' },
        },
        {
          shape: { mode: 'is', value: 'square' },
          color: { mode: 'any' },
          pattern: { mode: 'is', value: 'spotted' },
        },
      ],
    });
    if (!compiled) throw new Error('Expected compiled rule');
    assert.equal(ruleToNaturalLanguage(compiled), 'Eats triangles, or spotted squares');
  });
});

void describe('Fairness Certificate Engine', () => {
  void it('builds a rich deduplicated hypothesis space with > 1,000 unique rules', () => {
    const space = getHypothesisSpace();
    assert.ok(space.length > 1000, `Expected > 1000 unique rules, got ${space.length}`);
    const uniqueMasks = new Set(space.map((h) => h.mask));
    assert.equal(uniqueMasks.size, space.length);
  });

  void it('certifies clever unambiguous rules deterministically as fair_verified', () => {
    const rule = ruleAnd(atomShape('circle'), ruleNot(atomPattern('striped')));
    const first = certifyChallenge({ rule, mode: 'community' });
    const second = certifyChallenge({ rule, mode: 'community' });

    assert.deepEqual(first, second);
    assert.equal(first.verdict, 'fair_verified');
    assert.ok(first.score >= 70, `Expected strong fairness score, got ${first.score}`);
    assert.equal(first.examSnackIds.length, 6);
    assert.equal(first.benchSnackIds.length, 21);
    assert.equal(first.metrics.examSameTierDiscriminationPct, 100);
    if (first.metrics.minOptimalExperiments === null) {
      throw new Error('Expected optimal experiment count');
    }
    assert.ok(first.metrics.minOptimalExperiments <= first.metrics.experimentBudget);
  });

  void it('rejects contradictory, tautological, and 1-snack needle rules as invalid', () => {
    const contradiction = ruleAnd(atomColor('red'), atomColor('blue'));
    assert.equal(certifyChallenge({ rule: contradiction }).verdict, 'invalid');

    const tautology = ruleOr(atomColor('red'), ruleNot(atomColor('red')));
    assert.equal(certifyChallenge({ rule: tautology }).verdict, 'invalid');

    const singleSnack = ruleAnd(atomColor('red'), atomPattern('striped'), atomShape('circle'));
    assert.equal(certifyChallenge({ rule: singleSnack }).verdict, 'invalid');
  });

  void it('flags single positive attribute rules as too_easy in community mode', () => {
    const trivial = atomShape('circle');
    const report = certifyChallenge({ rule: trivial, mode: 'community' });
    assert.equal(report.verdict, 'too_easy');
  });

  void it('detects ambiguous or one-sided custom final examinations', () => {
    const rule = ruleAnd(atomShape('circle'), ruleNot(atomPattern('striped')));
    const badExam = [
      'red-striped-square',
      'blue-striped-square',
      'yellow-striped-square',
      'red-spotted-square',
      'blue-spotted-square',
      'yellow-plain-square',
    ] as const;
    const report = certifyChallenge({ rule, customExamSnackIds: badExam });
    assert.equal(report.verdict, 'ambiguous');

    const nonDistinguishingExam = [
      'red-plain-circle',
      'blue-spotted-circle',
      'yellow-plain-circle',
      'red-plain-square',
      'blue-striped-square',
      'yellow-spotted-triangle',
    ] as const;
    const report2 = certifyChallenge({ rule, customExamSnackIds: nonDistinguishingExam });
    assert.equal(report2.verdict, 'ambiguous');
    assert.ok(report2.metrics.survivingExamCompetitors.length > 0);
  });

  void it('flags challenges whose budget is too tight as too_difficult', () => {
    const rule = ruleOr(
      ruleAnd(atomColor('red'), atomPattern('striped')),
      ruleAnd(atomColor('yellow'), atomShape('square'))
    );
    const report = certifyChallenge({ rule, experimentBudget: 2, mode: 'community' });
    assert.equal(report.verdict, 'too_difficult');
  });

  void it('detects redundant forms equivalent to a simpler canonical rule', () => {
    const redundant = ruleOr(atomColor('red'), atomColor('blue'));
    const report = certifyChallenge({ rule: redundant, mode: 'community' });
    assert.equal(report.metrics.isRedundantForm, true);
    assert.equal(report.metrics.canonicalRuleText, 'Refuses all yellow snacks');
  });

  void it('computes monotonic hypothesis elimination across an evidence trail', () => {
    const trail = analyzeEvidenceTrail([
      { snackId: 'red-striped-circle', accepted: false },
      { snackId: 'red-plain-circle', accepted: true },
      { snackId: 'blue-spotted-circle', accepted: true },
    ]);
    assert.equal(trail.length, 3);
    assert.ok((trail[0]?.eliminatedCount ?? 0) > 0);
    assert.ok((trail[2]?.remainingAfter ?? 9999) < (trail[0]?.remainingBefore ?? 0));
  });
});

void describe('Curated Daily Monster Catalog', () => {
  void it('certifies all 21 curated daily monsters as fair_verified with 100% same-tier exam discrimination', () => {
    assert.equal(CURATED_DAILY_MONSTERS.length, 21);
    for (const monster of CURATED_DAILY_MONSTERS) {
      const report = certifyChallenge({
        rule: monster.rule,
        experimentBudget: monster.experimentBudget,
        mode: 'daily',
      });
      assert.equal(
        report.verdict,
        'fair_verified',
        `Daily monster "${monster.name}" failed fairness check: ${report.summary}`
      );
      assert.equal(
        report.metrics.examSameTierDiscriminationPct,
        100,
        `Daily monster "${monster.name}" had ambiguous exam competitors: ${report.metrics.survivingExamCompetitors.join(', ')}`
      );
    }
  });

  void it('maps UTC dates deterministically to the same daily challenge', () => {
    const dayA = getDailyChallengeForDayKey('2026-11-19');
    const dayB = getDailyChallengeForDayKey('2026-11-19');
    assert.equal(dayA.id, dayB.id);
    assert.equal(dayA.slug, dayB.slug);
    assert.equal(getDayNumberForDayKey('2026-11-01'), 1);
    assert.equal(getDayNumberForDayKey('2026-11-19'), 19);

    const archive = getRecentDailyArchiveKeys('2026-11-05', 14);
    assert.equal(archive.length, 5);
    assert.equal(archive[0], '2026-11-05');
    assert.equal(archive[4], '2026-11-01');
  });
});

void describe('Creator Recognition & Menagerie Milestones', () => {
  void it('rewards fair solvable challenges and never awards gold to impossible puzzles', () => {
    const gold = evaluateCreatorRecognition(90, {
      attempts: 10,
      solves: 6,
      solveRatePct: 60,
      avgExperiments: 5.5,
      exactDeductions: 4,
    });
    assert.equal(gold.tier, 'gold_architect');

    const brutal = evaluateCreatorRecognition(92, {
      attempts: 10,
      solves: 0,
      solveRatePct: 0,
      avgExperiments: 9,
      exactDeductions: 0,
    });
    assert.equal(brutal.tier, 'brutal_stumper');
  });

  void it('computes collection milestones accurately from player profile and menagerie', () => {
    const milestones = computeCollectionMilestones(
      {
        userId: 't2_u1',
        username: 'sleuth',
        streak: 3,
        bestStreak: 3,
        lastDailyKey: '2026-11-19',
        totalSolved: 2,
        dailySolved: 1,
        communitySolved: 1,
        createdCount: 1,
        exactDeductions: 1,
      },
      [
        {
          challengeId: 'daily:2026-11-19',
          kind: 'daily',
          dayNumber: 19,
          name: 'Juniper',
          personality: 'Playful',
          habitatNote: 'Canopy',
          appearance: {
            bodyShape: 'horned',
            bodyColor: 'mint',
            bellyPattern: 'patch',
            eyeStyle: 'three-eyes',
            mouthStyle: 'beak',
            accessory: 'ear-tufts',
          },
          ruleText: 'Eats yellow circles, or red squares',
          discoveredAt: 1000,
          experimentsUsed: 6,
          exactDeduction: true,
          difficulty: 'fiendish',
        },
        {
          challengeId: 'ch_1',
          kind: 'community',
          name: 'Bloop',
          personality: 'Curious',
          habitatNote: 'Shelf',
          creatorUsername: 'maker',
          appearance: {
            bodyShape: 'blob',
            bodyColor: 'sky',
            bellyPattern: 'spots',
            eyeStyle: 'big-round',
            mouthStyle: 'wavy',
            accessory: 'antenna',
          },
          ruleText: 'Eats blue circles',
          discoveredAt: 2000,
          experimentsUsed: 4,
          exactDeduction: false,
          difficulty: 'clever',
        },
      ]
    );

    const unlockedIds = milestones.filter((m) => m.unlocked).map((m) => m.id);
    assert.deepEqual(unlockedIds, [
      'first-friend',
      'sharp-mind',
      'daily-regular',
      'community-sleuth',
      'puzzle-architect',
    ]);
  });
});

void describe('Gameplay Session Engine', () => {
  function makeTestChallenge(): ChallengeDefinition {
    const daily = getDailyChallengeForDayKey('2026-11-04');
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

  void it('runs a complete discovery -> hypothesis -> unseen exam -> reveal flow', () => {
    const challenge = makeTestChallenge();
    let session = createInitialSession(challenge.id);

    const sealedSnack = challenge.fairness.examSnackIds[0];
    if (!sealedSnack) throw new Error('Expected sealed exam snack');
    const illegalExp = applyExperiment(challenge, session, sealedSnack);
    assert.equal(illegalExp.ok, false);

    const firstBench = challenge.fairness.benchSnackIds[0];
    const secondBench = challenge.fairness.benchSnackIds[1];
    if (!firstBench || !secondBench) throw new Error('Expected bench snacks');

    const exp1 = applyExperiment(challenge, session, firstBench);
    if (!exp1.ok) throw new Error(exp1.error);
    session = exp1.session;

    const dupExp = applyExperiment(challenge, session, firstBench);
    assert.equal(dupExp.ok, false);

    const exp2 = applyExperiment(challenge, session, secondBench);
    if (!exp2.ok) throw new Error(exp2.error);
    session = exp2.session;

    const hypRes = applyHypothesis(challenge, session, challenge.rule);
    if (!hypRes.ok) throw new Error(hypRes.error);
    assert.equal(hypRes.consistentWithEvidence, true);
    session = hypRes.session;
    assert.equal(session.phase, 'exam');

    const predictions: Record<string, boolean> = {};
    for (const examId of challenge.fairness.examSnackIds) {
      const snack = getSnackById(examId);
      if (!snack) throw new Error('Expected exam snack');
      predictions[examId] = evaluateRule(challenge.rule, snack);
    }

    const examRes = applyExamSubmission(challenge, session, predictions, 1700000000000);
    if (!examRes.ok) throw new Error(examRes.error);
    assert.equal(examRes.reveal.solved, true);
    assert.equal(examRes.reveal.exactDeduction, true);
    assert.equal(examRes.reveal.examCorrectCount, 6);
    assert.equal(examRes.confusedSnackIds.length, 0);
    assert.ok(examRes.reveal.shareText.includes('FINICKY'));
    assert.ok(!examRes.reveal.shareText.includes(examRes.reveal.trueRuleText));

    const replay = applyExamSubmission(challenge, examRes.session, predictions);
    assert.equal(replay.ok, false);
  });

  void it('enforces experiment budget limits and handles failed exams honestly', () => {
    const challenge = makeTestChallenge();
    let session = createInitialSession(challenge.id);
    const budget = challenge.fairness.metrics.experimentBudget;

    for (let i = 0; i < budget; i += 1) {
      const snackId = challenge.fairness.benchSnackIds[i];
      if (!snackId) throw new Error('Expected bench snack');
      const res = applyExperiment(challenge, session, snackId);
      if (!res.ok) throw new Error(res.error);
      session = res.session;
    }

    assert.equal(session.phase, 'hypothesis');
    const extraSnack = challenge.fairness.benchSnackIds[budget];
    if (!extraSnack) throw new Error('Expected extra bench snack');
    const overflow = applyExperiment(challenge, session, extraSnack);
    assert.equal(overflow.ok, false);

    const wrongRule = atomColor('yellow');
    const hyp = applyHypothesis(challenge, session, wrongRule);
    if (!hyp.ok) throw new Error(hyp.error);
    session = hyp.session;

    const wrongPredictions: Record<string, boolean> = {};
    for (const examId of challenge.fairness.examSnackIds) {
      const snack = getSnackById(examId);
      if (!snack) throw new Error('Expected exam snack');
      wrongPredictions[examId] = !evaluateRule(challenge.rule, snack);
    }

    const exam = applyExamSubmission(challenge, session, wrongPredictions);
    if (!exam.ok) throw new Error(exam.error);
    assert.equal(exam.reveal.solved, false);
    assert.equal(exam.reveal.examCorrectCount, 0);
    assert.equal(exam.confusedSnackIds.length, 6);
  });
});
