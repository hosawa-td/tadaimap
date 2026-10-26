import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors, spacing, typography } from "../theme/tokens";

const DOT_COUNT = 3;

export default function LaunchScreen() {
  const house = useRef(new Animated.Value(0)).current;
  const texts = useRef(new Animated.Value(0)).current;
  const dots = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(house, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(texts, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.stagger(
        180,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0.3, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ])
        )
      )
    );
    pulse.start();
    return () => pulse.stop();
  }, [house, texts, dots]);

  const houseStyle = {
    opacity: house,
    transform: [
      { scale: house.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
      { translateY: house.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
    ],
  };
  const textStyle = {
    opacity: texts,
    transform: [{ translateY: texts.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.house, houseStyle]}>
        <View style={styles.roof} />
        <View style={styles.body} />
      </Animated.View>
      <View style={styles.dotRow}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { opacity: dot, transform: [{ scale: dot.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.15] }) }] }]}
          />
        ))}
      </View>
      <Animated.Text style={[styles.title, textStyle]}>タダイマップ</Animated.Text>
      <Animated.Text style={[styles.caption, textStyle]}>家族の「ただいま」を、そっと共有</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  house: { alignItems: "center" },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 63,
    borderRightWidth: 63,
    borderBottomWidth: 58,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.primary,
  },
  body: { width: 90, height: 56, backgroundColor: colors.primary },
  dotRow: { flexDirection: "row", gap: 6, marginTop: spacing.md, marginBottom: spacing.lg },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent },
  title: { ...typography.headlineLg, color: colors.primary },
  caption: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.sm },
});
