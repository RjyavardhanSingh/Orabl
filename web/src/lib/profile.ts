/** Use the first name-like part of an email address for a friendly label. */
export function nameFromEmail(email?: string | null): string {
  const local = email?.split('@')[0] ?? ''
  const token = local.split(/[^A-Za-z]+/).find((part) => part.length > 1)
  return token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : local || 'there'
}
