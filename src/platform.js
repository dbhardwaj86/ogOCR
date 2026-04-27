// Tiny platform helper. The keyboard handler binds both ⌘ and Ctrl, so
// only the visible label needs OS detection — everything else still works
// regardless of the host platform.

function detectIsMac() {
  if (typeof navigator === 'undefined') return false;
  // `navigator.platform` is the historical signal; modern browsers also
  // expose `navigator.userAgentData`, but Safari + Firefox lag behind so
  // platform stays the most reliable cross-browser tell. macOS reports
  // `MacIntel` (intel + Apple silicon both); iOS/iPadOS report
  // `iPhone`/`iPad`. Treat all Apple platforms as ⌘ since that's the
  // physical key the user has.
  const p = navigator.platform || '';
  return /Mac|iPad|iPhone|iPod/i.test(p);
}

const IS_MAC = detectIsMac();

// Symbolic glyph for the platform's primary modifier key.
export function modKeyGlyph() {
  return IS_MAC ? '⌘' : 'Ctrl';
}

// Short label suitable for KBD-style chips ("⌘K" / "Ctrl K"). The space
// before the letter only renders on non-Mac so the Ctrl form stays
// readable.
export function modKeyLabel(letter) {
  if (IS_MAC) return `⌘${letter}`;
  return `Ctrl ${letter}`;
}
