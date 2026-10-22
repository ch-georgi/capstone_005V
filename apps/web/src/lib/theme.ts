export type Theme = "light" | "dark";
const KEY = "wellq-theme";

/** Tema vigente: lo fija index.html antes de pintar; claro si no hay nada guardado. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Aplica el tema y lo recuerda en este navegador (el almacenamiento puede no estar disponible). */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* modo privado o almacenamiento bloqueado: el tema vale solo para esta visita */
  }
}
