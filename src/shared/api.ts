import type {
  DifficultyTier,
  FairnessMetrics,
  FairnessReport,
  FairnessVerdict,
} from './engine/fairness.ts';
import type { MonsterAppearance } from './engine/monsters.ts';
import type { RuleNode } from './engine/rules.ts';
import type {
  ChallengeKind,
  ExamOutcomeItem,
  ExperimentRecord,
  GameSessionState,
  RevealPayload,
} from './engine/session.ts';
import type { SnackId } from './engine/snacks.ts';

export type PublicFairnessBadge = {
  readonly verdict: FairnessVerdict;
  readonly score: number;
  readonly difficulty: DifficultyTier;
  readonly totalGrammarHypothesesChecked: number;
  readonly examSameTierDiscriminationPct: number;
  readonly examFullGrammarDiscriminationPct: number;
  readonly experimentBudget: number;
  readonly minOptimalExperiments: number | null;
};

export type PublicChallenge = {
  readonly id: string;
  readonly kind: ChallengeKind;
  readonly dayKey?: string;
  readonly dayNumber?: number;
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly creatorUsername?: string;
  readonly postId?: string;
  readonly createdAt?: number;
  readonly appearance: MonsterAppearance;
  readonly fairnessBadge: PublicFairnessBadge;
  readonly benchSnackIds: readonly SnackId[];
  readonly examSnackIds: readonly SnackId[];
  readonly stats: ChallengeStatsSummary;
};

export type ChallengeStatsSummary = {
  readonly attempts: number;
  readonly solves: number;
  readonly solveRatePct: number;
  readonly avgExperiments: number;
  readonly exactDeductions: number;
};

export type CreatorChallengeAnalytics = ChallengeStatsSummary & {
  readonly challengeId: string;
  readonly name: string;
  readonly ruleText: string;
  readonly appearance: MonsterAppearance;
  readonly fairnessBadge: PublicFairnessBadge;
  readonly createdAt: number;
  readonly postId?: string;
  readonly confusingSnacks: readonly { readonly snackId: SnackId; readonly misses: number }[];
  readonly commonWrongHypotheses: readonly { readonly hypothesis: string; readonly count: number }[];
};

export type MenagerieResident = {
  readonly challengeId: string;
  readonly kind: ChallengeKind;
  readonly dayNumber?: number;
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly creatorUsername?: string;
  readonly appearance: MonsterAppearance;
  readonly ruleText: string;
  readonly discoveredAt: number;
  readonly experimentsUsed: number;
  readonly exactDeduction: boolean;
  readonly difficulty: DifficultyTier;
};

export type PlayerProfile = {
  readonly userId: string;
  readonly username: string;
  readonly streak: number;
  readonly bestStreak: number;
  readonly lastDailyKey: string | null;
  readonly totalSolved: number;
  readonly dailySolved: number;
  readonly communitySolved: number;
  readonly createdCount: number;
  readonly exactDeductions: number;
};

export type DailyHistoryEntry = {
  readonly dayKey: string;
  readonly dayNumber: number;
  readonly monsterName: string;
  readonly solved: boolean;
  readonly exactDeduction: boolean;
  readonly experimentsUsed: number;
  readonly examCorrectCount: number;
};

export type SplashResponse = {
  readonly postMode: 'daily' | 'challenge';
  readonly challengeId: string;
  readonly monsterName: string;
  readonly personality: string;
  readonly appearance: MonsterAppearance;
  readonly dayNumber?: number;
  readonly dayKey?: string;
  readonly creatorUsername?: string;
  readonly difficulty: DifficultyTier;
  readonly fairnessScore: number;
  readonly attempts: number;
  readonly solves: number;
  readonly alreadySolved: boolean;
  readonly username: string;
};

export type GameInitResponse = {
  readonly postId: string;
  readonly subredditName: string;
  readonly postMode: 'daily' | 'challenge';
  readonly activeChallenge: PublicChallenge;
  readonly session: GameSessionState;
  readonly reveal: RevealPayload | null;
  readonly profile: PlayerProfile;
  readonly menagerie: readonly MenagerieResident[];
  readonly dailyHistory: readonly DailyHistoryEntry[];
  readonly todayDayKey: string;
};

export type LoadChallengeResponse = {
  readonly challenge: PublicChallenge;
  readonly session: GameSessionState;
  readonly reveal: RevealPayload | null;
};

export type ExperimentResponse = {
  readonly session: GameSessionState;
  readonly record: ExperimentRecord;
  readonly remainingExperiments: number;
};

export type HypothesisResponse = {
  readonly session: GameSessionState;
  readonly consistentWithEvidence: boolean;
  readonly contradictions: readonly SnackId[];
};

export type ExamSubmitResponse = {
  readonly session: GameSessionState;
  readonly reveal: RevealPayload;
  readonly profile: PlayerProfile;
  readonly menagerie: readonly MenagerieResident[];
  readonly dailyHistory: readonly DailyHistoryEntry[];
  readonly stats: ChallengeStatsSummary;
  readonly newlyAddedToMenagerie: boolean;
};

export type ValidateRuleResponse = {
  readonly report: FairnessReport;
  readonly ruleText: string;
};

export type CreateChallengeRequest = {
  readonly name: string;
  readonly personality: string;
  readonly habitatNote?: string;
  readonly appearance: MonsterAppearance;
  readonly rule: RuleNode;
  readonly publishAsPost?: boolean;
};

export type CreateChallengeResponse = {
  readonly challenge: PublicChallenge;
  readonly report: FairnessReport;
  readonly createdPostUrl?: string;
  readonly postCreationNote?: string;
};

export type CommunityChallengesResponse = {
  readonly challenges: readonly PublicChallenge[];
  readonly myCreated: readonly CreatorChallengeAnalytics[];
  readonly solvedIds: readonly string[];
};

export type ShareCommentResponse = {
  readonly ok: true;
  readonly commentUrl?: string;
  readonly postedAs: 'USER' | 'APP';
};

export type ApiErrorResponse = {
  readonly status: 'error';
  readonly message: string;
};

export type {
  DifficultyTier,
  ExamOutcomeItem,
  FairnessMetrics,
  FairnessReport,
  FairnessVerdict,
};
