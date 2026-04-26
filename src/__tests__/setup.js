// jsdom shims for browser APIs the registry uses but tests don't exercise.
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
}
