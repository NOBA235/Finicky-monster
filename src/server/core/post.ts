import { context, reddit } from '@devvit/web/server';
import { getTodayDailyChallenge } from '../../shared/engine/dailyCatalog.ts';

export async function createDailyPost(dayKey?: string) {
  const daily = getTodayDailyChallenge();
  const targetDayKey = dayKey ?? daily.dayKey;
  const title = `FINICKY Daily #${daily.dayNumber}: Meet ${daily.name} — Can you figure out what it likes?`;

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title,
    entry: 'default',
    postData: {
      postMode: 'daily',
      dayKey: targetDayKey,
    },
    textFallback: {
      text: `FINICKY Daily #${daily.dayNumber} — ${daily.name}: "${daily.personality}" Open this post on Reddit to experiment with snacks and deduce its secret food rule!`,
    },
  });
}

export async function createHubPost() {
  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'FINICKY — Every monster has a secret. Can you figure out what it likes?',
    entry: 'default',
    postData: {
      postMode: 'daily',
    },
    textFallback: {
      text: 'Play FINICKY on Reddit! Feed snacks to mysterious monsters, deduce their hidden rules, collect them in your Menagerie, and create Fairness-Certified challenges for the community.',
    },
  });
}

export async function createCommunityChallengePost(params: {
  readonly challengeId: string;
  readonly monsterName: string;
  readonly personality: string;
  readonly creatorUsername: string;
  readonly fairnessScore: number;
  readonly asUser: boolean;
}) {
  const title = `FINICKY Challenge: ${params.monsterName} (by u/${params.creatorUsername}) — Can you crack its secret taste?`;
  const fallbackText = `Player-created FINICKY Challenge by u/${params.creatorUsername} — ${params.monsterName}: "${params.personality}" (Fairness Certified ${params.fairnessScore}/100). Open this interactive post to test snacks and deduce the secret rule!`;

  if (params.asUser) {
    try {
      return await reddit.submitCustomPost({
        subredditName: context.subredditName,
        title,
        entry: 'default',
        runAs: 'USER',
        userGeneratedContent: {
          text: `${params.monsterName}: ${params.personality}`,
        },
        postData: {
          postMode: 'challenge',
          challengeId: params.challengeId,
        },
        textFallback: {
          text: fallbackText,
        },
      });
    } catch (error) {
      console.warn('submitCustomPost as USER unavailable, falling back to APP:', error);
    }
  }

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title,
    entry: 'default',
    postData: {
      postMode: 'challenge',
      challengeId: params.challengeId,
    },
    textFallback: {
      text: fallbackText,
    },
  });
}
