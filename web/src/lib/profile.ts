/** Use the first name-like part of an email address for a friendly label. */
export function nameFromEmail(email?: string | null): string {
  const local = email?.split('@')[0] ?? ''
  const token = local.split(/[^A-Za-z]+/).find((part) => part.length > 1)
  return token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : local || 'there'
}

type Profile = { email?: string | null; name?: string | null } | null | undefined

/** Full name from Google, else a name guessed from the email. */
export function displayName(user: Profile): string {
  return user?.name?.trim() || nameFromEmail(user?.email)
}

/** First name for greetings: "Good morning, Nishant." */
export function firstName(user: Profile): string {
  return user?.name?.trim().split(/\s+/)[0] || nameFromEmail(user?.email)
}
