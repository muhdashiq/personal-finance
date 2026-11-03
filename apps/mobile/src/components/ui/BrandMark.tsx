import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

type BrandMarkProps = { size?: number };

/**
 * The app icon as a vector (same geometry as assets/brand/mark.svg):
 * a home whose interior is a rising bar chart, on an indigo tile.
 */
export const BrandMark = ({ size = 64 }: BrandMarkProps) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityRole="image" accessibilityLabel="Family Finance">
    <Defs>
      <LinearGradient id="brandBg" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#333E8C" />
        <Stop offset="1" stopColor="#1E2558" />
      </LinearGradient>
    </Defs>
    <Rect width="1024" height="1024" rx="230" fill="url(#brandBg)" />
    <G transform="translate(512 512) scale(0.92) translate(-512 -522)">
      <Path d="M236 500 L512 268 L788 500" fill="none" stroke="#FFFFFF" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M316 476 V736 Q316 776 356 776 H668 Q708 776 708 736 V476"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={52}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="392" y="616" width="64" height="104" rx="16" fill="#8FA8F8" />
      <Rect x="480" y="548" width="64" height="172" rx="16" fill="#B9C6FF" />
      <Rect x="568" y="468" width="64" height="252" rx="16" fill="#4CC38A" />
    </G>
  </Svg>
);
