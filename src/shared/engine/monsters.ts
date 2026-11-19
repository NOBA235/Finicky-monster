export const BODY_SHAPES = ['blob', 'pear', 'horned', 'fuzzy', 'tall', 'spiky'] as const;
export const BODY_COLORS = [
  'coral',
  'sage',
  'butter',
  'sky',
  'plum',
  'terracotta',
  'mint',
  'ochre',
] as const;
export const BELLY_PATTERNS = ['none', 'spots', 'stripes', 'freckles', 'patch'] as const;
export const EYE_STYLES = [
  'big-round',
  'sleepy',
  'three-eyes',
  'wide-googly',
  'cyclops',
  'curious-uneven',
] as const;
export const MOUTH_STYLES = [
  'fangs',
  'beak',
  'wavy',
  'wide-grin',
  'tiny-o',
  'whiskers',
] as const;
export const ACCESSORIES = [
  'none',
  'leaf-sprout',
  'antenna',
  'tiny-crown',
  'bow',
  'ear-tufts',
  'scarf',
] as const;

export type BodyShape = (typeof BODY_SHAPES)[number];
export type BodyColor = (typeof BODY_COLORS)[number];
export type BellyPattern = (typeof BELLY_PATTERNS)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type MouthStyle = (typeof MOUTH_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];

export type MonsterMood =
  | 'idle'
  | 'curious'
  | 'accept'
  | 'reject'
  | 'suspicious'
  | 'confused'
  | 'celebrate';

export type MonsterAppearance = {
  readonly bodyShape: BodyShape;
  readonly bodyColor: BodyColor;
  readonly bellyPattern: BellyPattern;
  readonly eyeStyle: EyeStyle;
  readonly mouthStyle: MouthStyle;
  readonly accessory: Accessory;
};

export type BodyPalette = {
  readonly fill: string;
  readonly shade: string;
  readonly belly: string;
  readonly cheek: string;
  readonly label: string;
};

export const MONSTER_PALETTES: Readonly<Record<BodyColor, BodyPalette>> = {
  coral: {
    fill: '#E87A6A',
    shade: '#C65647',
    belly: '#FAD9D0',
    cheek: '#D84E43',
    label: 'Coral',
  },
  sage: {
    fill: '#7FB086',
    shade: '#598A61',
    belly: '#D8ECD9',
    cheek: '#E28C7E',
    label: 'Sage',
  },
  butter: {
    fill: '#F1C762',
    shade: '#CA9A33',
    belly: '#FCF0C8',
    cheek: '#E2836F',
    label: 'Butter',
  },
  sky: {
    fill: '#6FA9CE',
    shade: '#4B82A8',
    belly: '#D5EAF7',
    cheek: '#E4898B',
    label: 'Sky',
  },
  plum: {
    fill: '#9C78AD',
    shade: '#765387',
    belly: '#E6D8EE',
    cheek: '#E2818F',
    label: 'Plum',
  },
  terracotta: {
    fill: '#D7885C',
    shade: '#AD613A',
    belly: '#F6DFCE',
    cheek: '#CE5D49',
    label: 'Terracotta',
  },
  mint: {
    fill: '#6DBEA8',
    shade: '#499783',
    belly: '#D4F1E8',
    cheek: '#E68D85',
    label: 'Mint',
  },
  ochre: {
    fill: '#D7A354',
    shade: '#AF7B2E',
    belly: '#F5E4C5',
    cheek: '#D87464',
    label: 'Ochre',
  },
};

export const ACCEPT_REACTIONS: readonly string[] = [
  'CRUNCH! Eyes sparkling — absolute favorite!',
  'Munch-munch! Happy wiggle and crumbs everywhere!',
  'Gulp! Tail wagging furiously — more like this!',
  'Ooh! Sniffed once, devoured in a heartbeat!',
  'Delightful! Lets out a tiny contented purr.',
];

export const REJECT_REACTIONS: readonly string[] = [
  'BLEGH! Pushed it away with one dramatic claw.',
  'Hmph! Crossed its arms and turned its nose up.',
  'Ptooey! Gave it a suspicious sniff and recoiled.',
  'Nope! Shook its head so hard its ears flopped.',
  'Eww! Stared at the snack like it was a soggy sock.',
];

export function pickReactionLine(accepted: boolean, seedIndex: number): string {
  const pool = accepted ? ACCEPT_REACTIONS : REJECT_REACTIONS;
  const idx = Math.abs(seedIndex) % pool.length;
  return pool[idx] ?? (accepted ? 'Yum! Accepted!' : 'Yuck! Rejected!');
}

function isOneOf<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === 'string' && list.some((item) => item === value);
}

export function validateMonsterAppearance(input: unknown): MonsterAppearance | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(input));
  const bodyShape = record['bodyShape'];
  const bodyColor = record['bodyColor'];
  const bellyPattern = record['bellyPattern'];
  const eyeStyle = record['eyeStyle'];
  const mouthStyle = record['mouthStyle'];
  const accessory = record['accessory'];

  if (
    !isOneOf(bodyShape, BODY_SHAPES) ||
    !isOneOf(bodyColor, BODY_COLORS) ||
    !isOneOf(bellyPattern, BELLY_PATTERNS) ||
    !isOneOf(eyeStyle, EYE_STYLES) ||
    !isOneOf(mouthStyle, MOUTH_STYLES) ||
    !isOneOf(accessory, ACCESSORIES)
  ) {
    return null;
  }

  return {
    bodyShape,
    bodyColor,
    bellyPattern,
    eyeStyle,
    mouthStyle,
    accessory,
  };
}

export function sanitizeMonsterName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 28);
}

export function sanitizePersonality(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 140);
}
