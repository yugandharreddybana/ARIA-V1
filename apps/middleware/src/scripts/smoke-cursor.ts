/**
 * Owner-run smoke for Cursor planning and cloud agents.
 * CI does not call this. Set CURSOR_API_KEY and SMOKE_REPO to exercise a live key.
 */
async function main(): Promise<void> {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    console.log('smoke:cursor skipped: set CURSOR_API_KEY and SMOKE_REPO to run the live check');
    return;
  }
  const base = (process.env.CURSOR_API_BASE || 'https://api.cursor.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Cursor models returned HTTP ${res.status}`);
  console.log('smoke:cursor listed models');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'smoke failed');
  process.exit(1);
});
