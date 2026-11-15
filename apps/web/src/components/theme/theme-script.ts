/**
 * Theme persistence shared by the inline boot script and the toggle.
 * The boot script runs before first paint so the page never flashes the wrong theme.
 */
export const THEME_STORAGE_KEY = 'kayan-theme'

export type ThemePreference = 'light' | 'dark'

/** Inline script: stored choice wins; a first visit always starts in light mode. */
export const themeBootScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark';var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);}catch(e){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}})();`
