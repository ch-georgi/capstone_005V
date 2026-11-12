import type { Gender } from "./api";

export const welcomeWord = (gender: Gender | undefined) =>
  gender === "FEMALE" ? "Bienvenida" : gender === "MALE" ? "Bienvenido" : "Bienvenido/a";
