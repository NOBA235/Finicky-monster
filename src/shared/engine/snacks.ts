export const SHAPES = ['circle', 'square', 'triangle'] as const;
export const COLORS = ['red', 'blue', 'yellow'] as const;
export const PATTERNS = ['striped', 'spotted', 'plain'] as const;

export type Shape = (typeof SHAPES)[number];
export type Color = (typeof COLORS)[number];
export type Pattern = (typeof PATTERNS)[number];

export type SnackId = `${Color}-${Pattern}-${Shape}`;

export type Snack = {
  readonly id: SnackId;
  readonly index: number;
  readonly bit: number;
  readonly shape: Shape;
  readonly color: Color;
  readonly pattern: Pattern;
  readonly label: string;
};

export const FULL_UNIVERSE_MASK = (1 << 27) - 1;

function capitalize(word: string): string {
  return word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function buildSnackUniverse(): readonly Snack[] {
  const snacks: Snack[] = [];
  let index = 0;
  for (const color of COLORS) {
    for (const pattern of PATTERNS) {
      for (const shape of SHAPES) {
        const id: SnackId = `${color}-${pattern}-${shape}`;
        const label = `${capitalize(color)} ${capitalize(pattern)} ${capitalize(shape)}`;
        snacks.push({
          id,
          index,
          bit: 1 << index,
          shape,
          color,
          pattern,
          label,
        });
        index += 1;
      }
    }
  }
  return snacks;
}

export const SNACK_UNIVERSE: readonly Snack[] = buildSnackUniverse();

const SNACK_BY_ID: ReadonlyMap<string, Snack> = new Map(
  SNACK_UNIVERSE.map((snack) => [snack.id, snack])
);

const SNACK_BY_INDEX: ReadonlyMap<number, Snack> = new Map(
  SNACK_UNIVERSE.map((snack) => [snack.index, snack])
);

export function isSnackId(value: string): value is SnackId {
  return SNACK_BY_ID.has(value);
}

export function getSnackById(id: string): Snack | undefined {
  return SNACK_BY_ID.get(id);
}

export function getSnackByIndex(index: number): Snack | undefined {
  return SNACK_BY_INDEX.get(index);
}

export function countBits(mask: number): number {
  let n = mask & FULL_UNIVERSE_MASK;
  let count = 0;
  while (n !== 0) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

export function snacksFromMask(mask: number): Snack[] {
  const result: Snack[] = [];
  for (const snack of SNACK_UNIVERSE) {
    if ((mask & snack.bit) !== 0) {
      result.push(snack);
    }
  }
  return result;
}

export function maskFromSnackIds(ids: readonly SnackId[]): number {
  let mask = 0;
  for (const id of ids) {
    const snack = SNACK_BY_ID.get(id);
    if (snack) {
      mask |= snack.bit;
    }
  }
  return mask;
}
