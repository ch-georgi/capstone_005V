import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { clearTemporaryDocuments } from "../documents/files";
import { api } from "./api";
import { demoMode } from "./mode";
import { createDemoApi, createDemoStorage } from "./demo";
import { SessionManager } from "./session";
const Context = createContext<SessionManager | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [manager] = useState(
    () =>
      new SessionManager(demoMode ? createDemoApi() : api, demoMode ? createDemoStorage() : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        deleteItem: SecureStore.deleteItemAsync,
      }),
  );
  useEffect(() => {
    clearTemporaryDocuments();
    void manager.restore();
    let stopClinical:(()=>void)|undefined;
    let disposed=false;
    if(Platform.OS==="android"&&!demoMode)void import("../clinical/lifecycle").then(({startClinical})=>{if(!disposed)stopClinical=startClinical(manager);});
    let previous="";
    const stop=manager.subscribe(()=>{const profile=manager.getSnapshot().profile;const key=profile?`${profile.user.id}:${profile.clinic.id}`:"";if(previous&&previous!==key)clearTemporaryDocuments();previous=key;});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void manager.revalidate();
    });
    return () => {disposed=true;stopClinical?.();sub.remove();stop();clearTemporaryDocuments();};
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}
export function useAuth() {
  const manager = useContext(Context);
  if (!manager) throw new Error("AuthProvider requerido");
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  return { manager, ...state };
}
