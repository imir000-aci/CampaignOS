'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { Campaign, CampaignListResponse } from '@/types/campaign'

export function useCampaigns(params?: { status?: string; q?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const query = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<CampaignListResponse>({
    queryKey: ['campaigns', params],
    queryFn: () => apiFetch<CampaignListResponse>(`/api/campaigns${query}`),
  })
}

export function useCampaign(id: string | null) {
  return useQuery<Campaign>({
    queryKey: ['campaign', id],
    queryFn: () => apiFetch<Campaign>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Campaign>) =>
      apiFetch<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
