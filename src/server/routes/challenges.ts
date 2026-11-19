import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  ApiErrorResponse,
  CommunityChallengesResponse,
  CreateChallengeResponse,
  ValidateRuleResponse,
} from '../../shared/api.ts';
import { certifyChallenge } from '../../shared/engine/fairness.ts';
import {
  sanitizeMonsterName,
  sanitizePersonality,
  validateMonsterAppearance,
} from '../../shared/engine/monsters.ts';
import { ruleToNaturalLanguage, validateRuleNode } from '../../shared/engine/rules.ts';
import { createCommunityChallengePost } from '../core/post.ts';
import {
  attachPostIdToChallenge,
  getMenagerie,
  listCommunityChallenges,
  listCreatorAnalytics,
  saveCommunityChallenge,
  toPublicChallenge,
  type StoredCommunityChallenge,
} from '../storage/redisStore.ts';

export const challengeRoutes = new Hono();

async function getActor(): Promise<{ readonly userId: string; readonly username: string }> {
  const userId = context.userId ?? context.loid ?? 'anonymous';
  let username = context.username;
  if (!username) {
    try {
      username = await reddit.getCurrentUsername();
    } catch {
      username = undefined;
    }
  }
  return {
    userId,
    username: username ?? 'MonsterMaker',
  };
}

function generateChallengeId(nowMs: number): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `ch_${nowMs.toString(36)}_${randomPart}`;
}

challengeRoutes.post('/validate', async (c) => {
  try {
    const body = await c.req.json<{ rule?: unknown }>();
    const report = certifyChallenge({
      rule: body.rule,
      mode: 'community',
    });
    const parsed = validateRuleNode(body.rule);
    const ruleText = parsed.valid ? ruleToNaturalLanguage(parsed.rule) : 'Incomplete or invalid rule';

    return c.json<ValidateRuleResponse>({
      report,
      ruleText,
    });
  } catch (error) {
    console.error('POST /api/challenges/validate error:', error);
    return c.json<ApiErrorResponse>({ status: 'error', message: 'Rule validation failed.' }, 400);
  }
});

challengeRoutes.get('/', async (c) => {
  try {
    const actor = await getActor();
    const [challenges, myCreated, menagerie] = await Promise.all([
      listCommunityChallenges(redis, 24),
      listCreatorAnalytics(redis, actor.userId),
      getMenagerie(redis, actor.userId),
    ]);

    return c.json<CommunityChallengesResponse>({
      challenges,
      myCreated,
      solvedIds: menagerie.map((entry) => entry.challengeId),
    });
  } catch (error) {
    console.error('GET /api/challenges error:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Failed to load community challenges.' },
      500
    );
  }
});

challengeRoutes.post('/create', async (c) => {
  try {
    const body = await c.req.json<{
      name?: unknown;
      personality?: unknown;
      habitatNote?: unknown;
      appearance?: unknown;
      rule?: unknown;
      publishAsPost?: unknown;
      asUser?: unknown;
    }>();

    const name = typeof body.name === 'string' ? sanitizeMonsterName(body.name) : '';
    if (name.length < 2) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Give your monster a name (at least 2 characters).' },
        400
      );
    }

    const personality =
      typeof body.personality === 'string' ? sanitizePersonality(body.personality) : '';
    if (personality.length < 6) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Add a short personality blurb (at least 6 characters).' },
        400
      );
    }

    const habitatNote =
      typeof body.habitatNote === 'string' && sanitizePersonality(body.habitatNote).length > 0
        ? sanitizePersonality(body.habitatNote)
        : `Hand-crafted by a fellow detective in r/${context.subredditName ?? 'finicky'}.`;

    const appearance = validateMonsterAppearance(body.appearance);
    if (!appearance) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Invalid monster appearance configuration.' },
        400
      );
    }

    const parsedRule = validateRuleNode(body.rule);
    if (!parsedRule.valid) {
      return c.json<ApiErrorResponse>({ status: 'error', message: parsedRule.error }, 400);
    }

    const report = certifyChallenge({
      rule: parsedRule.rule,
      mode: 'community',
    });

    if (report.verdict !== 'fair_verified') {
      return c.json<ApiErrorResponse>(
        {
          status: 'error',
          message: `Fairness Certificate required before publishing (${report.verdict.replace('_', ' ')}): ${report.summary}`,
        },
        400
      );
    }

    const actor = await getActor();
    const nowMs = Date.now();
    const challengeId = generateChallengeId(nowMs);

    let stored: StoredCommunityChallenge = {
      id: challengeId,
      kind: 'community',
      name,
      personality,
      habitatNote,
      creatorUserId: actor.userId,
      creatorUsername: actor.username,
      createdAt: nowMs,
      appearance,
      rule: parsedRule.rule,
      fairness: report,
    };

    await saveCommunityChallenge(redis, stored);

    let createdPostUrl: string | undefined;
    let postCreationNote: string | undefined;

    if (body.publishAsPost === true && context.subredditName) {
      try {
        const post = await createCommunityChallengePost({
          challengeId,
          monsterName: name,
          personality,
          creatorUsername: actor.username,
          fairnessScore: report.score,
          asUser: body.asUser === true,
        });
        const updated = await attachPostIdToChallenge(redis, challengeId, post.id);
        if (updated) {
          stored = updated;
        }
        createdPostUrl = `https://reddit.com/r/${context.subredditName}/comments/${post.id}`;
      } catch (postError) {
        console.warn('Optional subreddit post creation failed:', postError);
        postCreationNote =
          'Your monster is live in the Community Challenges hub! (Creating a separate Reddit feed post was unavailable right now.)';
      }
    }

    const publicChallenge = toPublicChallenge(
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
      {
        attempts: 0,
        solves: 0,
        solveRatePct: 0,
        avgExperiments: 0,
        exactDeductions: 0,
      },
      {
        ...(stored.postId !== undefined ? { postId: stored.postId } : {}),
        createdAt: stored.createdAt,
      }
    );

    return c.json<CreateChallengeResponse>(
      {
        challenge: publicChallenge,
        report,
        ...(createdPostUrl !== undefined ? { createdPostUrl } : {}),
        ...(postCreationNote !== undefined ? { postCreationNote } : {}),
      },
      201
    );
  } catch (error) {
    console.error('POST /api/challenges/create error:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Failed to publish monster challenge.' },
      500
    );
  }
});
