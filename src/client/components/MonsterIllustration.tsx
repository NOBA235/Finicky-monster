import {
  MONSTER_PALETTES,
  type MonsterAppearance,
  type MonsterMood,
} from '../../shared/engine/monsters.ts';

type MonsterIllustrationProps = {
  readonly appearance: MonsterAppearance;
  readonly mood?: MonsterMood;
  readonly size?: number;
  readonly name?: string;
  readonly decorative?: boolean;
};

export function MonsterIllustration({
  appearance,
  mood = 'idle',
  size = 172,
  name = 'Monster',
  decorative = false,
}: MonsterIllustrationProps) {
  const palette = MONSTER_PALETTES[appearance.bodyColor];
  const ink = '#2B2118';

  const animClass =
    mood === 'accept'
      ? 'monster-anim-accept'
      : mood === 'reject'
        ? 'monster-anim-reject'
        : mood === 'celebrate'
          ? 'monster-anim-celebrate'
          : mood === 'curious'
            ? 'monster-anim-curious'
            : 'monster-anim-idle';

  const renderBodyPath = () => {
    switch (appearance.bodyShape) {
      case 'blob':
        return (
          <path
            d="M42 146 C30 146 28 122 33 96 C38 64 56 44 90 44 C124 44 142 64 147 96 C152 122 150 146 138 146 C125 148 118 144 90 144 C62 144 55 148 42 146 Z"
            fill={palette.fill}
            stroke={ink}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        );
      case 'pear':
        return (
          <path
            d="M48 146 C30 144 26 116 40 94 C50 78 52 50 90 46 C128 50 130 78 140 94 C154 116 150 144 132 146 Z"
            fill={palette.fill}
            stroke={ink}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        );
      case 'horned':
        return (
          <g>
            {/* Curved horns */}
            <path
              d="M54 62 C40 48 38 30 50 24 C55 34 62 42 70 50 Z"
              fill="#F3E6CE"
              stroke={ink}
              strokeWidth="3.8"
              strokeLinejoin="round"
            />
            <path
              d="M126 62 C140 48 142 30 130 24 C125 34 118 42 110 50 Z"
              fill="#F3E6CE"
              stroke={ink}
              strokeWidth="3.8"
              strokeLinejoin="round"
            />
            <path
              d="M44 146 C34 144 32 112 38 86 C44 58 62 46 90 46 C118 46 136 58 142 86 C148 112 146 144 136 146 Z"
              fill={palette.fill}
              stroke={ink}
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </g>
        );
      case 'fuzzy':
        return (
          <path
            d="M44 144 C32 140 28 124 34 112 C24 102 26 84 38 78 C34 62 46 48 62 50 C70 38 84 36 90 44 C96 36 110 38 118 50 C134 48 146 62 142 78 C154 84 156 102 146 112 C152 124 148 140 136 144 C118 148 62 148 44 144 Z"
            fill={palette.fill}
            stroke={ink}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        );
      case 'tall':
        return (
          <path
            d="M54 146 C44 144 44 114 48 76 C52 44 66 32 90 32 C114 32 128 44 132 76 C136 114 136 144 126 146 Z"
            fill={palette.fill}
            stroke={ink}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        );
      case 'spiky':
        return (
          <path
            d="M44 146 C34 136 30 116 36 102 L26 90 L39 80 L34 62 L52 60 L58 40 L76 48 L90 32 L104 48 L122 40 L128 60 L146 62 L141 80 L154 90 L144 102 C150 116 146 136 136 146 Z"
            fill={palette.fill}
            stroke={ink}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        );
    }
  };

  const renderBelly = () => {
    switch (appearance.bellyPattern) {
      case 'none':
        return null;
      case 'patch':
        return (
          <ellipse
            cx="90"
            cy="122"
            rx="30"
            ry="20"
            fill={palette.belly}
            opacity="0.92"
          />
        );
      case 'spots':
        return (
          <g fill={palette.belly} opacity="0.9">
            <circle cx="72" cy="118" r="7" />
            <circle cx="94" cy="126" r="8.5" />
            <circle cx="110" cy="116" r="6" />
            <circle cx="82" cy="134" r="5" />
          </g>
        );
      case 'stripes':
        return (
          <g stroke={palette.shade} strokeWidth="5.5" strokeLinecap="round" opacity="0.55">
            <path d="M66 116 Q90 123 114 116" fill="none" />
            <path d="M62 127 Q90 134 118 127" fill="none" />
            <path d="M70 137 Q90 142 110 137" fill="none" />
          </g>
        );
      case 'freckles':
        return (
          <g fill={palette.shade} opacity="0.65">
            <circle cx="62" cy="108" r="2.8" />
            <circle cx="72" cy="113" r="2.4" />
            <circle cx="118" cy="108" r="2.8" />
            <circle cx="108" cy="113" r="2.4" />
            <circle cx="86" cy="124" r="2.6" />
            <circle cx="96" cy="128" r="2.2" />
            <circle cx="90" cy="118" r="2.1" />
          </g>
        );
    }
  };

  const renderAccessory = () => {
    switch (appearance.accessory) {
      case 'none':
        return null;
      case 'leaf-sprout':
        return (
          <g>
            <path d="M90 42 Q88 26 94 18" fill="none" stroke="#3D6B3B" strokeWidth="3.5" strokeLinecap="round" />
            <path
              d="M92 24 C106 12 118 18 110 30 C102 36 94 31 92 24 Z"
              fill="#6BB069"
              stroke={ink}
              strokeWidth="2.8"
            />
            <path
              d="M89 27 C76 16 66 23 73 33 C80 38 87 33 89 27 Z"
              fill="#84C57D"
              stroke={ink}
              strokeWidth="2.8"
            />
          </g>
        );
      case 'antenna':
        return (
          <g>
            <path d="M84 42 Q74 24 68 18" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="66" cy="16" r="6" fill="#F0BC3A" stroke={ink} strokeWidth="2.8" />
            <path d="M96 42 Q106 24 112 18" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="114" cy="16" r="6" fill="#F0BC3A" stroke={ink} strokeWidth="2.8" />
          </g>
        );
      case 'tiny-crown':
        return (
          <path
            d="M72 44 L75 24 L84 34 L90 21 L96 34 L105 24 L108 44 Z"
            fill="#F3C44E"
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        );
      case 'bow':
        return (
          <g transform="translate(114 44) rotate(16)">
            <path d="M0 0 L-14 -9 L-12 9 Z" fill="#DF5A49" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" />
            <path d="M0 0 L14 -9 L12 9 Z" fill="#DF5A49" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx="0" cy="0" r="4.5" fill="#FAD9D0" stroke={ink} strokeWidth="2.6" />
          </g>
        );
      case 'ear-tufts':
        return (
          <g fill={palette.shade} stroke={ink} strokeWidth="3.2" strokeLinejoin="round">
            <path d="M48 64 C32 52 28 38 42 40 C48 42 54 50 58 56 Z" />
            <path d="M132 64 C148 52 152 38 138 40 C132 42 126 50 122 56 Z" />
          </g>
        );
      case 'scarf':
        return (
          <g>
            <path
              d="M52 114 Q90 128 128 114 L125 127 Q90 140 55 127 Z"
              fill="#DF5A49"
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M106 123 L120 123 L124 146 L110 148 Z"
              fill="#C74435"
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </g>
        );
    }
  };

  const renderSingleEye = (cx: number, cy: number, r: number, pupilDx = 0, pupilDy = 0) => {
    if (mood === 'accept' || mood === 'celebrate') {
      return (
        <path
          d={`M${cx - r * 0.8} ${cy + 2} Q${cx} ${cy - r * 0.9} ${cx + r * 0.8} ${cy + 2}`}
          fill="none"
          stroke={ink}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      );
    }
    if (mood === 'reject') {
      return (
        <g stroke={ink} strokeWidth="3.6" strokeLinecap="round">
          <line x1={cx - r * 0.65} y1={cy - r * 0.55} x2={cx + r * 0.65} y2={cy + r * 0.55} />
          <line x1={cx + r * 0.65} y1={cy - r * 0.55} x2={cx - r * 0.65} y2={cy + r * 0.55} />
        </g>
      );
    }

    const lookDx = mood === 'curious' ? 2.5 : pupilDx;
    const lookDy = mood === 'curious' ? 2.5 : pupilDy;
    const isSleepy = appearance.eyeStyle === 'sleepy' || mood === 'suspicious';

    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="#FFFDF8" stroke={ink} strokeWidth="3.2" />
        <circle cx={cx + lookDx} cy={cy + lookDy} r={r * 0.5} fill={ink} />
        <circle cx={cx + lookDx - r * 0.18} cy={cy + lookDy - r * 0.22} r={r * 0.2} fill="#FFFDF8" />
        {isSleepy && (
          <path
            d={`M${cx - r - 1} ${cy - 2} Q${cx} ${cy - r * 0.2} ${cx + r + 1} ${cy - 2} L${cx + r + 1} ${cy - r - 2} L${cx - r - 1} ${cy - r - 2} Z`}
            fill={palette.fill}
            stroke={ink}
            strokeWidth="2.8"
          />
        )}
      </g>
    );
  };

  const renderEyes = () => {
    switch (appearance.eyeStyle) {
      case 'big-round':
        return (
          <g>
            {renderSingleEye(72, 82, 11)}
            {renderSingleEye(108, 82, 11)}
          </g>
        );
      case 'sleepy':
        return (
          <g>
            {renderSingleEye(72, 84, 10.5)}
            {renderSingleEye(108, 84, 10.5)}
          </g>
        );
      case 'three-eyes':
        return (
          <g>
            {renderSingleEye(66, 86, 8.5)}
            {renderSingleEye(90, 74, 9.5)}
            {renderSingleEye(114, 86, 8.5)}
          </g>
        );
      case 'wide-googly':
        return (
          <g>
            {renderSingleEye(68, 82, 12.5, 2, -1)}
            {renderSingleEye(112, 82, 12.5, -2, 1)}
          </g>
        );
      case 'cyclops':
        return <g>{renderSingleEye(90, 78, 16)}</g>;
      case 'curious-uneven':
        return (
          <g>
            {renderSingleEye(71, 84, 12.5)}
            {renderSingleEye(109, 80, 9)}
          </g>
        );
    }
  };

  const renderMouth = () => {
    if (mood === 'accept' || mood === 'celebrate') {
      return (
        <g>
          <path
            d="M74 102 Q90 120 106 102 Z"
            fill="#8D2B24"
            stroke={ink}
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <path d="M81 110 Q90 116 99 110" fill="none" stroke="#F49A9A" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    }
    if (mood === 'reject') {
      return (
        <g>
          <path
            d="M74 108 Q82 101 90 108 Q98 101 106 108"
            fill="none"
            stroke={ink}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M84 108 C84 121 96 121 96 108 Z"
            fill="#E2737D"
            stroke={ink}
            strokeWidth="2.8"
          />
        </g>
      );
    }
    if (mood === 'confused') {
      return (
        <path
          d="M78 106 Q84 102 90 107 Q96 112 102 105"
          fill="none"
          stroke={ink}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      );
    }
    if (mood === 'curious') {
      return <circle cx="90" cy="106" r="6" fill="#8D2B24" stroke={ink} strokeWidth="3" />;
    }

    switch (appearance.mouthStyle) {
      case 'fangs':
        return (
          <g>
            <path d="M74 103 Q90 113 106 103" fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
            <path d="M79 105 L83 113 L87 107 Z" fill="#FFFDF8" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M93 107 L97 113 L101 105 Z" fill="#FFFDF8" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
          </g>
        );
      case 'beak':
        return (
          <path
            d="M82 100 L98 100 L90 113 Z"
            fill="#F0BC3A"
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        );
      case 'wavy':
        return (
          <path
            d="M74 105 Q82 111 90 105 Q98 111 106 105"
            fill="none"
            stroke={ink}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        );
      case 'wide-grin':
        return (
          <path
            d="M72 102 Q90 118 108 102"
            fill="none"
            stroke={ink}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        );
      case 'tiny-o':
        return <circle cx="90" cy="105" r="5" fill="#8D2B24" stroke={ink} strokeWidth="3" />;
      case 'whiskers':
        return (
          <g stroke={ink} strokeWidth="2.8" strokeLinecap="round">
            <path d="M78 105 Q90 111 102 105" fill="none" />
            <line x1="48" y1="98" x2="64" y2="101" />
            <line x1="47" y1="106" x2="64" y2="106" />
            <line x1="132" y1="98" x2="116" y2="101" />
            <line x1="133" y1="106" x2="116" y2="106" />
          </g>
        );
    }
  };

  const renderMoodEffects = () => {
    if (mood === 'accept' || mood === 'celebrate') {
      return (
        <g>
          <path d="M26 42 L30 32 L34 42 L44 46 L34 50 L30 60 L26 50 L16 46 Z" fill="#F0BC3A" stroke={ink} strokeWidth="2" />
          <path d="M148 34 L151 27 L154 34 L161 37 L154 40 L151 47 L148 40 L141 37 Z" fill="#5CB270" stroke={ink} strokeWidth="2" />
          {mood === 'celebrate' && (
            <path
              d="M150 76 C150 70 158 68 160 74 C162 68 170 70 170 76 C170 83 160 89 160 89 C160 89 150 83 150 76 Z"
              fill="#DF5A49"
              stroke={ink}
              strokeWidth="2"
            />
          )}
        </g>
      );
    }
    if (mood === 'reject') {
      return (
        <g stroke="#5C8A47" strokeWidth="3.2" fill="none" strokeLinecap="round">
          <path d="M26 54 Q20 44 28 36 Q35 28 28 20" />
          <path d="M152 52 Q159 42 151 34 Q144 26 152 18" />
        </g>
      );
    }
    if (mood === 'confused' || mood === 'curious') {
      return (
        <text
          x="146"
          y="46"
          fill={ink}
          fontSize="26"
          fontWeight="800"
          fontFamily="Georgia, serif"
        >
          ?
        </text>
      );
    }
    return null;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 168"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${name}, looking ${mood}`}
      className="shrink-0 select-none overflow-visible"
    >
      {!decorative && <title>{`${name} (${mood})`}</title>}

      {/* Ground shadow */}
      <ellipse cx="90" cy="153" rx="54" ry="10" fill="#2B2118" opacity="0.13" />

      <g className={animClass}>
        {/* Cute stubby feet */}
        <ellipse cx="66" cy="146" rx="14" ry="8" fill={palette.shade} stroke={ink} strokeWidth="3.5" />
        <ellipse cx="114" cy="146" rx="14" ry="8" fill={palette.shade} stroke={ink} strokeWidth="3.5" />

        {/* Little side paws */}
        <ellipse
          cx="34"
          cy="108"
          rx="10"
          ry="7"
          transform="rotate(-24 34 108)"
          fill={palette.fill}
          stroke={ink}
          strokeWidth="3.5"
        />
        <ellipse
          cx="146"
          cy="108"
          rx="10"
          ry="7"
          transform="rotate(24 146 108)"
          fill={palette.fill}
          stroke={ink}
          strokeWidth="3.5"
        />

        {/* Body */}
        {renderBodyPath()}

        {/* Belly marking */}
        {renderBelly()}

        {/* Cheek blush */}
        <ellipse cx="56" cy="98" rx="8" ry="5" fill={palette.cheek} opacity="0.45" />
        <ellipse cx="124" cy="98" rx="8" ry="5" fill={palette.cheek} opacity="0.45" />

        {/* Accessory */}
        {renderAccessory()}

        {/* Eyes & Mouth */}
        {renderEyes()}
        {renderMouth()}

        {/* Reaction marks */}
        {renderMoodEffects()}
      </g>
    </svg>
  );
}
