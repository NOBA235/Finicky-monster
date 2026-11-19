import type {
  ChallengeStatsSummary,
  MenagerieResident,
  PlayerProfile,
} from '../api.ts';

export type CreatorBadgeTier =
  | 'gold_architect'
  | 'clever_riddler'
  | 'verified_maker'
  | 'brutal_stumper';

export type CreatorRecognition = {
  readonly tier: CreatorBadgeTier;
  readonly label: string;
  readonly icon: string;
  readonly note: string;
};

export type CollectionMilestone = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly unlocked: boolean;
  readonly progressText: string;
};

/**
 * Rewards clever, fair, solvable puzzle design — NOT impossible challenges.
 */
export function evaluateCreatorRecognition(
  fairnessScore: number,
  stats: ChallengeStatsSummary
): CreatorRecognition {
  if (stats.attempts >= 5 && stats.solveRatePct < 15) {
    return {
      tier: 'brutal_stumper',
      label: 'Ultra-Tricky',
      icon: '⚡',
      note: 'Very few players cracked this one — inspect Confusing Snacks below!',
    };
  }

  if (
    fairnessScore >= 85 &&
    stats.attempts >= 3 &&
    stats.solveRatePct >= 30 &&
    stats.solveRatePct <= 85
  ) {
    return {
      tier: 'gold_architect',
      label: 'Gold Puzzle Designer',
      icon: '🏆',
      note: 'High fairness score and ideal community solve balance (30–85%).',
    };
  }

  if (fairnessScore >= 75 && stats.solves >= 1) {
    return {
      tier: 'clever_riddler',
      label: 'Clever Riddler',
      icon: '★',
      note: 'Fair, solvable, and already solved by fellow Redditors!',
    };
  }

  return {
    tier: 'verified_maker',
    label: 'Certified Maker',
    icon: '✓',
    note: 'Verified fair and unambiguous by the Fairness Certificate Engine.',
  };
}

export function computeCollectionMilestones(
  profile: PlayerProfile,
  menagerie: readonly MenagerieResident[]
): readonly CollectionMilestone[] {
  const collected = menagerie.length;
  const communityCollected = menagerie.filter((m) => m.kind === 'community').length;

  return [
    {
      id: 'first-friend',
      title: 'First Friend',
      description: 'Understand and welcome your first monster into the Menagerie.',
      icon: '🌱',
      unlocked: collected >= 1,
      progressText: `${Math.min(collected, 1)}/1`,
    },
    {
      id: 'sharp-mind',
      title: 'Sharp Mind',
      description: 'Deduce a monster’s exact secret rule before the Final Exam.',
      icon: '🔎',
      unlocked: profile.exactDeductions >= 1,
      progressText: `${Math.min(profile.exactDeductions, 1)}/1`,
    },
    {
      id: 'daily-regular',
      title: 'Daily Regular',
      description: 'Reach a 3-day official Daily Monster streak.',
      icon: '🔥',
      unlocked: profile.bestStreak >= 3,
      progressText: `${Math.min(profile.bestStreak, 3)}/3`,
    },
    {
      id: 'community-sleuth',
      title: 'Community Sleuth',
      description: 'Solve a Fairness-Certified monster made by another Redditor.',
      icon: '🧩',
      unlocked: communityCollected >= 1,
      progressText: `${Math.min(communityCollected, 1)}/1`,
    },
    {
      id: 'puzzle-architect',
      title: 'Puzzle Architect',
      description: 'Design and publish a Fairness-Certified monster challenge.',
      icon: '🎨',
      unlocked: profile.createdCount >= 1,
      progressText: `${Math.min(profile.createdCount, 1)}/1`,
    },
    {
      id: 'curious-collector',
      title: 'Curious Collector',
      description: 'Gather 5 distinct monsters in your sanctuary.',
      icon: '🌿',
      unlocked: collected >= 5,
      progressText: `${Math.min(collected, 5)}/5`,
    },
  ];
}
