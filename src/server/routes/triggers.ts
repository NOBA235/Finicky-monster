import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createHubPost } from '../core/post.ts';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createHubPost();
    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `FINICKY post created in r/${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('Error creating initial FINICKY post:', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create initial FINICKY post',
      },
      400
    );
  }
});
