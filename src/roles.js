export const ROLE_ADMIN = "Админ";
export const ROLE_ASSISTANT = "Помощник";
export const ROLE_PARTICIPANT = "Участник";
export const ROLE_GUEST = "Гость";

const ADMIN_MANAGED_ROLES = new Set([ROLE_ADMIN, ROLE_ASSISTANT]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-zа-я0-9]+/g, "");
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function isGethsemaneChurch(value) {
  const text = normalizeText(value);
  const compact = compactText(value);
  if (!compact) return false;

  const exactAliases = [
    "гефсимания",
    "гефсемания",
    "гетсимания",
    "церковьгефсимания",
    "церковьгефсемания",
    "церковьгетсимания"
  ];
  if (exactAliases.some((alias) => compact.includes(alias))) return true;
  if (["гефа", "гефы", "гефе", "гефу", "гефса", "гефсы", "гефсе"].some((alias) => compact.includes(alias))) return true;

  const words = text.split(/[^a-zа-я0-9]+/).filter(Boolean);
  return words.some((word) => {
    if (["гефа", "гефса", "гефс", "gefa", "gefsa"].includes(word)) return true;
    if (word.startsWith("геф") && word.length <= 6) return true;
    if (word.startsWith("гефсим") || word.startsWith("гефсем") || word.startsWith("гетсим")) return true;
    if (word.length >= 7 && levenshteinDistance(word, "гефсимания") <= 2) return true;
    if (word.length >= 7 && levenshteinDistance(word, "гефсемания") <= 2) return true;
    return false;
  });
}

export function isGuestRole(value) {
  return String(value || "").trim() === ROLE_GUEST;
}

export function resolveProfileRole(existingUser = {}, profile = {}) {
  const currentRole = String(existingUser.role || "").trim();
  if (ADMIN_MANAGED_ROLES.has(currentRole)) return currentRole;

  const nextIsGethsemane = isGethsemaneChurch(profile.church);
  const previousChurch = String(existingUser.church || "").trim();

  if (
    currentRole === ROLE_PARTICIPANT
    && previousChurch
    && !isGethsemaneChurch(previousChurch)
    && !nextIsGethsemane
  ) {
    return currentRole;
  }

  return nextIsGethsemane ? ROLE_PARTICIPANT : ROLE_GUEST;
}
