export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEngine } = await import('./lib/engineScheduler');
    if (process.env.ENGINE_ENABLED === 'true') {
      startEngine();
    }
  }
}
