import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, View, type DimensionValue, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type SkeletonProps = { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle };

/** Pulsing placeholder; respects the reduce-motion setting. */
export const Skeleton = ({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) => {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        ]),
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.skeleton, opacity }, style]}
    />
  );
};

/** A card-shaped group of skeleton lines. */
export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, gap: 12 }}
    >
      <Skeleton width="40%" height={12} />
      <Skeleton width="65%" height={26} />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} width={`${80 - i * 15}%`} />
      ))}
    </View>
  );
};
