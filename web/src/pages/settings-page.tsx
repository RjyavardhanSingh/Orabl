import { LogOut, Mail, Monitor, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useNavigate } from 'react-router-dom'

import { ActivityHeatmap, HEATMAP_DAYS } from '../components/activity-heatmap'
import { UserAvatar } from '../components/user-avatar'
import { AppPage, PageHeader, Section } from '../components/layout/page'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { useAuthStore } from '../lib/auth-state'
import { displayName } from '../lib/profile'
import { cn } from '../lib/utils'

/* Editorial Ledger: open sections over a heavy rule, one hairline per row, no cards. */
const rowClass = 'grid grid-cols-1 gap-3 border-b border-line py-6 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8'
const labelClass = 'flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-ink/60'
const valueClass = 'min-w-0 break-all text-base text-strong'

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function SettingsPage() {
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const navigate = useNavigate()
  const { theme = 'system', setTheme } = useTheme()
  // Same query as the dashboard, so the cached list is reused when coming from there.
  const sessions = useQuery({ queryKey: ['study-sessions'], queryFn: api.listStudySessions, retry: false })

  return (
    <AppPage>
      <PageHeader overline="Your account" title="Settings" description="Your account, your study activity, and how Orabl looks on this device." />

      <div className="grid max-w-4xl gap-16">
        <Section id="account-heading" title="Account">
          <dl>
            <div className={cn(rowClass, 'sm:items-center')}>
              <dt className={labelClass}>
                <UserRound className="size-4" aria-hidden="true" /> Name
              </dt>
              <dd className="flex min-w-0 items-center gap-4">
                <UserAvatar name={displayName(user)} picture={user?.picture} className="size-14 text-2xl" />
                <span className="min-w-0">
                  <span className="block truncate font-serif text-2xl text-strong">{displayName(user)}</span>
                  <span className="mt-0.5 block text-sm text-ink/55">From your Google profile</span>
                </span>
              </dd>
            </div>
            <div className={rowClass}>
              <dt className={labelClass}>
                <Mail className="size-4" aria-hidden="true" /> Email
              </dt>
              <dd className={valueClass}>{user?.email ?? 'No email available'}</dd>
            </div>
            <div className={rowClass}>
              <dt className={labelClass}>
                <ShieldCheck className="size-4" aria-hidden="true" /> Sign-in method
              </dt>
              <dd className="text-base text-ink/70">Google</dd>
            </div>
          </dl>
        </Section>

        <Section
          id="activity-heading"
          title="Activity"
          aside={<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/50">Last {HEATMAP_DAYS} days</span>}
        >
          {sessions.isError ? (
            <p className="border-b border-line py-6 text-sm text-ink/65">Could not load your activity right now.</p>
          ) : (
            <div className="border-b border-line pb-6">
              <ActivityHeatmap sessions={sessions.data ?? []} />
            </div>
          )}
        </Section>

        <Section id="appearance-heading" title="Appearance">
          <div className={rowClass}>
            <p className={labelClass} id="theme-label">Theme</p>
            <div>
              <div role="radiogroup" aria-labelledby="theme-label" className="inline-grid grid-cols-3 overflow-hidden rounded-lg border border-ink/25">
                {themes.map(({ value, label, icon: Icon }) => {
                  const selected = theme === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTheme(value)}
                      className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold transition-colors [&:not(:first-child)]:border-l [&:not(:first-child)]:border-ink/25',
                        selected ? 'bg-primary text-on-primary' : 'text-ink/70 hover:bg-ink/5 hover:text-ink',
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-sm text-ink/55">System follows your device’s light or dark setting.</p>
            </div>
          </div>
        </Section>

        <Section id="session-heading" title="Session">
          <div className={cn(rowClass, 'sm:items-center')}>
            <p className={labelClass}>Sign out</p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-ink/65">Your sessions stay saved to your account.</p>
              <Button
                variant="secondary"
                onClick={() =>
                  void signOut().then(
                    () => navigate('/'),
                    () => navigate('/'),
                  )
                }
              >
                <LogOut aria-hidden="true" /> Log Out
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </AppPage>
  )
}
