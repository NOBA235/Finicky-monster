import {
  COLORS,
  PATTERNS,
  SHAPES,
  type Color,
  type Pattern,
  type Shape,
} from '../../shared/engine/snacks.ts';
import {
  compileVisualRuleDraft,
  createEmptyVisualClause,
  ruleToNaturalLanguage,
  type ClauseFilter,
  type RuleNode,
  type VisualClause,
  type VisualRuleDraft,
} from '../../shared/engine/rules.ts';

type RuleBuilderProps = {
  readonly draft: VisualRuleDraft;
  readonly onChange: (next: VisualRuleDraft) => void;
  readonly heading?: string;
  readonly helperText?: string;
};

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type FilterRowProps<T extends string> = {
  readonly label: string;
  readonly options: readonly T[];
  readonly filter: ClauseFilter<T>;
  readonly onChange: (next: ClauseFilter<T>) => void;
  readonly dotColors?: Readonly<Record<string, string>>;
};

function FilterRow<T extends string>({
  label,
  options,
  filter,
  onChange,
  dotColors,
}: FilterRowProps<T>) {
  const isNegated = filter.mode === 'not';

  const handleSelectValue = (val: T) => {
    if (filter.mode !== 'any' && filter.value === val) {
      onChange({ mode: 'any' });
      return;
    }
    onChange({ mode: isNegated ? 'not' : 'is', value: val });
  };

  const handleTogglePolarity = (mode: 'is' | 'not') => {
    if (filter.mode === 'any') return;
    onChange({ mode, value: filter.value });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-[#68584a]">
          {label}
        </span>
        {filter.mode !== 'any' && (
          <div className="inline-flex rounded-lg border border-[#dfd0b8] bg-[#faf4e8] p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleTogglePolarity('is')}
              aria-pressed={filter.mode === 'is'}
              className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                filter.mode === 'is'
                  ? 'bg-[#3f8a52] text-white'
                  : 'text-[#68584a] hover:text-[#2b2118]'
              }`}
            >
              Must be
            </button>
            <button
              type="button"
              onClick={() => handleTogglePolarity('not')}
              aria-pressed={filter.mode === 'not'}
              className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                filter.mode === 'not'
                  ? 'bg-[#df5a49] text-white'
                  : 'text-[#68584a] hover:text-[#2b2118]'
              }`}
            >
              Except / Not
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ mode: 'any' })}
          aria-pressed={filter.mode === 'any'}
          className={`touch-target px-3 py-1.5 rounded-xl border-2 text-xs font-bold cursor-pointer transition-colors ${
            filter.mode === 'any'
              ? 'border-[#2b2118] bg-[#2b2118] text-[#fffdf8]'
              : 'border-[#dfd0b8] bg-[#fffdf8] text-[#68584a] hover:border-[#2b2118]'
          }`}
        >
          Any
        </button>

        {options.map((opt) => {
          const active = filter.mode !== 'any' && filter.value === opt;
          const activeStyle =
            active && filter.mode === 'not'
              ? 'border-[#df5a49] bg-[#fdebe8] text-[#9e2b1e]'
              : active
                ? 'border-[#3f8a52] bg-[#e6f4e9] text-[#1f592d]'
                : 'border-[#dfd0b8] bg-[#fffdf8] text-[#2b2118] hover:border-[#2b2118]';

          const swatch = dotColors?.[opt];

          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleSelectValue(opt)}
              aria-pressed={active}
              className={`touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-bold cursor-pointer transition-colors ${activeStyle}`}
            >
              {swatch && (
                <span
                  aria-hidden="true"
                  className="inline-block w-3 h-3 rounded-full border border-[#2b2118]"
                  style={{ backgroundColor: swatch }}
                />
              )}
              <span>{active && filter.mode === 'not' ? `Not ${labelize(opt)}` : labelize(opt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COLOR_SWATCHES: Readonly<Record<Color, string>> = {
  red: '#DF5A49',
  blue: '#3B82B6',
  yellow: '#F0BC3A',
};

export function RuleBuilder({ draft, onChange, heading, helperText }: RuleBuilderProps) {
  const compiled: RuleNode | null = compileVisualRuleDraft(draft);

  const updateClause = (index: number, updater: (clause: VisualClause) => VisualClause) => {
    const nextClauses = draft.clauses.map((clause, idx) =>
      idx === index ? updater(clause) : clause
    );
    onChange({ clauses: nextClauses });
  };

  const addOrClause = () => {
    if (draft.clauses.length >= 2) return;
    onChange({ clauses: [...draft.clauses, createEmptyVisualClause()] });
  };

  const removeClause = (index: number) => {
    if (draft.clauses.length <= 1) return;
    onChange({ clauses: draft.clauses.filter((_, idx) => idx !== index) });
  };

  return (
    <div className="flex flex-col gap-3">
      {heading && (
        <div>
          <h3 className="finicky-title text-lg font-bold text-[#2b2118]">{heading}</h3>
          {helperText && <p className="text-sm text-[#68584a] mt-0.5">{helperText}</p>}
        </div>
      )}

      {/* Live natural language summary banner */}
      <div className="paper-card-inset px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#68584a]">
            Plain-English Rule
          </p>
          <p className="text-base font-extrabold text-[#2b2118] mt-0.5">
            {compiled ? ruleToNaturalLanguage(compiled) : 'Pick at least one trait below...'}
          </p>
        </div>
        {compiled && (
          <button
            type="button"
            onClick={() => onChange({ clauses: [createEmptyVisualClause()] })}
            className="text-xs font-bold text-[#68584a] underline hover:text-[#2b2118] cursor-pointer shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Preference Clauses */}
      <div className="flex flex-col gap-3">
        {draft.clauses.map((clause, idx) => (
          <div
            key={idx}
            className="rounded-2xl border-2 border-[#dfd0b8] bg-[#fffdf8] p-3.5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#794e8a]">
                {idx === 0 ? 'Preference 1' : 'OR Preference 2'}
              </span>
              {draft.clauses.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeClause(idx)}
                  className="text-xs font-bold text-[#df5a49] hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            <FilterRow<Shape>
              label="Shape"
              options={SHAPES}
              filter={clause.shape}
              onChange={(shape) => updateClause(idx, (c) => ({ ...c, shape }))}
            />

            <FilterRow<Color>
              label="Color"
              options={COLORS}
              filter={clause.color}
              dotColors={COLOR_SWATCHES}
              onChange={(color) => updateClause(idx, (c) => ({ ...c, color }))}
            />

            <FilterRow<Pattern>
              label="Pattern"
              options={PATTERNS}
              filter={clause.pattern}
              onChange={(pattern) => updateClause(idx, (c) => ({ ...c, pattern }))}
            />
          </div>
        ))}
      </div>

      {draft.clauses.length < 2 && (
        <button
          type="button"
          onClick={addOrClause}
          className="self-start rounded-xl border-2 border-dashed border-[#794e8a] bg-[#f2e8f7] px-3.5 py-2 text-xs font-extrabold text-[#5a3568] hover:bg-[#e8d8f0] cursor-pointer"
        >
          + Add “OR” Second Preference
        </button>
      )}
    </div>
  );
}
