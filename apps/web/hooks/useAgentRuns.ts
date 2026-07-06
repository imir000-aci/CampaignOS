'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { AgentRun, AgentDefinition } from '@/types/agent'

interface RunsResponse {
  runs: AgentRun[]
  total: number
}

interface AgentsResponse {
  agents: AgentDefinition[]
}

export function useAgentRuns(params?: { campaign_id?: string; status?: string }) {
  const qs = new URLSearchParams()
  if (params?.campaign_id) qs.set('campaign_id', params.campaign_id)
  if (params?.status) qs.set('status', params.status)
  const query = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<RunsResponse>({
    queryKey: ['agent-runs', params],
    queryFn: () => apiFetch<RunsResponse>(`/api/agents/runs${query}`),
    refetchInterval: 5000,
  })
}

export function useAgentRun(runId: string | null) {
  return useQuery<AgentRun>({
    queryKey: ['agent-run', runId],
    queryFn: () => apiFetch<AgentRun>(`/api/agents/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 3000
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED', 'VALIDATION_FAILED', 'ESCALATED'].includes(status)) return false
      return 3000
    },
  })
}

export function useAgentDefinitions() {
  return useQuery<AgentsResponse>({
    queryKey: ['agent-definitions'],
    queryFn: () => apiFetch<AgentsResponse>('/api/agents'),
    staleTime: Infinity,
  })
}

export function useTriggerPipeline() {
  return useMutation({
    mutationFn: (data: { campaign_id: string; brief: Record<string, unknown>; stub_mode?: boolean }) =>
      apiFetch<{ run_id: string; thread_id: string; status: string }>(
        '/api/agents/all/trigger',
        { method: 'POST', body: JSON.stringify({ ...data, stub_mode: data.stub_mode ?? true }) },
      ),
  })
}

export function useApproveRun() {
  return useMutation({
    mutationFn: ({ runId, reviewer_id, comments }: { runId: string; reviewer_id: string; comments?: string }) =>
      apiFetch(`/api/agents/runs/${runId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ reviewer_id, comments: comments ?? '' }),
      }),
  })
}

export function useRejectRun() {
  return useMutation({
    mutationFn: ({ runId, reviewer_id, reason, comments }: { runId: string; reviewer_id: string; reason: string; comments?: string }) =>
      apiFetch(`/api/agents/runs/${runId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewer_id, reason, comments: comments ?? '' }),
      }),
  })
}

export function useCancelRun() {
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: string; reason?: string }) =>
      apiFetch(`/api/agents/runs/${runId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason ?? '' }),
      }),
  })
}

export function useRunCost(runId: string | null) {
  return useQuery({
    queryKey: ['run-cost', runId],
    queryFn: () => apiFetch(`/api/agents/runs/${runId}/cost`),
    enabled: Boolean(runId),
  })
}
