import React from "react";
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
export const colors = {
  background: "#000000",
  surface: "#121C20",
  green: "#20F3A2",
  cyan: "#32BEDD",
  gray: "#455059",
  white: "#F5F7F8",
  muted: "#BCC6CA",
  error: "#FFB7B7",
};
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={["#000000", "#00251B", "#000000"]}
      locations={[0, 0.48, 1]}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.screen}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
export function Logo() {
  return (
    <Image
      source={require("../assets/wellq-logo.png")}
      accessibilityLabel="WellQ. Predict. Prevent. Perform."
      resizeMode="contain"
      style={styles.logo}
    />
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
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
  return (
    <Text style={[styles.copy, muted && { color: colors.muted }]}>
      {children}
    </Text>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <Text style={styles.badge}>{children}</Text>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#68757B"
        style={[styles.input, props.style]}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (pressed || disabled || busy) && { opacity: 0.65 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.white : "#001D13"} />
      ) : (
        <Text style={[styles.buttonText, secondary && { color: colors.white }]}>
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
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{title}</Text>
    </Pressable>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.error}
    >
      {message}
    </Text>
  ) : null;
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
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
