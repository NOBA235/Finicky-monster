import {
  SNACK_UNIVERSE,
  getSnackById,
  type SnackId,
} from './snacks.ts';
import {
  areRulesEquivalent,
  computeRuleMask,
  evaluateRule,
  ruleToNaturalLanguage,
  validateRuleNode,
  type RuleNode,
} from './rules.ts';
import {
  analyzeEvidenceTrail,
  type EvidenceStepInsight,
  type FairnessReport,
} from './fairness.ts';
import { pickReactionLine, type MonsterAppearance } from './monsters.ts';

export type ChallengeKind = 'daily' | 'community';

export type ChallengeDefinition = {
  readonly id: string;
  readonly kind: ChallengeKind;
  readonly dayKey?: string;
  readonly dayNumber?: number;
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly creatorUsername?: string;
  readonly appearance: MonsterAppearance;
  readonly rule: RuleNode;
  readonly fairness: FairnessReport;
};

export type ExperimentRecord = {
  readonly snackId: SnackId;
  readonly accepted: boolean;
  readonly reactionLine: string;
  readonly stepNumber: number;
};

export type ExamOutcomeItem = {
  readonly snackId: SnackId;
  readonly predicted: boolean;
  readonly actual: boolean;
  readonly correct: boolean;
};

export type SessionPhase = 'experiment' | 'hypothesis' | 'exam' | 'revealed';

export type GameSessionState = {
  readonly challengeId: string;
  readonly phase: SessionPhase;
  readonly experiments: readonly ExperimentRecord[];
  readonly hypothesisRule?: RuleNode;
  readonly hypothesisText?: string;
  readonly hypothesisConsistentWithEvidence?: boolean;
  readonly examResults?: readonly ExamOutcomeItem[];
  readonly examCorrectCount?: number;
  readonly solved?: boolean;
  readonly exactDeduction?: boolean;
  readonly completedAt?: number;
};

export type RevealPayload = {
  readonly trueRule: RuleNode;
  readonly trueRuleText: string;
  readonly canonicalRuleText: string;
  readonly solved: boolean;
  readonly exactDeduction: boolean;
  readonly examCorrectCount: number;
  readonly examTotal: number;
  readonly examResults: readonly ExamOutcomeItem[];
  readonly evidenceInsights: readonly EvidenceStepInsight[];
  readonly totalGrammarHypotheses: number;
  readonly shareText: string;
};

export function createInitialSession(challengeId: string): GameSessionState {
  return {
    challengeId,
    phase: 'experiment',
    experiments: [],
  };
}

export type ExperimentActionResult =
  | {
      readonly ok: true;
      readonly session: GameSessionState;
      readonly record: ExperimentRecord;
      readonly remainingExperiments: number;
    }
  | { readonly ok: false; readonly error: string };

export function applyExperiment(
  challenge: ChallengeDefinition,
  session: GameSessionState,
  snackId: SnackId
): ExperimentActionResult {
  if (session.phase === 'revealed') {
    return { ok: false, error: 'This investigation is already finished.' };
  }
  if (session.phase === 'exam') {
    return { ok: false, error: 'Experiments are closed once the Final Examination begins.' };
  }

  const budget = challenge.fairness.metrics.experimentBudget;
  if (session.experiments.length >= budget) {
    return { ok: false, error: 'No experiments remaining. Submit your hypothesis next!' };
  }

  if (!challenge.fairness.benchSnackIds.includes(snackId)) {
    return { ok: false, error: 'That snack is sealed for the Final Examination!' };
  }

  if (session.experiments.some((item) => item.snackId === snackId)) {
    return { ok: false, error: 'You already tested that snack.' };
  }

  const snack = getSnackById(snackId);
  if (!snack) {
    return { ok: false, error: 'Unknown snack.' };
  }

  const accepted = evaluateRule(challenge.rule, snack);
  const stepNumber = session.experiments.length + 1;
  const reactionLine = pickReactionLine(accepted, snack.index + stepNumber * 7);

  const record: ExperimentRecord = {
    snackId,
    accepted,
    reactionLine,
    stepNumber,
  };

  const experiments = [...session.experiments, record];
  const remainingExperiments = Math.max(0, budget - experiments.length);
  const nextPhase: SessionPhase = remainingExperiments === 0 ? 'hypothesis' : 'experiment';

  return {
    ok: true,
    session: {
      ...session,
      phase: nextPhase,
      experiments,
    },
    record,
    remainingExperiments,
  };
}

export type HypothesisActionResult =
  | {
      readonly ok: true;
      readonly session: GameSessionState;
      readonly consistentWithEvidence: boolean;
      readonly contradictions: readonly SnackId[];
    }
  | { readonly ok: false; readonly error: string };

export function applyHypothesis(
  challenge: ChallengeDefinition,
  session: GameSessionState,
  rawHypothesis: unknown
): HypothesisActionResult {
  if (session.challengeId !== challenge.id) {
    return { ok: false, error: 'Session does not match this monster challenge.' };
  }
  if (session.phase === 'revealed') {
    return { ok: false, error: 'This investigation is already complete.' };
  }
  if (session.experiments.length === 0) {
    return { ok: false, error: 'Conduct at least 1 snack experiment before submitting a hypothesis.' };
  }

  const parsed = validateRuleNode(rawHypothesis);
  if (!parsed.valid) {
    return { ok: false, error: parsed.error };
  }

  const contradictions: SnackId[] = [];
  for (const exp of session.experiments) {
    const snack = getSnackById(exp.snackId);
    if (!snack) continue;
    const predicted = evaluateRule(parsed.rule, snack);
    if (predicted !== exp.accepted) {
      contradictions.push(exp.snackId);
    }
  }

  const consistentWithEvidence = contradictions.length === 0;
  const hypothesisText = ruleToNaturalLanguage(parsed.rule);

  return {
    ok: true,
    session: {
      ...session,
      phase: 'exam',
      hypothesisRule: parsed.rule,
      hypothesisText,
      hypothesisConsistentWithEvidence: consistentWithEvidence,
    },
    consistentWithEvidence,
    contradictions,
  };
}

export type ExamSubmissionResult =
  | {
      readonly ok: true;
      readonly session: GameSessionState;
      readonly reveal: RevealPayload;
      readonly confusedSnackIds: readonly SnackId[];
    }
  | { readonly ok: false; readonly error: string };

export function buildSpoilerFreeShareText(
  challenge: ChallengeDefinition,
  experiments: readonly ExperimentRecord[],
  examResults: readonly ExamOutcomeItem[],
  solved: boolean,
  exactDeduction: boolean
): string {
  const header =
    challenge.kind === 'daily' && challenge.dayNumber !== undefined
      ? `FINICKY Daily #${challenge.dayNumber} — ${challenge.name}`
      : `FINICKY Challenge — ${challenge.name}`;

  const expRow = experiments.map((e) => (e.accepted ? '🟢' : '🔴')).join('');
  const examRow = examResults.map((r) => (r.correct ? '✅' : '❌')).join('');
  const verdictLine = solved
    ? exactDeduction
      ? `Solved with Exact Rule Deduction in ${experiments.length}/${challenge.fairness.metrics.experimentBudget} tests!`
      : `Solved the Unseen Exam in ${experiments.length}/${challenge.fairness.metrics.experimentBudget} tests!`
    : `Stumped! Exam ${examResults.filter((r) => r.correct).length}/${examResults.length} after ${experiments.length} tests.`;

  return [
    header,
    `Tests: ${expRow || '—'}`,
    `Exam:  ${examRow}`,
    verdictLine,
    'Can you figure out what it likes?',
  ].join('\n');
}

export function applyExamSubmission(
  challenge: ChallengeDefinition,
  session: GameSessionState,
  predictions: Readonly<Record<string, boolean>>,
  nowMs: number = Date.now()
): ExamSubmissionResult {
  if (session.phase === 'revealed') {
    return { ok: false, error: 'You already completed the Final Examination for this monster.' };
  }
  if (session.experiments.length === 0) {
    return { ok: false, error: 'Perform at least one experiment before taking the Final Examination.' };
  }

  const examIds = challenge.fairness.examSnackIds;
  const examResults: ExamOutcomeItem[] = [];
  const confusedSnackIds: SnackId[] = [];

  for (const snackId of examIds) {
    const predicted = predictions[snackId];
    if (typeof predicted !== 'boolean') {
      return { ok: false, error: 'Please predict Accept or Reject for all 6 unseen snacks.' };
    }
    const snack = getSnackById(snackId);
    if (!snack) {
      return { ok: false, error: 'Exam contains an invalid snack.' };
    }
    const actual = evaluateRule(challenge.rule, snack);
    const correct = predicted === actual;
    if (!correct) {
      confusedSnackIds.push(snackId);
    }
    examResults.push({
      snackId,
      predicted,
      actual,
      correct,
    });
  }

  const examCorrectCount = examResults.filter((item) => item.correct).length;
  const solved = examCorrectCount === examResults.length;
  const exactDeduction =
    session.hypothesisRule !== undefined &&
    areRulesEquivalent(session.hypothesisRule, challenge.rule);

  const nextSession: GameSessionState = {
    ...session,
    phase: 'revealed',
    examResults,
    examCorrectCount,
    solved,
    exactDeduction,
    completedAt: nowMs,
  };

  const reveal = buildRevealPayload(challenge, nextSession);

  return {
    ok: true,
    session: nextSession,
    reveal,
    confusedSnackIds,
  };
}

export function buildRevealPayload(
  challenge: ChallengeDefinition,
  session: GameSessionState
): RevealPayload {
  const examResults = session.examResults ?? [];
  const examCorrectCount = session.examCorrectCount ?? examResults.filter((r) => r.correct).length;
  const solved = session.solved ?? false;
  const exactDeduction = session.exactDeduction ?? false;
  const evidenceInsights = analyzeEvidenceTrail(session.experiments);

  return {
    trueRule: challenge.rule,
    trueRuleText: ruleToNaturalLanguage(challenge.rule),
    canonicalRuleText: challenge.fairness.metrics.canonicalRuleText,
    solved,
    exactDeduction,
    examCorrectCount,
    examTotal: challenge.fairness.examSnackIds.length,
    examResults,
    evidenceInsights,
    totalGrammarHypotheses: challenge.fairness.metrics.totalGrammarHypothesesChecked,
    shareText: buildSpoilerFreeShareText(
      challenge,
      session.experiments,
      examResults,
      solved,
      exactDeduction
    ),
  };
}

export function checkHypothesisAgainstUniverse(rule: RuleNode): {
  readonly mask: number;
  readonly acceptedIds: readonly SnackId[];
  readonly rejectedIds: readonly SnackId[];
} {
  const mask = computeRuleMask(rule);
  const acceptedIds: SnackId[] = [];
  const rejectedIds: SnackId[] = [];
  for (const snack of SNACK_UNIVERSE) {
    if ((mask & snack.bit) !== 0) acceptedIds.push(snack.id);
    else rejectedIds.push(snack.id);
  }
  return { mask, acceptedIds, rejectedIds };
}
