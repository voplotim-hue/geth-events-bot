import { isoNow, localNowParts } from "./time.js";

export const WEEKLY_SERVICE_SHEET = "Субботние служения";
export const WEEKLY_ATTENDANCE_SHEET = "Посещаемость служений";

export const WEEKLY_SERVICE_COLUMNS = [
  "ID служения",
  "Дата",
  "Статус",
  "ID сообщения лидеров",
  "ID сообщения подростков",
  "Создано",
  "Отменено",
  "Распределено"
];

export const WEEKLY_ATTENDANCE_COLUMNS = [
  "ID служения",
  "Дата",
  "Telegram ID",
  "ФИО",
  "Username",
  "Роль",
  "Группа",
  "Ответ на опрос",
  "Фактически присутствует",
  "Источник отметки",
  "Нагрузка лидера",
  "Назначенный лидер ID",
  "Назначенный лидер",
  "Время ответа",
  "Обновлено"
];

export const PASTORAL_NOTE_COLUMNS = [
  "Дата",
  "ID служения",
  "Подросток",
  "Username подростка",
  "Лидер",
  "Статус беседы",
  "Комментарий",
  "Создано"
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(parts) {
  return `${parts.dateKey}`;
}

export function saturdayDateKey(parts = localNowParts("Europe/Minsk")) {
  const date = new Date(`${parts.dateKey}T12:00:00Z`);
  const current = date.getUTCDay();
  const offset = (6 - current + 7) % 7;
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function weeklyServiceId(dateKey) {
  return `service_${String(dateKey || "").replace(/[^0-9]/g, "")}`;
}

export function serviceVoteCallbackData(serviceId, group, answer) {
  return `service_vote:${serviceId}:${group}:${answer}`;
}

export function serviceControlCallbackData(action, serviceId = "") {
  return `service:${action}${serviceId ? `:${serviceId}` : ""}`;
}

export function weeklyPollKeyboard(serviceId, group) {
  const options = group === "leaders"
    ? [["Буду", "yes"], ["Не буду", "no"], ["Пока не знаю", "maybe"]]
    : [["Буду", "yes"], ["Не буду", "no"]];
  return {
    inline_keyboard: options.map(([text, answer]) => [{
      text,
      callback_data: serviceVoteCallbackData(serviceId, group, answer)
    }])
  };
}

export function isPresent(value) {
  return ["да", "yes", "1", "true", "буду"].includes(String(value || "").trim().toLowerCase());
}

export function attendanceLabel(answer) {
  return ({ yes: "Буду", no: "Не буду", maybe: "Пока не знаю" })[String(answer || "")] || "";
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function weightedAssignments(leaders, teenagers) {
  const eligibleLeaders = leaders.filter((leader) => String(leader.telegram_user_id || "").trim());
  if (!eligibleLeaders.length) throw new Error("Нет фактически присутствующих лидеров для распределения.");

  const weightSum = eligibleLeaders.reduce((sum, leader) => sum + Math.max(1, Number(leader.leader_weight || 2)), 0);
  const count = teenagers.length;
  const quotas = eligibleLeaders.map((leader, index) => {
    const exact = count * Math.max(1, Number(leader.leader_weight || 2)) / weightSum;
    return { leader, index, count: Math.floor(exact), fraction: exact % 1 };
  });

  let remaining = count - quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of [...quotas].sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {
    if (!remaining) break;
    quota.count += 1;
    remaining -= 1;
  }

  const slots = shuffle(quotas.flatMap((quota) => Array.from({ length: quota.count }, () => quota.leader)));
  return shuffle(teenagers).map((teenager, index) => ({ teenager, leader: slots[index] }));
}

export async function runWeeklyServicePoll({ config, store, telegram, logger = console }) {
  if (!config.weeklyService?.enabled) return { skipped: "disabled" };
  if (!config.groupChatId || !config.leadersGroupChatId) return { skipped: "chat_not_configured" };

  const now = localNowParts(config.timeZone);
  if (now.weekday !== "Sat" || now.hour !== config.weeklyService.pollTime.hour || now.minute !== config.weeklyService.pollTime.minute) {
    return { skipped: "not_due" };
  }

  const dateKey = dateKeyFromParts(now);
  await store.ensureWeeklyServiceSheets();
  let service = await store.getWeeklyServiceByDate(dateKey);
  if (String(service?.status || "") === "cancelled") return { skipped: "cancelled", service };
  if (String(service?.status || "") === "polls_sent") return { skipped: "already_sent", service };

  if (!service) {
    service = await store.createWeeklyService({
      serviceId: weeklyServiceId(dateKey),
      dateKey,
      status: "scheduled"
    });
  }

  const leaderMessage = await telegram.sendMessage(
    config.leadersGroupChatId,
    "Кто сегодня будет на подростковом служении?",
    { reply_markup: weeklyPollKeyboard(service.service_id, "leaders") }
  );
  const teenMessage = await telegram.sendMessage(
    config.groupChatId,
    "Сегодня буду на подростковом служении?",
    { reply_markup: weeklyPollKeyboard(service.service_id, "teenagers") }
  );

  service = await store.updateWeeklyService(service.service_id, {
    status: "polls_sent",
    leader_message_id: String(leaderMessage.message_id || ""),
    teenager_message_id: String(teenMessage.message_id || "")
  });
  logger.log(`[weekly_service] polls sent for ${dateKey}`);
  return { sent: true, service };
}

export function startWeeklyServiceScheduler({ config, store, telegram, logger = console }) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runWeeklyServicePoll({ config, store, telegram, logger });
      if (result.sent) logger.log(`[weekly_service] scheduler created ${result.service.service_id}`);
    } catch (error) {
      logger.error("[weekly_service] scheduler", error);
    } finally {
      running = false;
    }
  };

  tick();
  return setInterval(tick, 30 * 1000);
}

export function weeklyAttendanceRow({ service, user, group, answer, existing = {} }) {
  return {
    service_id: service.service_id,
    service_date: service.service_date,
    telegram_user_id: String(user.telegram_user_id || user.id || ""),
    full_name: [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(" ") || user.username || "",
    username: user.username || "",
    role: user.role || "",
    group,
    poll_answer: attendanceLabel(answer),
    actual_present: existing.actual_present || "",
    attendance_source: "опрос",
    leader_weight: existing.leader_weight || (group === "leaders" ? "2" : ""),
    assigned_leader_id: existing.assigned_leader_id || "",
    assigned_leader_name: existing.assigned_leader_name || "",
    answered_at: isoNow(),
    updated_at: isoNow()
  };
}
