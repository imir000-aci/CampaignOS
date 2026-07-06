'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWizardStore } from '@/store/wizard-store'

const schema = z.object({
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().min(1, 'End date required'),
}).refine((d) => d.end_date > d.start_date, {
  message: 'End date must be after start date',
  path: ['end_date'],
})

type FormValues = z.infer<typeof schema>

export function Step3Dates() {
  const { data, updateData, nextStep, prevStep } = useWizardStore()
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      start_date: data.start_date ?? '',
      end_date: data.end_date ?? '',
    },
  })

  function onSubmit(values: FormValues) {
    updateData(values)
    nextStep()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Campaign Dates</h2>
        <p className="text-sm text-muted-foreground mt-1">Set the campaign flight window.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="start_date">Start Date</Label>
        <Input id="start_date" type="date" {...register('start_date')} />
        {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="end_date">End Date</Label>
        <Input id="end_date" type="date" {...register('end_date')} />
        {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
        <Button type="submit">Next: Channels</Button>
      </div>
    </form>
  )
}
