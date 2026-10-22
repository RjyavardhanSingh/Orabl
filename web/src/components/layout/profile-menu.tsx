/**
 * Re-exports the unified UserDropdown as ProfileMenu so that existing
 * consumers (AppShell, SettingsPage) pick up the new premium styling
 * without import changes.
 */
export { UserDropdown as ProfileMenu } from '../user-dropdown'
