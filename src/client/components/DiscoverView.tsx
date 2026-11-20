import { useMemo, useState, type MouseEvent } from 'react';
import { canRunAsUser, showShareSheet, showToast } from '@devvit/web/client';
import type {
  DailyHistoryEntry,
  ExamSubmitResponse,
  ExperimentResponse,
  HypothesisResponse,
  MenagerieResident,
  PlayerProfile,
  PublicChallenge,
  ShareCommentResponse,
} from '../../shared/api.ts';
import type { MonsterMood } from '../../shared/engine/monsters.ts';
import {
  compileVisualRuleDraft,
  createEmptyVisualClause,
  evaluateRule,
  type VisualRuleDraft,
} from '../../shared/engine/rules.ts';
import type { GameSessionState, RevealPayload } from '../../shared/engine/session.ts';
import {
  COLORS,
  PATTERNS,
  SHAPES,
  getSnackById,
  type Color,
  type Pattern,
  type Shape,
  type Snack,
  type SnackId,
} from '../../shared/engine/snacks.ts';
import { soundEngine } from '../utils/sound.ts';
import {
  beginFinickyJourney,
  trackInteraction,
  trackJourneyComplete,
  trackProgress,
} from '../utils/telemetry.ts';
import { ModalDialog } from './ModalDialog.tsx';
import { MonsterIllustration } from './MonsterIllustration.tsx';
import { RuleBuilder } from './RuleBuilder.tsx';
import { SnackIllustration } from './SnackIllustration.tsx';

type DiscoverViewProps = {
  readonly challenge: PublicChallenge;
  readonly session: GameSessionState;
  readonly reveal: RevealPayload | null;
  readonly onSessionUpdated: (next: GameSessionState) => void;
  readonly onExamCompleted: (payload: {
    readonly session: GameSessionState;
    readonly reveal: RevealPayload;
    readonly profile: PlayerProfile;
    readonly menagerie: readonly MenagerieResident[];
    readonly dailyHistory: readonly DailyHistoryEntry[];
    readonly stats: PublicChallenge['stats'];
    readonly newlyAddedToMenagerie: boolean;
  }) => void;
  readonly onNavigateTab: (tab: 'discover' | 'challenges' | 'create' | 'menagerie') => void;
};

export function DiscoverView({
  challenge,
  session,
  reveal,
  onSessionUpdated,
  onExamCompleted,
  onNavigateTab,
}: DiscoverViewProps) {
  const [mood, setMood] = useState<MonsterMood>(
    reveal ? (reveal.solved ? 'celebrate' : 'confused') : 'idle'
  );
  const [speechBubble, setSpeechBubble] = useState<string>(
    reveal
      ? reveal.solved
        ? `Aha! You figured me out: "${reveal.trueRuleText}"!`
        : `Tricky, right? My secret was: "${reveal.trueRuleText}".`
      : `Feed me a snack from the tray and watch how I react!`
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  // Filter state for Experiment Bench
  const [shapeFilter, setShapeFilter] = useState<Shape | 'all'>('all');
  const [colorFilter, setColorFilter] = useState<Color | 'all'>('all');
  const [patternFilter, setPatternFilter] = useState<Pattern | 'all'>('all');

  // Phase 2: Hypothesis builder local draft & explicit toggle between experiment and hypothesis
  const [showHypothesisStage, setShowHypothesisStage] = useState(session.phase === 'hypothesis');
  const [hypothesisDraft, setHypothesisDraft] = useState<VisualRuleDraft>({
    clauses: [createEmptyVisualClause()],
  });
  const [contradictionWarning, setContradictionWarning] = useState<readonly SnackId[]>([]);

  // Phase 3: Unseen Final Examination predictions
  const [examPredictions, setExamPredictions] = useState<Record<string, boolean>>({});
  const [showExamEvidence, setShowExamEvidence] = useState(false);

  // Share state
  const [postingComment, setPostingComment] = useState(false);
  const [commentPosted, setCommentPosted] = useState(false);

  const lastExperiment =
    session.experiments.length > 0
      ? session.experiments[session.experiments.length - 1]
      : undefined;
  const lastTestedSnack = lastExperiment ? getSnackById(lastExperiment.snackId) : undefined;

  const budget = challenge.fairnessBadge.experimentBudget;
  const remainingExperiments = Math.max(0, budget - session.experiments.length);

  const testedMap = useMemo(() => {
    const map = new Map<SnackId, boolean>();
    for (const exp of session.experiments) {
      map.set(exp.snackId, exp.accepted);
    }
    return map;
  }, [session.experiments]);

  const benchSnacks = useMemo(() => {
    const list: Snack[] = [];
    for (const id of challenge.benchSnackIds) {
      const snack = getSnackById(id);
      if (snack) list.push(snack);
    }
    return list;
  }, [challenge.benchSnackIds]);

  const filteredBench = useMemo(() => {
    return benchSnacks.filter((snack) => {
      if (shapeFilter !== 'all' && snack.shape !== shapeFilter) return false;
      if (colorFilter !== 'all' && snack.color !== colorFilter) return false;
      if (patternFilter !== 'all' && snack.pattern !== patternFilter) return false;
      return true;
    });
  }, [benchSnacks, shapeFilter, colorFilter, patternFilter]);

  const examSnacks = useMemo(() => {
    const list: Snack[] = [];
    for (const id of challenge.examSnackIds) {
      const snack = getSnackById(id);
      if (snack) list.push(snack);
    }
    return list;
  }, [challenge.examSnackIds]);

  const acceptedHistory = useMemo(
    () => session.experiments.filter((e) => e.accepted),
    [session.experiments]
  );
  const rejectedHistory = useMemo(
    () => session.experiments.filter((e) => !e.accepted),
    [session.experiments]
  );

  const summarizeTraits = (items: readonly { readonly snackId: SnackId }[]): string | null => {
    if (items.length < 2) return null;
    const counts = new Map<string, number>();
    for (const item of items) {
      const snack = getSnackById(item.snackId);
      if (!snack) continue;
      for (const trait of [snack.color, snack.pattern, snack.shape]) {
        counts.set(trait, (counts.get(trait) ?? 0) + 1);
      }
    }
    const top = Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([trait, n]) => `${trait.charAt(0).toUpperCase() + trait.slice(1)} ×${n}`);
    return top.length > 0 ? top.join(' · ') : null;
  };

  const acceptedTraitSummary = useMemo(
    () => summarizeTraits(acceptedHistory),
    [acceptedHistory]
  );
  const rejectedTraitSummary = useMemo(
    () => summarizeTraits(rejectedHistory),
    [rejectedHistory]
  );

  // Live local consistency check for Hypothesis Builder
  const compiledHypothesis = useMemo(
    () => compileVisualRuleDraft(hypothesisDraft),
    [hypothesisDraft]
  );

  const liveHypothesisContradictions = useMemo(() => {
    if (!compiledHypothesis) return [];
    const conflicts: SnackId[] = [];
    for (const exp of session.experiments) {
      const snack = getSnackById(exp.snackId);
      if (!snack) continue;
      if (evaluateRule(compiledHypothesis, snack) !== exp.accepted) {
        conflicts.push(exp.snackId);
      }
    }
    return conflicts;
  }, [compiledHypothesis, session.experiments]);

  const handleTestSnack = async (snack: Snack) => {
    if (busy || session.phase === 'exam' || session.phase === 'revealed') return;
    if (testedMap.has(snack.id) || remainingExperiments <= 0) return;

    setBusy(true);
    setErrorMsg(null);
    soundEngine.playTap();

    try {
      if (session.experiments.length === 0) {
        await beginFinickyJourney(
          challenge.kind === 'daily' ? 'daily_game_opened' : 'challenge_attempted',
          challenge.kind
        );
      }

      const res = await fetch('/api/session/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id, snackId: snack.id }),
      });
      const data: ExperimentResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Experiment failed');
      }

      onSessionUpdated(data.session);
      setMood(data.record.accepted ? 'accept' : 'reject');
      setSpeechBubble(data.record.reactionLine);

      if (data.record.accepted) soundEngine.playAccept();
      else soundEngine.playReject();

      const progressRatio = Math.min(0.6, (data.session.experiments.length / budget) * 0.6);
      trackProgress(
        progressRatio,
        'experiment_performed',
        data.record.accepted ? 'accept' : 'reject'
      );

      if (data.remainingExperiments === 0) {
        setShowHypothesisStage(true);
      }

      // Gently settle back to idle after reaction pulse
      window.setTimeout(() => {
        setMood((current) => (current === 'accept' || current === 'reject' ? 'idle' : current));
      }, 950);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not test snack.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitHypothesis = async () => {
    if (!compiledHypothesis || busy) return;
    setBusy(true);
    setErrorMsg(null);
    soundEngine.playHypothesis();

    try {
      const res = await fetch('/api/session/hypothesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          hypothesisRule: compiledHypothesis,
        }),
      });
      const data: HypothesisResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Could not submit hypothesis');
      }

      setContradictionWarning(data.contradictions);
      onSessionUpdated(data.session);
      setShowHypothesisStage(false);
      setMood('suspicious');
      setSpeechBubble(
        'Interesting theory! Now prove it on 6 brand-new unseen snacks from the sealed tray.'
      );
      trackProgress(0.75, 'hypothesis_submitted', data.consistentWithEvidence ? 'consistent' : 'mixed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit hypothesis.');
    } finally {
      setBusy(false);
    }
  };

  const handleExamPredict = (snackId: SnackId, value: boolean) => {
    soundEngine.playTap();
    setExamPredictions((prev) => ({ ...prev, [snackId]: value }));
  };

  const allExamAnswered = examSnacks.every((s) => typeof examPredictions[s.id] === 'boolean');

  const handleSubmitExam = async () => {
    if (!allExamAnswered || busy) return;
    setBusy(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/session/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          predictions: examPredictions,
        }),
      });
      const data: ExamSubmitResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Could not grade exam');
      }

      onExamCompleted(data);

      if (data.reveal.solved) {
        setMood('celebrate');
        setSpeechBubble(`Bravo! You cracked my secret and invited me to your Menagerie!`);
        soundEngine.playCelebrate();
        trackInteraction('monster_solved', data.reveal.exactDeduction ? 'exact' : 'exam_only');
      } else {
        setMood('confused');
        setSpeechBubble(`So close! You got ${data.reveal.examCorrectCount}/6 — peek at my real rule below.`);
        soundEngine.playMiss();
      }

      trackProgress(
        1,
        challenge.kind === 'daily' ? 'daily_challenge_completed' : 'challenge_completed',
        data.reveal.solved ? 'solved' : 'missed'
      );
      trackJourneyComplete(data.reveal.solved, data.reveal.examCorrectCount * 100);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not grade final exam.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.shareText);
      showToast('Spoiler-free result copied to clipboard!');
    } catch {
      try {
        await showShareSheet({
          title: `FINICKY — ${challenge.name}`,
          text: reveal.shareText,
        });
      } catch {
        showToast('Result ready to share!');
      }
    }
  };

  const handlePostSpoilerFreeComment = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!reveal || postingComment || commentPosted) return;
    setPostingComment(true);
    try {
      let asUser = false;
      try {
        asUser = await canRunAsUser(e.nativeEvent);
      } catch {
        asUser = false;
      }

      const res = await fetch('/api/share-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id, asUser }),
      });
      const data: ShareCommentResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Could not post comment');
      }
      setCommentPosted(true);
      showToast('Spoiler-free result posted to the Reddit thread!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post comment right now.');
    } finally {
      setPostingComment(false);
    }
  };

  const difficultyStyles: Record<PublicChallenge['fairnessBadge']['difficulty'], string> = {
    gentle: 'bg-[#e6f4e9] text-[#1f592d] border-[#9fd1ab]',
    clever: 'bg-[#e4f1fa] text-[#1e4e76] border-[#9ec6e4]',
    tricky: 'bg-[#fdf4db] text-[#7c5308] border-[#e7cb7a]',
    fiendish: 'bg-[#f2e8f7] text-[#5a3568] border-[#c8a8d8]',
  };

  const phaseStep =
    session.phase === 'revealed'
      ? 4
      : session.phase === 'exam'
        ? 3
        : showHypothesisStage
          ? 2
          : 1;

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Phase Progress Ribbon */}
      <ol
        aria-label="Investigation progress"
        className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-extrabold"
      >
        {[
          { step: 1, short: '1. Test', full: '1. Experiment' },
          { step: 2, short: '2. Theory', full: '2. Theory' },
          { step: 3, short: '3. Exam', full: '3. Unseen Exam' },
          { step: 4, short: '4. Reveal', full: '4. Reveal' },
        ].map((item) => {
          const isCurrent = phaseStep === item.step;
          const isDone = phaseStep > item.step;
          return (
            <li
              key={item.step}
              aria-current={isCurrent ? 'step' : undefined}
              className={`rounded-xl border-2 px-1.5 sm:px-2 py-1.5 transition-colors ${
                isCurrent
                  ? 'border-[#2b2118] bg-[#f0bc3a] text-[#2b2118]'
                  : isDone
                    ? 'border-[#3f8a52] bg-[#e6f4e9] text-[#1f592d]'
                    : 'border-[#dfd0b8] bg-[#fffdf8] text-[#68584a]'
              }`}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.full}</span>
            </li>
          );
        })}
      </ol>

      {/* Monster Stage Card */}
      <section className="paper-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[#dfd0b8] bg-[#faf4e8] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#68584a]">
                {challenge.kind === 'daily' && challenge.dayNumber !== undefined
                  ? `Daily Monster #${challenge.dayNumber}`
                  : `By u/${challenge.creatorUsername ?? 'Redditor'}`}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold capitalize ${
                  difficultyStyles[challenge.fairnessBadge.difficulty]
                }`}
              >
                {challenge.fairnessBadge.difficulty}
              </span>
              <button
                type="button"
                onClick={() => setShowCertModal(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[#3f8a52] bg-[#e6f4e9] px-2.5 py-0.5 text-[11px] font-extrabold text-[#1f592d] hover:bg-[#d4ecd9] cursor-pointer"
              >
                <span>✓ Fairness {challenge.fairnessBadge.score}/100</span>
              </button>
            </div>
            <h2 className="finicky-title text-2xl sm:text-3xl font-bold text-[#2b2118] mt-1">
              {challenge.name}
            </h2>
            <p className="text-sm text-[#68584a] max-w-xl">{challenge.personality}</p>
          </div>

          {/* Experiment Pips */}
          {session.phase !== 'revealed' && (
            <div className="paper-card-inset px-3 py-2 text-right shrink-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#68584a]">
                Tests Left
              </p>
              <p className="text-lg font-extrabold text-[#2b2118] leading-tight">
                {remainingExperiments} <span className="text-xs font-bold text-[#68584a]">/ {budget}</span>
              </p>
              <div className="flex items-center justify-end gap-1 mt-1" aria-hidden="true">
                {Array.from({ length: budget }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-2 h-2 rounded-full border border-[#2b2118] ${
                      idx < remainingExperiments ? 'bg-[#3f8a52]' : 'bg-[#dfd0b8]'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Character + Tasting Plate + Live Speech Bubble */}
        <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl bg-[#faf4e8] border border-[#e3d5bf] px-4 py-3">
          <div className="flex items-end gap-2 shrink-0">
            <MonsterIllustration
              appearance={challenge.appearance}
              mood={mood}
              size={146}
              name={challenge.name}
            />
            {lastTestedSnack && lastExperiment && session.phase !== 'revealed' && (
              <div className="flex flex-col items-center gap-1 pb-2 animate-float-pop">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    lastExperiment.accepted
                      ? 'border-[#3f8a52] bg-[#e6f4e9] text-[#1f592d]'
                      : 'border-[#df5a49] bg-[#fdebe8] text-[#9e2b1e]'
                  }`}
                >
                  {lastExperiment.accepted ? 'Yum! ✓' : 'Blegh! ✕'}
                </span>
                <div className="rounded-full border-2 border-[#dfd0b8] bg-[#fffdf8] p-1.5 shadow-[0_3px_0_#ddd0ba]">
                  <SnackIllustration snack={lastTestedSnack} size={36} decorative />
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 w-full">
            <div
              role="status"
              aria-live="polite"
              className="relative rounded-2xl border-2 border-[#2b2118] bg-[#fffdf8] px-4 py-3 text-sm sm:text-base font-bold text-[#2b2118] shadow-[0_2px_0_#2b2118]"
            >
              “{speechBubble}”
            </div>
            {challenge.stats.attempts > 0 && (
              <p className="text-xs font-semibold text-[#68584a] mt-2">
                Community record: {challenge.stats.solves} solved out of {challenge.stats.attempts}{' '}
                attempts ({challenge.stats.solveRatePct}%)
              </p>
            )}
          </div>
        </div>

        {/* First-time detective tip before any test is run */}
        {session.experiments.length === 0 && session.phase === 'experiment' && (
          <p className="mt-3 rounded-xl border border-[#e7cb7a] bg-[#fdf4db] px-3.5 py-2 text-xs font-bold text-[#7c5308]">
            💡 Detective tip: Every snack has 3 traits — <strong>Shape</strong>,{' '}
            <strong>Color</strong>, and <strong>Pattern</strong>. Feed snacks below to discover the
            hidden rule!
          </p>
        )}

        {/* Evidence Notebook — always visible once >= 1 test is run */}
        {session.experiments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
            <div className="rounded-2xl border-2 border-[#9fd1ab] bg-[#e6f4e9] p-3">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#1f592d]">
                  ✓ Liked Snacks ({acceptedHistory.length})
                </p>
                {acceptedTraitSummary && (
                  <span className="text-[10px] font-extrabold text-[#1f592d] bg-[#fffdf8]/80 rounded-full px-2 py-0.5 border border-[#9fd1ab]">
                    {acceptedTraitSummary}
                  </span>
                )}
              </div>
              {acceptedHistory.length === 0 ? (
                <p className="text-xs text-[#3f6b49] italic">None accepted yet — keep testing!</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {acceptedHistory.map((item) => {
                    const snack = getSnackById(item.snackId);
                    if (!snack) return null;
                    return (
                      <li
                        key={item.snackId}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#9fd1ab] bg-[#fffdf8] px-2 py-1 text-xs font-bold text-[#2b2118]"
                      >
                        <SnackIllustration snack={snack} size={24} decorative />
                        <span>{snack.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border-2 border-[#e9a89f] bg-[#fdebe8] p-3">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#9e2b1e]">
                  ✕ Refused Snacks ({rejectedHistory.length})
                </p>
                {rejectedTraitSummary && (
                  <span className="text-[10px] font-extrabold text-[#9e2b1e] bg-[#fffdf8]/80 rounded-full px-2 py-0.5 border border-[#e9a89f]">
                    {rejectedTraitSummary}
                  </span>
                )}
              </div>
              {rejectedHistory.length === 0 ? (
                <p className="text-xs text-[#9e4c43] italic">None refused yet — test a contrast!</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {rejectedHistory.map((item) => {
                    const snack = getSnackById(item.snackId);
                    if (!snack) return null;
                    return (
                      <li
                        key={item.snackId}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#e9a89f] bg-[#fffdf8] px-2 py-1 text-xs font-bold text-[#2b2118]"
                      >
                        <SnackIllustration snack={snack} size={24} decorative />
                        <span>{snack.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-[#df5a49] bg-[#fdebe8] px-4 py-3 text-sm font-bold text-[#9e2b1e]"
        >
          {errorMsg}
        </div>
      )}

      {/* PHASE 1: EXPERIMENT BENCH */}
      {session.phase !== 'exam' && session.phase !== 'revealed' && !showHypothesisStage && (
        <section className="paper-card p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="finicky-title text-lg font-bold text-[#2b2118]">
                Snack Experiment Bench
              </h3>
              <p className="text-xs sm:text-sm text-[#68584a]">
                Tap any snack to feed {challenge.name}. 6 unseen snacks are sealed for the Final Exam.
              </p>
            </div>
            {session.experiments.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  setShowHypothesisStage(true);
                  setMood('suspicious');
                  setSpeechBubble('Think you spotted my secret? Build your hypothesis!');
                }}
                className="tactile-btn bg-[#794e8a] text-white px-4 py-2 text-sm cursor-pointer"
              >
                I Have a Theory! →
              </button>
            )}
          </div>

          {/* Quick Attribute Filters for Scientific Probing */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#faf4e8] border border-[#e3d5bf] px-3 py-2 text-xs">
            <span className="font-extrabold text-[#68584a] uppercase">Filter:</span>
            <select
              aria-label="Filter snacks by shape"
              value={shapeFilter}
              onChange={(e) => {
                const v = e.target.value;
                setShapeFilter(SHAPES.find((s) => s === v) ?? 'all');
              }}
              className="rounded-lg border border-[#dfd0b8] bg-[#fffdf8] px-2 py-1 font-bold text-[#2b2118]"
            >
              <option value="all">All Shapes</option>
              {SHAPES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}s
                </option>
              ))}
            </select>
            <select
              aria-label="Filter snacks by color"
              value={colorFilter}
              onChange={(e) => {
                const v = e.target.value;
                setColorFilter(COLORS.find((c) => c === v) ?? 'all');
              }}
              className="rounded-lg border border-[#dfd0b8] bg-[#fffdf8] px-2 py-1 font-bold text-[#2b2118]"
            >
              <option value="all">All Colors</option>
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter snacks by pattern"
              value={patternFilter}
              onChange={(e) => {
                const v = e.target.value;
                setPatternFilter(PATTERNS.find((p) => p === v) ?? 'all');
              }}
              className="rounded-lg border border-[#dfd0b8] bg-[#fffdf8] px-2 py-1 font-bold text-[#2b2118]"
            >
              <option value="all">All Patterns</option>
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            {(shapeFilter !== 'all' || colorFilter !== 'all' || patternFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setShapeFilter('all');
                  setColorFilter('all');
                  setPatternFilter('all');
                }}
                className="font-bold text-[#794e8a] underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* 21-Snack Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
            {filteredBench.map((snack) => {
              const testedOutcome = testedMap.get(snack.id);
              const alreadyTested = testedOutcome !== undefined;
              return (
                <button
                  key={snack.id}
                  type="button"
                  disabled={busy || alreadyTested || remainingExperiments <= 0}
                  onMouseEnter={() => {
                    if (!alreadyTested && mood === 'idle') setMood('curious');
                  }}
                  onMouseLeave={() => {
                    if (mood === 'curious') setMood('idle');
                  }}
                  onClick={() => void handleTestSnack(snack)}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center transition-all ${
                    alreadyTested
                      ? testedOutcome
                        ? 'border-[#3f8a52] bg-[#e6f4e9] opacity-85 cursor-default'
                        : 'border-[#df5a49] bg-[#fdebe8] opacity-75 cursor-default'
                      : 'border-[#dfd0b8] bg-[#fffdf8] hover:border-[#2b2118] hover:-translate-y-0.5 hover:shadow-[0_3px_0_#2b2118] cursor-pointer'
                  }`}
                >
                  {alreadyTested && (
                    <span
                      className={`absolute top-1 right-1 text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                        testedOutcome ? 'bg-[#3f8a52] text-white' : 'bg-[#df5a49] text-white'
                      }`}
                    >
                      {testedOutcome ? '✓' : '✕'}
                    </span>
                  )}
                  <SnackIllustration snack={snack} size={46} decorative />
                  <span className="text-[11px] font-bold leading-tight text-[#2b2118]">
                    {snack.color} {snack.pattern}
                  </span>
                  <span className="text-[10px] font-semibold text-[#68584a] capitalize">
                    {snack.shape}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* PHASE 2: HYPOTHESIS BUILDER */}
      {session.phase !== 'exam' && session.phase !== 'revealed' && showHypothesisStage && (
        <section className="paper-card p-4 sm:p-5 flex flex-col gap-4 animate-float-pop">
          <RuleBuilder
            draft={hypothesisDraft}
            onChange={setHypothesisDraft}
            heading={`What is ${challenge.name}'s secret food rule?`}
            helperText="Piece together your theory from the evidence above, then test it on 6 unseen snacks."
          />

          {compiledHypothesis && (
            <div
              className={`rounded-xl border-2 px-3.5 py-2.5 text-xs font-bold flex flex-col gap-2 ${
                liveHypothesisContradictions.length === 0
                  ? 'border-[#3f8a52] bg-[#e6f4e9] text-[#1f592d]'
                  : 'border-[#e7b236] bg-[#fdf4db] text-[#7c5308]'
              }`}
            >
              <p>
                {liveHypothesisContradictions.length === 0
                  ? `✓ Your theory matches all ${session.experiments.length} snack experiment(s) you ran!`
                  : `Heads up: this theory disagrees with ${liveHypothesisContradictions.length} tested snack(s):`}
              </p>
              {liveHypothesisContradictions.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {liveHypothesisContradictions.map((id) => {
                    const snack = getSnackById(id);
                    const actual = testedMap.get(id);
                    if (!snack || actual === undefined) return null;
                    return (
                      <li
                        key={id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e7cb7a] bg-[#fffdf8] px-2 py-0.5 text-[11px] font-bold text-[#2b2118]"
                      >
                        <SnackIllustration snack={snack} size={18} decorative />
                        <span>
                          {snack.label} ({actual ? 'was Liked' : 'was Refused'})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {remainingExperiments > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setShowHypothesisStage(false);
                  setMood('idle');
                }}
                className="rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] px-4 py-2 text-sm font-bold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
              >
                ← Run More Tests ({remainingExperiments} left)
              </button>
            ) : (
              <span className="text-xs font-bold text-[#68584a]">
                All experiments used — time to lock in your theory!
              </span>
            )}

            <button
              type="button"
              disabled={!compiledHypothesis || busy}
              onClick={() => void handleSubmitHypothesis()}
              className="tactile-btn bg-[#3f8a52] text-white px-5 py-2.5 text-sm cursor-pointer"
            >
              {busy ? 'Locking in...' : 'Lock Theory & Open Final Exam →'}
            </button>
          </div>
        </section>
      )}

      {/* PHASE 3: UNSEEN FINAL EXAMINATION */}
      {session.phase === 'exam' && (
        <section className="paper-card p-4 sm:p-5 flex flex-col gap-4 animate-float-pop">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#794e8a] bg-[#f2e8f7] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#5a3568]">
              Sealed Tray Opened · 6 Unseen Snacks
            </span>
            <h3 className="finicky-title text-xl font-bold text-[#2b2118] mt-1">
              Final Examination
            </h3>
            <p className="text-sm text-[#68584a]">
              Predict whether {challenge.name} will <strong>Accept (Yum)</strong> or{' '}
              <strong>Reject (Yuck)</strong> all 6 unseen snacks to recruit it to your Menagerie!
            </p>
            {session.hypothesisText && (
              <p className="mt-2 rounded-xl bg-[#faf4e8] border border-[#dfd0b8] px-3 py-2 text-xs font-bold text-[#2b2118]">
                Your hypothesis: <span className="text-[#794e8a]">“{session.hypothesisText}”</span>
              </p>
            )}
            {contradictionWarning.length > 0 && (
              <p className="mt-1.5 text-xs font-bold text-[#9e2b1e]">
                Note: Your locked theory disagreed with {contradictionWarning.length} earlier test —
                trust your sharpest deduction on each card below!
              </p>
            )}

            {/* Exam progress bar & quick evidence reference toggle */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[160px] flex items-center gap-2">
                <div
                  className="flex-1 h-2.5 rounded-full bg-[#f2e8d5] border border-[#dfd0b8] overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Object.keys(examPredictions).length}
                  aria-valuemin={0}
                  aria-valuemax={examSnacks.length}
                  aria-label="Final examination completion progress"
                >
                  <div
                    className="h-full bg-[#3f8a52] transition-all"
                    style={{
                      width: `${Math.round((Object.keys(examPredictions).length / Math.max(1, examSnacks.length)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-extrabold text-[#2b2118] shrink-0">
                  {Object.keys(examPredictions).length}/{examSnacks.length}
                </span>
              </div>

              <button
                type="button"
                aria-expanded={showExamEvidence}
                onClick={() => setShowExamEvidence((v) => !v)}
                className="rounded-xl border border-[#dfd0b8] bg-[#faf4e8] px-3 py-1 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
              >
                {showExamEvidence ? 'Hide Evidence Notes ▲' : 'Peek at My Evidence ▼'}
              </button>
            </div>

            {showExamEvidence && (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-[#9fd1ab] bg-[#e6f4e9] p-2.5">
                  <p className="font-extrabold text-[#1f592d] mb-1">Liked ({acceptedHistory.length})</p>
                  <p className="text-[#2b2118] font-semibold">
                    {acceptedHistory.length === 0
                      ? 'None tested yet'
                      : acceptedHistory
                          .map((e) => getSnackById(e.snackId)?.label)
                          .filter(Boolean)
                          .join(', ')}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e9a89f] bg-[#fdebe8] p-2.5">
                  <p className="font-extrabold text-[#9e2b1e] mb-1">Refused ({rejectedHistory.length})</p>
                  <p className="text-[#2b2118] font-semibold">
                    {rejectedHistory.length === 0
                      ? 'None tested yet'
                      : rejectedHistory
                          .map((e) => getSnackById(e.snackId)?.label)
                          .filter(Boolean)
                          .join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {examSnacks.map((snack, index) => {
              const choice = examPredictions[snack.id];
              return (
                <div
                  key={snack.id}
                  className="rounded-2xl border-2 border-[#dfd0b8] bg-[#fffdf8] p-3 flex flex-col items-center gap-2.5"
                >
                  <span className="self-start text-[11px] font-extrabold text-[#68584a]">
                    Unseen Snack #{index + 1}
                  </span>
                  <SnackIllustration snack={snack} size={62} />
                  <p className="text-xs font-extrabold text-[#2b2118] text-center">{snack.label}</p>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                      type="button"
                      aria-pressed={choice === true}
                      onClick={() => handleExamPredict(snack.id, true)}
                      className={`touch-target rounded-xl border-2 py-2 text-xs font-extrabold cursor-pointer transition-colors ${
                        choice === true
                          ? 'border-[#2b2118] bg-[#3f8a52] text-white shadow-[0_2px_0_#2b2118]'
                          : 'border-[#9fd1ab] bg-[#e6f4e9] text-[#1f592d] hover:border-[#2b2118]'
                      }`}
                    >
                      ✓ Yum
                    </button>
                    <button
                      type="button"
                      aria-pressed={choice === false}
                      onClick={() => handleExamPredict(snack.id, false)}
                      className={`touch-target rounded-xl border-2 py-2 text-xs font-extrabold cursor-pointer transition-colors ${
                        choice === false
                          ? 'border-[#2b2118] bg-[#df5a49] text-white shadow-[0_2px_0_#2b2118]'
                          : 'border-[#e9a89f] bg-[#fdebe8] text-[#9e2b1e] hover:border-[#2b2118]'
                      }`}
                    >
                      ✕ Yuck
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs font-bold text-[#68584a]">
              Answered: {Object.keys(examPredictions).length} / {examSnacks.length}
            </p>
            <button
              type="button"
              disabled={!allExamAnswered || busy}
              onClick={() => void handleSubmitExam()}
              className="tactile-btn bg-[#2b2118] text-[#fffdf8] px-6 py-2.5 text-sm cursor-pointer"
            >
              {busy ? 'Grading Exam...' : 'Submit Final Examination'}
            </button>
          </div>
        </section>
      )}

      {/* PHASE 4: FULL REVEAL & EVIDENCE WALKTHROUGH */}
      {session.phase === 'revealed' && reveal && (
        <section className="paper-card p-4 sm:p-5 flex flex-col gap-4 animate-float-pop">
          <div
            className={`rounded-2xl border-2 p-4 ${
              reveal.solved
                ? 'border-[#3f8a52] bg-[#e6f4e9]'
                : 'border-[#df5a49] bg-[#fdebe8]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="finicky-title text-xl sm:text-2xl font-bold text-[#2b2118]">
                {reveal.solved
                  ? reveal.exactDeduction
                    ? '★ Master Detective — Exact Deduction!'
                    : '✓ Monster Understood & Collected!'
                  : `Exam Score: ${reveal.examCorrectCount} / ${reveal.examTotal}`}
              </h3>
              <span className="rounded-full border border-[#2b2118] bg-[#fffdf8] px-3 py-1 text-xs font-extrabold text-[#2b2118]">
                {session.experiments.length} / {budget} Tests Used
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-[#dfd0b8] bg-[#fffdf8] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#68584a]">
                {challenge.name}’s Secret Rule
              </p>
              <p className="text-lg font-extrabold text-[#2b2118] mt-0.5">
                {reveal.trueRuleText}
              </p>
              {session.hypothesisText && (
                <p className="text-xs font-bold text-[#68584a] mt-1">
                  Your theory: “{session.hypothesisText}”{' '}
                  {reveal.exactDeduction ? '(Exact logical match!)' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Unseen Exam Breakdown */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#68584a] mb-2">
              Unseen Final Exam Results ({reveal.examCorrectCount}/{reveal.examTotal})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {reveal.examResults.map((item) => {
                const snack = getSnackById(item.snackId);
                if (!snack) return null;
                return (
                  <div
                    key={item.snackId}
                    className={`rounded-xl border-2 p-2.5 flex items-center gap-2 ${
                      item.correct
                        ? 'border-[#9fd1ab] bg-[#e6f4e9]'
                        : 'border-[#e9a89f] bg-[#fdebe8]'
                    }`}
                  >
                    <SnackIllustration snack={snack} size={36} decorative />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#2b2118] truncate">{snack.label}</p>
                      <p className="text-[11px] font-semibold text-[#68584a]">
                        Actual: <strong>{item.actual ? 'Yum' : 'Yuck'}</strong> ·{' '}
                        {item.correct ? '✓ Correct' : '✕ Missed'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence Walkthrough */}
          {reveal.evidenceInsights.length > 0 && (
            <div className="paper-card-inset p-3.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#68584a] mb-2">
                Scientific Evidence Trail (Out of {reveal.totalGrammarHypotheses.toLocaleString()}{' '}
                Rules)
              </h4>
              <ol className="flex flex-col gap-1.5 text-xs">
                {reveal.evidenceInsights.map((step, i) => {
                  const snack = getSnackById(step.snackId);
                  if (!snack) return null;
                  return (
                    <li
                      key={step.snackId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fffdf8] border border-[#dfd0b8] px-2.5 py-1.5"
                    >
                      <span className="font-bold text-[#2b2118]">
                        {i + 1}. {snack.label} →{' '}
                        <span className={step.accepted ? 'text-[#1f592d]' : 'text-[#9e2b1e]'}>
                          {step.accepted ? 'Accepted' : 'Rejected'}
                        </span>
                      </span>
                      <span className="text-[#68584a] font-semibold">
                        Ruled out <strong>{step.eliminatedCount.toLocaleString()}</strong> rules (
                        {step.remainingAfter.toLocaleString()} left)
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Spoiler-free sharing & Next Loop CTAs */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleCopyShare()}
              className="tactile-btn bg-[#f0bc3a] text-[#2b2118] px-4 py-2 text-xs sm:text-sm cursor-pointer"
            >
              Copy Spoiler-Free Result
            </button>
            <button
              type="button"
              disabled={postingComment || commentPosted}
              onClick={(e) => void handlePostSpoilerFreeComment(e)}
              className="tactile-btn bg-[#3b82b6] text-white px-4 py-2 text-xs sm:text-sm cursor-pointer"
            >
              {commentPosted
                ? '✓ Posted in Comments'
                : postingComment
                  ? 'Posting...'
                  : 'Post Result to Thread'}
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('create')}
              className="tactile-btn bg-[#794e8a] text-white px-4 py-2 text-xs sm:text-sm cursor-pointer"
            >
              Create Your Own Monster →
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('challenges')}
              className="rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] px-3.5 py-2 text-xs sm:text-sm font-bold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              Browse Community Monsters
            </button>
          </div>
        </section>
      )}

      {/* Fairness Certificate Inspector Dialog (Spoiler-Free!) */}
      <ModalDialog
        open={showCertModal}
        onClose={() => setShowCertModal(false)}
        title="Fairness Certificate"
      >
        <div className="flex flex-col gap-3 text-sm text-[#2b2118]">
          <p>
            Every FINICKY monster is verified by a deterministic rule-validation engine before you
            ever play it — guaranteeing the hidden rule is fair, solvable, and unambiguous.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="paper-card-inset p-3">
              <dt className="font-bold text-[#68584a]">Fairness Score</dt>
              <dd className="text-lg font-extrabold text-[#1f592d]">
                {challenge.fairnessBadge.score} / 100
              </dd>
            </div>
            <div className="paper-card-inset p-3">
              <dt className="font-bold text-[#68584a]">Grammar Rules Checked</dt>
              <dd className="text-lg font-extrabold text-[#2b2118]">
                {challenge.fairnessBadge.totalGrammarHypothesesChecked.toLocaleString()}
              </dd>
            </div>
            <div className="paper-card-inset p-3">
              <dt className="font-bold text-[#68584a]">Same-Tier Exam Clarity</dt>
              <dd className="text-lg font-extrabold text-[#1f592d]">
                {challenge.fairnessBadge.examSameTierDiscriminationPct}%
              </dd>
            </div>
            <div className="paper-card-inset p-3">
              <dt className="font-bold text-[#68584a]">Optimal Solvability</dt>
              <dd className="text-lg font-extrabold text-[#2b2118]">
                {challenge.fairnessBadge.minOptimalExperiments ?? '?'} /{' '}
                {challenge.fairnessBadge.experimentBudget} tests
              </dd>
            </div>
          </dl>
          <p className="text-xs text-[#68584a]">
            No spoilers are shown here — all 6 unseen Final Exam snacks were selected mathematically
            to separate the true rule from competing hypotheses.
          </p>
        </div>
      </ModalDialog>
    </div>
  );
}
