import { useState } from 'react'

import { cn } from '../lib/utils'

/**
 * The person's Google photo as a square tile (DESIGN.md: avatars are never circles), falling
 * back to their initial when there is no photo or it fails to load.
 */
export function UserAvatar({ name, picture, className }: { name: string; picture?: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const initial = name.charAt(0).toUpperCase() || '?'
  const showPhoto = Boolean(picture) && failedSrc !== picture

  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary font-serif text-lg text-on-primary',
        className,
      )}
      aria-hidden="true"
    >
      {showPhoto ? (
        <img
          src={picture ?? undefined}
          alt=""
          // Google's image host refuses hotlinked requests that carry a Referer.
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(picture ?? null)}
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  )
}
