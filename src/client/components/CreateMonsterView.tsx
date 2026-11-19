import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { canRunAsUser, navigateTo, showToast } from '@devvit/web/client';
import type { CreateChallengeResponse } from '../../shared/api.ts';
import { certifyChallenge, type FairnessVerdict } from '../../shared/engine/fairness.ts';
import {
  ACCESSORIES,
  BELLY_PATTERNS,
  BODY_COLORS,
  BODY_SHAPES,
  EYE_STYLES,
  MONSTER_PALETTES,
  MOUTH_STYLES,
  type BodyColor,
  type MonsterAppearance,
  type MonsterMood,
} from '../../shared/engine/monsters.ts';
import {
  compileVisualRuleDraft,
  evaluateRule,
  type VisualRuleDraft,
} from '../../shared/engine/rules.ts';
import { SNACK_UNIVERSE } from '../../shared/engine/snacks.ts';
import { soundEngine } from '../utils/sound.ts';
import { trackInteraction } from '../utils/telemetry.ts';
import { MonsterIllustration } from './MonsterIllustration.tsx';
import { RuleBuilder } from './RuleBuilder.tsx';
import { SnackIllustration } from './SnackIllustration.tsx';

type CreateMonsterViewProps = {
  readonly onPublished: (challengeId: string) => void;
};

const DEFAULT_APPEARANCE: MonsterAppearance = {
  bodyShape: 'horned',
  bodyColor: 'mint',
  bellyPattern: 'spots',
  eyeStyle: 'curious-uneven',
  mouthStyle: 'fangs',
  accessory: 'leaf-sprout',
};

const STARTER_DRAFT: VisualRuleDraft = {
  clauses: [
    {
      shape: { mode: 'is', value: 'circle' },
      color: { mode: 'any' },
      pattern: { mode: 'not', value: 'striped' },
    },
  ],
};

function randomPick<T>(items: readonly T[], fallback: T): T {
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] ?? fallback;
}

const SAMPLE_NAMES = [
  'Bramblepuff',
  'Marmalade',
  'Zest',
  'Nutmeg',
  'Pipsqueak',
  'Oatmeal',
  'Cobble',
  'Truffle',
];

const VERDICT_META: Readonly<
  Record<
    FairnessVerdict,
    { readonly badge: string; readonly color: string; readonly icon: string }
  >
> = {
  fair_verified: {
    badge: 'Fair & Verified',
    color: 'border-[#3f8a52] bg-[#e6f4e9] text-[#1f592d]',
    icon: '✓',
  },
  too_easy: {
    badge: 'Too Easy',
    color: 'border-[#e7b236] bg-[#fdf4db] text-[#7c5308]',
    icon: '◔',
  },
  too_difficult: {
    badge: 'Too Difficult',
    color: 'border-[#df5a49] bg-[#fdebe8] text-[#9e2b1e]',
    icon: '!',
  },
  ambiguous: {
    badge: 'Ambiguous',
    color: 'border-[#794e8a] bg-[#f2e8f7] text-[#5a3568]',
    icon: '?',
  },
  invalid: {
    badge: 'Invalid Rule',
    color: 'border-[#df5a49] bg-[#fdebe8] text-[#9e2b1e]',
    icon: '✕',
  },
};

export function CreateMonsterView({ onPublished }: CreateMonsterViewProps) {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [appearance, setAppearance] = useState<MonsterAppearance>(DEFAULT_APPEARANCE);
  const [previewMood, setPreviewMood] = useState<MonsterMood>('idle');
  const [ruleDraft, setRuleDraft] = useState<VisualRuleDraft>(STARTER_DRAFT);
  const [publishAsPost, setPublishAsPost] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<CreateChallengeResponse | null>(null);

  useEffect(() => {
    trackInteraction('monster_creation_started', 'creator_studio');
  }, []);

  const compiledRule = useMemo(() => compileVisualRuleDraft(ruleDraft), [ruleDraft]);

  // Real-time deterministic Fairness Certificate runs locally (identical shared engine as server!)
  const liveReport = useMemo(() => {
    if (!compiledRule) return null;
    return certifyChallenge({ rule: compiledRule, mode: 'community' });
  }, [compiledRule]);

  const previewSnacks = useMemo(() => {
    if (!compiledRule) return { accepted: [], rejected: SNACK_UNIVERSE };
    const accepted = SNACK_UNIVERSE.filter((s) => evaluateRule(compiledRule, s));
    const rejected = SNACK_UNIVERSE.filter((s) => !evaluateRule(compiledRule, s));
    return { accepted, rejected };
  }, [compiledRule]);

  const handleRandomize = () => {
    soundEngine.playTap();
    setAppearance({
      bodyShape: randomPick(BODY_SHAPES, 'blob'),
      bodyColor: randomPick(BODY_COLORS, 'sage'),
      bellyPattern: randomPick(BELLY_PATTERNS, 'spots'),
      eyeStyle: randomPick(EYE_STYLES, 'big-round'),
      mouthStyle: randomPick(MOUTH_STYLES, 'wavy'),
      accessory: randomPick(ACCESSORIES, 'leaf-sprout'),
    });
    if (!name.trim()) {
      setName(randomPick(SAMPLE_NAMES, 'Bramblepuff'));
    }
  };

  const canPublish =
    name.trim().length >= 2 &&
    personality.trim().length >= 6 &&
    compiledRule !== null &&
    liveReport?.verdict === 'fair_verified' &&
    !submitting;

  const handlePublish = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!compiledRule || !canPublish) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      let asUser = false;
      if (publishAsPost) {
        try {
          asUser = await canRunAsUser(e.nativeEvent);
        } catch {
          asUser = false;
        }
      }

      const res = await fetch('/api/challenges/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          personality: personality.trim(),
          appearance,
          rule: compiledRule,
          publishAsPost,
          asUser,
        }),
      });
      const data: CreateChallengeResponse | { status: 'error'; message: string } = await res.json();
      if (!res.ok || 'status' in data) {
        throw new Error('message' in data ? data.message : 'Failed to publish monster.');
      }

      soundEngine.playCelebrate();
      setCreatedResult(data);
      trackInteraction('monster_created', `score_${data.report.score}`);
      showToast(`${data.challenge.name} is Fairness-Certified & live!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not publish monster.');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdResult) {
    return (
      <section className="paper-card p-5 sm:p-6 flex flex-col items-center text-center gap-4 animate-float-pop">
        <span className="inline-flex items-center rounded-full border-2 border-[#3f8a52] bg-[#e6f4e9] px-3 py-1 text-xs font-extrabold text-[#1f592d]">
          ✓ Fairness Certified · {createdResult.report.score}/100
        </span>
        <MonsterIllustration
          appearance={createdResult.challenge.appearance}
          mood="celebrate"
          size={164}
          name={createdResult.challenge.name}
        />
        <div>
          <h2 className="finicky-title text-2xl font-bold text-[#2b2118]">
            {createdResult.challenge.name} Is Ready to Stump Reddit!
          </h2>
          <p className="text-sm text-[#68584a] mt-1 max-w-md">
            Your monster passed {createdResult.report.metrics.totalGrammarHypothesesChecked.toLocaleString()}{' '}
            grammar checks and is now playable in Community Challenges.
          </p>
          {createdResult.postCreationNote && (
            <p className="text-xs font-semibold text-[#7c5308] mt-2">
              {createdResult.postCreationNote}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2.5 pt-2">
          {createdResult.createdPostUrl && (
            <button
              type="button"
              onClick={() => {
                if (createdResult.createdPostUrl) {
                  navigateTo(createdResult.createdPostUrl);
                }
              }}
              className="tactile-btn bg-[#df5a49] text-white px-4 py-2 text-sm cursor-pointer"
            >
              Open Reddit Post ↗
            </button>
          )}
          <button
            type="button"
            onClick={() => onPublished(createdResult.challenge.id)}
            className="tactile-btn bg-[#3f8a52] text-white px-4 py-2 text-sm cursor-pointer"
          >
            Playtest Your Challenge
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatedResult(null);
              setName('');
              setPersonality('');
            }}
            className="rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] px-4 py-2 text-sm font-bold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
          >
            Invent Another Monster
          </button>
        </div>
      </section>
    );
  }

  const verdictStyle = liveReport ? VERDICT_META[liveReport.verdict] : VERDICT_META.invalid;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Character Workshop */}
        <section className="paper-card p-4 sm:p-5 lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="finicky-title text-xl font-bold text-[#2b2118]">1. Design Creature</h2>
              <p className="text-xs text-[#68584a]">Give your picky monster a memorable look.</p>
            </div>
            <button
              type="button"
              onClick={handleRandomize}
              className="rounded-xl border-2 border-[#dfd0b8] bg-[#faf4e8] px-3 py-1.5 text-xs font-extrabold text-[#2b2118] hover:border-[#2b2118] cursor-pointer"
            >
              🎲 Randomize
            </button>
          </div>

          {/* Live Character Stage */}
          <div className="rounded-2xl border border-[#e3d5bf] bg-[#faf4e8] p-4 flex flex-col items-center gap-2">
            <MonsterIllustration
              appearance={appearance}
              mood={previewMood}
              size={152}
              name={name || 'New Monster'}
            />
            <div className="flex gap-1.5">
              {(['idle', 'accept', 'reject', 'celebrate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPreviewMood(m);
                    if (m === 'accept') soundEngine.playAccept();
                    if (m === 'reject') soundEngine.playReject();
                    if (m === 'celebrate') soundEngine.playCelebrate();
                  }}
                  aria-pressed={previewMood === m}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold capitalize cursor-pointer ${
                    previewMood === m
                      ? 'border-[#2b2118] bg-[#2b2118] text-white'
                      : 'border-[#dfd0b8] bg-[#fffdf8] text-[#68584a]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Name & Personality Inputs */}
          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="monster-name"
                className="block text-xs font-extrabold uppercase tracking-wide text-[#68584a] mb-1"
              >
                Monster Name
              </label>
              <input
                id="monster-name"
                type="text"
                maxLength={28}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pipsqueak, Bramble, Marmalade"
                className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-3 py-2 text-sm font-bold text-[#2b2118] focus:border-[#2b2118]"
              />
            </div>

            <div>
              <label
                htmlFor="monster-personality"
                className="block text-xs font-extrabold uppercase tracking-wide text-[#68584a] mb-1"
              >
                Personality Blurb (No Rule Spoilers!)
              </label>
              <textarea
                id="monster-personality"
                rows={2}
                maxLength={140}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="e.g. Hides behind teapots and judges biscuits with extreme suspicion."
                className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-3 py-2 text-sm font-semibold text-[#2b2118] focus:border-[#2b2118]"
              />
            </div>
          </div>

          {/* Appearance Part Pickers */}
          <div className="flex flex-col gap-3 text-xs">
            <div>
              <span className="block font-extrabold uppercase tracking-wide text-[#68584a] mb-1.5">
                Body Color
              </span>
              <div className="flex flex-wrap gap-1.5">
                {BODY_COLORS.map((color: BodyColor) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={MONSTER_PALETTES[color].label}
                    aria-pressed={appearance.bodyColor === color}
                    onClick={() => setAppearance((a) => ({ ...a, bodyColor: color }))}
                    className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                      appearance.bodyColor === color
                        ? 'border-[#2b2118] scale-110 shadow-[0_2px_0_#2b2118]'
                        : 'border-[#dfd0b8]'
                    }`}
                    style={{ backgroundColor: MONSTER_PALETTES[color].fill }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="body-shape" className="block font-extrabold text-[#68584a] mb-1">
                  Body Shape
                </label>
                <select
                  id="body-shape"
                  value={appearance.bodyShape}
                  onChange={(e) => {
                    const next = BODY_SHAPES.find((v) => v === e.target.value);
                    if (next) setAppearance((a) => ({ ...a, bodyShape: next }));
                  }}
                  className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-2 font-bold capitalize"
                >
                  {BODY_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="belly-pattern" className="block font-extrabold text-[#68584a] mb-1">
                  Belly Pattern
                </label>
                <select
                  id="belly-pattern"
                  value={appearance.bellyPattern}
                  onChange={(e) => {
                    const next = BELLY_PATTERNS.find((v) => v === e.target.value);
                    if (next) setAppearance((a) => ({ ...a, bellyPattern: next }));
                  }}
                  className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-2 font-bold capitalize"
                >
                  {BELLY_PATTERNS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="eye-style" className="block font-extrabold text-[#68584a] mb-1">
                  Eyes
                </label>
                <select
                  id="eye-style"
                  value={appearance.eyeStyle}
                  onChange={(e) => {
                    const next = EYE_STYLES.find((v) => v === e.target.value);
                    if (next) setAppearance((a) => ({ ...a, eyeStyle: next }));
                  }}
                  className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-2 font-bold capitalize"
                >
                  {EYE_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('-', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="mouth-style" className="block font-extrabold text-[#68584a] mb-1">
                  Mouth
                </label>
                <select
                  id="mouth-style"
                  value={appearance.mouthStyle}
                  onChange={(e) => {
                    const next = MOUTH_STYLES.find((v) => v === e.target.value);
                    if (next) setAppearance((a) => ({ ...a, mouthStyle: next }));
                  }}
                  className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-2 font-bold capitalize"
                >
                  {MOUTH_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('-', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label htmlFor="accessory-style" className="block font-extrabold text-[#68584a] mb-1">
                  Accessory
                </label>
                <select
                  id="accessory-style"
                  value={appearance.accessory}
                  onChange={(e) => {
                    const next = ACCESSORIES.find((v) => v === e.target.value);
                    if (next) setAppearance((a) => ({ ...a, accessory: next }));
                  }}
                  className="w-full rounded-xl border-2 border-[#dfd0b8] bg-[#fffdf8] px-2.5 py-2 font-bold capitalize"
                >
                  {ACCESSORIES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('-', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Secret Rule Builder + Live 27-Snack Preview + Fairness Certificate */}
        <section className="paper-card p-4 sm:p-5 lg:col-span-7 flex flex-col gap-4">
          <RuleBuilder
            draft={ruleDraft}
            onChange={setRuleDraft}
            heading="2. Invent Secret Taste Rule"
            helperText="Combine traits, exclusions, or an OR preference. Avoid trivial 1-trait rules so detectives have a clever puzzle!"
          />

          {/* Live 27-Snack Reaction Preview */}
          <div className="paper-card-inset p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
              <span className="text-[#1f592d]">
                ✓ Accepts {previewSnacks.accepted.length} / 27 snacks
              </span>
              <span className="text-[#9e2b1e]">
                ✕ Refuses {previewSnacks.rejected.length} / 27 snacks
              </span>
            </div>

            <div className="grid grid-cols-9 gap-1.5">
              {SNACK_UNIVERSE.map((snack) => {
                const likes = compiledRule ? evaluateRule(compiledRule, snack) : false;
                return (
                  <div
                    key={snack.id}
                    title={`${snack.label}: ${likes ? 'Accepted' : 'Rejected'}`}
                    className={`rounded-lg border p-1 flex flex-col items-center justify-center ${
                      likes
                        ? 'border-[#3f8a52] bg-[#e6f4e9]'
                        : 'border-[#e3d5bf] bg-[#fffdf8] opacity-40'
                    }`}
                  >
                    <SnackIllustration snack={snack} size={26} decorative />
                  </div>
                );
              })}
            </div>
          </div>

          {/* LIVE FAIRNESS CERTIFICATE PANEL */}
          <div className={`rounded-2xl border-2 p-4 flex flex-col gap-2.5 ${verdictStyle.color}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-current font-black text-sm">
                  {verdictStyle.icon}
                </span>
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">
                    Fairness Certificate Engine
                  </p>
                  <p className="text-base font-extrabold">{verdictStyle.badge}</p>
                </div>
              </div>
              {liveReport && (
                <div className="text-right">
                  <p className="text-xl font-black leading-none">{liveReport.score}/100</p>
                  <p className="text-[11px] font-bold capitalize opacity-80">
                    {liveReport.difficulty} difficulty
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs sm:text-sm font-bold">
              {liveReport ? liveReport.summary : 'Select at least one trait above to test fairness.'}
            </p>

            {liveReport && (
              <>
                <ul className="list-disc pl-5 text-xs font-semibold space-y-0.5">
                  {liveReport.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px]">
                  <div className="rounded-xl bg-[#fffdf8]/85 border border-current/25 px-2 py-1.5 text-[#2b2118]">
                    <p className="font-bold text-[#68584a]">Rules Checked</p>
                    <p className="font-black text-sm">
                      {liveReport.metrics.totalGrammarHypothesesChecked.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#fffdf8]/85 border border-current/25 px-2 py-1.5 text-[#2b2118]">
                    <p className="font-bold text-[#68584a]">Optimal / Budget</p>
                    <p className="font-black text-sm">
                      {liveReport.metrics.minOptimalExperiments ?? '—'} /{' '}
                      {liveReport.metrics.experimentBudget}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#fffdf8]/85 border border-current/25 px-2 py-1.5 text-[#2b2118]">
                    <p className="font-bold text-[#68584a]">Exam Clarity</p>
                    <p className="font-black text-sm">
                      {liveReport.metrics.examSameTierDiscriminationPct}%
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border-2 border-[#df5a49] bg-[#fdebe8] px-3.5 py-2.5 text-xs font-bold text-[#9e2b1e]"
            >
              {errorMsg}
            </div>
          )}

          {/* Publish Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#2b2118] cursor-pointer">
              <input
                type="checkbox"
                checked={publishAsPost}
                onChange={(e) => setPublishAsPost(e.target.checked)}
                className="w-4 h-4 accent-[#3f8a52]"
              />
              <span>Also publish as a playable Reddit post</span>
            </label>

            <button
              type="button"
              disabled={!canPublish}
              onClick={(e) => void handlePublish(e)}
              className="tactile-btn bg-[#3f8a52] text-white px-5 py-2.5 text-sm cursor-pointer"
            >
              {submitting ? 'Certifying & Publishing...' : 'Publish Verified Monster'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
