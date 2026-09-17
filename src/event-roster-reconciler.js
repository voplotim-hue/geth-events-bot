const INITIAL_DELAY_MS = 60_000;
const INTERVAL_MS = 10 * 60_000;

export function startEventRosterReconciler({ store, logger = console }) {
  if (!store?.enabled || typeof store.reconcileActiveEventRosters !== "function") return;

  const run = async () => {
    try {
      const result = await store.reconcileActiveEventRosters();
      if (result.repaired || result.errors) {
        logger.log(`[event_roster_reconcile] repaired=${result.repaired} errors=${result.errors}`);
      }
    } catch (error) {
      logger.warn(`[event_roster_reconcile] ${error.message}`);
    }
  };

  const initialTimer = setTimeout(run, INITIAL_DELAY_MS);
  const interval = setInterval(run, INTERVAL_MS);
  initialTimer.unref?.();
  interval.unref?.();
}
