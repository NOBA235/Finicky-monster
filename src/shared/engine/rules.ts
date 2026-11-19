import {
  COLORS,
  FULL_UNIVERSE_MASK,
  PATTERNS,
  SHAPES,
  SNACK_UNIVERSE,
  type Color,
  type Pattern,
  type Shape,
  type Snack,
} from './snacks.ts';

export type AttributeKey = 'shape' | 'color' | 'pattern';
export type AttributeValue = Shape | Color | Pattern;

export type ShapeAtom = {
  readonly kind: 'attr';
  readonly attr: 'shape';
  readonly value: Shape;
};

export type ColorAtom = {
  readonly kind: 'attr';
  readonly attr: 'color';
  readonly value: Color;
};

export type PatternAtom = {
  readonly kind: 'attr';
  readonly attr: 'pattern';
  readonly value: Pattern;
};

export type AtomNode = ShapeAtom | ColorAtom | PatternAtom;

export type NotNode = {
  readonly kind: 'not';
  readonly child: RuleNode;
};

export type AndNode = {
  readonly kind: 'and';
  readonly children: readonly RuleNode[];
};

export type OrNode = {
  readonly kind: 'or';
  readonly children: readonly RuleNode[];
};

export type RuleNode = AtomNode | NotNode | AndNode | OrNode;

export type ClauseFilter<T extends string> =
  | { readonly mode: 'any' }
  | { readonly mode: 'is'; readonly value: T }
  | { readonly mode: 'not'; readonly value: T };

export type VisualClause = {
  readonly shape: ClauseFilter<Shape>;
  readonly color: ClauseFilter<Color>;
  readonly pattern: ClauseFilter<Pattern>;
};

export type VisualRuleDraft = {
  readonly clauses: readonly VisualClause[];
};

export const MAX_RULE_DEPTH = 4;
export const MAX_RULE_LEAVES = 6;
export const MAX_RULE_CHILDREN = 4;

export function atomShape(value: Shape): ShapeAtom {
  return { kind: 'attr', attr: 'shape', value };
}

export function atomColor(value: Color): ColorAtom {
  return { kind: 'attr', attr: 'color', value };
}

export function atomPattern(value: Pattern): PatternAtom {
  return { kind: 'attr', attr: 'pattern', value };
}

export function ruleNot(child: RuleNode): NotNode {
  return { kind: 'not', child };
}

export function ruleAnd(...children: readonly RuleNode[]): AndNode {
  return { kind: 'and', children };
}

export function ruleOr(...children: readonly RuleNode[]): OrNode {
  return { kind: 'or', children };
}

function isShape(value: unknown): value is Shape {
  return typeof value === 'string' && SHAPES.some((item) => item === value);
}

function isColor(value: unknown): value is Color {
  return typeof value === 'string' && COLORS.some((item) => item === value);
}

function isPattern(value: unknown): value is Pattern {
  return typeof value === 'string' && PATTERNS.some((item) => item === value);
}

export type RuleValidationResult =
  | { readonly valid: true; readonly rule: RuleNode; readonly leafCount: number; readonly depth: number }
  | { readonly valid: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateRuleNode(input: unknown): RuleValidationResult {
  let leaves = 0;
  let maxDepth = 0;

  function parse(node: unknown, depth: number): RuleNode | string {
    if (depth > MAX_RULE_DEPTH) {
      return `Rule nesting exceeds maximum depth of ${MAX_RULE_DEPTH}.`;
    }
    if (depth > maxDepth) {
      maxDepth = depth;
    }
    if (!isRecord(node)) {
      return 'Rule node must be an object.';
    }

    const kind = node['kind'];
    if (kind === 'attr') {
      const attr = node['attr'];
      const value = node['value'];
      leaves += 1;
      if (leaves > MAX_RULE_LEAVES) {
        return `Rule has too many conditions (maximum ${MAX_RULE_LEAVES}).`;
      }
      if (attr === 'shape' && isShape(value)) {
        return { kind: 'attr', attr: 'shape', value };
      }
      if (attr === 'color' && isColor(value)) {
        return { kind: 'attr', attr: 'color', value };
      }
      if (attr === 'pattern' && isPattern(value)) {
        return { kind: 'attr', attr: 'pattern', value };
      }
      return 'Invalid snack attribute or value in rule condition.';
    }

    if (kind === 'not') {
      const child = parse(node['child'], depth + 1);
      if (typeof child === 'string') {
        return child;
      }
      return { kind: 'not', child };
    }

    if (kind === 'and' || kind === 'or') {
      const rawChildren = node['children'];
      if (!Array.isArray(rawChildren) || rawChildren.length === 0) {
        return `${kind.toUpperCase()} rule must contain at least one condition.`;
      }
      if (rawChildren.length > MAX_RULE_CHILDREN) {
        return `${kind.toUpperCase()} rule cannot contain more than ${MAX_RULE_CHILDREN} conditions.`;
      }
      const parsedChildren: RuleNode[] = [];
      for (const rawChild of rawChildren) {
        const parsed = parse(rawChild, depth + 1);
        if (typeof parsed === 'string') {
          return parsed;
        }
        parsedChildren.push(parsed);
      }
      return { kind, children: parsedChildren };
    }

    return 'Unknown rule node kind.';
  }

  const parsed = parse(input, 1);
  if (typeof parsed === 'string') {
    return { valid: false, error: parsed };
  }
  return { valid: true, rule: parsed, leafCount: leaves, depth: maxDepth };
}

export function evaluateRule(rule: RuleNode, snack: Snack): boolean {
  switch (rule.kind) {
    case 'attr': {
      if (rule.attr === 'shape') return snack.shape === rule.value;
      if (rule.attr === 'color') return snack.color === rule.value;
      return snack.pattern === rule.value;
    }
    case 'not':
      return !evaluateRule(rule.child, snack);
    case 'and':
      return rule.children.every((child) => evaluateRule(child, snack));
    case 'or':
      return rule.children.some((child) => evaluateRule(child, snack));
  }
}

export function computeRuleMask(rule: RuleNode): number {
  let mask = 0;
  for (const snack of SNACK_UNIVERSE) {
    if (evaluateRule(rule, snack)) {
      mask |= snack.bit;
    }
  }
  return mask & FULL_UNIVERSE_MASK;
}

export function countRuleLeaves(rule: RuleNode): number {
  switch (rule.kind) {
    case 'attr':
      return 1;
    case 'not':
      return countRuleLeaves(rule.child);
    case 'and':
    case 'or':
      return rule.children.reduce((acc, child) => acc + countRuleLeaves(child), 0);
  }
}

export function countRuleOperators(rule: RuleNode): number {
  switch (rule.kind) {
    case 'attr':
      return 0;
    case 'not':
      return 1 + countRuleOperators(rule.child);
    case 'and':
    case 'or':
      return (
        Math.max(0, rule.children.length - 1) +
        rule.children.reduce((acc, child) => acc + countRuleOperators(child), 0)
      );
  }
}

export function getAcceptedSnacks(rule: RuleNode): Snack[] {
  return SNACK_UNIVERSE.filter((snack) => evaluateRule(rule, snack));
}

export function getRejectedSnacks(rule: RuleNode): Snack[] {
  return SNACK_UNIVERSE.filter((snack) => !evaluateRule(rule, snack));
}

export function areRulesEquivalent(a: RuleNode, b: RuleNode): boolean {
  return computeRuleMask(a) === computeRuleMask(b);
}

export function createEmptyVisualClause(): VisualClause {
  return {
    shape: { mode: 'any' },
    color: { mode: 'any' },
    pattern: { mode: 'any' },
  };
}

export function compileVisualClause(clause: VisualClause): RuleNode | null {
  const parts: RuleNode[] = [];

  if (clause.color.mode === 'is') {
    parts.push(atomColor(clause.color.value));
  } else if (clause.color.mode === 'not') {
    parts.push(ruleNot(atomColor(clause.color.value)));
  }

  if (clause.pattern.mode === 'is') {
    parts.push(atomPattern(clause.pattern.value));
  } else if (clause.pattern.mode === 'not') {
    parts.push(ruleNot(atomPattern(clause.pattern.value)));
  }

  if (clause.shape.mode === 'is') {
    parts.push(atomShape(clause.shape.value));
  } else if (clause.shape.mode === 'not') {
    parts.push(ruleNot(atomShape(clause.shape.value)));
  }

  if (parts.length === 0) {
    return null;
  }
  const first = parts[0];
  if (parts.length === 1 && first) {
    return first;
  }
  return ruleAnd(...parts);
}

export function compileVisualRuleDraft(draft: VisualRuleDraft): RuleNode | null {
  const compiledClauses: RuleNode[] = [];
  for (const clause of draft.clauses) {
    const compiled = compileVisualClause(clause);
    if (compiled) {
      compiledClauses.push(compiled);
    }
  }
  if (compiledClauses.length === 0) {
    return null;
  }
  const first = compiledClauses[0];
  if (compiledClauses.length === 1 && first) {
    return first;
  }
  return ruleOr(...compiledClauses);
}

function pluralShape(shape: Shape): string {
  return `${shape}s`;
}

type ConjunctionParts = {
  positiveColors: Color[];
  negativeColors: Color[];
  positivePatterns: Pattern[];
  negativePatterns: Pattern[];
  positiveShapes: Shape[];
  negativeShapes: Shape[];
  complexTerms: RuleNode[];
};

function extractConjunctionParts(nodes: readonly RuleNode[]): ConjunctionParts {
  const parts: ConjunctionParts = {
    positiveColors: [],
    negativeColors: [],
    positivePatterns: [],
    negativePatterns: [],
    positiveShapes: [],
    negativeShapes: [],
    complexTerms: [],
  };

  for (const node of nodes) {
    if (node.kind === 'attr') {
      if (node.attr === 'color') parts.positiveColors.push(node.value);
      else if (node.attr === 'pattern') parts.positivePatterns.push(node.value);
      else parts.positiveShapes.push(node.value);
    } else if (node.kind === 'not' && node.child.kind === 'attr') {
      const inner = node.child;
      if (inner.attr === 'color') parts.negativeColors.push(inner.value);
      else if (inner.attr === 'pattern') parts.negativePatterns.push(inner.value);
      else parts.negativeShapes.push(inner.value);
    } else {
      parts.complexTerms.push(node);
    }
  }

  return parts;
}

function describeConjunctionPhrase(nodes: readonly RuleNode[]): string {
  const parts = extractConjunctionParts(nodes);
  if (parts.complexTerms.length > 0) {
    return nodes.map((child) => describeNodePhrase(child)).join(' and ');
  }

  const adjectives: string[] = [];
  if (parts.positiveColors.length === 1 && parts.positiveColors[0]) {
    adjectives.push(parts.positiveColors[0]);
  }
  if (parts.positivePatterns.length === 1 && parts.positivePatterns[0]) {
    adjectives.push(parts.positivePatterns[0]);
  }

  const noun =
    parts.positiveShapes.length === 1 && parts.positiveShapes[0]
      ? pluralShape(parts.positiveShapes[0])
      : 'snacks';

  const base = adjectives.length > 0 ? `${adjectives.join(' ')} ${noun}` : noun;

  const extraQualifiers: string[] = [];
  if (parts.positiveColors.length > 1) {
    extraQualifiers.push(`both ${parts.positiveColors.join(' and ')}`);
  }
  if (parts.positivePatterns.length > 1) {
    extraQualifiers.push(`both ${parts.positivePatterns.join(' and ')}`);
  }
  if (parts.positiveShapes.length > 1) {
    extraQualifiers.push(`both ${parts.positiveShapes.map(pluralShape).join(' and ')}`);
  }

  const exclusions: string[] = [];
  for (const color of parts.negativeColors) {
    exclusions.push(`not ${color}`);
  }
  for (const pattern of parts.negativePatterns) {
    exclusions.push(`not ${pattern}`);
  }
  for (const shape of parts.negativeShapes) {
    exclusions.push(`not ${pluralShape(shape)}`);
  }

  const clauses = [...extraQualifiers, ...exclusions];
  if (clauses.length === 0) {
    return base;
  }
  if (adjectives.length === 0 && parts.positiveShapes.length === 0) {
    return `snacks that are ${clauses.join(' and ')}`;
  }
  return `${base} that are ${clauses.join(' and ')}`;
}

function describeNodePhrase(rule: RuleNode): string {
  switch (rule.kind) {
    case 'attr': {
      if (rule.attr === 'shape') {
        return pluralShape(rule.value);
      }
      return `${rule.value} snacks`;
    }
    case 'not': {
      if (rule.child.kind === 'attr') {
        if (rule.child.attr === 'shape') {
          return `snacks that are not ${pluralShape(rule.child.value)}`;
        }
        return `snacks that are not ${rule.child.value}`;
      }
      return `anything except ${describeNodePhrase(rule.child)}`;
    }
    case 'and':
      return describeConjunctionPhrase(rule.children);
    case 'or': {
      const phrases = rule.children.map((child) => describeNodePhrase(child));
      if (phrases.length === 1 && phrases[0]) {
        return phrases[0];
      }
      if (phrases.length === 2 && phrases[0] && phrases[1]) {
        return `${phrases[0]}, or ${phrases[1]}`;
      }
      return phrases.join(', or ');
    }
  }
}

export function ruleToNaturalLanguage(rule: RuleNode): string {
  if (rule.kind === 'not' && rule.child.kind === 'attr') {
    if (rule.child.attr === 'shape') {
      return `Refuses all ${pluralShape(rule.child.value)}`;
    }
    return `Refuses all ${rule.child.value} snacks`;
  }
  const phrase = describeNodePhrase(rule);
  return `Eats ${phrase}`;
}
