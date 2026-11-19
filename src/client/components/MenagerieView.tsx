import { useMemo, useState } from 'react';
import type {
  DailyHistoryEntry,
  MenagerieResident,
  PlayerProfile,
} from '../../shared/api.ts';
import type { MonsterMood } from '../../shared/engine/monsters.ts';
import { computeCollectionMilestones } from '../../shared/engine/recognition.ts';
import { SNACK_UNIVERSE, getSnackById } from '../../shared/engine/snacks.ts';
import { soundEngine } from '../utils/sound.ts';
import { ModalDialog } from './ModalDialog.tsx';
import { MonsterIllustration } from './MonsterIllustration.tsx';
import { SnackIllustration } from './SnackIllustration.tsx';

type MenagerieViewProps = {
  readonly profile: PlayerProfile;
  readonly menagerie: readonly MenagerieResident[];
  readonly dailyHistory: readonly DailyHistoryEntry[];
  readonly onPlayDaily: (dayKey: string) => void;
  readonly onGoDiscover: () => void;
  readonly onOpenArchive: () => void;
};

function getDetectiveTitle(totalSolved: number): string {
  if (totalSolved >= 20) return 'Grand Taste Archivist';
  if (totalSolved >= 10) return 'Senior Snackologist';
  if (totalSolved >= 5) return 'Curious Naturalist';
  if (totalSolved >= 1) return 'Apprentice Sleuth';
  return 'New Explorer';
}

export function MenagerieView({
  profile,
  menagerie,
  dailyHistory,
  onPlayDaily,
  onGoDiscover,
  onOpenArchive,
}: MenagerieViewProps) {
  const [selectedResident, setSelectedResident] = useState<MenagerieResident | null>(null);
  const [residentMood, setResidentMood] = useState<MonsterMood>('idle');
  const [treatCount, setTreatCount] = useState(0);

  const milestones = useMemo(
    () => computeCollectionMilestones(profile, menagerie),
    [profile, menagerie]
  );

  const unlockedCount = milestones.filter((m) => m.unlocked).length;

  const selectedFavoriteSnack = useMemo(() => {
    if (!selectedResident) return null;
    if (selectedResident.favoriteSnackId) {
      const found = getSnackById(selectedResident.favoriteSnackId);
      if (found) return found;
    }
    return SNACK_UNIVERSE[0] ?? null;
  }, [selectedResident]);

  const handleOpenResident = (resident: MenagerieResident) => {
    soundEngine.playTap();
    setSelectedResident(resident);
    setResidentMood('idle');
    setTreatCount(0);
  };

  const handleOfferTreat = () => {
    soundEngine.playAccept();
    setResidentMood('accept');
    setTreatCount((c) => c + 1);
    window.setTimeout(() => {
      setResidentMood('celebrate');
    }, 550);
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Detective Profile & Streak Banner */}
      <section className="paper-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#dfd0b8] bg-[#faf4e8] px-2.5 py-0.5 text-[11px] font-extrabold text-[#794e8a]">
              {getDetectiveTitle(profile.totalSolved)}
            </span>
            <h2 className="finicky-title text-xl sm:text-2xl font-bold text-[#2b2118] mt-1">
              u/{profile.username}’s Living Menagerie
            </h2>
          </div>
          <div className="rounded-2xl border-2 border-[#e7b236] bg-[#fdf4db] px-4 py-2 text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#7c5308]">
              Daily Streak
            </p>
            <p className="text-2xl font-black text-[#2b2118] leading-tight">
              🔥 {profile.streak}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="paper-card-inset p-2.5">
            <p className="text-[11px] font-bold text-[#68584a]">Collected</p>
            <p className="text-lg font-black text-[#2b2118]">{menagerie.length}</p>
          </div>
          <div className="paper-card-inset p-2.5">
            <p className="text-[11px] font-bold text-[#68584a]">Best Streak</p>
            <p className="text-lg font-black text-[#2b2118]">{profile.bestStreak}</p>
          </div>
          <div className="paper-card-inset p-2.5">
            <p className="text-[11px] font-bold text-[#68584a]">Exact Rules</p>
            <p className="text-lg font-black text-[#1f592d]">{profile.exactDeductions}</p>
          </div>
          <div className="paper-card-inset p-2.5">
            <p className="text-[11px] font-bold text-[#68584a]">Created</p>
            <p className="text-lg font-black text-[#794e8a]">{profile.createdCount}</p>
          </div>
        </div>
      </section>

      {/* Illustrated Sanctuary Meadow */}
      <section className="paper-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="finicky-title text-lg font-bold text-[#2b2118]">
            Sanctuary Residents ({menagerie.length})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#68584a]">Tap any resident to visit</span>
            <button
              type="button"
              onClick={onOpenArchive}
              className="rounded-xl border border-[#dfd0b8] bg-[#faf4e8] px-2.5 py-1 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              📅 Past Dailies
            </button>
          </div>
        </div>

        {menagerie.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#c7b69a] bg-[#faf4e8] p-8 text-center flex flex-col items-center gap-3">
            <p className="finicky-title text-lg font-bold text-[#2b2118]">
              Your Meadow Is Quiet... For Now
            </p>
            <p className="text-sm text-[#68584a] max-w-sm">
              Solve today’s Daily Monster or a Community Challenge by passing its unseen Final Exam,
              and it will move right into your Menagerie!
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onGoDiscover}
                className="tactile-btn bg-[#3f8a52] text-white px-5 py-2 text-sm cursor-pointer"
              >
                Meet Today’s Monster →
              </button>
              <button
                type="button"
                onClick={onOpenArchive}
                className="rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-4 py-2 text-sm font-bold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
              >
                Browse Daily Archive
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-[#b7d3b0] bg-[#edf5ea] p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {menagerie.map((resident) => (
              <button
                key={resident.challengeId}
                type="button"
                onClick={() => handleOpenResident(resident)}
                className="rounded-2xl border-2 border-[#c8dac2] bg-[#fffdf8] p-3 flex flex-col items-center text-center gap-1.5 hover:border-[#2b2118] hover:-translate-y-0.5 hover:shadow-[0_3px_0_#2b2118] transition-all cursor-pointer"
              >
                <MonsterIllustration
                  appearance={resident.appearance}
                  mood="idle"
                  size={86}
                  name={resident.name}
                  decorative
                />
                <span className="finicky-title text-base font-bold text-[#2b2118]">
                  {resident.name}
                </span>
                <span className="text-[11px] font-bold text-[#68584a]">
                  {resident.kind === 'daily' && resident.dayNumber !== undefined
                    ? `Daily #${resident.dayNumber}`
                    : `by u/${resident.creatorUsername ?? 'Redditor'}`}
                </span>
                {resident.exactDeduction && (
                  <span className="rounded-full bg-[#fdf4db] border border-[#e7b236] px-2 py-0.5 text-[10px] font-extrabold text-[#7c5308]">
                    ★ Exact Rule
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Collection Milestones Wax Seals */}
      <section className="paper-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="finicky-title text-lg font-bold text-[#2b2118]">
            Sanctuary Milestones
          </h3>
          <span className="text-xs font-extrabold text-[#794e8a]">
            {unlockedCount} / {milestones.length} unlocked
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {milestones.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border-2 p-3 flex flex-col gap-1 ${
                m.unlocked
                  ? 'border-[#e7b236] bg-[#fdf4db]'
                  : 'border-[#dfd0b8] bg-[#faf4e8] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-lg" aria-hidden="true">
                  {m.icon}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    m.unlocked
                      ? 'bg-[#3f8a52] text-white'
                      : 'bg-[#e3d5bf] text-[#68584a]'
                  }`}
                >
                  {m.unlocked ? 'Earned' : m.progressText}
                </span>
              </div>
              <p className="text-xs font-extrabold text-[#2b2118]">{m.title}</p>
              <p className="text-[11px] text-[#68584a] leading-snug">{m.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Daily Challenge History */}
      {dailyHistory.length > 0 && (
        <section className="paper-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="finicky-title text-lg font-bold text-[#2b2118]">
              Daily Investigation Log
            </h3>
            <button
              type="button"
              onClick={onOpenArchive}
              className="text-xs font-extrabold text-[#794e8a] underline cursor-pointer"
            >
              Open Full Archive
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {dailyHistory.slice(0, 10).map((entry) => (
              <li
                key={entry.dayKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dfd0b8] bg-[#faf4e8] px-3.5 py-2 text-xs"
              >
                <div>
                  <span className="font-extrabold text-[#2b2118]">
                    Day #{entry.dayNumber} · {entry.monsterName}
                  </span>{' '}
                  <span className="text-[#68584a]">({entry.dayKey})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-extrabold ${
                      entry.solved
                        ? 'bg-[#e6f4e9] text-[#1f592d]'
                        : 'bg-[#fdebe8] text-[#9e2b1e]'
                    }`}
                  >
                    {entry.solved
                      ? `Solved · ${entry.experimentsUsed} tests`
                      : `Exam ${entry.examCorrectCount}/6`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlayDaily(entry.dayKey)}
                    className="font-extrabold text-[#794e8a] underline cursor-pointer"
                  >
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Resident Inspector Native <dialog> with Interactive Favorite Treat */}
      <ModalDialog
        open={selectedResident !== null}
        onClose={() => setSelectedResident(null)}
        title={selectedResident ? selectedResident.name : 'Resident'}
      >
        {selectedResident && (
          <div className="flex flex-col items-center text-center gap-3">
            <MonsterIllustration
              appearance={selectedResident.appearance}
              mood={residentMood}
              size={148}
              name={selectedResident.name}
            />
            <p className="text-sm font-semibold text-[#2b2118]">{selectedResident.personality}</p>
            <p className="text-xs italic text-[#68584a]">“{selectedResident.habitatNote}”</p>

            {selectedFavoriteSnack && (
              <button
                type="button"
                onClick={handleOfferTreat}
                className="tactile-btn bg-[#e6f4e9] text-[#1f592d] px-4 py-2 text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <SnackIllustration snack={selectedFavoriteSnack} size={26} decorative />
                <span>
                  {treatCount === 0
                    ? `Offer Favorite Treat (${selectedFavoriteSnack.label})`
                    : `Happy Munch! ×${treatCount} — Offer Another`}
                </span>
              </button>
            )}

            <div className="w-full paper-card-inset p-3 text-left">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#68584a]">
                Favorite Food Rule
              </p>
              <p className="text-base font-extrabold text-[#1f592d] mt-0.5">
                {selectedResident.ruleText}
              </p>
            </div>

            <dl className="w-full grid grid-cols-2 gap-2 text-xs text-left">
              <div className="rounded-xl border border-[#dfd0b8] bg-[#fffdf8] p-2.5">
                <dt className="font-bold text-[#68584a]">Discovered</dt>
                <dd className="font-extrabold text-[#2b2118]">
                  {new Date(selectedResident.discoveredAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="rounded-xl border border-[#dfd0b8] bg-[#fffdf8] p-2.5">
                <dt className="font-bold text-[#68584a]">Experiments Used</dt>
                <dd className="font-extrabold text-[#2b2118]">
                  {selectedResident.experimentsUsed}{' '}
                  {selectedResident.exactDeduction ? '(★ Exact Rule)' : ''}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
