// Harness self-test only: no language code or production fault injection.
process.once('message', () => {
  if (process.argv[2] === '0') process.exit(17);
  else setTimeout(() => process.disconnect?.(), 10000);
});
process.send?.({ type: 'start', input: { seed: Number(process.argv[2]), index: 0, text: 'known fixture', category: 'harness-self-test' } });
