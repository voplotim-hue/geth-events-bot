import { localNowParts } from "./time.js";
import { isPresent, saturdayDateKey, serviceControlCallbackData } from "./weekly-service.js";

function isLeaderComing(row) {
  const actual = String(row.actual_present || "").trim().toLowerCase();
  if (["нет", "no", "0", "false"].includes(actual)) return false;
  return isPresent(row.actual_present) || String(row.poll_answer || "").trim() === "Буду";
}

function leaderName(row) {
  return row.full_name || row.username || row.telegram_user_id || "Лидер";
}

export async function runWeeklyServiceCoordinatorSummary({ config, store, telegram, logger = console }) {
  const now = localNowParts(config.timeZone);
  const reminderTime = config.weeklyService?.coordinatorSummaryTime || { hour: 8, minute: 0 };
  if (now.weekday !== "Sat" || now.hour < reminderTime.hour
    || (now.hour === reminderTime.hour && now.minute < reminderTime.minute)) {
    return { skipped: "not_due" };
  }

  const dateKey = saturdayDateKey(now);
  const service = await store.getWeeklyServiceByDate(dateKey);
  if (!service || String(service.status) === "cancelled") return { skipped: "service_unavailable" };

  const attendance = await store.listWeeklyAttendance(service.service_id);
  const leaders = attendance.filter((row) => row.group === "leaders");
  const coming = leaders.filter(isLeaderComing);
  const undecided = leaders.filter((row) => String(row.poll_answer || "") === "Пока не знаю");
  const lines = [
    `Служение сегодня, ${dateKey.split("-").reverse().join(".")}`,
    "",
    `Будут (${coming.length}):`,
    ...(coming.length ? coming.map((row) => `• ${leaderName(row)}`) : ["• Пока никто не отметил «Буду»"])
  ];
  if (undecided.length) {
    lines.push("", `Пока не знают (${undecided.length}):`, ...undecided.map((row) => `• ${leaderName(row)}`));
  }
  lines.push("", "Можно настроить нагрузку лидеров. После финальной отметки присутствующих запускайте распределение.");

  for (const coordinatorId of config.weeklyService?.coordinatorIds || []) {
    try {
      await telegram.sendMessage(coordinatorId, lines.join("\n"), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Настроить нагрузку лидеров", callback_data: serviceControlCallbackData("weights", service.service_id) }],
            [{ text: "Сформировать группы", callback_data: serviceControlCallbackData("assign", service.service_id) }]
          ]
        }
      });
    } catch (error) {
      logger.warn(`[weekly_service_summary] coordinator=${coordinatorId}: ${error.message}`);
    }
  }
  return { checked: true, serviceId: service.service_id, leaders: coming.length };
}

export function startWeeklyServiceCoordinatorSummaryScheduler({ config, store, telegram, logger = console }) {
  let lastRunDate = "";

  async function tick() {
    const now = localNowParts(config.timeZone);
    if (lastRunDate === now.dateKey) return;
    const result = await runWeeklyServiceCoordinatorSummary({ config, store, telegram, logger });
    if (result.checked) {
      lastRunDate = now.dateKey;
      logger.log(`[weekly_service_summary] sent ${now.dateKey}, leaders=${result.leaders}`);
    }
  }

  const timer = setInterval(() => {
    tick().catch((error) => logger.error("[weekly_service_summary]", error));
  }, 60_000);
  tick().catch((error) => logger.error("[weekly_service_summary]", error));
  return timer;
}
