export function localNowParts(timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

export function isoNow() {
  return new Date().toISOString();
}

export function parseBirthday(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return {
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }

  const raw = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (match) {
    return {
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw);
  if (match) {
    return {
      month: Number(match[2]),
      day: Number(match[1])
    };
  }

  return null;
}
