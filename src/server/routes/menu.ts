import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDailyPost, createHubPost } from '../core/post.ts';

export const menu = new Hono();

menu.post('/post-daily', async (c) => {
  try {
    const post = await createDailyPost();
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error('Error creating daily FINICKY post:', error);
    return c.json<UiResponse>({ showToast: 'Failed to create daily FINICKY post' }, 400);
  }
});

menu.post('/post-hub', async (c) => {
  try {
    const post = await createHubPost();
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error('Error creating FINICKY hub post:', error);
    return c.json<UiResponse>({ showToast: 'Failed to create FINICKY hub post' }, 400);
  }
});
