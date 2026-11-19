import {
  atomColor,
  atomPattern,
  atomShape,
  ruleAnd,
  ruleNot,
  ruleOr,
  type RuleNode,
} from './rules.ts';
import { certifyChallenge, type FairnessReport } from './fairness.ts';
import type { MonsterAppearance } from './monsters.ts';

export type CuratedMonsterSpec = {
  readonly slug: string;
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly appearance: MonsterAppearance;
  readonly rule: RuleNode;
  readonly experimentBudget: number;
};

export type ResolvedDailyChallenge = {
  readonly id: string;
  readonly kind: 'daily';
  readonly dayKey: string;
  readonly dayNumber: number;
  readonly slug: string;
  readonly name: string;
  readonly personality: string;
  readonly habitatNote: string;
  readonly appearance: MonsterAppearance;
  readonly rule: RuleNode;
  readonly fairness: FairnessReport;
};

export const DAILY_EPOCH_UTC = '2026-11-01';

export const CURATED_DAILY_MONSTERS: readonly CuratedMonsterSpec[] = [
  // Days 1-3: Gentle single-trait introductions
  {
    slug: 'barnaby',
    name: 'Barnaby',
    personality: 'A polite little moss-blob who inspects every biscuit with a tiny monocle.',
    habitatNote: 'Naps beside warm teacups and collects round pebbles.',
    appearance: {
      bodyShape: 'blob',
      bodyColor: 'sage',
      bellyPattern: 'patch',
      eyeStyle: 'big-round',
      mouthStyle: 'wavy',
      accessory: 'leaf-sprout',
    },
    rule: atomShape('circle'),
    experimentBudget: 6,
  },
  {
    slug: 'pippin',
    name: 'Pippin',
    personality: 'Bright-eyed and deeply opinionated about sunshine tones.',
    habitatNote: 'Hides in linen cupboards whenever lemons are sliced.',
    appearance: {
      bodyShape: 'pear',
      bodyColor: 'sky',
      bellyPattern: 'freckles',
      eyeStyle: 'curious-uneven',
      mouthStyle: 'beak',
      accessory: 'ear-tufts',
    },
    rule: ruleNot(atomColor('yellow')),
    experimentBudget: 6,
  },
  {
    slug: 'mochi',
    name: 'Mochi',
    personality: 'Squishy, gentle, and enchanted by polka-dot patterns.',
    habitatNote: 'Counts freckled mushrooms along the garden path.',
    appearance: {
      bodyShape: 'fuzzy',
      bodyColor: 'coral',
      bellyPattern: 'spots',
      eyeStyle: 'sleepy',
      mouthStyle: 'tiny-o',
      accessory: 'bow',
    },
    rule: atomPattern('spotted'),
    experimentBudget: 6,
  },

  // Days 4-9: Clever two-trait combinations & exclusions
  {
    slug: 'bramble',
    name: 'Bramble',
    personality: 'Fond of round treats, though stripes make its whiskers twitch.',
    habitatNote: 'Builds tidy nests out of unstriped yarn.',
    appearance: {
      bodyShape: 'horned',
      bodyColor: 'terracotta',
      bellyPattern: 'freckles',
      eyeStyle: 'wide-googly',
      mouthStyle: 'fangs',
      accessory: 'scarf',
    },
    rule: ruleAnd(atomShape('circle'), ruleNot(atomPattern('striped'))),
    experimentBudget: 9,
  },
  {
    slug: 'noodle',
    name: 'Noodle',
    personality: 'A minimalist gourmet who refuses any fuss or decoration on crimson snacks.',
    habitatNote: 'Alphabetizes jars in the pantry at midnight.',
    appearance: {
      bodyShape: 'tall',
      bodyColor: 'butter',
      bellyPattern: 'none',
      eyeStyle: 'sleepy',
      mouthStyle: 'whiskers',
      accessory: 'antenna',
    },
    rule: ruleAnd(atomColor('red'), atomPattern('plain')),
    experimentBudget: 9,
  },
  {
    slug: 'thistle',
    name: 'Thistle',
    personality: 'Admires cool skies, yet refuses sharp corners.',
    habitatNote: 'Sits on mossy stones watching clouds drift.',
    appearance: {
      bodyShape: 'spiky',
      bodyColor: 'plum',
      bellyPattern: 'patch',
      eyeStyle: 'three-eyes',
      mouthStyle: 'wavy',
      accessory: 'tiny-crown',
    },
    rule: ruleAnd(atomColor('blue'), ruleNot(atomShape('triangle'))),
    experimentBudget: 9,
  },
  {
    slug: 'crumble',
    name: 'Crumble',
    personality: 'Strictly prefers boxy pastries—as long as they are never scarlet.',
    habitatNote: 'Stacks sugar cubes into miniature fortresses.',
    appearance: {
      bodyShape: 'blob',
      bodyColor: 'ochre',
      bellyPattern: 'stripes',
      eyeStyle: 'big-round',
      mouthStyle: 'wide-grin',
      accessory: 'none',
    },
    rule: ruleAnd(atomShape('square'), ruleNot(atomColor('red'))),
    experimentBudget: 9,
  },
  {
    slug: 'waffles',
    name: 'Waffles',
    personality: 'Easygoing about most snacks, except two very specific pet peeves.',
    habitatNote: 'Sleeps inside warm bread baskets.',
    appearance: {
      bodyShape: 'fuzzy',
      bodyColor: 'butter',
      bellyPattern: 'spots',
      eyeStyle: 'cyclops',
      mouthStyle: 'wide-grin',
      accessory: 'scarf',
    },
    rule: ruleAnd(ruleNot(atomColor('red')), ruleNot(atomShape('triangle'))),
    experimentBudget: 9,
  },
  {
    slug: 'pebble',
    name: 'Pebble',
    personality: 'Demands sunny snacks with a bit of flair—never plain.',
    habitatNote: 'Polishes river stones until they gleam.',
    appearance: {
      bodyShape: 'pear',
      bodyColor: 'mint',
      bellyPattern: 'stripes',
      eyeStyle: 'curious-uneven',
      mouthStyle: 'tiny-o',
      accessory: 'leaf-sprout',
    },
    rule: ruleAnd(atomColor('yellow'), ruleNot(atomPattern('plain'))),
    experimentBudget: 9,
  },

  // Days 10-15: Tricky disjunctions & hybrid tastes
  {
    slug: 'gumbo',
    name: 'Gumbo',
    personality: 'A joyful eccentric with two very different cravings.',
    habitatNote: 'Hums jazz tunes while stirring imaginary soup.',
    appearance: {
      bodyShape: 'horned',
      bodyColor: 'sage',
      bellyPattern: 'spots',
      eyeStyle: 'three-eyes',
      mouthStyle: 'wide-grin',
      accessory: 'bow',
    },
    rule: ruleOr(atomShape('triangle'), ruleAnd(atomPattern('spotted'), atomShape('square'))),
    experimentBudget: 10,
  },
  {
    slug: 'saffron',
    name: 'Saffron',
    personality: 'Regal, dramatic, and wildly loyal to stripes—plus plain crimson treats.',
    habitatNote: 'Lounges atop velvet cushions demanding fan service.',
    appearance: {
      bodyShape: 'tall',
      bodyColor: 'coral',
      bellyPattern: 'stripes',
      eyeStyle: 'sleepy',
      mouthStyle: 'fangs',
      accessory: 'tiny-crown',
    },
    rule: ruleOr(atomPattern('striped'), ruleAnd(atomColor('red'), atomPattern('plain'))),
    experimentBudget: 10,
  },
  {
    slug: 'turnip',
    name: 'Turnip',
    personality: 'Grumpy on the outside, utterly charmed by tidy patterns and crisp shapes.',
    habitatNote: 'Guards a tiny windowsill herb garden.',
    appearance: {
      bodyShape: 'pear',
      bodyColor: 'plum',
      bellyPattern: 'patch',
      eyeStyle: 'big-round',
      mouthStyle: 'whiskers',
      accessory: 'leaf-sprout',
    },
    rule: ruleOr(atomColor('blue'), atomPattern('spotted')),
    experimentBudget: 9,
  },
  {
    slug: 'sprout',
    name: 'Sprout',
    personality: 'Bouncy garden sprite who loves dotted treats or simple pointy bites.',
    habitatNote: 'Sprouts a fresh leaf whenever it guesses a riddle.',
    appearance: {
      bodyShape: 'blob',
      bodyColor: 'mint',
      bellyPattern: 'freckles',
      eyeStyle: 'wide-googly',
      mouthStyle: 'beak',
      accessory: 'antenna',
    },
    rule: ruleOr(atomPattern('spotted'), ruleAnd(atomPattern('plain'), atomShape('triangle'))),
    experimentBudget: 10,
  },
  {
    slug: 'cinder',
    name: 'Cinder',
    personality: 'Warm as fireplace embers and strangely fond of anything golden or round.',
    habitatNote: 'Toasts tiny marshmallows over candle flames.',
    appearance: {
      bodyShape: 'spiky',
      bodyColor: 'terracotta',
      bellyPattern: 'none',
      eyeStyle: 'cyclops',
      mouthStyle: 'fangs',
      accessory: 'ear-tufts',
    },
    rule: ruleOr(atomColor('yellow'), atomShape('circle')),
    experimentBudget: 9,
  },
  {
    slug: 'clover',
    name: 'Clover',
    personality: 'A daydreamer who eats crimson snacks or blue triangles.',
    habitatNote: 'Presses four-leaf clovers inside old cookbooks.',
    appearance: {
      bodyShape: 'fuzzy',
      bodyColor: 'sage',
      bellyPattern: 'patch',
      eyeStyle: 'curious-uneven',
      mouthStyle: 'wavy',
      accessory: 'bow',
    },
    rule: ruleOr(atomColor('red'), ruleAnd(atomColor('blue'), atomShape('triangle'))),
    experimentBudget: 10,
  },

  // Days 16-21: Fiendish multi-clause connoisseurs
  {
    slug: 'biscuit',
    name: 'Biscuit',
    personality: 'A distinguished critic who keeps two exact recipes in mind.',
    habitatNote: 'Hosts five-o’clock tea for imaginary dignitaries.',
    appearance: {
      bodyShape: 'blob',
      bodyColor: 'ochre',
      bellyPattern: 'freckles',
      eyeStyle: 'big-round',
      mouthStyle: 'whiskers',
      accessory: 'tiny-crown',
    },
    rule: ruleOr(
      ruleAnd(atomPattern('plain'), atomShape('square')),
      ruleAnd(atomColor('blue'), atomShape('triangle'))
    ),
    experimentBudget: 10,
  },
  {
    slug: 'fizz',
    name: 'Fizz',
    personality: 'Crackles with static electricity whenever a bold snack arrives.',
    habitatNote: 'Hides in wool sweaters during thunderstorms.',
    appearance: {
      bodyShape: 'spiky',
      bodyColor: 'sky',
      bellyPattern: 'stripes',
      eyeStyle: 'wide-googly',
      mouthStyle: 'wide-grin',
      accessory: 'antenna',
    },
    rule: ruleOr(
      ruleAnd(atomColor('red'), atomPattern('striped')),
      ruleAnd(atomColor('yellow'), atomShape('square'))
    ),
    experimentBudget: 10,
  },
  {
    slug: 'fig',
    name: 'Fig',
    personality: 'Soft-spoken poet who avoids plainness, redness, and triangles altogether.',
    habitatNote: 'Writes haikus on fallen autumn leaves.',
    appearance: {
      bodyShape: 'pear',
      bodyColor: 'plum',
      bellyPattern: 'spots',
      eyeStyle: 'sleepy',
      mouthStyle: 'tiny-o',
      accessory: 'scarf',
    },
    rule: ruleAnd(
      ruleNot(atomColor('red')),
      ruleNot(atomPattern('plain')),
      ruleNot(atomShape('triangle'))
    ),
    experimentBudget: 10,
  },
  {
    slug: 'juniper',
    name: 'Juniper',
    personality: 'Playful trickster who switches tastes between circles and sunny squares.',
    habitatNote: 'Juggles acorns in the canopy at dusk.',
    appearance: {
      bodyShape: 'horned',
      bodyColor: 'mint',
      bellyPattern: 'patch',
      eyeStyle: 'three-eyes',
      mouthStyle: 'beak',
      accessory: 'ear-tufts',
    },
    rule: ruleOr(
      ruleAnd(atomColor('yellow'), atomShape('circle')),
      ruleAnd(atomColor('red'), atomShape('square'))
    ),
    experimentBudget: 10,
  },
  {
    slug: 'puddle',
    name: 'Puddle',
    personality: 'Melts into happy puddles for cool stripes or golden dots.',
    habitatNote: 'Splashes in rainwater saucers after storms.',
    appearance: {
      bodyShape: 'blob',
      bodyColor: 'sky',
      bellyPattern: 'spots',
      eyeStyle: 'cyclops',
      mouthStyle: 'wavy',
      accessory: 'leaf-sprout',
    },
    rule: ruleOr(
      ruleAnd(atomColor('blue'), atomPattern('striped')),
      ruleAnd(atomColor('yellow'), atomPattern('spotted'))
    ),
    experimentBudget: 10,
  },
  {
    slug: 'marzipan',
    name: 'Marzipan',
    personality: 'The Grand Confectioner of the Menagerie—fussy, clever, and proud.',
    habitatNote: 'Keeps a velvet ledger of every biscuit ever tasted.',
    appearance: {
      bodyShape: 'tall',
      bodyColor: 'coral',
      bellyPattern: 'freckles',
      eyeStyle: 'curious-uneven',
      mouthStyle: 'wide-grin',
      accessory: 'tiny-crown',
    },
    rule: ruleOr(
      ruleAnd(atomPattern('spotted'), atomShape('circle')),
      ruleAnd(atomColor('red'), atomPattern('plain'))
    ),
    experimentBudget: 10,
  },
];

export function formatUtcDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && formatUtcDayKey(parsed) === value;
}

export function getDayNumberForDayKey(dayKey: string): number {
  const epochMs = Date.parse(`${DAILY_EPOCH_UTC}T00:00:00Z`);
  const targetMs = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(epochMs) || Number.isNaN(targetMs)) {
    return 1;
  }
  const diffDays = Math.floor((targetMs - epochMs) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getPreviousDayKey(dayKey: string): string {
  const ms = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(ms)) return dayKey;
  return formatUtcDayKey(new Date(ms - 86_400_000));
}

const resolvedDailyCache = new Map<string, ResolvedDailyChallenge>();

export function getDailyChallengeForDayKey(dayKey: string): ResolvedDailyChallenge {
  const normalizedKey = isValidDayKey(dayKey) ? dayKey : formatUtcDayKey(new Date());
  const cached = resolvedDailyCache.get(normalizedKey);
  if (cached) return cached;

  const dayNumber = getDayNumberForDayKey(normalizedKey);
  const catalogIndex = (dayNumber - 1) % CURATED_DAILY_MONSTERS.length;
  const spec = CURATED_DAILY_MONSTERS[catalogIndex] ?? CURATED_DAILY_MONSTERS[0];
  if (!spec) {
    throw new Error('Daily monster catalog is empty.');
  }

  const fairness = certifyChallenge({
    rule: spec.rule,
    experimentBudget: spec.experimentBudget,
    mode: 'daily',
  });

  const resolved: ResolvedDailyChallenge = {
    id: `daily:${normalizedKey}`,
    kind: 'daily',
    dayKey: normalizedKey,
    dayNumber,
    slug: spec.slug,
    name: spec.name,
    personality: spec.personality,
    habitatNote: spec.habitatNote,
    appearance: spec.appearance,
    rule: spec.rule,
    fairness,
  };

  resolvedDailyCache.set(normalizedKey, resolved);
  return resolved;
}

export function getTodayDailyChallenge(now: Date = new Date()): ResolvedDailyChallenge {
  return getDailyChallengeForDayKey(formatUtcDayKey(now));
}
