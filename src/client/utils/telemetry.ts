import { telemetry } from '@devvit/analytics/client/reddit';

export type FinickyJourneyEvent =
  | 'daily_game_opened'
  | 'monster_encountered'
  | 'experiment_performed'
  | 'hypothesis_submitted'
  | 'monster_solved'
  | 'daily_challenge_completed'
  | 'monster_creation_started'
  | 'monster_created'
  | 'challenge_attempted'
  | 'challenge_completed';

let readySent = false;

export function trackAppReady(): void {
  if (readySent) return;
  readySent = true;
  void telemetry.appReady().catch(() => undefined);
}

export async function beginFinickyJourney(action: FinickyJourneyEvent, details?: string): Promise<void> {
  try {
    if (!telemetry.getActiveJourneyId()) {
      await telemetry.startJourney();
    }
    await telemetry.interaction({
      action,
      ...(details !== undefined ? { actionDetails: details.slice(0, 100) } : {}),
    });
  } catch {
    // Telemetry is non-blocking; never disrupt gameplay
  }
}

export function trackInteraction(action: FinickyJourneyEvent, details?: string): void {
  void telemetry
    .interaction({
      action,
      ...(details !== undefined ? { actionDetails: details.slice(0, 100) } : {}),
    })
    .catch(() => undefined);
}

export function trackProgress(
  progress: number,
  action: FinickyJourneyEvent,
  details?: string
): void {
  if (!telemetry.getActiveJourneyId()) {
    trackInteraction(action, details);
    return;
  }
  void telemetry
    .progress({
      progress: Math.max(0, Math.min(1, progress)),
      action,
      ...(details !== undefined ? { actionDetails: details.slice(0, 100) } : {}),
    })
    .catch(() => undefined);
}

export function trackJourneyComplete(win: boolean, score: number): void {
  if (!telemetry.getActiveJourneyId()) return;
  void telemetry
    .endJourney({
      complete: true,
      game: { win, score },
    })
    .catch(() => undefined);
}
