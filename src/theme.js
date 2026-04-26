// Single source of truth for theme metadata. Imported by App.jsx (cycle) and
// TopBar.jsx (label). Keep these three in sync with the data-theme rules in
// src/index.css.
export const THEMES = ['paper', 'sepia', 'ink'];

export const THEME_LABELS = Object.freeze({
  paper: 'Paper',
  sepia: 'Sepia',
  ink: 'Ink',
});

export const NEXT_THEME = Object.freeze({
  paper: 'sepia',
  sepia: 'ink',
  ink: 'paper',
});

export function nextTheme(t) {
  return NEXT_THEME[t] || 'paper';
}
