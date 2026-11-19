import {
  COLORS,
  FULL_UNIVERSE_MASK,
  PATTERNS,
  SHAPES,
  SNACK_UNIVERSE,
  countBits,
  getSnackById,
  maskFromSnackIds,
  type Snack,
  type SnackId,
} from './snacks.ts';
import {
  atomColor,
  atomPattern,
  atomShape,
  computeRuleMask,
  countRuleLeaves,
  ruleAnd,
  ruleNot,
  ruleOr,
  ruleToNaturalLanguage,
  validateRuleNode,
  type AttributeKey,
  type RuleNode,
} from './rules.ts';

export type FairnessVerdict =
  | 'fair_verified'
  | 'too_easy'
  | 'too_difficult'
  | 'ambiguous'
  | 'invalid';

export type DifficultyTier = 'gentle' | 'clever' | 'tricky' | 'fiendish';

export type HypothesisEntry = {
  readonly mask: number;
  readonly rule: RuleNode;
  readonly text: string;
  readonly complexity: 1 | 2 | 3 | 4;
  readonly isSinglePositiveAttr: boolean;
  readonly acceptedCount: number;
};

export type FairnessMetrics = {
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly complexityTier: number;
  readonly canonicalRuleText: string;
  readonly isRedundantForm: boolean;
  readonly totalGrammarHypothesesChecked: number;
  readonly minOptimalExperiments: number | null;
  readonly experimentBudget: number;
  readonly examSameTierDiscriminationPct: number;
  readonly examFullGrammarDiscriminationPct: number;
  readonly examAcceptedCount: number;
  readonly examRejectedCount: number;
  readonly survivingExamCompetitors: readonly string[];
  readonly survivingBenchCompetitors: readonly string[];
};

export type FairnessReport = {
  readonly verdict: FairnessVerdict;
  readonly score: number;
  readonly difficulty: DifficultyTier;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly metrics: FairnessMetrics;
  readonly benchSnackIds: readonly SnackId[];
  readonly examSnackIds: readonly SnackId[];
};

export type CertifyChallengeOptions = {
  readonly rule: unknown;
  readonly experimentBudget?: number;
  readonly customExamSnackIds?: readonly SnackId[];
  readonly mode?: 'community' | 'daily';
};

export type EvidenceStepInsight = {
  readonly snackId: SnackId;
  readonly accepted: boolean;
  readonly remainingBefore: number;
  readonly remainingAfter: number;
  readonly eliminatedCount: number;
};

export const EXAM_SIZE = 6;
export const DEFAULT_EXPERIMENT_BUDGET = 7;

type LiteralDef = {
  readonly attr: AttributeKey;
  readonly positive: boolean;
  readonly node: RuleNode;
  readonly mask: number;
};

let cachedHypothesisSpace: readonly HypothesisEntry[] | null = null;
let cachedHypothesisByMask: ReadonlyMap<number, HypothesisEntry> | null = null;

function buildLiterals(): LiteralDef[] {
  const literals: LiteralDef[] = [];
  for (const shape of SHAPES) {
    const pos = atomShape(shape);
    const neg = ruleNot(pos);
    literals.push({ attr: 'shape', positive: true, node: pos, mask: computeRuleMask(pos) });
    literals.push({ attr: 'shape', positive: false, node: neg, mask: computeRuleMask(neg) });
  }
  for (const color of COLORS) {
    const pos = atomColor(color);
    const neg = ruleNot(pos);
    literals.push({ attr: 'color', positive: true, node: pos, mask: computeRuleMask(pos) });
    literals.push({ attr: 'color', positive: false, node: neg, mask: computeRuleMask(neg) });
  }
  for (const pattern of PATTERNS) {
    const pos = atomPattern(pattern);
    const neg = ruleNot(pos);
    literals.push({ attr: 'pattern', positive: true, node: pos, mask: computeRuleMask(pos) });
    literals.push({ attr: 'pattern', positive: false, node: neg, mask: computeRuleMask(neg) });
  }
  return literals;
}

function buildHypothesisSpaceInternal(): {
  list: readonly HypothesisEntry[];
  byMask: ReadonlyMap<number, HypothesisEntry>;
} {
  const literals = buildLiterals();
  const byMask = new Map<number, HypothesisEntry>();

  function register(
    mask: number,
    rule: RuleNode,
    complexity: 1 | 2 | 3 | 4,
    isSinglePositiveAttr: boolean
  ): void {
    const normalized = mask & FULL_UNIVERSE_MASK;
    if (normalized === 0 || normalized === FULL_UNIVERSE_MASK) {
      return;
    }
    const existing = byMask.get(normalized);
    if (existing) {
      if (existing.complexity < complexity) {
        return;
      }
      if (existing.complexity === complexity) {
        const candidateText = ruleToNaturalLanguage(rule);
        if (existing.text.length <= candidateText.length) {
          return;
        }
      }
    }
    byMask.set(normalized, {
      mask: normalized,
      rule,
      text: ruleToNaturalLanguage(rule),
      complexity,
      isSinglePositiveAttr,
      acceptedCount: countBits(normalized),
    });
  }

  // Tier 1: Single attribute literals (positive and negative)
  for (const lit of literals) {
    register(lit.mask, lit.node, 1, lit.positive);
  }

  // Tier 2: 2-literal conjunctions and 2-literal disjunctions on distinct attributes
  const twoLiteralConjunctions: { mask: number; node: RuleNode; allPositive: boolean }[] = [];
  for (let i = 0; i < literals.length; i += 1) {
    const a = literals[i];
    if (!a) continue;
    for (let j = i + 1; j < literals.length; j += 1) {
      const b = literals[j];
      if (!b || a.attr === b.attr) continue;
      const andMask = a.mask & b.mask;
      const andNode = ruleAnd(a.node, b.node);
      register(andMask, andNode, 2, false);
      twoLiteralConjunctions.push({
        mask: andMask,
        node: andNode,
        allPositive: a.positive && b.positive,
      });

      const orMask = a.mask | b.mask;
      const orNode = ruleOr(a.node, b.node);
      register(orMask, orNode, 2, false);
    }
  }

  // Tier 3a: 3-literal conjunctions (one literal from each attribute)
  const shapeLits = literals.filter((l) => l.attr === 'shape');
  const colorLits = literals.filter((l) => l.attr === 'color');
  const patternLits = literals.filter((l) => l.attr === 'pattern');
  for (const s of shapeLits) {
    for (const c of colorLits) {
      for (const p of patternLits) {
        const mask = s.mask & c.mask & p.mask;
        register(mask, ruleAnd(c.node, p.node, s.node), 3, false);
      }
    }
  }

  // Tier 3b: Single literal OR 2-literal conjunction (e.g., "triangles OR spotted squares")
  for (const lit of literals) {
    for (const conj of twoLiteralConjunctions) {
      if (!conj.allPositive && !lit.positive) {
        continue;
      }
      const mask = lit.mask | conj.mask;
      register(mask, ruleOr(lit.node, conj.node), 3, false);
    }
  }

  // Tier 4: Disjunction of two positive 2-literal conjunctions (e.g., "red circles OR plain squares")
  const positivePairs = twoLiteralConjunctions.filter((item) => item.allPositive);
  for (let i = 0; i < positivePairs.length; i += 1) {
    const first = positivePairs[i];
    if (!first) continue;
    for (let j = i + 1; j < positivePairs.length; j += 1) {
      const second = positivePairs[j];
      if (!second) continue;
      const mask = first.mask | second.mask;
      register(mask, ruleOr(first.node, second.node), 4, false);
    }
  }

  const list = Array.from(byMask.values()).sort((a, b) => {
    if (a.complexity !== b.complexity) return a.complexity - b.complexity;
    return a.mask - b.mask;
  });

  return { list, byMask };
}

export function getHypothesisSpace(): readonly HypothesisEntry[] {
  if (!cachedHypothesisSpace) {
    const built = buildHypothesisSpaceInternal();
    cachedHypothesisSpace = built.list;
    cachedHypothesisByMask = built.byMask;
  }
  return cachedHypothesisSpace;
}

export function findCanonicalHypothesis(mask: number): HypothesisEntry | undefined {
  getHypothesisSpace();
  return cachedHypothesisByMask?.get(mask & FULL_UNIVERSE_MASK);
}

export function recommendedBudgetForComplexity(complexityTier: number): number {
  if (complexityTier <= 1) return 6;
  if (complexityTier === 2) return 9;
  return 10;
}

export function selectOptimalExamSnacks(
  targetMask: number,
  targetComplexity: number
): { readonly examSnackIds: readonly SnackId[]; readonly benchSnackIds: readonly SnackId[] } {
  const space = getHypothesisSpace();
  const maxRelevantTier = Math.min(4, Math.max(2, targetComplexity + 1));

  // Track competing hypotheses still agreeing with target on chosen exam snacks
  const competitors = space.filter(
    (h) => h.mask !== targetMask && h.complexity <= maxRelevantTier
  );
  const alive = new Uint8Array(competitors.length);
  alive.fill(1);

  const totalAccepted = countBits(targetMask);
  const totalRejected = SNACK_UNIVERSE.length - totalAccepted;

  // Target balanced exam: try to have at least 2 accepted and 2 rejected, while leaving plenty on bench
  const desiredMinAccepted = Math.min(2, Math.max(1, totalAccepted - 1));
  const desiredMinRejected = Math.min(2, Math.max(1, totalRejected - 1));
  const maxExamAccepted = Math.min(EXAM_SIZE - desiredMinRejected, Math.max(1, totalAccepted - 1));
  const maxExamRejected = Math.min(EXAM_SIZE - desiredMinAccepted, Math.max(1, totalRejected - 1));

  const chosen: Snack[] = [];
  const chosenSet = new Set<number>();
  let examAccepted = 0;
  let examRejected = 0;

  for (let slot = 0; slot < EXAM_SIZE; slot += 1) {
    const remainingSlots = EXAM_SIZE - slot;
    const mustPickAccepted = desiredMinAccepted - examAccepted >= remainingSlots;
    const mustPickRejected = desiredMinRejected - examRejected >= remainingSlots;

    let bestSnack: Snack | null = null;
    let bestScore = -1;

    for (const snack of SNACK_UNIVERSE) {
      if (chosenSet.has(snack.index)) continue;
      const isAccepted = (targetMask & snack.bit) !== 0;

      if (mustPickAccepted && !isAccepted) continue;
      if (mustPickRejected && isAccepted) continue;
      if (isAccepted && examAccepted >= maxExamAccepted) continue;
      if (!isAccepted && examRejected >= maxExamRejected) continue;

      let score = 0;
      for (let i = 0; i < competitors.length; i += 1) {
        if (alive[i] === 0) continue;
        const comp = competitors[i];
        if (!comp) continue;
        const compAccepts = (comp.mask & snack.bit) !== 0;
        if (compAccepts !== isAccepted) {
          score += comp.complexity <= targetComplexity ? 12 : 2;
        }
      }

      // Slight diversity bonus for spreading attributes across the 6 exam cards
      let diversityBonus = 0;
      const sameShapeCount = chosen.filter((s) => s.shape === snack.shape).length;
      const sameColorCount = chosen.filter((s) => s.color === snack.color).length;
      const samePatternCount = chosen.filter((s) => s.pattern === snack.pattern).length;
      diversityBonus += Math.max(0, 2 - sameShapeCount);
      diversityBonus += Math.max(0, 2 - sameColorCount);
      diversityBonus += Math.max(0, 2 - samePatternCount);

      const totalScore = score * 10 + diversityBonus;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestSnack = snack;
      }
    }

    if (!bestSnack) {
      // Fallback if constraints were overly tight (e.g. degenerate masks)
      bestSnack = SNACK_UNIVERSE.find((s) => !chosenSet.has(s.index)) ?? null;
    }
    if (!bestSnack) break;

    chosen.push(bestSnack);
    chosenSet.add(bestSnack.index);
    const pickedAccepted = (targetMask & bestSnack.bit) !== 0;
    if (pickedAccepted) examAccepted += 1;
    else examRejected += 1;

    for (let i = 0; i < competitors.length; i += 1) {
      if (alive[i] === 0) continue;
      const comp = competitors[i];
      if (!comp) continue;
      const compAccepts = (comp.mask & bestSnack.bit) !== 0;
      if (compAccepts !== pickedAccepted) {
        alive[i] = 0;
      }
    }
  }

  // Deterministic 1-swap refinement: if any same-tier competitor still survives the 6-snack exam,
  // try replacing one exam snack with a bench snack while preserving accepted/rejected balance.
  const sameTierCompetitors = space.filter(
    (h) => h.mask !== targetMask && h.complexity <= targetComplexity
  );

  function countSurvivingSameTier(snacks: readonly Snack[]): number {
    let examMask = 0;
    for (const s of snacks) examMask |= s.bit;
    let surviving = 0;
    for (const comp of sameTierCompetitors) {
      if (((comp.mask ^ targetMask) & examMask) === 0) {
        surviving += 1;
      }
    }
    return surviving;
  }

  let currentSurviving = countSurvivingSameTier(chosen);
  if (currentSurviving > 0) {
    for (let pass = 0; pass < 2 && currentSurviving > 0; pass += 1) {
      let improved = false;
      for (let slot = 0; slot < chosen.length && currentSurviving > 0; slot += 1) {
        const currentSnack = chosen[slot];
        if (!currentSnack) continue;
        const currentIsAccepted = (targetMask & currentSnack.bit) !== 0;

        for (const candidate of SNACK_UNIVERSE) {
          if (chosenSet.has(candidate.index)) continue;
          const candIsAccepted = (targetMask & candidate.bit) !== 0;
          const nextAcc = examAccepted - (currentIsAccepted ? 1 : 0) + (candIsAccepted ? 1 : 0);
          const nextRej = EXAM_SIZE - nextAcc;
          if (nextAcc < desiredMinAccepted || nextRej < desiredMinRejected) continue;
          if (nextAcc > maxExamAccepted || nextRej > maxExamRejected) continue;

          const trial = [...chosen];
          trial[slot] = candidate;
          const trialSurviving = countSurvivingSameTier(trial);
          if (trialSurviving < currentSurviving) {
            chosenSet.delete(currentSnack.index);
            chosenSet.add(candidate.index);
            chosen[slot] = candidate;
            examAccepted = nextAcc;
            currentSurviving = trialSurviving;
            improved = true;
            break;
          }
        }
      }
      if (!improved) break;
    }
  }

  const examSnackIds = chosen.map((s) => s.id);
  const benchSnackIds = SNACK_UNIVERSE.filter((s) => !chosenSet.has(s.index)).map((s) => s.id);

  return { examSnackIds, benchSnackIds };
}

type SolvabilityAnalysis = {
  readonly minOptimalExperiments: number | null;
  readonly survivingCompetitorsAtBudget: readonly string[];
};

function clampComplexityTier(value: number): 1 | 2 | 3 | 4 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

function analyzeBenchSolvability(
  targetMask: number,
  targetComplexity: number,
  benchSnackIds: readonly SnackId[],
  budget: number
): SolvabilityAnalysis {
  const space = getHypothesisSpace();
  const benchSnacks: Snack[] = [];
  for (const id of benchSnackIds) {
    const snack = getSnackById(id);
    if (snack) benchSnacks.push(snack);
  }

  // Competing hypotheses in the target's complexity class (exact same-or-lower complexity)
  const plausibleMaxTier = clampComplexityTier(targetComplexity);
  let candidates = space.filter(
    (h) => h.complexity <= plausibleMaxTier
  );
  // Ensure targetMask itself is represented if it was outside the grammar
  if (!candidates.some((h) => h.mask === targetMask)) {
    candidates = [
      ...candidates,
      {
        mask: targetMask,
        rule: atomShape('circle'),
        text: 'Target rule',
        complexity: plausibleMaxTier,
        isSinglePositiveAttr: false,
        acceptedCount: countBits(targetMask),
      },
    ];
  }

  const usedIndices = new Set<number>();
  let minSolvedStep: number | null = null;
  let survivingAtBudget: HypothesisEntry[] = [];

  const maxSteps = Math.max(budget, 14);

  for (let step = 1; step <= maxSteps; step += 1) {
    const competitors = candidates.filter((h) => h.mask !== targetMask);
    if (competitors.length === 0) {
      if (minSolvedStep === null) {
        minSolvedStep = step - 1;
      }
      if (step - 1 <= budget) {
        survivingAtBudget = [];
      }
      break;
    }

    // Active learning: pick bench snack minimizing worst-case remaining hypotheses (minimax split)
    let bestSnack: Snack | null = null;
    let bestWorstCase = Number.POSITIVE_INFINITY;
    let bestSameTierElim = -1;

    for (const snack of benchSnacks) {
      if (usedIndices.has(snack.index)) continue;
      let acceptBucket = 0;
      let rejectBucket = 0;
      let targetOutcomeElimSameTier = 0;
      const targetAccepts = (targetMask & snack.bit) !== 0;

      for (const h of candidates) {
        const hAccepts = (h.mask & snack.bit) !== 0;
        if (hAccepts) acceptBucket += 1;
        else rejectBucket += 1;
        if (h.mask !== targetMask && hAccepts !== targetAccepts) {
          targetOutcomeElimSameTier += 1;
        }
      }

      // Skip uninformative snacks that cannot split remaining hypotheses
      if (acceptBucket === 0 || rejectBucket === 0) continue;

      const worstCase = Math.max(acceptBucket, rejectBucket);
      if (
        worstCase < bestWorstCase ||
        (worstCase === bestWorstCase && targetOutcomeElimSameTier > bestSameTierElim)
      ) {
        bestWorstCase = worstCase;
        bestSameTierElim = targetOutcomeElimSameTier;
        bestSnack = snack;
      }
    }

    if (!bestSnack) break;
    usedIndices.add(bestSnack.index);

    const targetAccepts = (targetMask & bestSnack.bit) !== 0;
    candidates = candidates.filter((h) => ((h.mask & bestSnack.bit) !== 0) === targetAccepts);

    const remainingCompetitors = candidates.filter((h) => h.mask !== targetMask);
    if (remainingCompetitors.length === 0 && minSolvedStep === null) {
      minSolvedStep = step;
    }
    if (step === budget) {
      survivingAtBudget = remainingCompetitors;
    }
  }

  if (minSolvedStep !== null && minSolvedStep <= budget) {
    survivingAtBudget = [];
  } else if (survivingAtBudget.length === 0) {
    survivingAtBudget = candidates.filter((h) => h.mask !== targetMask);
  }

  return {
    minOptimalExperiments: minSolvedStep,
    survivingCompetitorsAtBudget: survivingAtBudget.slice(0, 5).map((h) => h.text),
  };
}

function makeInvalidReport(
  reasons: readonly string[],
  budget: number,
  acceptedCount = 0
): FairnessReport {
  const space = getHypothesisSpace();
  return {
    verdict: 'invalid',
    score: 0,
    difficulty: 'gentle',
    summary: reasons[0] ?? 'This rule is not valid for a FINICKY challenge.',
    reasons,
    metrics: {
      acceptedCount,
      rejectedCount: SNACK_UNIVERSE.length - acceptedCount,
      complexityTier: 0,
      canonicalRuleText: 'Invalid rule',
      isRedundantForm: false,
      totalGrammarHypothesesChecked: space.length,
      minOptimalExperiments: null,
      experimentBudget: budget,
      examSameTierDiscriminationPct: 0,
      examFullGrammarDiscriminationPct: 0,
      examAcceptedCount: 0,
      examRejectedCount: 0,
      survivingExamCompetitors: [],
      survivingBenchCompetitors: [],
    },
    benchSnackIds: [],
    examSnackIds: [],
  };
}

export function certifyChallenge(options: CertifyChallengeOptions): FairnessReport {
  const mode = options.mode ?? 'community';
  const validation = validateRuleNode(options.rule);
  const fallbackBudget = options.experimentBudget ?? DEFAULT_EXPERIMENT_BUDGET;

  if (!validation.valid) {
    return makeInvalidReport([validation.error], fallbackBudget);
  }

  const rule = validation.rule;
  const targetMask = computeRuleMask(rule);
  const acceptedCount = countBits(targetMask);
  const rejectedCount = SNACK_UNIVERSE.length - acceptedCount;

  if (acceptedCount === 0) {
    return makeInvalidReport(
      ['Contradictory rule: this monster refuses every single snack in the universe (0 of 27 accepted).'],
      fallbackBudget,
      0
    );
  }
  if (acceptedCount === SNACK_UNIVERSE.length) {
    return makeInvalidReport(
      ['Tautology rule: this monster eats every single snack in the universe (27 of 27 accepted).'],
      fallbackBudget,
      SNACK_UNIVERSE.length
    );
  }

  const space = getHypothesisSpace();
  const canonical = findCanonicalHypothesis(targetMask);
  const complexityTier = canonical ? canonical.complexity : Math.min(4, Math.max(3, validation.leafCount));
  const budget = options.experimentBudget ?? recommendedBudgetForComplexity(complexityTier);
  const canonicalRuleText = canonical ? canonical.text : ruleToNaturalLanguage(rule);
  const submittedLeaves = countRuleLeaves(rule);
  const canonicalLeaves = canonical ? countRuleLeaves(canonical.rule) : submittedLeaves;
  const isRedundantForm = canonical !== undefined && submittedLeaves > canonicalLeaves;

  if (acceptedCount < 2 || acceptedCount > SNACK_UNIVERSE.length - 2) {
    return makeInvalidReport(
      [
        acceptedCount < 2
          ? 'Only 1 snack out of 27 is accepted — players would be guessing a needle in a haystack instead of deducing a rule.'
          : '26 of 27 snacks are accepted — players would be hunting for a single exception instead of deducing a rule.',
      ],
      budget,
      acceptedCount
    );
  }

  // Validate or select the 6-snack unseen final exam
  let examSnackIds: readonly SnackId[];
  let benchSnackIds: readonly SnackId[];

  if (options.customExamSnackIds && options.customExamSnackIds.length > 0) {
    const uniqueIds = new Set<SnackId>();
    for (const id of options.customExamSnackIds) {
      if (!getSnackById(id) || uniqueIds.has(id)) {
        return makeInvalidReport(
          ['Final examination contains invalid or duplicate snacks.'],
          budget,
          acceptedCount
        );
      }
      uniqueIds.add(id);
    }
    if (uniqueIds.size < 4 || uniqueIds.size > 9) {
      return makeInvalidReport(
        ['Final examination must contain between 4 and 9 unique unseen snacks.'],
        budget,
        acceptedCount
      );
    }
    examSnackIds = Array.from(uniqueIds);
    benchSnackIds = SNACK_UNIVERSE.filter((s) => !uniqueIds.has(s.id)).map((s) => s.id);
  } else {
    const selected = selectOptimalExamSnacks(targetMask, complexityTier);
    examSnackIds = selected.examSnackIds;
    benchSnackIds = selected.benchSnackIds;
  }

  const examMask = maskFromSnackIds(examSnackIds);
  const examAcceptedCount = countBits(targetMask & examMask);
  const examRejectedCount = examSnackIds.length - examAcceptedCount;

  // Evaluate exam distinguishing power across the complete grammar
  const sameTierCompetitors = space.filter(
    (h) => h.mask !== targetMask && h.complexity <= complexityTier
  );
  const survivingExamSameTier: HypothesisEntry[] = [];
  for (const comp of sameTierCompetitors) {
    if (((comp.mask ^ targetMask) & examMask) === 0) {
      survivingExamSameTier.push(comp);
    }
  }
  const examSameTierDiscriminationPct =
    sameTierCompetitors.length === 0
      ? 100
      : Math.round(
          ((sameTierCompetitors.length - survivingExamSameTier.length) /
            sameTierCompetitors.length) *
            1000
        ) / 10;

  let fullEliminated = 0;
  let fullTotal = 0;
  for (const comp of space) {
    if (comp.mask === targetMask) continue;
    fullTotal += 1;
    if (((comp.mask ^ targetMask) & examMask) !== 0) {
      fullEliminated += 1;
    }
  }
  const examFullGrammarDiscriminationPct =
    fullTotal === 0 ? 100 : Math.round((fullEliminated / fullTotal) * 1000) / 10;

  // Evaluate bench solvability via deterministic active-learning simulation
  const solvability = analyzeBenchSolvability(targetMask, complexityTier, benchSnackIds, budget);

  // Determine difficulty label
  const difficulty: DifficultyTier =
    complexityTier === 1
      ? 'gentle'
      : complexityTier === 2
        ? 'clever'
        : complexityTier === 3
          ? 'tricky'
          : 'fiendish';

  const reasons: string[] = [];
  if (isRedundantForm) {
    reasons.push(`Equivalent to a simpler rule: "${canonicalRuleText}".`);
  }

  // Evaluate verdict
  let verdict: FairnessVerdict = 'fair_verified';
  let summary = 'Fair & Verified — uniquely deducible within budget with a sharp final exam.';

  if (examAcceptedCount === 0 || examRejectedCount === 0) {
    verdict = 'ambiguous';
    summary = 'Final exam is one-sided and cannot test both acceptance and rejection.';
    reasons.push('The unseen final exam must contain both accepted and rejected snacks.');
  } else if (survivingExamSameTier.length > 0) {
    verdict = 'ambiguous';
    summary = `Ambiguous final exam: ${survivingExamSameTier.length} competing rule(s) agree with every exam snack.`;
    reasons.push(
      `Final exam cannot distinguish this rule from: ${survivingExamSameTier
        .slice(0, 2)
        .map((c) => `"${c.text}"`)
        .join(', ')}.`
    );
  } else if (solvability.minOptimalExperiments === null) {
    verdict = 'ambiguous';
    summary = 'Ambiguous bench: competing rules remain indistinguishable even after testing all bench snacks.';
    reasons.push('Available experiment snacks cannot separate this rule from simpler/equal alternatives.');
  } else if (
    solvability.minOptimalExperiments > budget ||
    acceptedCount <= 2 ||
    acceptedCount >= SNACK_UNIVERSE.length - 2
  ) {
    verdict = 'too_difficult';
    summary = `Too difficult: requires at least ${solvability.minOptimalExperiments} optimal experiments (budget is ${budget}).`;
    reasons.push(
      acceptedCount <= 2 || acceptedCount >= SNACK_UNIVERSE.length - 2
        ? `Extreme snack balance (${acceptedCount}/27 accepted) makes discovery overly narrow.`
        : `Even optimal scientific probing needs ${solvability.minOptimalExperiments} tests, exceeding the ${budget}-experiment budget.`
    );
  } else if (mode === 'community' && canonical && canonical.isSinglePositiveAttr) {
    verdict = 'too_easy';
    summary = 'Too easy for a community challenge — single-trait rules are solved almost immediately.';
    reasons.push(
      'Try combining two traits, adding an "except" exclusion, or adding a second OR clause to create a clever deduction!'
    );
  } else {
    reasons.push(
      `Checked against ${space.length.toLocaleString()} distinct rules in the FINICKY grammar.`
    );
    reasons.push(
      `Optimal deduction solves in ${solvability.minOptimalExperiments} of ${budget} allowed experiments.`
    );
    reasons.push(
      `Unseen 6-snack exam eliminates ${examSameTierDiscriminationPct}% of same-tier competitors (${examFullGrammarDiscriminationPct}% overall).`
    );
  }

  // Compute deterministic quality score 0..100
  const balanceRatio = Math.min(acceptedCount, rejectedCount) / (SNACK_UNIVERSE.length / 2);
  const balanceScore = Math.round(balanceRatio * 20); // up to 20
  const examScore = Math.round(
    (examSameTierDiscriminationPct / 100) * 35 + (examFullGrammarDiscriminationPct / 100) * 15
  ); // up to 50
  const efficiencyRatio =
    solvability.minOptimalExperiments !== null && solvability.minOptimalExperiments <= budget
      ? 1 - Math.abs(solvability.minOptimalExperiments - Math.min(budget - 1, 5)) / budget
      : 0;
  const solvabilityScore = Math.max(0, Math.round(efficiencyRatio * 20)); // up to 20
  const depthBonus = complexityTier === 1 ? 4 : complexityTier === 2 ? 10 : complexityTier === 3 ? 10 : 8; // up to 10

  let rawScore = Math.min(100, Math.max(0, balanceScore + examScore + solvabilityScore + depthBonus));
  if (verdict === 'too_easy') rawScore = Math.min(rawScore, 55);
  if (verdict === 'ambiguous') rawScore = Math.min(rawScore, 45);
  if (verdict === 'too_difficult') rawScore = Math.min(rawScore, 48);

  return {
    verdict,
    score: rawScore,
    difficulty,
    summary,
    reasons,
    metrics: {
      acceptedCount,
      rejectedCount,
      complexityTier,
      canonicalRuleText,
      isRedundantForm,
      totalGrammarHypothesesChecked: space.length,
      minOptimalExperiments: solvability.minOptimalExperiments,
      experimentBudget: budget,
      examSameTierDiscriminationPct,
      examFullGrammarDiscriminationPct,
      examAcceptedCount,
      examRejectedCount,
      survivingExamCompetitors: survivingExamSameTier.slice(0, 5).map((c) => c.text),
      survivingBenchCompetitors: solvability.survivingCompetitorsAtBudget,
    },
    benchSnackIds,
    examSnackIds,
  };
}

export function analyzeEvidenceTrail(
  experiments: readonly { readonly snackId: SnackId; readonly accepted: boolean }[]
): readonly EvidenceStepInsight[] {
  const space = getHypothesisSpace();
  let consistent = space;
  const insights: EvidenceStepInsight[] = [];

  for (const exp of experiments) {
    const snack = getSnackById(exp.snackId);
    if (!snack) continue;
    const before = consistent.length;
    consistent = consistent.filter((h) => ((h.mask & snack.bit) !== 0) === exp.accepted);
    const after = consistent.length;
    insights.push({
      snackId: exp.snackId,
      accepted: exp.accepted,
      remainingBefore: before,
      remainingAfter: after,
      eliminatedCount: Math.max(0, before - after),
    });
  }

  return insights;
}
