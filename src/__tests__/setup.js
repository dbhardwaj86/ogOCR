// jsdom shims for browser APIs the registry uses but tests don't exercise.
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
}

// jsdom doesn't ship a working IndexedDB; pull in fake-indexeddb so the
// `src/storage/idb.js` wrapper has a real-shaped DB to talk to. Importing
// `fake-indexeddb/auto` patches the global `indexedDB` and `IDBKeyRange`.
import 'fake-indexeddb/auto';
