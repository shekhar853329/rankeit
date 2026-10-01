import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

export interface UseCollapsibleOptions {
  duration?: number;
  easingExpand?: (value: number) => number;
  easingCollapse?: (value: number) => number;
}

/**
 * Balanced, gentle S-curve easing:
 * - Starts softly with zero initial jerk (unlike ease-out which explodes immediately).
 * - Accelerates smoothly through the mid-portion.
 * - Decelerates with a cushion to a soft, natural landing.
 */
export const DEFAULT_EXPAND_EASING = Easing.bezier(0.38, 0, 0.22, 1);
export const DEFAULT_COLLAPSE_EASING = Easing.bezier(0.38, 0, 0.25, 1);

/**
 * Custom hook to drive buttery smooth height, opacity, and chevron animations
 * across Web, iOS, and Android.
 */
export function useCollapsible(
  collapsed: boolean,
  options?: UseCollapsibleOptions
) {
  const duration = options?.duration ?? 340;
  const easingExpand = options?.easingExpand ?? DEFAULT_EXPAND_EASING;
  const easingCollapse = options?.easingCollapse ?? DEFAULT_COLLAPSE_EASING;

  const animProgress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [isFullyExpanded, setIsFullyExpanded] = useState<boolean>(!collapsed);

  // Keep track of measured height to smoothly animate between 0 and measuredHeight
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && (measuredHeight === null || Math.abs(h - measuredHeight) > 1)) {
        setMeasuredHeight(h);
      }
    },
    [measuredHeight]
  );

  useEffect(() => {
    if (!collapsed) {
      // Expanding: smoothly animate from 0 to 1 with balanced acceleration and deceleration
      Animated.timing(animProgress, {
        toValue: 1,
        duration,
        easing: easingExpand,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setIsFullyExpanded(true);
        }
      });
    } else {
      // Collapsing: lock height back to measured value and smoothly animate to 0
      setIsFullyExpanded(false);
      Animated.timing(animProgress, {
        toValue: 0,
        duration: Math.max(220, Math.round(duration * 0.88)),
        easing: easingCollapse,
        useNativeDriver: false,
      }).start();
    }
  }, [collapsed, duration, easingExpand, easingCollapse, animProgress]);

  const targetHeight = measuredHeight && measuredHeight > 0 ? measuredHeight : 240;

  const animatedHeight = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetHeight],
  });

  // Natural linear opacity matching the smoothed progress curve
  const animatedOpacity = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const animatedTranslateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-5, 0],
  });

  const chevronRotate = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const containerStyle: StyleProp<ViewStyle> = {
    height: isFullyExpanded ? undefined : animatedHeight,
    opacity: animatedOpacity,
    transform: [{ translateY: animatedTranslateY }],
    overflow: 'hidden',
  };

  const chevronStyle = {
    transform: [{ rotate: chevronRotate }],
  };

  return {
    animProgress,
    measuredHeight,
    isFullyExpanded,
    handleLayout,
    containerStyle,
    chevronStyle,
  };
}

export interface SmoothCollapsibleProps {
  collapsed: boolean;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Animated collapsible container that smoothly expands and collapses content
 * without layout jank, abrupt popping, or aggressive initial acceleration.
 */
export const SmoothCollapsible: React.FC<SmoothCollapsibleProps> = ({
  collapsed,
  duration = 340,
  style,
  children,
}) => {
  const { containerStyle, handleLayout, measuredHeight } = useCollapsible(
    collapsed,
    { duration }
  );

  return (
    <Animated.View
      style={[containerStyle, style]}
      pointerEvents={collapsed ? 'none' : 'auto'}>
      <View
        onLayout={handleLayout}
        pointerEvents={collapsed ? 'none' : 'auto'}
        style={
          measuredHeight === null && collapsed
            ? {
                position: 'absolute',
                top: -9999,
                left: 0,
                right: 0,
                opacity: 0,
              }
            : undefined
        }>
        {children}
      </View>
    </Animated.View>
  );
};

export interface SmoothChevronProps {
  animProgress?: Animated.Value;
  expanded?: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Animated chevron icon that smoothly rotates 180 degrees synchronously
 * with the collapsible window.
 */
export const SmoothChevron: React.FC<SmoothChevronProps> = ({
  animProgress,
  expanded,
  size = 14,
  color,
  style,
}) => {
  const internalAnim = useRef(
    new Animated.Value(expanded ? 1 : 0)
  ).current;

  useEffect(() => {
    if (expanded !== undefined) {
      Animated.timing(internalAnim, {
        toValue: expanded ? 1 : 0,
        duration: 320,
        easing: DEFAULT_EXPAND_EASING,
        useNativeDriver: false,
      }).start();
    }
  }, [expanded, internalAnim]);

  const activeAnim = animProgress ?? internalAnim;

  const rotate = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <Animated.View style={[{ transform: [{ rotate }] }, style]}>
      <Ionicons name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
};
