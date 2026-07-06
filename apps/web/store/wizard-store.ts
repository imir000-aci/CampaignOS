import { create } from 'zustand'

export interface WizardData {
  campaign_name?: string
  brief_text?: string
  objective?: string
  budget_total_cents?: number
  budget_media_cents?: number
  start_date?: string
  end_date?: string
  channels?: string[]
  kpi_targets?: Array<{ metric: string; target: number }>
}

interface WizardStore {
  step: number
  data: WizardData
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  updateData: (patch: Partial<WizardData>) => void
  reset: () => void
}

export const useWizardStore = create<WizardStore>()((set) => ({
  step: 1,
  data: {},
  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(s.step + 1, 7) })),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
  updateData: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
  reset: () => set({ step: 1, data: {} }),
}))
