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

export function isGethsemaneChurch(value) {
  return normalizeText(value) === "гефсимания";
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
