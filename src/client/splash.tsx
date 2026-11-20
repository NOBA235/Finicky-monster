import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import type { SplashResponse } from '../shared/api.ts';
import { getTodayDailyChallenge } from '../shared/engine/dailyCatalog.ts';
import { SNACK_UNIVERSE } from '../shared/engine/snacks.ts';
import { MonsterIllustration } from './components/MonsterIllustration.tsx';
import { SnackIllustration } from './components/SnackIllustration.tsx';
import { trackAppReady } from './utils/telemetry.ts';

const previewSnacks = [SNACK_UNIVERSE[0], SNACK_UNIVERSE[13], SNACK_UNIVERSE[26]];

export function Splash() {
  const fallbackDaily = getTodayDailyChallenge();
  const [data, setData] = useState<SplashResponse>({
    postMode: 'daily',
    challengeId: fallbackDaily.id,
    monsterName: fallbackDaily.name,
    personality: fallbackDaily.personality,
    appearance: fallbackDaily.appearance,
    dayNumber: fallbackDaily.dayNumber,
    dayKey: fallbackDaily.dayKey,
    difficulty: fallbackDaily.fairness.difficulty,
    fairnessScore: fallbackDaily.fairness.score,
    attempts: 0,
    solves: 0,
    alreadySolved: false,
    username: 'Explorer',
  });

  useEffect(() => {
    trackAppReady();
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/splash');
        if (!res.ok) return;
        const json: SplashResponse = await res.json();
        if (active && json.monsterName) {
          setData(json);
        }
      } catch {
        // Keep deterministic daily preview if offline/local
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4">
      <div className="paper-card max-w-md w-full px-4 py-4 sm:p-5 flex flex-col items-center text-center gap-2.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full border border-[#dfd0b8] bg-[#faf4e8] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#68584a]">
            {data.postMode === 'challenge'
              ? `Community Challenge · u/${data.creatorUsername ?? 'Redditor'}`
              : `Daily Puzzle #${data.dayNumber ?? 1}`}
          </span>
          <span className="rounded-full border border-[#3f8a52] bg-[#e6f4e9] px-2.5 py-0.5 text-[11px] font-extrabold text-[#1f592d]">
            ✓ Fairness {data.fairnessScore}/100
          </span>
        </div>

        <h1
          className="finicky-title font-bold text-[#2b2118] leading-tight"
          style={{ fontSize: 'clamp(1.5rem, 1.15rem + 1.8vw, 2.15rem)' }}
        >
          FINICKY
        </h1>
        <p className="text-xs sm:text-sm font-bold text-[#794e8a] -mt-1">
          Every monster has a secret. Can you figure out what it likes?
        </p>

        <div className="relative flex items-center justify-center gap-3">
          {previewSnacks[0] && (
            <div className="-rotate-12 hidden sm:block">
              <SnackIllustration snack={previewSnacks[0]} size={40} decorative />
            </div>
          )}
          <MonsterIllustration
            appearance={data.appearance}
            mood={data.alreadySolved ? 'celebrate' : 'curious'}
            size={132}
            name={data.monsterName}
          />
          {previewSnacks[1] && (
            <div className="rotate-12 hidden sm:block">
              <SnackIllustration snack={previewSnacks[1]} size={40} decorative />
            </div>
          )}
        </div>

        <div>
          <p className="finicky-title text-lg sm:text-xl font-bold text-[#2b2118]">
            Meet {data.monsterName}
          </p>
          <p className="text-xs sm:text-sm text-[#68584a] max-w-xs mx-auto mt-0.5 line-clamp-2">
            {data.personality}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
          className="tactile-btn bg-[#df5a49] text-white px-7 py-2.5 text-sm sm:text-base w-full sm:w-auto cursor-pointer mt-0.5"
        >
          {data.alreadySolved ? 'Open Menagerie & Results →' : 'Investigate Monster →'}
        </button>

        <p className="text-[11px] font-bold text-[#68584a]">
          {data.attempts > 0
            ? `${data.solves} of ${data.attempts} Redditors solved this monster`
            : 'Feed snacks · Deduce the hidden rule · Create your own!'}
        </p>
      </div>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
