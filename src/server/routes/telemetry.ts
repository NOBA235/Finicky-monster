import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import {
  TELEMETRY_JOURNEY_ENDPOINTS,
  TELEMETRY_UNSPECIFIED_RECEIPT,
  type TelemetryJourneyEndRequest,
  type TelemetryJourneyEventResponse,
  type TelemetryJourneyInteractionRequest,
  type TelemetryJourneyProgressRequest,
  type TelemetryJourneyStartResponse,
} from '@devvit/analytics/shared/reddit';

export const telemetryRoutes = new Hono();

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.appReady, async (c) => {
  try {
    const res = await telemetry.appReady();
    return c.json<TelemetryJourneyEventResponse>(res, 200);
  } catch (error) {
    console.warn('Telemetry appReady failed:', error);
    return c.json<TelemetryJourneyEventResponse>(
      { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.start, async (c) => {
  try {
    const res = await telemetry.startJourney();
    return c.json<TelemetryJourneyStartResponse>(res, 200);
  } catch (error) {
    console.warn('Telemetry startJourney failed:', error);
    return c.json<TelemetryJourneyStartResponse>(
      { journeyId: '', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.progress, async (c) => {
  try {
    const body = await c.req.json<Partial<TelemetryJourneyProgressRequest>>();
    if (typeof body.journeyId !== 'string' || typeof body.progress !== 'number') {
      return c.json<TelemetryJourneyEventResponse>(
        { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
        400
      );
    }
    const clampedProgress = Math.max(0, Math.min(1, body.progress));
    const res = await telemetry.journeyProgress({
      journeyId: body.journeyId,
      progress: clampedProgress,
      action: typeof body.action === 'string' ? body.action.slice(0, 64) : '',
      actionDetails: typeof body.actionDetails === 'string' ? body.actionDetails.slice(0, 128) : '',
    });
    return c.json<TelemetryJourneyEventResponse>(res, 200);
  } catch (error) {
    console.warn('Telemetry journeyProgress failed:', error);
    return c.json<TelemetryJourneyEventResponse>(
      { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.interaction, async (c) => {
  try {
    const body = await c.req.json<Partial<TelemetryJourneyInteractionRequest>>();
    if (typeof body.action !== 'string' || body.action.trim().length === 0) {
      return c.json<TelemetryJourneyEventResponse>(
        { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
        400
      );
    }
    const res = await telemetry.journeyInteraction({
      journeyId: typeof body.journeyId === 'string' ? body.journeyId : '',
      action: body.action.slice(0, 64),
      actionDetails: typeof body.actionDetails === 'string' ? body.actionDetails.slice(0, 128) : '',
    });
    return c.json<TelemetryJourneyEventResponse>(res, 200);
  } catch (error) {
    console.warn('Telemetry journeyInteraction failed:', error);
    return c.json<TelemetryJourneyEventResponse>(
      { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.end, async (c) => {
  try {
    const body = await c.req.json<Partial<TelemetryJourneyEndRequest>>();
    if (typeof body.journeyId !== 'string') {
      return c.json<TelemetryJourneyEventResponse>(
        { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
        400
      );
    }
    const res = await telemetry.endJourney({
      journeyId: body.journeyId,
      complete: typeof body.complete === 'boolean' ? body.complete : true,
      ...(body.game &&
      typeof body.game.win === 'boolean' &&
      typeof body.game.score === 'number'
        ? { game: { win: body.game.win, score: body.game.score } }
        : {}),
    });
    return c.json<TelemetryJourneyEventResponse>(res, 200);
  } catch (error) {
    console.warn('Telemetry endJourney failed:', error);
    return c.json<TelemetryJourneyEventResponse>(
      { receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});
