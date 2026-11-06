// Runs once when the Next.js server starts, before any request is handled.
// The Node-only import must sit inside this exact check so Next.js drops it from the Edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDatabaseOnStartup } = await import('./instrumentation-node');
    await initDatabaseOnStartup();
  }
}
