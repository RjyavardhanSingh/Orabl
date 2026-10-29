import type { StudySessionSummary } from '../lib/api'
import { cn } from '../lib/utils'

/*
 * Study activity over the last weeks: one square per day, shaded by how many sessions were
 * created or worked on. Lives on the Settings page, beside the account it belongs to.
 */

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export const HEATMAP_DAYS = 35
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Monochrome ink scale; square cells, never dots. */
const heatLevelClass = [
  'border border-ink/10 text-ink/35',
  'bg-ink/20 text-ink',
  'bg-ink/50 text-canvas',
  'bg-ink/85 text-canvas',
]

/** Activity per local day: how many sessions were created or worked on that day. */
function activityByDay(sessions: StudySessionSummary[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const days = new Set([session.created_at, session.updated_at].map((iso) => new Date(iso).toDateString()))
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return counts
}

export function ActivityHeatmap({ sessions }: { sessions: StudySessionSummary[] }) {
  const counts = activityByDay(sessions)
  const today = new Date()
  const days = Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HEATMAP_DAYS - 1 - index))
    return { day, count: counts.get(day.toDateString()) ?? 0, isToday: index === HEATMAP_DAYS - 1 }
  })
  const activeDays = days.filter((entry) => entry.count > 0).length
  // Pad so the first day lands under its weekday column.
  const leading = days[0].day.getDay()

  return (
    <div className="max-w-md pt-6">
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`${activeDays} active days in the last ${HEATMAP_DAYS} days`}>
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} aria-hidden="true" className="pb-1 text-center text-[10px] font-bold text-ink/40">
            {label}
          </span>
        ))}
        {Array.from({ length: leading }, (_, index) => (
          <span key={`pad-${index}`} aria-hidden="true" />
        ))}
        {days.map(({ day, count, isToday }) => (
          <span
            key={day.toDateString()}
            title={`${dateFormat.format(day)}: ${count} ${count === 1 ? 'session' : 'sessions'}`}
            className={cn(
              'tabular flex aspect-square items-center justify-center rounded-[3px] text-[9px] font-medium',
              isToday ? 'bg-primary font-bold text-on-primary shadow-[2px_2px_0_var(--rule)]' : heatLevelClass[Math.min(count, 3)],
            )}
          >
            {day.getDate()}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4 text-xs text-ink/60">
        <span>
          <span className="tabular font-bold text-ink">{activeDays}</span> active {activeDays === 1 ? 'day' : 'days'}
        </span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          Less
          {heatLevelClass.map((tone, index) => (
            <span key={index} className={cn('size-3 rounded-[2px]', tone)} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
