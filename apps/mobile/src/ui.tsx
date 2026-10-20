import React from "react";
import { useTheme, palettes } from "./theme";
import { demoMode } from "./auth/mode";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
export const colors = palettes.dark;
export function Screen({ children, center = true }: { children: React.ReactNode; center?: boolean }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.background, colors.middle, colors.background]}
      locations={[0, 0.48, 1]}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[styles.screen, !center && { justifyContent: "flex-start" }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              {demoMode ? <Badge>Modo demostración · Datos ficticios</Badge> : null}
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
export function Logo() {
  const { mode } = useTheme();
  return (
    <Image
      source={mode === "dark" ? require("../assets/wellq-logo.png") : require("../assets/wellq-logo-light.png")}
      accessibilityLabel="WellQ. Predict. Prevent. Perform."
      resizeMode="contain"
      style={styles.logo}
    />
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading,{color:colors.white}]}>
      {children}
    </Text>
  );
}
export function Copy({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.copy, { color: muted ? colors.muted : colors.white }]}>
      {children}
    </Text>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.badge,{color:colors.green}]}>{children}</Text>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label,{color:colors.white}]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#68757B"
        style={[styles.input, { backgroundColor:colors.input, color:colors.ink, borderWidth:1,borderColor:colors.gray }, props.style]}
      />
    </View>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { colors, mode } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor:colors.green },
        secondary && [styles.secondary,{ backgroundColor:colors.surface,borderColor:colors.gray }],
        (pressed || disabled || busy) && { opacity: 0.65 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.white : mode === "light" ? "#FFFFFF" : "#001D13"} />
      ) : (
        <Text style={[styles.buttonText, {color: secondary ? colors.white : mode === "light" ? "#FFFFFF" : "#001D13"}]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Link({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={[styles.linkText,{color:colors.green}]}>{title}</Text>
    </Pressable>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  const { colors } = useTheme();
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.error,{color:colors.error}]}
    >
      {message}
    </Text>
  ) : null;
}
export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card,{backgroundColor:colors.card,borderColor:colors.border}]}>{children}</View>;
}
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flexGrow: 1, padding: 24, justifyContent: "center" },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: 16 },
  logo: { width: 200, height: 76, alignSelf: "flex-start", marginBottom: 20 },
  heading: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 32,
    lineHeight: 42,
    color: colors.white,
  },
  copy: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 25,
    color: colors.white,
  },
  badge: {
    fontFamily: "Poppins_500Medium",
    color: colors.green,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  field: { gap: 8 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 14, color: colors.white },
  input: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: "#172126",
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
  },
  button: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.green,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gray,
  },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#001D13",
    textAlign: "center",
  },
  link: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: colors.green,
    textAlign: "center",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: colors.error,
  },
  card: {
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#254339",
    backgroundColor: "#08150F",
    borderRadius: 20,
  },
});
