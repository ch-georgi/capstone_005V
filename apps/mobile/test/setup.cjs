jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-system-ui", () => ({setBackgroundColorAsync:jest.fn(()=>Promise.resolve())}));
jest.mock("@expo/vector-icons/Ionicons", () => "Ionicon");
