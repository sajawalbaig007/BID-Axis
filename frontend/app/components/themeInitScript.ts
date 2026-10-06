/** Inline script for layout — prevents theme flash before hydration (SSR only). */
export const THEME_STORAGE_KEY = "theme";

export function themeInitScript(): string {
  return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k)||"system";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(r);document.documentElement.style.colorScheme=r}catch(e){}})();`;
}
