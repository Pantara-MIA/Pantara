import { useState } from 'react';

/**
 * Commodity vector illustration.
 *
 * Always the base layer of a card, so the layout holds even if the photo fails
 * to load. A photo (if any) is stacked on top and fades in only once loaded.
 */

type ArtKey = string;

const PALETTE = {
  red: ['#D8442B', '#B5301E'],
  green: ['#66BB6A', '#3E8E42'],
  deepGreen: ['#2E7D32', '#1B5E20'],
  gold: ['#D3BE6D', '#B9A24F'],
  cream: ['#F1E5C8', '#DCCB9F'],
  brown: ['#B07A4B', '#8A5A32'],
  purple: ['#A85673', '#7E3A52'],
  white: ['#F5F1E4', '#DED8C4'],
  orange: ['#E08A2E', '#BE6D18'],
};

function Leaf({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M0 0 C 10 -14, 26 -16, 34 -6 C 24 6, 8 8, 0 0 Z" fill="#3E8E42" />
      <path d="M0 0 C 12 -6, 24 -8, 33 -6" stroke="#2E6B2E" strokeWidth="1.6" fill="none" />
    </g>
  );
}

/** Elongated chili shape; `curl` sets how much the pod bends. */
function ChiliShape({
  fill,
  stroke,
  curl = 0,
  len = 120,
  girth = 26,
  x = 0,
  y = 0,
  rot = 0,
}: {
  fill: string;
  stroke: string;
  curl?: number;
  len?: number;
  girth?: number;
  x?: number;
  y?: number;
  rot?: number;
}) {
  const d = `M 0 0
    C ${girth * 0.9} ${len * 0.12}, ${girth * 0.75 + curl} ${len * 0.55}, ${curl * 1.4} ${len}
    C ${-girth * 0.75 + curl} ${len * 0.55}, ${-girth * 0.9} ${len * 0.12}, 0 0 Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={d} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2.4" opacity="0.55" />
      <path
        d={`M ${-girth * 0.3} ${len * 0.16} C ${-girth * 0.42} ${len * 0.4}, ${-girth * 0.2 + curl * 0.6} ${len * 0.66}, ${curl * 0.9} ${len * 0.86}`}
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.32"
      />
      <path d="M -9 2 C -4 -12, 4 -12, 9 2 Z" fill="#3E8E42" />
      <rect x="-2.6" y="-20" width="5.2" height="14" rx="2.6" fill="#4C9A4E" />
    </g>
  );
}

function ArtBody({ art }: { art: ArtKey }) {
  switch (art) {
    case 'chili-red':
      return (
        <g>
          <ChiliShape fill={PALETTE.red[0]} stroke={PALETTE.red[1]} curl={10} len={86} girth={17} x={78} y={54} rot={-14} />
          <ChiliShape fill="#E05A3F" stroke={PALETTE.red[1]} curl={-8} len={74} girth={15} x={126} y={66} rot={16} />
          <ChiliShape fill="#C13A24" stroke={PALETTE.red[1]} curl={6} len={64} girth={13} x={104} y={92} rot={2} />
        </g>
      );
    case 'chili-green':
      return (
        <g>
          <ChiliShape fill="#6FA83F" stroke="#4C7B29" curl={9} len={84} girth={16} x={80} y={56} rot={-12} />
          <ChiliShape fill="#8CC152" stroke="#4C7B29" curl={-7} len={72} girth={14} x={126} y={68} rot={15} />
          <ChiliShape fill="#5D9134" stroke="#4C7B29" curl={5} len={62} girth={12} x={104} y={94} rot={3} />
        </g>
      );
    case 'chili-curly':
      return (
        <g>
          <ChiliShape fill="#C7361F" stroke="#93230F" curl={26} len={120} girth={16} x={72} y={40} rot={-10} />
          <ChiliShape fill="#D8442B" stroke="#93230F" curl={-24} len={112} girth={15} x={132} y={46} rot={12} />
        </g>
      );
    case 'chili-big':
      return (
        <g>
          <ChiliShape fill="#CC3B22" stroke="#93230F" curl={4} len={116} girth={30} x={82} y={42} rot={-8} />
          <ChiliShape fill="#E05A3F" stroke="#93230F" curl={-3} len={104} girth={27} x={134} y={50} rot={10} />
        </g>
      );
    case 'chili-green-big':
      return (
        <g>
          <ChiliShape fill="#5D9134" stroke="#3F6B22" curl={4} len={116} girth={30} x={82} y={42} rot={-8} />
          <ChiliShape fill="#7FB246" stroke="#3F6B22" curl={-3} len={104} girth={27} x={134} y={50} rot={10} />
        </g>
      );

    case 'rice-premium':
    case 'rice-medium':
    case 'rice-sphp':
    case 'rice-glutinous': {
      const tone =
        art === 'rice-glutinous'
          ? ['#FFFFFF', '#E6E1D2']
          : art === 'rice-sphp'
            ? ['#F2E9D2', '#D9CBA8']
            : art === 'rice-medium'
              ? ['#EFE3C6', '#D3C29B']
              : ['#F8F1DE', '#E2D6B5'];
      const grains = [];
      let k = 0;
      for (let row = 0; row < 5; row++) {
        const count = 6 - Math.abs(row - 2);
        for (let i = 0; i < count; i++) {
          const cx = 110 + (i - (count - 1) / 2) * 22 + (row % 2 ? 6 : -6);
          const cy = 74 + row * 17;
          grains.push(
            <ellipse
              key={k++}
              cx={cx}
              cy={cy}
              rx="10"
              ry="5.4"
              fill={row % 2 ? tone[0] : tone[1]}
              stroke="#C9B98F"
              strokeWidth="1"
              transform={`rotate(${((row * 7 + i * 23) % 60) - 30} ${cx} ${cy})`}
            />
          );
        }
      }
      return (
        <g>
          <path d="M40 152 C 60 176, 160 176, 180 152 L 180 168 C 160 186, 60 186, 40 168 Z" fill="#C8A96A" opacity="0.5" />
          {grains}
          <path d="M172 46 C 186 56, 188 78, 178 92" stroke="#8FBF6A" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <Leaf x={172} y={48} r={-24} />
        </g>
      );
    }

    case 'shallot':
      return (
        <g>
          {[
            { x: 78, y: 96, s: 1, c: ['#A85673', '#7E3A52'] },
            { x: 124, y: 104, s: 0.86, c: ['#C1708C', '#8E4B64'] },
            { x: 104, y: 66, s: 0.72, c: ['#94486A', '#6E3049'] },
          ].map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${b.y}) scale(${b.s})`}>
              <path d="M0 0 C -34 -6, -36 34, 0 44 C 36 34, 34 -6, 0 0 Z" fill={b.c[0]} />
              <path d="M0 0 C -12 8, -12 32, 0 44" stroke={b.c[1]} strokeWidth="2.6" fill="none" opacity="0.8" />
              <path d="M0 0 C 12 8, 12 32, 0 44" stroke={b.c[1]} strokeWidth="2.6" fill="none" opacity="0.8" />
              <path d="M-3 0 C -8 -18, 4 -22, 3 0 Z" fill="#8C6239" />
            </g>
          ))}
        </g>
      );

    case 'garlic':
      return (
        <g transform="translate(110 92)">
          <path d="M0 -34 C -46 -14, -44 44, 0 52 C 44 44, 46 -14, 0 -34 Z" fill="#F5F1E4" />
          <path d="M0 -34 C -20 -6, -20 30, 0 52" stroke="#D9D1BC" strokeWidth="3" fill="none" />
          <path d="M0 -34 C 20 -6, 20 30, 0 52" stroke="#D9D1BC" strokeWidth="3" fill="none" />
          <path d="M0 -34 C -36 -8, -34 34, -18 48" stroke="#E2DBC8" strokeWidth="2.4" fill="none" />
          <path d="M0 -34 C 36 -8, 34 34, 18 48" stroke="#E2DBC8" strokeWidth="2.4" fill="none" />
          <path d="M-4 -34 C -10 -56, 8 -58, 4 -34 Z" fill="#C9B98F" />
        </g>
      );

    case 'onion':
      return (
        <g transform="translate(110 96)">
          <path d="M0 -38 C -54 -14, -52 46, 0 56 C 52 46, 54 -14, 0 -38 Z" fill="#D9A05B" />
          <path d="M0 -38 C -26 -8, -26 32, 0 56" stroke="#B27C3C" strokeWidth="3" fill="none" opacity="0.75" />
          <path d="M0 -38 C 26 -8, 26 32, 0 56" stroke="#B27C3C" strokeWidth="3" fill="none" opacity="0.75" />
          <path d="M0 -38 C -42 -10, -40 36, -20 52" stroke="#C48D4B" strokeWidth="2.4" fill="none" />
          <path d="M0 -38 C 42 -10, 40 36, 20 52" stroke="#C48D4B" strokeWidth="2.4" fill="none" />
          <path d="M-4 -38 C -14 -62, 12 -64, 4 -38 Z" fill="#8FBF6A" />
        </g>
      );

    case 'tomato':
      return (
        <g>
          <g transform="translate(102 100)">
            <circle cx="0" cy="0" r="46" fill="#D8442B" />
            <path d="M-46 -4 C -34 -30, 34 -30, 46 -4" stroke="#E8674F" strokeWidth="7" fill="none" opacity="0.5" strokeLinecap="round" />
            <path d="M0 -46 L -14 -34 L -26 -42 L -20 -28 L -34 -26 L -20 -18 L 0 -24 L 20 -18 L 34 -26 L 20 -28 L 26 -42 L 14 -34 Z" fill="#3E8E42" />
            <rect x="-3" y="-56" width="6" height="12" rx="3" fill="#3E8E42" />
          </g>
          <circle cx="164" cy="126" r="26" fill="#C13A24" />
          <path d="M164 100 L 156 108 L 148 104 L 152 112 L 144 116 L 156 118 L 164 112 L 172 118 L 184 116 L 176 112 L 180 104 L 172 108 Z" fill="#3E8E42" transform="translate(0 -2) scale(1)" />
        </g>
      );

    case 'potato':
      return (
        <g>
          <g transform="translate(96 100) rotate(-12)">
            <path d="M-52 -4 C -56 -34, -14 -44, 16 -38 C 50 -32, 60 -6, 52 14 C 44 36, 4 44, -20 36 C -44 28, -48 16, -52 -4 Z" fill="#C99B5F" />
            <ellipse cx="-18" cy="-8" rx="5" ry="3.4" fill="#A87C41" />
            <ellipse cx="16" cy="8" rx="6" ry="4" fill="#A87C41" />
            <ellipse cx="30" cy="-16" rx="4.4" ry="3" fill="#A87C41" />
            <path d="M-46 -12 C -30 -30, 10 -34, 34 -26" stroke="#DCB27C" strokeWidth="7" fill="none" opacity="0.55" strokeLinecap="round" />
          </g>
          <g transform="translate(160 132) rotate(16) scale(0.6)">
            <path d="M-52 -4 C -56 -34, -14 -44, 16 -38 C 50 -32, 60 -6, 52 14 C 44 36, 4 44, -20 36 C -44 28, -48 16, -52 -4 Z" fill="#B98A50" />
          </g>
        </g>
      );

    case 'carrot':
      return (
        <g transform="translate(108 40)">
          <path d="M0 24 C 22 30, 30 56, 22 84 C 16 110, 6 128, 0 138 C -6 128, -16 110, -22 84 C -30 56, -22 30, 0 24 Z" fill="#E08A2E" />
          <path d="M-14 52 L 14 58 M -18 74 L 16 78 M -12 96 L 12 98" stroke="#BE6D18" strokeWidth="3" strokeLinecap="round" />
          <Leaf x={2} y={22} r={-52} />
          <Leaf x={-2} y={22} r={-118} />
          <Leaf x={0} y={20} r={-86} />
        </g>
      );

    case 'leafy':
      return (
        <g transform="translate(110 104)">
          {[-40, -14, 14, 40].map((dx, i) => (
            <g key={i} transform={`translate(${dx} 0) rotate(${dx * 0.28})`}>
              <path d="M0 42 C -22 18, -24 -30, 0 -54 C 24 -30, 22 18, 0 42 Z" fill={i % 2 ? '#7FB246' : '#66A83C'} />
              <path d="M0 42 L 0 -50" stroke="#EFF6E4" strokeWidth="3.4" strokeLinecap="round" opacity="0.8" />
              <path d="M0 20 L -14 4 M 0 2 L -14 -14 M 0 20 L 14 4 M 0 2 L 14 -14" stroke="#EFF6E4" strokeWidth="1.8" opacity="0.55" />
            </g>
          ))}
          <path d="M-52 42 C -20 56, 20 56, 52 42 L 52 52 C 20 66, -20 66, -52 52 Z" fill="#F3F7EC" />
        </g>
      );

    case 'egg':
      return (
        <g>
          {[
            { x: 76, y: 112, r: -14 },
            { x: 142, y: 116, r: 12 },
            { x: 110, y: 74, r: -2 },
          ].map((e, i) => (
            <g key={i} transform={`translate(${e.x} ${e.y}) rotate(${e.r})`}>
              <path d="M0 -38 C 24 -38, 32 -10, 32 6 C 32 26, 18 40, 0 40 C -18 40, -32 26, -32 6 C -32 -10, -24 -38, 0 -38 Z" fill="#F5EBD8" />
              <path d="M-14 -22 C -24 -10, -26 6, -20 20" stroke="#FFFFFF" strokeWidth="6" fill="none" opacity="0.7" strokeLinecap="round" />
              <path d="M0 -38 C 24 -38, 32 -10, 32 6 C 32 26, 18 40, 0 40 C -18 40, -32 26, -32 6 C -32 -10, -24 -38, 0 -38 Z" fill="none" stroke="#DDCFAE" strokeWidth="1.6" />
            </g>
          ))}
        </g>
      );

    case 'chicken':
      return (
        <g transform="translate(106 96)">
          <path d="M-30 -40 C 6 -56, 44 -34, 46 4 C 48 38, 20 58, -8 52 C -34 46, -46 22, -44 -4 C -43 -20, -40 -34, -30 -40 Z" fill="#E9B98E" />
          <path d="M-24 -34 C 0 -46, 30 -30, 34 0" stroke="#F4D2B2" strokeWidth="8" fill="none" opacity="0.6" strokeLinecap="round" />
          <path d="M-34 -34 C -50 -50, -56 -66, -44 -74 C -34 -80, -24 -66, -26 -46 Z" fill="#F3F0E6" />
          <circle cx="-40" cy="-66" r="5" fill="#DDD6C4" />
          <path d="M-6 50 C 10 60, 26 56, 34 44" stroke="#C99B72" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );

    case 'beef':
      return (
        <g transform="translate(108 98)">
          <path d="M-52 -20 C -40 -50, 20 -56, 46 -34 C 66 -16, 58 30, 26 44 C -6 58, -50 40, -56 12 C -58 0, -56 -10, -52 -20 Z" fill="#B3402F" />
          <path d="M-40 -18 C -20 -34, 16 -34, 34 -18" stroke="#C95744" strokeWidth="8" fill="none" opacity="0.6" strokeLinecap="round" />
          <path d="M-30 6 C -10 -6, 18 -4, 32 8" stroke="#F0E4DA" strokeWidth="6" fill="none" opacity="0.85" strokeLinecap="round" />
          <path d="M-24 26 C -6 16, 14 18, 26 28" stroke="#F0E4DA" strokeWidth="4.4" fill="none" opacity="0.7" strokeLinecap="round" />
          <path d="M40 -34 C 60 -34, 66 -8, 56 6 C 50 -14, 46 -26, 40 -34 Z" fill="#F3ECE0" />
        </g>
      );

    case 'oil':
      return (
        <g transform="translate(110 46)">
          <rect x="-16" y="-6" width="32" height="22" rx="6" fill="#8FBF6A" />
          <path d="M-14 16 C -18 34, -40 44, -40 74 L -40 122 C -40 132, -32 138, -22 138 L 22 138 C 32 138, 40 132, 40 122 L 40 74 C 40 44, 18 34, 14 16 Z" fill="#F4E6BE" />
          <path d="M-34 78 L 34 78 L 34 120 C 34 128, 28 132, 20 132 L -20 132 C -28 132, -34 128, -34 120 Z" fill="#D3BE6D" />
          <rect x="-24" y="44" width="48" height="26" rx="5" fill="#FFFFFF" opacity="0.75" />
          <path d="M-30 66 C -34 90, -34 112, -30 126" stroke="#FFFFFF" strokeWidth="7" fill="none" opacity="0.5" strokeLinecap="round" />
        </g>
      );

    case 'sugar':
      return (
        <g>
          <path d="M46 96 C 46 88, 54 84, 62 84 L 158 84 C 166 84, 174 88, 174 96 L 174 150 C 174 158, 166 162, 158 162 L 62 162 C 54 162, 46 158, 46 150 Z" fill="#F1E5C8" />
          <path d="M46 96 C 46 88, 54 84, 62 84 L 158 84 C 166 84, 174 88, 174 96 L 174 108 L 46 108 Z" fill="#E2D3AE" />
          {[
            [72, 62],
            [98, 50],
            [126, 58],
            [150, 46],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${(i * 37) % 40 - 20})`}>
              <rect x="-11" y="-11" width="22" height="22" rx="4" fill="#FFFFFF" />
              <rect x="-11" y="-11" width="22" height="22" rx="4" fill="none" stroke="#E0D6BC" strokeWidth="1.6" />
              <path d="M-7 -6 L 4 -6" stroke="#F3EEE0" strokeWidth="3" strokeLinecap="round" />
            </g>
          ))}
          <path d="M60 128 L 160 128" stroke="#E2D3AE" strokeWidth="4" strokeLinecap="round" />
        </g>
      );

    default:
      return (
        <g transform="translate(110 100)">
          <circle r="46" fill="#A5D6A7" />
          <circle r="30" fill="#66BB6A" />
        </g>
      );
  }
}

export function CommodityArt({
  art,
  className = '',
  photo,
  alt = '',
  showPhoto = true,
}: {
  art: ArtKey;
  className?: string;
  photo?: string;
  alt?: string;
  showPhoto?: boolean;
}) {
  const [photoOk, setPhotoOk] = useState(false);

  // The caller fully controls the outer wrapper (size and position); the inner
  // layer provides the positioning context for the stacked photo.
  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden">
      <svg viewBox="0 0 220 200" className="h-full w-full" role="img" aria-label={alt}>
        <defs>
          <radialGradient id={`bg-${art}`} cx="34%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#F3FAF4" />
            <stop offset="60%" stopColor="#E8F5E9" />
            <stop offset="100%" stopColor="#CFE7D1" />
          </radialGradient>
        </defs>
        <rect width="220" height="200" fill={`url(#bg-${art})`} />
        <circle cx="182" cy="34" r="46" fill="#A5D6A7" opacity="0.35" />
        <circle cx="30" cy="176" r="38" fill="#66BB6A" opacity="0.18" />
        <g className="anim-float" style={{ transformOrigin: '110px 100px' }}>
          <ArtBody art={art} />
        </g>
      </svg>

      {showPhoto && photo && (
        <img
          src={photo}
          alt={alt}
          loading="lazy"
          onLoad={() => setPhotoOk(true)}
          onError={() => setPhotoOk(false)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            photoOk ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      </div>
    </div>
  );
}

export default CommodityArt;
