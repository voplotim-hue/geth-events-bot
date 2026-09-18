import { isoNow, localNowParts } from "./time.js";

export async function runPastoralFollowupReminders({ config, store, telegram, logger = console }) {
  const now = localNowParts(config.timeZone);
  const reminderTime = config.weeklyService?.pastoralReminderTime || { hour: 10, minute: 0 };
  if (now.hour < reminderTime.hour || (now.hour === reminderTime.hour && now.minute < reminderTime.minute)) {
    return { skipped: "not_due" };
  }

  const requests = await store.listPastoralContinuations({
    reminderDate: now.dateKey,
    status: "reminder_pending"
  });
  let sent = 0;
  for (const request of requests) {
    if (request.type !== "weekday_dm" || !request.leader_user_id) continue;
    try {
      await telegram.sendMessage(
        request.leader_user_id,
        `Напоминание: вы планировали продолжить общение в ЛС с ${request.teenager_name || "подростком"}.`
      );
      await store.updatePastoralContinuation(request.request_id, {
        status: "reminder_sent",
        reminder_sent_at: isoNow()
      });
      sent += 1;
    } catch (error) {
      logger.warn(`[pastoral_followup] request=${request.request_id}: ${error.message}`);
    }
  }
  return { checked: true, sent };
}

export function startPastoralFollowupScheduler({ config, store, telegram, logger = console }) {
  let lastRunDate = "";

  async function tick() {
    const now = localNowParts(config.timeZone);
    if (lastRunDate === now.dateKey) return;
    const result = await runPastoralFollowupReminders({ config, store, telegram, logger });
    if (result.checked) {
      lastRunDate = now.dateKey;
      logger.log(`[pastoral_followup] checked ${now.dateKey}, sent=${result.sent}`);
    }
  }

  const timer = setInterval(() => {
    tick().catch((error) => logger.error("[pastoral_followup]", error));
  }, 60_000);
  tick().catch((error) => logger.error("[pastoral_followup]", error));
  return timer;
}
