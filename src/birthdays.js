import { buildBirthdayGreeting } from "./blessings.js";
import { fullName } from "./excel-graph.js";
import { isoNow, localNowParts } from "./time.js";

function displayUser(user) {
  const name = fullName(user);
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return `пользователь ${user.telegram_user_id}`;
}

function firstNameForNotification(user) {
  const firstName = String(user.first_name || "").trim();
  if (firstName) return firstName;
  return displayUser(user);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkedUserName(user) {
  const name = escapeHtml(firstNameForNotification(user));
  const username = String(user.username || "").replace(/^@/, "").trim();
  if (username) {
    return `<a href="https://t.me/${encodeURIComponent(username)}">${name}</a>`;
  }

  const telegramUserId = String(user.telegram_user_id || user.id || "").trim();
  if (telegramUserId) {
    return `<a href="tg://user?id=${encodeURIComponent(telegramUserId)}">${name}</a>`;
  }

  return name;
}

async function notifyAdminsAboutBirthday({ config, telegram, user, logger = console }) {
  const adminIds = [...(config.adminUserIds || [])].filter(Boolean);
  const name = linkedUserName(user);
  const text = [
    `Сегодня день рождения у ${name}!`,
    "",
    "Вы можете поздравить именинника в ЛС от себя лично. Хорошего дня ❤"
  ].join("\n");

  let sent = 0;
  const failed = [];

  for (const adminId of adminIds) {
    try {
      await telegram.sendMessage(adminId, text, { parse_mode: "HTML" });
      sent += 1;
    } catch (error) {
      failed.push(`${adminId}: ${error.message}`);
      logger.warn(`[birthdays] admin notification failed for ${adminId}: ${error.message}`);
    }
  }

  return { sent, failed };
}

export function birthdayCallback(action, dateKey, telegramUserId) {
  return `bday:${action}:${dateKey}:${telegramUserId}`;
}

export function birthdayApprovalText({ user, message }) {
  const username = user.username ? `@${user.username}` : "username не указан";
  return [
    "<b>ПОЗДРАВЛЕНИЕ НА СОГЛАСОВАНИЕ</b>",
    "",
    `Кому: ${escapeHtml(displayUser(user))} (${escapeHtml(username)})`,
    "",
    escapeHtml(message)
  ].join("\n");
}

export async function sendBirthdayApprovalRequest({ config, telegram, user, dateKey, message }) {
  const approverChatId = config.birthdayApproverChatId;
  if (!approverChatId) {
    return { queued: false, reason: "missing_approver" };
  }

  await telegram.sendMessage(approverChatId, birthdayApprovalText({ user, message }), {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Утвердить и отправить",
            callback_data: birthdayCallback("approve", dateKey, user.telegram_user_id)
          }
        ],
        [
          {
            text: "Редактировать",
            callback_data: birthdayCallback("edit", dateKey, user.telegram_user_id)
          }
        ],
        [
          {
            text: "Отклонить",
            callback_data: birthdayCallback("reject", dateKey, user.telegram_user_id)
          }
        ]
      ]
    }
  });

  return { queued: true, reason: "pending_approval" };
}

async function getTemplates(store, logger = console) {
  try {
    return await store.birthdayTemplates();
  } catch (error) {
    logger.warn(`[birthdays] using built-in templates: ${error.message}`);
    return undefined;
  }
}

export async function queueBirthdayApproval({
  config,
  store,
  telegram,
  user,
  dateKey,
  logger = console,
  variantIndex = null,
  notes = ""
}) {
  const approverChatId = config.birthdayApproverChatId;
  const templates = await getTemplates(store, logger);
  const message = buildBirthdayGreeting(user, dateKey, templates, variantIndex);

  await store.upsertBirthdayDraft({
    dateKey,
    user,
    message,
    notes
  });

  if (!approverChatId) {
    await store.updateBirthdayLog({
      dateKey,
      telegramUserId: user.telegram_user_id,
      patch: {
        approval_status: "error",
        notes: "BIRTHDAY_APPROVER_CHAT_ID or SUPERADMIN_USER_ID is not configured"
      }
    });
    return { queued: false, reason: "missing_approver" };
  }

  try {
    return await sendBirthdayApprovalRequest({ config, telegram, user, dateKey, message });
  } catch (error) {
    await store.updateBirthdayLog({
      dateKey,
      telegramUserId: user.telegram_user_id,
      patch: {
        approval_status: "error",
        notes: `${notes ? `${notes}; ` : ""}approval_send_failed=${error.message}`
      }
    });
    throw error;
  }
}

export async function approveBirthdayGreeting({ config, store, telegram, dateKey, telegramUserId, approvedBy }) {
  const log = await store.getBirthdayLog(dateKey, telegramUserId);
  if (!log) {
    return { ok: false, reason: "not_found" };
  }

  if (String(log.approval_status) === "sent") {
    return { ok: true, reason: "already_sent" };
  }

  if (String(log.approval_status) !== "pending") {
    return { ok: false, reason: `status_${log.approval_status || "empty"}` };
  }

  const user = await store.getUserByTelegramId(telegramUserId);
  if (!user) {
    await store.updateBirthdayLog({
      dateKey,
      telegramUserId,
      patch: {
        approval_status: "error",
        notes: "User card not found in Users"
      }
    });
    return { ok: false, reason: "user_not_found" };
  }

  const message = String(log.birthday_message || "").trim();
  let privateSent = false;
  let groupSent = false;
  const notes = [];

  if (user.private_chat_id) {
    try {
      await telegram.sendMessage(user.private_chat_id, message);
      privateSent = true;
    } catch (error) {
      notes.push(`private: ${error.message}`);
    }
  } else {
    notes.push("private_chat_id is empty; user must send /start to the bot");
  }

  if (config.sendBirthdaysToGroup && config.groupChatId) {
    try {
      const mention = user.username ? `@${user.username}` : displayUser(user);
      await telegram.sendMessage(config.groupChatId, `Сегодня день рождения у ${mention}!\n\n${message}`);
      groupSent = true;
    } catch (error) {
      notes.push(`group: ${error.message}`);
    }
  }

  await store.updateBirthdayLog({
    dateKey,
    telegramUserId,
    patch: {
      approval_status: privateSent || groupSent ? "sent" : "error",
      private_sent: privateSent ? "yes" : "no",
      group_sent: groupSent ? "yes" : "no",
      approved_by: String(approvedBy || ""),
      approved_at: isoNow(),
      sent_at: privateSent || groupSent ? isoNow() : "",
      notes: notes.join("; ")
    }
  });

  return { ok: privateSent || groupSent, privateSent, groupSent, reason: notes.join("; ") || "sent" };
}

export async function rejectBirthdayGreeting({ store, dateKey, telegramUserId, rejectedBy }) {
  await store.updateBirthdayLog({
    dateKey,
    telegramUserId,
    patch: {
      approval_status: "rejected",
      approved_by: String(rejectedBy || ""),
      approved_at: isoNow(),
      notes: "Rejected by approver"
    }
  });
}

export async function runBirthdaySweep({ config, store, telegram, force = false }) {
  if (!store.enabled) return { checked: false, sent: 0, reason: "excel_disabled" };

  const now = localNowParts(config.timeZone);
  if (!force) {
    const currentMinutes = now.hour * 60 + now.minute;
    const targetMinutes = config.birthdayCheckTime.hour * 60 + config.birthdayCheckTime.minute;
    if (currentMinutes < targetMinutes) {
      return { checked: false, sent: 0, reason: "too_early" };
    }
  }

  const users = await store.birthdaysFor(now.month, now.day);
  let queued = 0;
  let adminNotifications = 0;

  for (const user of users) {
    const existingLog = await store.getBirthdayLog(now.dateKey, user.telegram_user_id);
    if (existingLog && String(existingLog.approval_status) !== "error") continue;

    const adminNotice = await notifyAdminsAboutBirthday({
      config,
      telegram,
      user
    });
    adminNotifications += adminNotice.sent;

    const result = await queueBirthdayApproval({
      config,
      store,
      telegram,
      user,
      dateKey: now.dateKey,
      notes: [
        "Created by daily birthday sweep",
        `admin_notifications_sent=${adminNotice.sent}`,
        adminNotice.failed.length ? `admin_notifications_failed=${adminNotice.failed.join(" | ")}` : ""
      ].filter(Boolean).join("; ")
    });
    if (result.queued) queued += 1;
  }

  return { checked: true, sent: queued, queued, adminNotifications, reason: "ok" };
}

export function startBirthdayScheduler({ config, store, telegram, logger = console }) {
  let lastRunDate = "";

  async function tick() {
    const now = localNowParts(config.timeZone);
    if (lastRunDate === now.dateKey) return;

    const result = await runBirthdaySweep({ config, store, telegram });
    if (result.checked) {
      lastRunDate = now.dateKey;
      logger.log(`[birthdays] checked ${now.dateKey}, queued=${result.queued || result.sent}, admin_notifications=${result.adminNotifications || 0}`);
    }
  }

  const timer = setInterval(() => {
    tick().catch((error) => logger.error("[birthdays]", error));
  }, 60_000);

  tick().catch((error) => logger.error("[birthdays]", error));
  return timer;
}
