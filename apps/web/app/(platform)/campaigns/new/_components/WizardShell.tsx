'use client'

import { useWizardStore } from '@/store/wizard-store'
import { Step1Brief } from './steps/Step1Brief'
import { Step2Budget } from './steps/Step2Budget'
import { Step3Dates } from './steps/Step3Dates'
import { Step4Channels } from './steps/Step4Channels'
import { Step5KPIs } from './steps/Step5KPIs'
import { Step6Review } from './steps/Step6Review'
import { Step7Launch } from './steps/Step7Launch'

const STEP_LABELS = [
  'Brief',
  'Budget',
  'Dates',
  'Channels',
  'KPIs',
  'Review',
  'Launch',
]

export function WizardShell() {
  const step = useWizardStore((s) => s.step)

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const isActive = n === step
          const isDone = n < step
          return (
            <div key={label} className="flex items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {n}
              </div>
              <span
                className={`hidden text-xs sm:inline ${
                  isActive ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div className={`mx-1 h-px w-6 ${isDone ? 'bg-primary/40' : 'bg-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {step === 1 && <Step1Brief />}
        {step === 2 && <Step2Budget />}
        {step === 3 && <Step3Dates />}
        {step === 4 && <Step4Channels />}
        {step === 5 && <Step5KPIs />}
        {step === 6 && <Step6Review />}
        {step === 7 && <Step7Launch />}
      </div>
    </div>
  )
}
