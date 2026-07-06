'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useWizardStore } from '@/store/wizard-store'

const schema = z.object({
  campaign_name: z.string().min(3, 'Name must be at least 3 characters'),
  brief_text: z.string().min(20, 'Brief must be at least 20 characters'),
  objective: z.enum(['ACQUISITION', 'RETENTION', 'LOYALTY', 'AWARENESS']),
})

type FormValues = z.infer<typeof schema>

export function Step1Brief() {
  const { data, updateData, nextStep } = useWizardStore()
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      campaign_name: data.campaign_name ?? '',
      brief_text: data.brief_text ?? '',
      objective: (data.objective as FormValues['objective']) ?? 'ACQUISITION',
    },
  })

  function onSubmit(values: FormValues) {
    updateData(values)
    nextStep()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Campaign Brief</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Describe the campaign goal and context for the AI agents.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign_name">Campaign Name</Label>
        <Input id="campaign_name" placeholder="Summer Grilling 2026" {...register('campaign_name')} />
        {errors.campaign_name && <p className="text-xs text-destructive">{errors.campaign_name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="objective">Objective</Label>
        <select
          id="objective"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...register('objective')}
        >
          <option value="ACQUISITION">Acquisition — new customers</option>
          <option value="RETENTION">Retention — re-engage lapsed</option>
          <option value="LOYALTY">Loyalty — deepen existing relationship</option>
          <option value="AWARENESS">Awareness — brand visibility</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brief_text">Campaign Brief</Label>
        <Textarea
          id="brief_text"
          rows={5}
          placeholder="Describe your campaign goals, target audience, key messages, and any constraints..."
          {...register('brief_text')}
        />
        {errors.brief_text && <p className="text-xs text-destructive">{errors.brief_text.message}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="submit">Next: Budget</Button>
      </div>
    </form>
  )
}
