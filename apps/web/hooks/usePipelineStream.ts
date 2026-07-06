'use client'

import { useReducer, useCallback, useState } from 'react'
import { useSSE } from './useSSE'
import type { PipelineEvent, AgentRun } from '@/types/agent'

interface StreamState {
  events: PipelineEvent[]
  latestRun: AgentRun | null
  isDone: boolean
  error: string | null
}

type StreamAction =
  | { type: 'EVENT'; payload: PipelineEvent }
  | { type: 'DONE' }
  | { type: 'ERROR'; payload: string }
  | { type: 'RESET' }

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'EVENT': {
      const evt = action.payload
      const latestRun =
        evt.type === 'pipeline_started' ||
        evt.type === 'step_completed' ||
        evt.type === 'awaiting_approval' ||
        evt.type === 'gate_resumed' ||
        evt.type === 'pipeline_completed' ||
        evt.type === 'pipeline_rejected' ||
        evt.type === 'pipeline_failed' ||
        evt.type === 'validation_failed' ||
        evt.type === 'escalated'
          ? ({ ...state.latestRun, ...evt.data } as AgentRun)
          : state.latestRun
      return {
        ...state,
        events: [...state.events, evt],
        latestRun,
      }
    }
    case 'DONE':
      return { ...state, isDone: true }
    case 'ERROR':
      return { ...state, error: action.payload }
    case 'RESET':
      return { events: [], latestRun: null, isDone: false, error: null }
    default:
      return state
  }
}

export function usePipelineStream(runId: string | null) {
  const [connectionKey, setConnectionKey] = useState(0)
  const [state, dispatch] = useReducer(streamReducer, {
    events: [],
    latestRun: null,
    isDone: false,
    error: null,
  })

  const url = runId ? `/api/agents/runs/${runId}/stream` : ''

  // connectionKey changes force EventSource reconnect (after gate approve/reject)
  const sseUrl = runId ? `${url}?_k=${connectionKey}` : ''

  useSSE(sseUrl, {
    enabled: Boolean(runId),
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data as string) as PipelineEvent
        dispatch({ type: 'EVENT', payload: data })
      } catch {
        // ignore malformed events
      }
    },
    onDone: () => dispatch({ type: 'DONE' }),
    onError: () => dispatch({ type: 'ERROR', payload: 'Stream connection lost' }),
  })

  const reconnect = useCallback(() => {
    dispatch({ type: 'RESET' })
    setConnectionKey((k) => k + 1)
  }, [])

  return { ...state, reconnect }
}
