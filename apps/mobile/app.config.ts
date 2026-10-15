import { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const demoMode = process.env.WELLQ_DEMO_MODE === "true";
  if (demoMode && process.env.WELLQ_APP_ENV === "production")
    throw new Error("El modo demostración no está permitido en el perfil de producción.");
  return {
    ...config,
    extra: {
      ...config.extra,
      demoMode,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000/api/v1",
    },
    name: "WellQ",
    slug: "wellq-mobile",
    plugins: (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties"
        ? [
            "expo-build-properties",
            {
              android: {
                minSdkVersion: 29,
                usesCleartextTraffic: (
                  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000/api/v1"
                ).startsWith("http:"),
              },
            },
          ]
        : plugin,
    ),
  };
};
