import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Polygon, Polyline } from 'react-native-svg';
import { useReducedMotion } from './motion';

export type EggState = 'idle' | 'busy' | 'hatched';

/** All drawings share one 100 × 130 box, so the shells and the chick line up. */
const VIEW_BOX = '0 0 100 130';
const EGG = 'M50 4 C77 4 95 46 95 80 C95 108 75 126 50 126 C25 126 5 108 5 80 C5 46 23 4 50 4 Z';
const CRACK = '10,70 18,62 28,72 38,61 50,72 61,61 71,72 81,62 90,70';
const TOP = `0,0 100,0 100,70 ${CRACK.split(' ').reverse().join(' ')} 0,70`;
const BOTTOM = `0,70 ${CRACK} 100,70 100,130 0,130`;

const CHICK_YELLOW = '#F6C945';
const CHICK_SHADE = '#E8B12E';
const BEAK = '#E07B1A';
const EYE = '#1B2A21';

/** Animations run on the native side (transforms and opacity only), so they stay smooth on cheap phones. */
const timing = (value: Animated.Value, toValue: number, duration: number, easing?: (t: number) => number) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

/**
 * The sign-in egg. It rocks while the phone checks the password, shakes "no"
 * when it's wrong, and hatches a chick when it's right. With "Reduce motion"
 * on the phone, it simply shows the result.
 */
export function HatchingEgg({ state, shake, color, crackColor, size = 120 }: { state: EggState; shake: number; color: string; crackColor: string; size?: number }) {
  const reduced = useReducedMotion();
  // One Animated.Value each, made once for the life of the egg.
  const [rock] = useState(() => new Animated.Value(0));
  const [shakeX] = useState(() => new Animated.Value(0));
  const [crack] = useState(() => new Animated.Value(0));
  const [lid] = useState(() => new Animated.Value(0));
  const [chick] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (state === 'busy' && !reduced) {
      const rocking = Animated.loop(Animated.sequence([timing(rock, -7, 160), timing(rock, 7, 320), timing(rock, 0, 160)]));
      rocking.start();
      return () => {
        rocking.stop();
        timing(rock, 0, 120).start();
      };
    }
    if (state === 'hatched') {
      if (reduced) {
        crack.setValue(1);
        lid.setValue(1);
        chick.setValue(1);
        return;
      }
      const hatching = Animated.parallel([
        timing(crack, 1, 180),
        Animated.sequence([Animated.delay(260), timing(lid, 1, 560, Easing.out(Easing.cubic))]),
        Animated.sequence([Animated.delay(380), Animated.spring(chick, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true })]),
      ]);
      hatching.start();
      return () => hatching.stop();
    }
    crack.setValue(0);
    lid.setValue(0);
    chick.setValue(0);
    return undefined;
  }, [state, reduced, rock, crack, lid, chick]);

  useEffect(() => {
    if (!shake || reduced) return;
    Animated.sequence([timing(shakeX, -12, 50), timing(shakeX, 12, 70), timing(shakeX, -9, 70), timing(shakeX, 9, 70), timing(shakeX, 0, 50)]).start();
  }, [shake, reduced, shakeX]);

  const box = { width: size, height: size * 1.3 };
  const layer = [StyleSheet.absoluteFill, box];
  const whole = { transform: [{ translateX: shakeX }, { rotate: rock.interpolate({ inputRange: [-7, 7], outputRange: ['-7deg', '7deg'] }) }] };
  const top = {
    opacity: lid.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.55] }) },
      { translateX: lid.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.2] }) },
      { rotate: lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-40deg'] }) },
    ],
  };
  const crackLine = { opacity: Animated.multiply(crack, Animated.subtract(1, lid)) };
  const bird = {
    opacity: chick.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' as const }),
    transform: [
      { translateY: chick.interpolate({ inputRange: [0, 1], outputRange: [size * 0.28, -size * 0.06] }) },
      { scale: chick.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
    ],
  };

  return (
    <Animated.View
      style={[box, whole]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={state === 'hatched' ? 'Signed in: the egg hatched a chick' : 'Wechiau egg'}
    >
      {/* The chick waits inside, behind both halves of the shell. */}
      <Animated.View style={[layer, bird]}>
        <Svg viewBox={VIEW_BOX} width="100%" height="100%">
          <Ellipse cx={50} cy={94} rx={26} ry={24} fill={CHICK_YELLOW} />
          <Ellipse cx={34} cy={94} rx={9} ry={13} fill={CHICK_SHADE} />
          <Ellipse cx={66} cy={94} rx={9} ry={13} fill={CHICK_SHADE} />
          <Circle cx={50} cy={62} r={18} fill={CHICK_YELLOW} />
          <Path d="M46 46 Q50 37 54 46" stroke={CHICK_SHADE} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Circle cx={43} cy={58} r={2.8} fill={EYE} />
          <Circle cx={57} cy={58} r={2.8} fill={EYE} />
          <Polygon points="45,64 55,64 50,71" fill={BEAK} />
        </Svg>
      </Animated.View>

      <View style={layer} pointerEvents="none">
        <Svg viewBox={VIEW_BOX} width="100%" height="100%">
          <Defs>
            <ClipPath id="bottom">
              <Polygon points={BOTTOM} />
            </ClipPath>
          </Defs>
          <Path d={EGG} fill={color} clipPath="url(#bottom)" />
        </Svg>
      </View>

      <Animated.View style={[layer, top]} pointerEvents="none">
        <Svg viewBox={VIEW_BOX} width="100%" height="100%">
          <Defs>
            <ClipPath id="top">
              <Polygon points={TOP} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#top)">
            <Path d={EGG} fill={color} />
            <Ellipse cx={36} cy={34} rx={7} ry={13} fill="#FFFFFF" opacity={0.35} />
          </G>
        </Svg>
      </Animated.View>

      <Animated.View style={[layer, crackLine]} pointerEvents="none">
        <Svg viewBox={VIEW_BOX} width="100%" height="100%">
          <Polyline points={CRACK} stroke={crackColor} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
