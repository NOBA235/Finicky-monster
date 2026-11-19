import { useId } from 'react';
import type { Color, Snack } from '../../shared/engine/snacks.ts';

type SnackPalette = {
  readonly base: string;
  readonly accent: string;
  readonly highlight: string;
};

const SNACK_PALETTES: Readonly<Record<Color, SnackPalette>> = {
  red: {
    base: '#DF5A49',
    accent: '#9E2B1E',
    highlight: '#F69D91',
  },
  blue: {
    base: '#3B82B6',
    accent: '#1E4E76',
    highlight: '#8CC4EC',
  },
  yellow: {
    base: '#F0BC3A',
    accent: '#9C6D0C',
    highlight: '#FCE28D',
  },
};

type SnackIllustrationProps = {
  readonly snack: Snack;
  readonly size?: number;
  readonly decorative?: boolean;
};

export function SnackIllustration({
  snack,
  size = 56,
  decorative = false,
}: SnackIllustrationProps) {
  const uid = useId();
  const clipId = `snack-clip-${uid}`;
  const palette = SNACK_PALETTES[snack.color];

  const renderShape = (props?: { fill?: string; stroke?: string; strokeWidth?: number }) => {
    switch (snack.shape) {
      case 'circle':
        return (
          <circle
            cx="32"
            cy="32"
            r="23"
            fill={props?.fill}
            stroke={props?.stroke}
            strokeWidth={props?.strokeWidth}
          />
        );
      case 'square':
        return (
          <rect
            x="10"
            y="10"
            width="44"
            height="44"
            rx="10"
            fill={props?.fill}
            stroke={props?.stroke}
            strokeWidth={props?.strokeWidth}
          />
        );
      case 'triangle':
        return (
          <path
            d="M32 8 L55 51 Q56 54 52 54 L12 54 Q8 54 9 51 Z"
            strokeLinejoin="round"
            fill={props?.fill}
            stroke={props?.stroke}
            strokeWidth={props?.strokeWidth}
          />
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : snack.label}
      className="shrink-0 overflow-visible"
    >
      {!decorative && <title>{snack.label}</title>}
      <defs>
        <clipPath id={clipId}>{renderShape()}</clipPath>
      </defs>

      {/* Soft paper drop shadow */}
      <g transform="translate(0 3)" opacity="0.2">
        {renderShape({ fill: '#2B2118' })}
      </g>

      {/* Base biscuit fill */}
      {renderShape({ fill: palette.base })}

      {/* Pattern clipped cleanly to silhouette */}
      <g clipPath={`url(#${clipId})`}>
        {snack.pattern === 'striped' && (
          <g stroke={palette.accent} strokeWidth="6" strokeLinecap="round" opacity="0.88">
            <line x1="-6" y1="22" x2="26" y2="-6" />
            <line x1="-4" y1="40" x2="44" y2="-4" />
            <line x1="2" y1="58" x2="60" y2="2" />
            <line x1="18" y1="68" x2="70" y2="18" />
            <line x1="38" y1="70" x2="74" y2="36" />
          </g>
        )}

        {snack.pattern === 'spotted' && (
          <g fill="#FFFDF8" stroke={palette.accent} strokeWidth="1.6">
            <circle cx="21" cy="24" r="4.5" />
            <circle cx="38" cy="20" r="4" />
            <circle cx="31" cy="36" r="5" />
            <circle cx="45" cy="39" r="4.2" />
            <circle cx="19" cy="44" r="4" />
            <circle cx="33" cy="51" r="3.6" />
          </g>
        )}

        {snack.pattern === 'plain' && (
          <g opacity="0.55">
            {snack.shape === 'circle' && (
              <path
                d="M18 24 A16 16 0 0 1 36 14"
                fill="none"
                stroke={palette.highlight}
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            )}
            {snack.shape === 'square' && (
              <path
                d="M17 20 L17 17 Q17 16 19 16 L34 16"
                fill="none"
                stroke={palette.highlight}
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            )}
            {snack.shape === 'triangle' && (
              <path
                d="M27 25 L32 16 L37 25"
                fill="none"
                stroke={palette.highlight}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        )}
      </g>

      {/* Crisp storybook ink outline */}
      {renderShape({ fill: 'none', stroke: '#2B2118', strokeWidth: 3.2 })}
    </svg>
  );
}
