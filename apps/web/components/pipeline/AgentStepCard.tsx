import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AgentDefinition } from '@/types/agent'

interface Props {
  agent: AgentDefinition
  completed: boolean
  running: boolean
  failed: boolean
  tokensUsed?: number
  costUsd?: number
}

export function AgentStepCard({ agent, completed, running, failed, tokensUsed, costUsd }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
        completed && 'border-green-200 bg-green-50',
        running && 'border-blue-200 bg-blue-50',
        failed && 'border-red-200 bg-red-50',
        !completed && !running && !failed && 'border-border bg-background opacity-50',
      )}
    >
      <div className="shrink-0">
        {completed && <CheckCircle2 className="h-5 w-5 text-green-600" />}
        {running && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
        {failed && <XCircle className="h-5 w-5 text-red-600" />}
        {!completed && !running && !failed && <Circle className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium capitalize text-sm">{agent.name}</p>
        <p className="text-xs text-muted-foreground">{agent.model}</p>
      </div>
      {completed && tokensUsed !== undefined && (
        <div className="text-right shrink-0">
          <p className="text-xs font-mono text-muted-foreground">{tokensUsed.toLocaleString()} tok</p>
          {costUsd !== undefined && (
            <p className="text-xs font-mono text-muted-foreground">${costUsd.toFixed(4)}</p>
          )}
        </div>
      )}
    </div>
  )
}
