'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWizardStore } from '@/store/wizard-store'

const schema = z.object({
  budget_total: z.coerce.number().min(1000, 'Minimum budget is $1,000'),
  budget_media: z.coerce.number().min(500, 'Minimum media budget is $500'),
}).refine((d) => d.budget_media <= d.budget_total, {
  message: 'Media budget cannot exceed total budget',
  path: ['budget_media'],
})

type FormValues = z.infer<typeof schema>

export function Step2Budget() {
  const { data, updateData, nextStep, prevStep } = useWizardStore()
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      budget_total: data.budget_total_cents ? data.budget_total_cents / 100 : undefined,
      budget_media: data.budget_media_cents ? data.budget_media_cents / 100 : undefined,
    },
  })

  function onSubmit(values: FormValues) {
    updateData({
      budget_total_cents: Math.round(values.budget_total * 100),
      budget_media_cents: Math.round(values.budget_media * 100),
    })
    nextStep()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Budget</h2>
        <p className="text-sm text-muted-foreground mt-1">Set the total and media budget in USD.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="budget_total">Total Budget ($)</Label>
        <Input
          id="budget_total"
          type="number"
          min={1000}
          step={1000}
          placeholder="5000000"
          {...register('budget_total')}
        />
        {errors.budget_total && <p className="text-xs text-destructive">{errors.budget_total.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="budget_media">Media Budget ($)</Label>
        <Input
          id="budget_media"
          type="number"
          min={500}
          step={500}
          placeholder="3500000"
          {...register('budget_media')}
        />
        {errors.budget_media && <p className="text-xs text-destructive">{errors.budget_media.message}</p>}
        <p className="text-xs text-muted-foreground">Portion of total budget allocated to paid media.</p>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
        <Button type="submit">Next: Dates</Button>
      </div>
    </form>
  )
}
