import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AppShell, EmptyState } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'

export function SprintPlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <AppShell>
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden="true" />}
        title={title}
        description={description}
        action={
          <Button asChild variant="secondary" className='rounded-xl'>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Home
            </Link>
          </Button>
        }
      />
    </AppShell>
  )
}
