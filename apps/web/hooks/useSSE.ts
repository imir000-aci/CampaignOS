'use client'

import { useEffect, useRef } from 'react'

interface SSEOptions {
  onMessage: (event: MessageEvent) => void
  onDone?: () => void
  onError?: (error: Event) => void
  enabled?: boolean
}

export function useSSE(url: string, options: SSEOptions) {
  const { onMessage, onDone, onError, enabled = true } = options
  const onMessageRef = useRef(onMessage)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)

  onMessageRef.current = onMessage
  onDoneRef.current = onDone
  onErrorRef.current = onError

  useEffect(() => {
    if (!enabled || !url) return

    const es = new EventSource(url)

    es.onmessage = (event) => {
      onMessageRef.current(event)
    }

    es.addEventListener('done', () => {
      es.close()
      onDoneRef.current?.()
    })

    es.onerror = (error) => {
      onErrorRef.current?.(error)
    }

    return () => {
      es.close()
    }
  }, [url, enabled])
}
