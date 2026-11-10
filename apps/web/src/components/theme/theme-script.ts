/**
 * Theme persistence shared by the inline boot script and the toggle.
 * The boot script runs before first paint so the page never flashes the wrong theme.
 */
export const THEME_STORAGE_KEY = 'kayan-theme'

export type ThemePreference = 'light' | 'dark'

/** Inline script: stored choice wins, otherwise follow the operating system. */
export const themeBootScript = `(function(){try{var k='${THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);}catch(e){}})();`
