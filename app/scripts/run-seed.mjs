global.alert = (msg) => console.log('[SEED-ALERT]', msg);
const { seedDatabase } = await import('./seed-bundle.mjs');
await seedDatabase({ silent: true });
console.log('SEED DONE');