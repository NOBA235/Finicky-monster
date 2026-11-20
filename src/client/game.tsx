import './index.css';

import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  DailyHistoryEntry,
  GameInitResponse,
  LoadChallengeResponse,
  MenagerieResident,
  PlayerProfile,
  PublicChallenge,
} from '../shared/api.ts';
import type { GameSessionState, RevealPayload } from '../shared/engine/session.ts';
import { CommunityChallengesView } from './components/CommunityChallengesView.tsx';
import { CreateMonsterView } from './components/CreateMonsterView.tsx';
import { DailyArchiveDialog } from './components/DailyArchiveDialog.tsx';
import { DiscoverView } from './components/DiscoverView.tsx';
import { MenagerieView } from './components/MenagerieView.tsx';
import { ModalDialog } from './components/ModalDialog.tsx';
import { soundEngine } from './utils/sound.ts';
import { trackAppReady, trackInteraction } from './utils/telemetry.ts';

type TabKey = 'discover' | 'challenges' | 'create' | 'menagerie';

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switchingChallenge, setSwitchingChallenge] = useState(false);

  const [subredditName, setSubredditName] = useState('finicky');
  const [todayDayKey, setTodayDayKey] = useState('');
  const [activeChallenge, setActiveChallenge] = useState<PublicChallenge | null>(null);
  const [session, setSession] = useState<GameSessionState | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [menagerie, setMenagerie] = useState<readonly MenagerieResident[]>([]);
  const [dailyHistory, setDailyHistory] = useState<readonly DailyHistoryEntry[]>([]);

  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [showHelp, setShowHelp] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [initTick, setInitTick] = useState(0);

  const retryInit = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setInitTick((n) => n + 1);
  }, []);

  useEffect(() => {
    trackAppReady();
    let active = true;
    const run = async () => {
      try {
        const res = await fetch('/api/init');
        const data: GameInitResponse | { status: 'error'; message: string } = await res.json();
        if (!res.ok || 'status' in data) {
          throw new Error('message' in data ? data.message : 'Unable to load FINICKY.');
        }
        if (!active) return;
        setSubredditName(data.subredditName);
        setTodayDayKey(data.todayDayKey);
        setActiveChallenge(data.activeChallenge);
        setSession(data.session);
        setReveal(data.reveal);
        setProfile(data.profile);
        setMenagerie(data.menagerie);
        setDailyHistory(data.dailyHistory);
        trackInteraction('monster_encountered', data.activeChallenge.kind);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to connect to FINICKY server.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [initTick]);

  const loadSpecificChallenge = useCallback(async (challengeId: string) => {
    setSwitchingChallenge(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/challenge/${encodeURIComponent(challengeId)}`);
      const data: LoadChallengeResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Could not open challenge.');
      }
      setActiveChallenge(data.challenge);
      setSession(data.session);
      setReveal(data.reveal);
      setActiveTab('discover');
      trackInteraction('monster_encountered', data.challenge.kind);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load monster.');
    } finally {
      setSwitchingChallenge(false);
    }
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
    if (!next) soundEngine.playTap();
  };

  const todayId = todayDayKey ? `daily:${todayDayKey}` : '';
  const isViewingTodayDaily = activeChallenge?.id === todayId;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main-content" className="visually-hidden">
        Skip to main content
      </a>

      {/* Warm Storybook Header */}
      <header className="sticky top-0 z-20 border-b-2 border-[#dfd0b8] bg-[#faf4e8]/95 backdrop-blur-xs">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h1
              className="finicky-title font-bold text-[#2b2118] leading-none"
              style={{ fontSize: 'clamp(1.25rem, 1rem + 1.1vw, 1.65rem)' }}
            >
              FINICKY
            </h1>
            {profile && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#e7b236] bg-[#fdf4db] px-2.5 py-0.5 text-xs font-extrabold text-[#7c5308]">
                🔥 {profile.streak}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {!isViewingTodayDaily && todayId && activeTab === 'discover' && (
              <button
                type="button"
                onClick={() => void loadSpecificChallenge(todayId)}
                className="rounded-xl border-2 border-[#3f8a52] bg-[#e6f4e9] px-2.5 py-1 text-xs font-extrabold text-[#1f592d] hover:bg-[#d6ecd9] cursor-pointer"
              >
                Today’s Daily
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowArchive(true)}
              aria-label="Open Daily Monster Archive"
              className="touch-target rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-1 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              📅 Archive
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
              className="touch-target rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-1 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="How to play FINICKY"
              className="touch-target rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-3 py-1 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              ? Rules
            </button>
          </div>
        </div>

        {/* Primary 4-Pillar Navigation */}
        <nav aria-label="Primary" className="max-w-5xl mx-auto px-3 sm:px-5 pb-2.5">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { key: 'discover' as const, label: 'Discover', icon: '🔍', count: null },
              { key: 'challenges' as const, label: 'Community', icon: '🧩', count: null },
              { key: 'create' as const, label: 'Create', icon: '🎨', count: null },
              {
                key: 'menagerie' as const,
                label: 'Menagerie',
                icon: '🌿',
                count: menagerie.length,
              },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    soundEngine.playTap();
                    setActiveTab(tab.key);
                  }}
                  className={`touch-target rounded-xl border-2 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-extrabold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight ${
                    active
                      ? 'border-[#2b2118] bg-[#2b2118] text-[#fffdf8] shadow-[0_2px_0_#68584a]'
                      : 'border-[#dfd0b8] bg-[#fffdf8] text-[#2b2118] hover:border-[#2b2118]'
                  }`}
                >
                  <span aria-hidden="true" className="text-sm sm:text-base leading-none">
                    {tab.icon}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                          active ? 'bg-[#f0bc3a] text-[#2b2118]' : 'bg-[#f2e8d5] text-[#68584a]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 pt-4">
        {loading && (
          <div className="paper-card p-10 text-center flex flex-col items-center gap-3">
            <p className="finicky-title text-xl font-bold text-[#2b2118]">
              Waking up today’s monster...
            </p>
            <p className="text-sm text-[#68584a]">Setting out 21 fresh snacks on the tasting bench.</p>
          </div>
        )}

        {!loading && loadError && (
          <div
            role="alert"
            className="paper-card p-6 text-center flex flex-col items-center gap-3 border-[#df5a49]"
          >
            <p className="finicky-title text-lg font-bold text-[#9e2b1e]">
              Something went sideways in the kitchen
            </p>
            <p className="text-sm text-[#68584a]">{loadError}</p>
            <button
              type="button"
              onClick={retryInit}
              className="tactile-btn bg-[#2b2118] text-white px-5 py-2 text-sm cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !loadError && switchingChallenge && (
          <div className="paper-card p-8 text-center text-sm font-bold text-[#68584a]">
            Preparing the next monster’s snack tray...
          </div>
        )}

        {!loading && !loadError && !switchingChallenge && activeTab === 'discover' && activeChallenge && session && (
          <DiscoverView
            key={activeChallenge.id}
            challenge={activeChallenge}
            session={session}
            reveal={reveal}
            onSessionUpdated={(next) => setSession(next)}
            onExamCompleted={(payload) => {
              setSession(payload.session);
              setReveal(payload.reveal);
              setProfile(payload.profile);
              setMenagerie(payload.menagerie);
              setDailyHistory(payload.dailyHistory);
              setActiveChallenge((prev) =>
                prev ? { ...prev, stats: payload.stats } : prev
              );
            }}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {!loading && !loadError && !switchingChallenge && activeTab === 'challenges' && (
          <CommunityChallengesView
            subredditName={subredditName}
            onPlayChallenge={(id) => void loadSpecificChallenge(id)}
            onGoCreate={() => setActiveTab('create')}
          />
        )}

        {!loading && !loadError && !switchingChallenge && activeTab === 'create' && (
          <CreateMonsterView
            onPublished={(id) => {
              void loadSpecificChallenge(id);
            }}
          />
        )}

        {!loading && !loadError && !switchingChallenge && activeTab === 'menagerie' && profile && (
          <MenagerieView
            profile={profile}
            menagerie={menagerie}
            dailyHistory={dailyHistory}
            onPlayDaily={(dayKey) => void loadSpecificChallenge(`daily:${dayKey}`)}
            onOpenArchive={() => setShowArchive(true)}
            onGoDiscover={() => {
              if (todayId && !isViewingTodayDaily) {
                void loadSpecificChallenge(todayId);
              } else {
                setActiveTab('discover');
              }
            }}
          />
        )}
      </main>

      <DailyArchiveDialog
        open={showArchive}
        activeChallengeId={activeChallenge?.id}
        onClose={() => setShowArchive(false)}
        onSelectDay={(dayKey) => void loadSpecificChallenge(`daily:${dayKey}`)}
      />

      {/* How to Play Native <dialog> */}
      <ModalDialog open={showHelp} onClose={() => setShowHelp(false)} title="How to Play FINICKY">
        <ol className="list-decimal pl-5 flex flex-col gap-2.5 text-sm text-[#2b2118]">
          <li>
            <strong>Every snack has 3 visible traits:</strong> Shape (Circle, Square, Triangle),
            Color (Red, Blue, Yellow), and Pattern (Striped, Spotted, Plain) — 27 snacks in total.
          </li>
          <li>
            <strong>Run scientific experiments:</strong> Feed snacks from the 21-snack bench to
            watch whether the monster joyfully munches or dramatically rejects each one.
          </li>
          <li>
            <strong>Form your hypothesis:</strong> Use the visual rule chips to state what you think
            the monster secretly likes (for example, “Circles that are not striped” or “Triangles,
            or spotted squares”).
          </li>
          <li>
            <strong>Pass the Unseen Final Exam:</strong> Predict Yum or Yuck on 6 brand-new sealed
            snacks! Get all 6 right to welcome the monster into your Menagerie.
          </li>
          <li>
            <strong>Create &amp; Certify:</strong> Design your own monster in the Create tab. Our
            deterministic <em>Fairness Certificate</em> checks over 1,000 competing rules to verify
            your puzzle is fair and solvable before Reddit plays it!
          </li>
        </ol>
      </ModalDialog>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
