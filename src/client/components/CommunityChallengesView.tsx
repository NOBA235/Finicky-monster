import { useCallback, useEffect, useState } from 'react';
import { navigateTo } from '@devvit/web/client';
import type {
  CommunityChallengesResponse,
  CreatorChallengeAnalytics,
  PublicChallenge,
} from '../../shared/api.ts';
import { getSnackById } from '../../shared/engine/snacks.ts';
import { MonsterIllustration } from './MonsterIllustration.tsx';
import { SnackIllustration } from './SnackIllustration.tsx';

type CommunityChallengesViewProps = {
  readonly subredditName: string;
  readonly onPlayChallenge: (challengeId: string) => void;
  readonly onGoCreate: () => void;
};

export function CommunityChallengesView({
  subredditName,
  onPlayChallenge,
  onGoCreate,
}: CommunityChallengesViewProps) {
  const [subTab, setSubTab] = useState<'explore' | 'mine'>('explore');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<readonly PublicChallenge[]>([]);
  const [myCreated, setMyCreated] = useState<readonly CreatorChallengeAnalytics[]>([]);
  const [solvedIds, setSolvedIds] = useState<ReadonlySet<string>>(new Set());

  const [refreshTick, setRefreshTick] = useState(0);

  const triggerRefresh = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch('/api/challenges');
        const data: CommunityChallengesResponse | { status: 'error'; message: string } =
          await res.json();
        if (!res.ok || 'status' in data) {
          throw new Error('message' in data ? data.message : 'Failed to load challenges.');
        }
        if (!active) return;
        setChallenges(data.challenges);
        setMyCreated(data.myCreated);
        setSolvedIds(new Set(data.solvedIds));
      } catch (err) {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Could not load community challenges.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [refreshTick]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="paper-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="finicky-title text-xl sm:text-2xl font-bold text-[#2b2118]">
            Community Challenges
          </h2>
          <p className="text-xs sm:text-sm text-[#68584a]">
            Every player-created monster here earned a deterministic Fairness Certificate.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] p-1 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setSubTab('explore')}
              aria-pressed={subTab === 'explore'}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${
                subTab === 'explore' ? 'bg-[#2b2118] text-white' : 'text-[#68584a]'
              }`}
            >
              Explore ({challenges.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('mine')}
              aria-pressed={subTab === 'mine'}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${
                subTab === 'mine' ? 'bg-[#794e8a] text-white' : 'text-[#68584a]'
              }`}
            >
              My Creations ({myCreated.length})
            </button>
          </div>
          <button
            type="button"
            onClick={triggerRefresh}
            aria-label="Refresh challenges"
            className="touch-target rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-3 py-1.5 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
          >
            ↻
          </button>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-[#df5a49] bg-[#fdebe8] px-4 py-3 text-sm font-bold text-[#9e2b1e]"
        >
          {errorMsg}
        </div>
      )}

      {loading && (
        <div className="paper-card p-8 text-center text-sm font-bold text-[#68584a]">
          Gathering verified community monsters...
        </div>
      )}

      {/* EXPLORE COMMUNITY CHALLENGES */}
      {!loading && subTab === 'explore' && (
        <>
          {challenges.length === 0 ? (
            <div className="paper-card p-8 text-center flex flex-col items-center gap-3">
              <p className="finicky-title text-xl font-bold text-[#2b2118]">
                No Community Monsters Yet!
              </p>
              <p className="text-sm text-[#68584a] max-w-md">
                Be the first puzzle designer in r/{subredditName} to invent a monster, pass the
                Fairness Certificate, and challenge fellow Redditors.
              </p>
              <button
                type="button"
                onClick={onGoCreate}
                className="tactile-btn bg-[#794e8a] text-white px-5 py-2.5 text-sm cursor-pointer"
              >
                Create the First Monster →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {challenges.map((ch) => {
                const isSolved = solvedIds.has(ch.id);
                return (
                  <article
                    key={ch.id}
                    className="paper-card p-4 flex items-center gap-3.5 justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MonsterIllustration
                        appearance={ch.appearance}
                        mood={isSolved ? 'celebrate' : 'idle'}
                        size={82}
                        name={ch.name}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-[#3f8a52] bg-[#e6f4e9] px-2 py-0.5 text-[10px] font-extrabold text-[#1f592d]">
                            ✓ Fair {ch.fairnessBadge.score}
                          </span>
                          <span className="rounded-full border border-[#dfd0b8] bg-[#faf4e8] px-2 py-0.5 text-[10px] font-extrabold capitalize text-[#68584a]">
                            {ch.fairnessBadge.difficulty}
                          </span>
                          {isSolved && (
                            <span className="rounded-full bg-[#f0bc3a] px-2 py-0.5 text-[10px] font-black text-[#2b2118]">
                              Collected
                            </span>
                          )}
                        </div>
                        <h3 className="finicky-title text-lg font-bold text-[#2b2118] truncate mt-0.5">
                          {ch.name}
                        </h3>
                        <p className="text-xs text-[#68584a] line-clamp-2">{ch.personality}</p>
                        <p className="text-[11px] font-bold text-[#68584a] mt-1">
                          by u/{ch.creatorUsername ?? 'Redditor'} · {ch.stats.solves}/
                          {ch.stats.attempts} solved
                          {ch.stats.attempts > 0 ? ` (${ch.stats.solveRatePct}%)` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onPlayChallenge(ch.id)}
                      className="tactile-btn bg-[#2b2118] text-[#fffdf8] px-3.5 py-2 text-xs shrink-0 cursor-pointer"
                    >
                      {isSolved ? 'Review' : 'Play →'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CREATOR ANALYTICS DASHBOARD */}
      {!loading && subTab === 'mine' && (
        <>
          {myCreated.length === 0 ? (
            <div className="paper-card p-8 text-center flex flex-col items-center gap-3">
              <p className="finicky-title text-xl font-bold text-[#2b2118]">
                You Haven’t Created a Monster Yet
              </p>
              <p className="text-sm text-[#68584a] max-w-md">
                Publish a Fairness-Certified monster to track how many Redditors attempt it, solve
                rate, average tests, most confusing snacks, and common wrong assumptions!
              </p>
              <button
                type="button"
                onClick={onGoCreate}
                className="tactile-btn bg-[#794e8a] text-white px-5 py-2.5 text-sm cursor-pointer"
              >
                Open Monster Studio →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myCreated.map((item) => (
                <article key={item.challengeId} className="paper-card p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MonsterIllustration
                        appearance={item.appearance}
                        mood="idle"
                        size={74}
                        name={item.name}
                      />
                      <div>
                        <h3 className="finicky-title text-xl font-bold text-[#2b2118]">
                          {item.name}
                        </h3>
                        <p className="text-xs font-extrabold text-[#794e8a]">
                          Secret Rule: {item.ruleText}
                        </p>
                        <p className="text-[11px] font-bold text-[#1f592d]">
                          ✓ Fairness Certified {item.fairnessBadge.score}/100 (
                          {item.fairnessBadge.difficulty})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.postId && (
                        <button
                          type="button"
                          onClick={() =>
                            navigateTo(
                              `https://reddit.com/r/${subredditName}/comments/${item.postId}`
                            )
                          }
                          className="rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] px-3 py-1.5 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
                        >
                          Reddit Post ↗
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onPlayChallenge(item.challengeId)}
                        className="rounded-xl border-2 border-[#2b2118] bg-[#fffdf8] px-3 py-1.5 text-xs font-extrabold text-[#2b2118] hover:bg-[#faf4e8] cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  </div>

                  {/* Creator Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="paper-card-inset p-2.5">
                      <p className="text-[11px] font-bold text-[#68584a]">Attempts</p>
                      <p className="text-lg font-black text-[#2b2118]">{item.attempts}</p>
                    </div>
                    <div className="paper-card-inset p-2.5">
                      <p className="text-[11px] font-bold text-[#68584a]">Solved</p>
                      <p className="text-lg font-black text-[#1f592d]">
                        {item.solves} ({item.solveRatePct}%)
                      </p>
                    </div>
                    <div className="paper-card-inset p-2.5">
                      <p className="text-[11px] font-bold text-[#68584a]">Avg Tests</p>
                      <p className="text-lg font-black text-[#2b2118]">
                        {item.attempts > 0 ? item.avgExperiments : '—'}
                      </p>
                    </div>
                    <div className="paper-card-inset p-2.5">
                      <p className="text-[11px] font-bold text-[#68584a]">Exact Rules</p>
                      <p className="text-lg font-black text-[#794e8a]">{item.exactDeductions}</p>
                    </div>
                  </div>

                  {/* Confusion & Wrong Assumptions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-[#dfd0b8] bg-[#faf4e8] p-3">
                      <p className="font-extrabold uppercase tracking-wide text-[#68584a] mb-2">
                        Most Confusing Exam Snacks
                      </p>
                      {item.confusingSnacks.length === 0 ? (
                        <p className="text-[#68584a] italic">No missed exam snacks recorded yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {item.confusingSnacks.map((c) => {
                            const snack = getSnackById(c.snackId);
                            if (!snack) return null;
                            return (
                              <li key={c.snackId} className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 font-bold text-[#2b2118]">
                                  <SnackIllustration snack={snack} size={22} decorative />
                                  {snack.label}
                                </span>
                                <span className="font-extrabold text-[#9e2b1e]">
                                  {c.misses} miss{c.misses === 1 ? '' : 'es'}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#dfd0b8] bg-[#faf4e8] p-3">
                      <p className="font-extrabold uppercase tracking-wide text-[#68584a] mb-2">
                        Common Wrong Assumptions
                      </p>
                      {item.commonWrongHypotheses.length === 0 ? (
                        <p className="text-[#68584a] italic">No wrong theories recorded yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {item.commonWrongHypotheses.map((w) => (
                            <li key={w.hypothesis} className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[#2b2118] truncate">
                                “{w.hypothesis}”
                              </span>
                              <span className="font-extrabold text-[#794e8a] shrink-0">
                                ×{w.count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
