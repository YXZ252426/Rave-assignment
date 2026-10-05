globalThis.fetch = async () => {
  throw new Error('Unexpected fetch in offline CLI test.');
};
