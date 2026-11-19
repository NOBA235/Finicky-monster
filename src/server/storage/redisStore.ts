import type {
  ChallengeStatsSummary,
  CreatorChallengeAnalytics,
  DailyHistoryEntry,
  MenagerieResident,
  PlayerProfile,
  PublicChallenge,
  PublicFairnessBadge,
} from '../../shared/api.ts';
import {
  getDailyChallengeForDayKey,
  getPreviousDayKey,
  isValidDayKey,
} from '../../shared/engine/dailyCatalog.ts';
import type { FairnessReport } from '../../shared/engine/fairness.ts';
import type { MonsterAppearance } from '../../shared/engine/monsters.ts';
import { getAcceptedSnacks, ruleToNaturalLanguage, type RuleNode } from '../../shared/engine/rules.ts';
import {
  createInitialSession,
  type ChallengeDefinition,
  type GameSessionState,
} from '../../shared/engine/session.ts';
import { isSnackId, type SnackId } from '../../shared/engine/snacks.ts';

export type ZMember = {
  member: string;
  score: number;
};

export type ZRangeOptions = {
  by?: 'rank' | 'score' | 'lex';
  reverse?: boolean;
};

export type KeyValueStore = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: ZMember[]): Promise<number>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: ZRangeOptions
  ): Promise<ZMember[]>;
};

export type StoredCommunityChallenge = {
  readonly id: string;
  readonly kind: 'community';
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly creatorUserId: string;
  readonly creatorUsername: string;
  readonly createdAt: number;
  readonly postId?: string;
  readonly appearance: MonsterAppearance;
  readonly rule: RuleNode;
  readonly fairness: FairnessReport;
};

const KEY_PREFIX = 'finicky:v1';

function userProfileKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}:profile`;
}

function userMenagerieKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}:menagerie`;
}

function userDailyHistoryKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}:dailyHistory`;
}

function userSessionKey(userId: string, challengeId: string): string {
  return `${KEY_PREFIX}:user:${userId}:session:${challengeId}`;
}

function userCreatedKey(userId: string): string {
  return `${KEY_PREFIX}:user:${userId}:created`;
}

function challengeDataKey(challengeId: string): string {
  return `${KEY_PREFIX}:challenge:${challengeId}`;
}

function challengeStatsKey(challengeId: string): string {
  return `${KEY_PREFIX}:challenge:${challengeId}:stats`;
}

function challengePlayersKey(challengeId: string): string {
  return `${KEY_PREFIX}:challenge:${challengeId}:players`;
}

const CHALLENGES_RECENT_KEY = `${KEY_PREFIX}:challenges:recent`;
const CHALLENGES_FEATURED_KEY = `${KEY_PREFIX}:challenges:featured`;

function parseIntSafe(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJsonParse(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMenagerieResident(raw: string): MenagerieResident | null {
  const parsed: unknown = safeJsonParse(raw);
  if (!isObjectRecord(parsed)) return null;
  if (typeof parsed['challengeId'] !== 'string' || typeof parsed['name'] !== 'string') {
    return null;
  }
  return JSON.parse(raw);
}

function parseDailyHistoryEntry(raw: string): DailyHistoryEntry | null {
  const parsed: unknown = safeJsonParse(raw);
  if (!isObjectRecord(parsed)) return null;
  if (typeof parsed['dayKey'] !== 'string' || typeof parsed['monsterName'] !== 'string') {
    return null;
  }
  return JSON.parse(raw);
}

function parseGameSession(raw: string | undefined): GameSessionState | null {
  if (!raw) return null;
  const parsed: unknown = safeJsonParse(raw);
  if (!isObjectRecord(parsed)) return null;
  if (typeof parsed['challengeId'] !== 'string' || !Array.isArray(parsed['experiments'])) {
    return null;
  }
  return JSON.parse(raw);
}

function parseStoredCommunityChallenge(raw: string | undefined): StoredCommunityChallenge | null {
  if (!raw) return null;
  const parsed: unknown = safeJsonParse(raw);
  if (!isObjectRecord(parsed)) return null;
  if (typeof parsed['id'] !== 'string' || typeof parsed['name'] !== 'string') {
    return null;
  }
  return JSON.parse(raw);
}

export function buildPublicFairnessBadge(fairness: FairnessReport): PublicFairnessBadge {
  return {
    verdict: fairness.verdict,
    score: fairness.score,
    difficulty: fairness.difficulty,
    totalGrammarHypothesesChecked: fairness.metrics.totalGrammarHypothesesChecked,
    examSameTierDiscriminationPct: fairness.metrics.examSameTierDiscriminationPct,
    examFullGrammarDiscriminationPct: fairness.metrics.examFullGrammarDiscriminationPct,
    experimentBudget: fairness.metrics.experimentBudget,
    minOptimalExperiments: fairness.metrics.minOptimalExperiments,
  };
}

export function toPublicChallenge(
  challenge: ChallengeDefinition,
  stats: ChallengeStatsSummary,
  extra?: { readonly postId?: string; readonly createdAt?: number }
): PublicChallenge {
  const base: PublicChallenge = {
    id: challenge.id,
    kind: challenge.kind,
    ...(challenge.dayKey !== undefined ? { dayKey: challenge.dayKey } : {}),
    ...(challenge.dayNumber !== undefined ? { dayNumber: challenge.dayNumber } : {}),
    name: challenge.name,
    personality: challenge.personality,
    habitatNote: challenge.habitatNote,
    ...(challenge.creatorUsername !== undefined
      ? { creatorUsername: challenge.creatorUsername }
      : {}),
    ...(extra?.postId !== undefined ? { postId: extra.postId } : {}),
    ...(extra?.createdAt !== undefined ? { createdAt: extra.createdAt } : {}),
    appearance: challenge.appearance,
    fairnessBadge: buildPublicFairnessBadge(challenge.fairness),
    benchSnackIds: challenge.fairness.benchSnackIds,
    examSnackIds: challenge.fairness.examSnackIds,
    stats,
  };
  return base;
}

export async function getPlayerProfile(
  store: KeyValueStore,
  userId: string,
  username: string
): Promise<PlayerProfile> {
  const raw = await store.hGetAll(userProfileKey(userId));
  return {
    userId,
    username,
    streak: parseIntSafe(raw['streak'], 0),
    bestStreak: parseIntSafe(raw['bestStreak'], 0),
    lastDailyKey: raw['lastDailyKey'] ? raw['lastDailyKey'] : null,
    totalSolved: parseIntSafe(raw['totalSolved'], 0),
    dailySolved: parseIntSafe(raw['dailySolved'], 0),
    communitySolved: parseIntSafe(raw['communitySolved'], 0),
    createdCount: parseIntSafe(raw['createdCount'], 0),
    exactDeductions: parseIntSafe(raw['exactDeductions'], 0),
  };
}

export async function getMenagerie(
  store: KeyValueStore,
  userId: string
): Promise<readonly MenagerieResident[]> {
  const raw = await store.hGetAll(userMenagerieKey(userId));
  const list: MenagerieResident[] = [];
  for (const val of Object.values(raw)) {
    const parsed = parseMenagerieResident(val);
    if (parsed) {
      list.push(parsed);
    }
  }
  return list.sort((a, b) => b.discoveredAt - a.discoveredAt);
}

export async function getDailyHistory(
  store: KeyValueStore,
  userId: string
): Promise<readonly DailyHistoryEntry[]> {
  const raw = await store.hGetAll(userDailyHistoryKey(userId));
  const entries: DailyHistoryEntry[] = [];
  for (const val of Object.values(raw)) {
    const parsed = parseDailyHistoryEntry(val);
    if (parsed) {
      entries.push(parsed);
    }
  }
  return entries.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

export async function getOrCreateSession(
  store: KeyValueStore,
  userId: string,
  challengeId: string
): Promise<GameSessionState> {
  const raw = await store.get(userSessionKey(userId, challengeId));
  const parsed = parseGameSession(raw);
  if (parsed && parsed.challengeId === challengeId) {
    return parsed;
  }
  return createInitialSession(challengeId);
}

export async function saveSession(
  store: KeyValueStore,
  userId: string,
  session: GameSessionState
): Promise<void> {
  await store.set(userSessionKey(userId, session.challengeId), JSON.stringify(session));
}

export async function getChallengeStats(
  store: KeyValueStore,
  challengeId: string
): Promise<ChallengeStatsSummary> {
  const raw = await store.hGetAll(challengeStatsKey(challengeId));
  const attempts = parseIntSafe(raw['attempts'], 0);
  const solves = parseIntSafe(raw['solves'], 0);
  const totalExperiments = parseIntSafe(raw['totalExperiments'], 0);
  const exactDeductions = parseIntSafe(raw['exactDeductions'], 0);
  const solveRatePct = attempts > 0 ? Math.round((solves / attempts) * 100) : 0;
  const avgExperiments = attempts > 0 ? Math.round((totalExperiments / attempts) * 10) / 10 : 0;

  return {
    attempts,
    solves,
    solveRatePct,
    avgExperiments,
    exactDeductions,
  };
}

export async function saveCommunityChallenge(
  store: KeyValueStore,
  challenge: StoredCommunityChallenge
): Promise<void> {
  await Promise.all([
    store.set(challengeDataKey(challenge.id), JSON.stringify(challenge)),
    store.zAdd(CHALLENGES_RECENT_KEY, { member: challenge.id, score: challenge.createdAt }),
    store.zAdd(CHALLENGES_FEATURED_KEY, {
      member: challenge.id,
      score: challenge.fairness.score,
    }),
    store.zAdd(userCreatedKey(challenge.creatorUserId), {
      member: challenge.id,
      score: challenge.createdAt,
    }),
    store.hIncrBy(userProfileKey(challenge.creatorUserId), 'createdCount', 1),
  ]);
}

export async function attachPostIdToChallenge(
  store: KeyValueStore,
  challengeId: string,
  postId: string
): Promise<StoredCommunityChallenge | null> {
  const existing = await getCommunityChallenge(store, challengeId);
  if (!existing) return null;
  const updated: StoredCommunityChallenge = {
    ...existing,
    postId,
  };
  await store.set(challengeDataKey(challengeId), JSON.stringify(updated));
  return updated;
}

export async function getCommunityChallenge(
  store: KeyValueStore,
  challengeId: string
): Promise<StoredCommunityChallenge | null> {
  const raw = await store.get(challengeDataKey(challengeId));
  return parseStoredCommunityChallenge(raw);
}

export async function resolveChallengeDefinition(
  store: KeyValueStore,
  challengeId: string
): Promise<{
  readonly def: ChallengeDefinition;
  readonly postId?: string;
  readonly createdAt?: number;
} | null> {
  if (challengeId.startsWith('daily:')) {
    const dayKey = challengeId.slice('daily:'.length);
    if (!isValidDayKey(dayKey)) return null;
    const daily = getDailyChallengeForDayKey(dayKey);
    return {
      def: {
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
      },
    };
  }

  const stored = await getCommunityChallenge(store, challengeId);
  if (!stored) return null;
  return {
    def: {
      id: stored.id,
      kind: 'community',
      name: stored.name,
      personality: stored.personality,
      habitatNote: stored.habitatNote,
      creatorUsername: stored.creatorUsername,
      appearance: stored.appearance,
      rule: stored.rule,
      fairness: stored.fairness,
    },
    ...(stored.postId !== undefined ? { postId: stored.postId } : {}),
    createdAt: stored.createdAt,
  };
}

export async function listCommunityChallenges(
  store: KeyValueStore,
  limit = 24,
  sort: 'recent' | 'featured' = 'recent'
): Promise<readonly PublicChallenge[]> {
  const indexKey = sort === 'featured' ? CHALLENGES_FEATURED_KEY : CHALLENGES_RECENT_KEY;
  const entries = await store.zRange(indexKey, 0, Math.max(0, limit - 1), {
    by: 'rank',
    reverse: true,
  });

  const results: PublicChallenge[] = [];
  for (const item of entries) {
    const stored = await getCommunityChallenge(store, item.member);
    if (!stored) continue;
    const stats = await getChallengeStats(store, stored.id);
    results.push(
      toPublicChallenge(
        {
          id: stored.id,
          kind: 'community',
          name: stored.name,
          personality: stored.personality,
          habitatNote: stored.habitatNote,
          creatorUsername: stored.creatorUsername,
          appearance: stored.appearance,
          rule: stored.rule,
          fairness: stored.fairness,
        },
        stats,
        {
          ...(stored.postId !== undefined ? { postId: stored.postId } : {}),
          createdAt: stored.createdAt,
        }
      )
    );
  }
  return results;
}

export async function listCreatorAnalytics(
  store: KeyValueStore,
  creatorUserId: string
): Promise<readonly CreatorChallengeAnalytics[]> {
  const created = await store.zRange(userCreatedKey(creatorUserId), 0, 29, {
    by: 'rank',
    reverse: true,
  });

  const analytics: CreatorChallengeAnalytics[] = [];
  for (const entry of created) {
    const stored = await getCommunityChallenge(store, entry.member);
    if (!stored) continue;
    const rawStats = await store.hGetAll(challengeStatsKey(stored.id));
    const attempts = parseIntSafe(rawStats['attempts'], 0);
    const solves = parseIntSafe(rawStats['solves'], 0);
    const totalExperiments = parseIntSafe(rawStats['totalExperiments'], 0);
    const exactDeductions = parseIntSafe(rawStats['exactDeductions'], 0);

    const confusingSnacks: { snackId: SnackId; misses: number }[] = [];
    const wrongHypotheses: { hypothesis: string; count: number }[] = [];

    for (const [field, val] of Object.entries(rawStats)) {
      if (field.startsWith('confused:')) {
        const snackId = field.slice('confused:'.length);
        const misses = parseIntSafe(val, 0);
        if (isSnackId(snackId) && misses > 0) {
          confusingSnacks.push({ snackId, misses });
        }
      } else if (field.startsWith('wrongHyp:')) {
        const hypothesis = field.slice('wrongHyp:'.length);
        const count = parseIntSafe(val, 0);
        if (hypothesis && count > 0) {
          wrongHypotheses.push({ hypothesis, count });
        }
      }
    }

    confusingSnacks.sort((a, b) => b.misses - a.misses);
    wrongHypotheses.sort((a, b) => b.count - a.count);

    analytics.push({
      challengeId: stored.id,
      name: stored.name,
      ruleText: ruleToNaturalLanguage(stored.rule),
      appearance: stored.appearance,
      fairnessBadge: buildPublicFairnessBadge(stored.fairness),
      createdAt: stored.createdAt,
      ...(stored.postId !== undefined ? { postId: stored.postId } : {}),
      attempts,
      solves,
      solveRatePct: attempts > 0 ? Math.round((solves / attempts) * 100) : 0,
      avgExperiments: attempts > 0 ? Math.round((totalExperiments / attempts) * 10) / 10 : 0,
      exactDeductions,
      confusingSnacks: confusingSnacks.slice(0, 4),
      commonWrongHypotheses: wrongHypotheses.slice(0, 4),
    });
  }

  return analytics;
}

export type RecordCompletionParams = {
  readonly userId: string;
  readonly username: string;
  readonly challenge: ChallengeDefinition;
  readonly session: GameSessionState;
  readonly solved: boolean;
  readonly exactDeduction: boolean;
  readonly examCorrectCount: number;
  readonly confusedSnackIds: readonly SnackId[];
  readonly nowMs: number;
};

export type RecordCompletionOutcome = {
  readonly countedAsFirstAttempt: boolean;
  readonly newlyAddedToMenagerie: boolean;
  readonly stats: ChallengeStatsSummary;
  readonly profile: PlayerProfile;
  readonly menagerie: readonly MenagerieResident[];
  readonly dailyHistory: readonly DailyHistoryEntry[];
};

export async function recordCompletion(
  store: KeyValueStore,
  params: RecordCompletionParams
): Promise<RecordCompletionOutcome> {
  const {
    userId,
    username,
    challenge,
    session,
    solved,
    exactDeduction,
    examCorrectCount,
    confusedSnackIds,
    nowMs,
  } = params;

  // Persist final revealed session
  await saveSession(store, userId, session);

  // Atomic duplicate guard per (challengeId, userId)
  const firstAttemptFlag = await store.hSetNX(
    challengePlayersKey(challenge.id),
    userId,
    solved ? 'solved' : 'attempted'
  );
  const countedAsFirstAttempt = firstAttemptFlag === 1;

  if (countedAsFirstAttempt) {
    const sKey = challengeStatsKey(challenge.id);
    const statOps: Promise<unknown>[] = [
      store.hIncrBy(sKey, 'attempts', 1),
      store.hIncrBy(sKey, 'totalExperiments', session.experiments.length),
    ];
    if (solved) {
      statOps.push(store.hIncrBy(sKey, 'solves', 1));
    }
    if (exactDeduction) {
      statOps.push(store.hIncrBy(sKey, 'exactDeductions', 1));
    }
    for (const snackId of confusedSnackIds) {
      statOps.push(store.hIncrBy(sKey, `confused:${snackId}`, 1));
    }
    if (!exactDeduction && session.hypothesisText) {
      const normalizedHyp = session.hypothesisText.slice(0, 72);
      statOps.push(store.hIncrBy(sKey, `wrongHyp:${normalizedHyp}`, 1));
    }
    await Promise.all(statOps);
  }

  let newlyAddedToMenagerie = false;

  if (solved) {
    const favoriteSnack = getAcceptedSnacks(challenge.rule)[0];
    const resident: MenagerieResident = {
      challengeId: challenge.id,
      kind: challenge.kind,
      ...(challenge.dayNumber !== undefined ? { dayNumber: challenge.dayNumber } : {}),
      name: challenge.name,
      personality: challenge.personality,
      habitatNote: challenge.habitatNote,
      ...(challenge.creatorUsername !== undefined
        ? { creatorUsername: challenge.creatorUsername }
        : {}),
      appearance: challenge.appearance,
      ruleText: ruleToNaturalLanguage(challenge.rule),
      ...(favoriteSnack ? { favoriteSnackId: favoriteSnack.id } : {}),
      discoveredAt: nowMs,
      experimentsUsed: session.experiments.length,
      exactDeduction,
      difficulty: challenge.fairness.difficulty,
    };

    const inserted = await store.hSetNX(
      userMenagerieKey(userId),
      challenge.id,
      JSON.stringify(resident)
    );
    newlyAddedToMenagerie = inserted === 1;

    if (newlyAddedToMenagerie) {
      const pKey = userProfileKey(userId);
      const current = await getPlayerProfile(store, userId, username);
      const profileOps: Promise<unknown>[] = [
        store.hIncrBy(pKey, 'totalSolved', 1),
        store.hIncrBy(pKey, challenge.kind === 'daily' ? 'dailySolved' : 'communitySolved', 1),
      ];
      if (exactDeduction) {
        profileOps.push(store.hIncrBy(pKey, 'exactDeductions', 1));
      }

      if (challenge.kind === 'daily' && challenge.dayKey) {
        let nextStreak = current.streak;
        if (current.lastDailyKey === challenge.dayKey) {
          nextStreak = Math.max(1, current.streak);
        } else if (
          current.lastDailyKey !== null &&
          current.lastDailyKey === getPreviousDayKey(challenge.dayKey)
        ) {
          nextStreak = current.streak + 1;
        } else if (
          current.lastDailyKey === null ||
          challenge.dayKey > current.lastDailyKey
        ) {
          nextStreak = 1;
        }
        const nextBest = Math.max(current.bestStreak, nextStreak);
        const latestKey =
          current.lastDailyKey && current.lastDailyKey > challenge.dayKey
            ? current.lastDailyKey
            : challenge.dayKey;

        profileOps.push(
          store.hSet(pKey, {
            streak: String(nextStreak),
            bestStreak: String(nextBest),
            lastDailyKey: latestKey,
          })
        );
      }

      await Promise.all(profileOps);
    }
  }

  if (challenge.kind === 'daily' && challenge.dayKey && challenge.dayNumber !== undefined) {
    const historyEntry: DailyHistoryEntry = {
      dayKey: challenge.dayKey,
      dayNumber: challenge.dayNumber,
      monsterName: challenge.name,
      solved,
      exactDeduction,
      experimentsUsed: session.experiments.length,
      examCorrectCount,
    };
    await store.hSetNX(
      userDailyHistoryKey(userId),
      challenge.dayKey,
      JSON.stringify(historyEntry)
    );
  }

  const [stats, profile, menagerie, dailyHistory] = await Promise.all([
    getChallengeStats(store, challenge.id),
    getPlayerProfile(store, userId, username),
    getMenagerie(store, userId),
    getDailyHistory(store, userId),
  ]);

  return {
    countedAsFirstAttempt,
    newlyAddedToMenagerie,
    stats,
    profile,
    menagerie,
    dailyHistory,
  };
}

export function createMemoryStore(): KeyValueStore {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();

  function getHash(key: string): Map<string, string> {
    let map = hashes.get(key);
    if (!map) {
      map = new Map<string, string>();
      hashes.set(key, map);
    }
    return map;
  }

  function getZSet(key: string): Map<string, number> {
    let map = zsets.get(key);
    if (!map) {
      map = new Map<string, number>();
      zsets.set(key, map);
    }
    return map;
  }

  return {
    async get(key) {
      return strings.get(key);
    },
    async set(key, value) {
      strings.set(key, value);
      return 'OK';
    },
    async hGet(key, field) {
      return hashes.get(key)?.get(field);
    },
    async hSet(key, fieldValues) {
      const hash = getHash(key);
      let added = 0;
      for (const [k, v] of Object.entries(fieldValues)) {
        if (!hash.has(k)) added += 1;
        hash.set(k, v);
      }
      return added;
    },
    async hSetNX(key, field, value) {
      const hash = getHash(key);
      if (hash.has(field)) return 0;
      hash.set(field, value);
      return 1;
    },
    async hGetAll(key) {
      const hash = hashes.get(key);
      if (!hash) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of hash.entries()) {
        out[k] = v;
      }
      return out;
    },
    async hIncrBy(key, field, value) {
      const hash = getHash(key);
      const current = parseIntSafe(hash.get(field), 0);
      const next = current + value;
      hash.set(field, String(next));
      return next;
    },
    async zAdd(key, ...members) {
      const zset = getZSet(key);
      let added = 0;
      for (const item of members) {
        if (!zset.has(item.member)) added += 1;
        zset.set(item.member, item.score);
      }
      return added;
    },
    async zRange(key, start, stop, options) {
      const zset = zsets.get(key);
      if (!zset) return [];
      const entries: ZMember[] = Array.from(zset.entries()).map(([member, score]) => ({
        member,
        score,
      }));
      entries.sort((a, b) => {
        if (a.score !== b.score) {
          return options?.reverse ? b.score - a.score : a.score - b.score;
        }
        return options?.reverse
          ? b.member.localeCompare(a.member)
          : a.member.localeCompare(b.member);
      });
      const startIdx = typeof start === 'number' ? start : 0;
      const endIdx = typeof stop === 'number' ? stop : entries.length - 1;
      const normalizedEnd = endIdx < 0 ? entries.length + endIdx : endIdx;
      return entries.slice(Math.max(0, startIdx), normalizedEnd + 1);
    },
  };
}
