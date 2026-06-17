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

export function formatBirthDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const asText = (displayValue) => `'${displayValue}`;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return asText([
      String(date.getUTCDate()).padStart(2, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCFullYear()).padStart(4, "0")
    ].join("."));
  }

  const raw = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(raw);
  if (match) {
    return asText([
      String(Number(match[3])).padStart(2, "0"),
      String(Number(match[2])).padStart(2, "0"),
      String(Number(match[1])).padStart(4, "0")
    ].join("."));
  }

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return asText([
      String(Number(match[1])).padStart(2, "0"),
      String(Number(match[2])).padStart(2, "0"),
      String(Number(year)).padStart(4, "0")
    ].join("."));
  }

  return raw;
}

export function normalizeDateKey(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  const raw = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(raw);
  if (match) {
    return [
      String(Number(match[1])).padStart(4, "0"),
      String(Number(match[2])).padStart(2, "0"),
      String(Number(match[3])).padStart(2, "0")
    ].join("-");
  }

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return [
      String(Number(year)).padStart(4, "0"),
      String(Number(match[2])).padStart(2, "0"),
      String(Number(match[1])).padStart(2, "0")
    ].join("-");
  }

  return raw;
}
