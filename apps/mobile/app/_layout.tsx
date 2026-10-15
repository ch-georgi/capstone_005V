import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/context";
function Routes() {
  const { status } = useAuth();
  if (status === "loading")
    return (
      <View
        style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}
      >
        <ActivityIndicator
          color="#20F3A2"
          accessibilityLabel="Recuperando sesión"
        />
      </View>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
      }}
    >
      <Stack.Protected guard={status === "anonymous"}>
        <Stack.Screen name="login" />
        <Stack.Screen name="recovery" />
      </Stack.Protected>
      <Stack.Protected guard={status === "authenticated"}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected
        guard={status === "selection" || status === "authenticated"}
      >
        <Stack.Screen name="clinics" />
      </Stack.Protected>
    </Stack>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Poppins_400Regular: require("../assets/fonts/Poppins-Regular.ttf"),
    Poppins_500Medium: require("../assets/fonts/Poppins-Medium.ttf"),
    Poppins_600SemiBold: require("../assets/fonts/Poppins-SemiBold.ttf"),
    Poppins_700Bold: require("../assets/fonts/Poppins-Bold.ttf"),
  });
  if (error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: "#fff" }}>
          No se pudo cargar la tipografía. Vuelve a abrir la aplicación.
        </Text>
      </View>
    );
  if (!loaded)
    return (
      <View
        style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}
      >
        <ActivityIndicator color="#20F3A2" />
      </View>
    );
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Routes />
    </AuthProvider>
  );
}
