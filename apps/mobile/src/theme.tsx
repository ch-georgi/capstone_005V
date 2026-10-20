import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { Platform } from "react-native";
export const palettes = {
  dark: { background: "#000000", surface: "#121C20", card: "#08150F", green: "#20F3A2", cyan: "#32BEDD", gray: "#455059", white: "#F5F7F8", muted: "#BCC6CA", error: "#FFB7B7", input: "#F5F7F8", ink: "#172126", border: "#254339", middle: "#00251B" },
  light: { background: "#F4F8F6", surface: "#FFFFFF", card: "#FFFFFF", green: "#087D52", cyan: "#06718A", gray: "#BBCAC3", white: "#14251E", muted: "#4E6258", error: "#B42318", input: "#FFFFFF", ink: "#14251E", border: "#CCDCD3", middle: "#E0F5E9" },
};
export type ThemeMode = keyof typeof palettes;
const Context = createContext({ mode: "dark" as ThemeMode, colors: palettes.dark, setMode: (_mode: ThemeMode) => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
 const [mode,setModeState]=useState<ThemeMode>("dark");
 const changed=useRef(false);
 const writes=useRef(Promise.resolve());
 useEffect(()=>{ void AsyncStorage.getItem("wellq.appearance.v1").then(value=>{ if(!changed.current && (value==="light" || value==="dark")) setModeState(value); }).catch(()=>undefined); },[]);
 useEffect(()=>{ if(Platform.OS!=="web") void SystemUI.setBackgroundColorAsync(palettes[mode].background).catch(()=>undefined); },[mode]);
 function setMode(value: ThemeMode) { changed.current=true;setModeState(value);writes.current=writes.current.then(()=>AsyncStorage.setItem("wellq.appearance.v1",value)).catch(()=>undefined); }
 return <Context.Provider value={{mode,colors:palettes[mode],setMode}}>{children}</Context.Provider>;
}
export const useTheme=()=>useContext(Context);
