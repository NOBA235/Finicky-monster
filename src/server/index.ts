import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { challengeRoutes } from './routes/challenges.ts';
import { gameRoutes } from './routes/game.ts';
import { menu } from './routes/menu.ts';
import { telemetryRoutes } from './routes/telemetry.ts';
import { triggers } from './routes/triggers.ts';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);

app.route('/api', gameRoutes);
app.route('/api/challenges', challengeRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
