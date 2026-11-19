import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  ApiErrorResponse,
  DailyArchiveItem,
  DailyArchiveResponse,
  ExamSubmitResponse,
  ExperimentResponse,
  GameInitResponse,
  HypothesisResponse,
  LoadChallengeResponse,
  ShareCommentResponse,
  SplashResponse,
} from '../../shared/api.ts';
import {
  formatUtcDayKey,
  getDailyChallengeForDayKey,
  getRecentDailyArchiveKeys,
  isValidDayKey,
} from '../../shared/engine/dailyCatalog.ts';
import {
  applyExamSubmission,
  applyExperiment,
  applyHypothesis,
  buildRevealPayload,
} from '../../shared/engine/session.ts';
import { isSnackId } from '../../shared/engine/snacks.ts';
import {
  getChallengeStats,
  getDailyHistory,
  getMenagerie,
  getOrCreateSession,
  getPlayerProfile,
  recordCompletion,
  resolveChallengeDefinition,
  saveSession,
  toPublicChallenge,
} from '../storage/redisStore.ts';

export const gameRoutes = new Hono();

async function getActor(): Promise<{ readonly userId: string; readonly username: string }> {
  const rawUserId = context.userId ?? context.loid ?? 'anonymous';
  let username = context.username;
  if (!username) {
    try {
      username = await reddit.getCurrentUsername();
    } catch {
      username = undefined;
    }
  }
  return {
    userId: rawUserId,
    username: username ?? 'CuriousExplorer',
  };
}

function getPostBinding(): { readonly postMode: 'daily' | 'challenge'; readonly challengeId: string } {
  const postData = context.postData;
  const todayKey = formatUtcDayKey(new Date());

  if (postData && typeof postData === 'object') {
    const mode = postData['postMode'];
    const challengeId = postData['challengeId'];
    const dayKey = postData['dayKey'];

    if (mode === 'challenge' && typeof challengeId === 'string' && challengeId.length > 0) {
      return { postMode: 'challenge', challengeId };
    }
    if (typeof dayKey === 'string' && isValidDayKey(dayKey)) {
      return { postMode: 'daily', challengeId: `daily:${dayKey}` };
    }
  }

  return { postMode: 'daily', challengeId: `daily:${todayKey}` };
}

gameRoutes.get('/splash', async (c) => {
  try {
    const actor = await getActor();
    const binding = getPostBinding();
    let resolved = await resolveChallengeDefinition(redis, binding.challengeId);
    let postMode: 'daily' | 'challenge' = binding.postMode;

    if (!resolved) {
      const todayKey = formatUtcDayKey(new Date());
      const daily = getDailyChallengeForDayKey(todayKey);
      resolved = await resolveChallengeDefinition(redis, daily.id);
      postMode = 'daily';
    }

    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Unable to load monster.' }, 500);
    }

    const [stats, session] = await Promise.all([
      getChallengeStats(redis, resolved.def.id),
      getOrCreateSession(redis, actor.userId, resolved.def.id),
    ]);

    return c.json<SplashResponse>({
      postMode,
      challengeId: resolved.def.id,
      monsterName: resolved.def.name,
      personality: resolved.def.personality,
      appearance: resolved.def.appearance,
      ...(resolved.def.dayNumber !== undefined ? { dayNumber: resolved.def.dayNumber } : {}),
      ...(resolved.def.dayKey !== undefined ? { dayKey: resolved.def.dayKey } : {}),
      ...(resolved.def.creatorUsername !== undefined
        ? { creatorUsername: resolved.def.creatorUsername }
        : {}),
      difficulty: resolved.def.fairness.difficulty,
      fairnessScore: resolved.def.fairness.score,
      attempts: stats.attempts,
      solves: stats.solves,
      alreadySolved: session.phase === 'revealed' && session.solved === true,
      username: actor.username,
    });
  } catch (error) {
    console.error('GET /api/splash error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Failed to load splash view.' }, 500);
  }
});

gameRoutes.get('/init', async (c) => {
  try {
    const actor = await getActor();
    const todayDayKey = formatUtcDayKey(new Date());
    const binding = getPostBinding();
    const requestedId = c.req.query('challengeId');

    const targetId = requestedId && requestedId.trim().length > 0 ? requestedId.trim() : binding.challengeId;
    let resolved = await resolveChallengeDefinition(redis, targetId);
    let postMode: 'daily' | 'challenge' = targetId.startsWith('daily:') ? 'daily' : 'challenge';

    if (!resolved) {
      resolved = await resolveChallengeDefinition(redis, `daily:${todayDayKey}`);
      postMode = 'daily';
    }

    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Monster not found.' }, 404);
    }

    const [stats, session, profile, menagerie, dailyHistory] = await Promise.all([
      getChallengeStats(redis, resolved.def.id),
      getOrCreateSession(redis, actor.userId, resolved.def.id),
      getPlayerProfile(redis, actor.userId, actor.username),
      getMenagerie(redis, actor.userId),
      getDailyHistory(redis, actor.userId),
    ]);

    const reveal = session.phase === 'revealed' ? buildRevealPayload(resolved.def, session) : null;

    return c.json<GameInitResponse>({
      postId: context.postId ?? 'local',
      subredditName: context.subredditName ?? 'finicky',
      postMode,
      activeChallenge: toPublicChallenge(resolved.def, stats, {
        ...(resolved.postId !== undefined ? { postId: resolved.postId } : {}),
        ...(resolved.createdAt !== undefined ? { createdAt: resolved.createdAt } : {}),
      }),
      session,
      reveal,
      profile,
      menagerie,
      dailyHistory,
      todayDayKey,
    });
  } catch (error) {
    console.error('GET /api/init error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Failed to initialize FINICKY.' }, 500);
  }
});

gameRoutes.get('/daily-archive', async (c) => {
  try {
    const actor = await getActor();
    const todayDayKey = formatUtcDayKey(new Date());
    const keys = getRecentDailyArchiveKeys(todayDayKey, 14);

    const items: DailyArchiveItem[] = await Promise.all(
      keys.map(async (dayKey) => {
        const daily = getDailyChallengeForDayKey(dayKey);
        const session = await getOrCreateSession(redis, actor.userId, daily.id);
        const status: DailyArchiveItem['status'] =
          session.phase === 'revealed'
            ? session.solved
              ? 'solved'
              : 'missed'
            : session.experiments.length > 0
              ? 'in_progress'
              : 'unplayed';

        return {
          id: daily.id,
          dayKey: daily.dayKey,
          dayNumber: daily.dayNumber,
          name: daily.name,
          personality: daily.personality,
          appearance: daily.appearance,
          difficulty: daily.fairness.difficulty,
          fairnessScore: daily.fairness.score,
          isToday: dayKey === todayDayKey,
          status,
        };
      })
    );

    return c.json<DailyArchiveResponse>({
      todayDayKey,
      items,
    });
  } catch (error) {
    console.error('GET /api/daily-archive error:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Failed to load daily archive.' },
      500
    );
  }
});

gameRoutes.get('/challenge/:id', async (c) => {
  try {
    const challengeId = decodeURIComponent(c.req.param('id'));
    const resolved = await resolveChallengeDefinition(redis, challengeId);
    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Challenge not found.' }, 404);
    }

    const actor = await getActor();
    const [stats, session] = await Promise.all([
      getChallengeStats(redis, resolved.def.id),
      getOrCreateSession(redis, actor.userId, resolved.def.id),
    ]);

    const reveal = session.phase === 'revealed' ? buildRevealPayload(resolved.def, session) : null;

    return c.json<LoadChallengeResponse>({
      challenge: toPublicChallenge(resolved.def, stats, {
        ...(resolved.postId !== undefined ? { postId: resolved.postId } : {}),
        ...(resolved.createdAt !== undefined ? { createdAt: resolved.createdAt } : {}),
      }),
      session,
      reveal,
    });
  } catch (error) {
    console.error('GET /api/challenge/:id error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Failed to load challenge.' }, 500);
  }
});

gameRoutes.post('/session/experiment', async (c) => {
  try {
    const body = await c.req.json<{ challengeId?: unknown; snackId?: unknown }>();
    if (typeof body.challengeId !== 'string' || typeof body.snackId !== 'string') {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Missing challengeId or snackId.' }, 400);
    }
    if (!isSnackId(body.snackId)) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Invalid snackId.' }, 400);
    }

    const resolved = await resolveChallengeDefinition(redis, body.challengeId);
    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Challenge not found.' }, 404);
    }

    const actor = await getActor();
    const session = await getOrCreateSession(redis, actor.userId, resolved.def.id);
    const result = applyExperiment(resolved.def, session, body.snackId);

    if (!result.ok) {
      return c.json<ApiErrorResponse>({ status: 'error', message: result.error }, 400);
    }

    await saveSession(redis, actor.userId, result.session);

    return c.json<ExperimentResponse>({
      session: result.session,
      record: result.record,
      remainingExperiments: result.remainingExperiments,
    });
  } catch (error) {
    console.error('POST /api/session/experiment error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Experiment failed.' }, 500);
  }
});

gameRoutes.post('/session/hypothesis', async (c) => {
  try {
    const body = await c.req.json<{ challengeId?: unknown; hypothesisRule?: unknown }>();
    if (typeof body.challengeId !== 'string') {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Missing challengeId.' }, 400);
    }

    const resolved = await resolveChallengeDefinition(redis, body.challengeId);
    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Challenge not found.' }, 404);
    }

    const actor = await getActor();
    const session = await getOrCreateSession(redis, actor.userId, resolved.def.id);
    const result = applyHypothesis(resolved.def, session, body.hypothesisRule);

    if (!result.ok) {
      return c.json<ApiErrorResponse>({ status: 'error', message: result.error }, 400);
    }

    await saveSession(redis, actor.userId, result.session);

    return c.json<HypothesisResponse>({
      session: result.session,
      consistentWithEvidence: result.consistentWithEvidence,
      contradictions: result.contradictions,
    });
  } catch (error) {
    console.error('POST /api/session/hypothesis error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Failed to submit hypothesis.' }, 500);
  }
});

gameRoutes.post('/session/exam', async (c) => {
  try {
    const body = await c.req.json<{
      challengeId?: unknown;
      predictions?: unknown;
    }>();

    if (
      typeof body.challengeId !== 'string' ||
      typeof body.predictions !== 'object' ||
      body.predictions === null ||
      Array.isArray(body.predictions)
    ) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Missing challengeId or predictions.' },
        400
      );
    }

    const predictions: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(body.predictions)) {
      if (typeof val === 'boolean') {
        predictions[key] = val;
      }
    }

    const resolved = await resolveChallengeDefinition(redis, body.challengeId);
    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Challenge not found.' }, 404);
    }

    const actor = await getActor();
    const session = await getOrCreateSession(redis, actor.userId, resolved.def.id);
    const nowMs = Date.now();
    const graded = applyExamSubmission(resolved.def, session, predictions, nowMs);

    if (!graded.ok) {
      return c.json<ApiErrorResponse>({ status: 'error', message: graded.error }, 400);
    }

    const outcome = await recordCompletion(redis, {
      userId: actor.userId,
      username: actor.username,
      challenge: resolved.def,
      session: graded.session,
      solved: graded.reveal.solved,
      exactDeduction: graded.reveal.exactDeduction,
      examCorrectCount: graded.reveal.examCorrectCount,
      confusedSnackIds: graded.confusedSnackIds,
      nowMs,
    });

    return c.json<ExamSubmitResponse>({
      session: graded.session,
      reveal: graded.reveal,
      profile: outcome.profile,
      menagerie: outcome.menagerie,
      dailyHistory: outcome.dailyHistory,
      stats: outcome.stats,
      newlyAddedToMenagerie: outcome.newlyAddedToMenagerie,
    });
  } catch (error) {
    console.error('POST /api/session/exam error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Failed to grade examination.' }, 500);
  }
});

gameRoutes.post('/share-comment', async (c) => {
  try {
    const postId = context.postId;
    if (!postId) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'No Reddit post context available for commenting.' },
        400
      );
    }

    const body = await c.req.json<{ challengeId?: unknown; asUser?: unknown }>();
    if (typeof body.challengeId !== 'string') {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Missing challengeId.' }, 400);
    }

    const resolved = await resolveChallengeDefinition(redis, body.challengeId);
    if (!resolved) {
      return c.json<ApiErrorResponse>({ status: 'error', message: 'Challenge not found.' }, 404);
    }

    const actor = await getActor();
    const session = await getOrCreateSession(redis, actor.userId, resolved.def.id);
    if (session.phase !== 'revealed') {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Complete the investigation before sharing your result!' },
        400
      );
    }

    const reveal = buildRevealPayload(resolved.def, session);
    const commentBody = `**${reveal.shareText.replace(/\n/g, '  \n')}**\n\n*(Spoiler-free result card — no secret rule revealed!)*`;
    const wantsUser = body.asUser === true;

    if (wantsUser) {
      try {
        const comment = await reddit.submitComment({
          id: postId,
          text: commentBody,
          runAs: 'USER',
        });
        return c.json<ShareCommentResponse>({
          ok: true,
          commentUrl: comment.url,
          postedAs: 'USER',
        });
      } catch (err) {
        console.warn('submitComment as USER failed, falling back to APP:', err);
      }
    }

    const fallbackBody = `u/${actor.username} shared a FINICKY result:\n\n${commentBody}`;
    const comment = await reddit.submitComment({
      id: postId,
      text: fallbackBody,
      runAs: 'APP',
    });

    return c.json<ShareCommentResponse>({
      ok: true,
      commentUrl: comment.url,
      postedAs: 'APP',
    });
  } catch (error) {
    console.error('POST /api/share-comment error:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Could not post comment right now. Use Copy Result instead!' },
      400
    );
  }
});
