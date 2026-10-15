import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { SessionManager } from "./session";
const Context = createContext<SessionManager | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [manager] = useState(
    () =>
      new SessionManager(api, {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        deleteItem: SecureStore.deleteItemAsync,
      }),
  );
  useEffect(() => {
    void manager.restore();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void manager.revalidate();
    });
    return () => sub.remove();
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}
export function useAuth() {
  const manager = useContext(Context);
  if (!manager) throw new Error("AuthProvider requerido");
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  return { manager, ...state };
}
