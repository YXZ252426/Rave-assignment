// Default tests must inject transport; an accidental real fetch cannot leave the process.
globalThis.fetch = async () => {
  throw new Error(
    'Unexpected network call in offline tests. Inject a mock transport.',
  );
};
