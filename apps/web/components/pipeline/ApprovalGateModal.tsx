'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useApproveRun, useRejectRun } from '@/hooks/useAgentRuns'
import { useAuthStore } from '@/store/auth-store'
import type { RunStatus, ApprovalRequest } from '@/types/agent'

const schema = z.object({
  comments: z.string(),
  reason: z.string(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  runId: string
  status: RunStatus
  approvalRequest: ApprovalRequest | null
  onDecision: () => void
}

const GATE_LABELS: Partial<Record<RunStatus, { title: string; description: string }>> = {
  AWAITING_GATE1: {
    title: 'Strategy Review',
    description: 'Review the AI-generated campaign strategy before proceeding to audience, creative, and targeting.',
  },
  AWAITING_GATE2: {
    title: 'Final Preview Review',
    description: 'Review the complete campaign preview before finalizing and submitting for activation.',
  },
}

export function ApprovalGateModal({ runId, status, approvalRequest, onDecision }: Props) {
  const isOpen = status === 'AWAITING_GATE1' || status === 'AWAITING_GATE2'
  const user = useAuthStore((s) => s.user)
  const approve = useApproveRun()
  const reject = useRejectRun()

  const { register, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { comments: '', reason: '' },
  })

  const gate = GATE_LABELS[status]

  async function onApprove(values: FormValues) {
    await approve.mutateAsync({
      runId,
      reviewer_id: user?.email ?? 'reviewer',
      comments: values.comments,
    })
    reset()
    onDecision()
  }

  async function onReject(values: FormValues) {
    await reject.mutateAsync({
      runId,
      reviewer_id: user?.email ?? 'reviewer',
      reason: values.reason || 'Rejected by reviewer',
      comments: values.comments,
    })
    reset()
    onDecision()
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{gate?.title ?? 'Approval Required'}</DialogTitle>
          <DialogDescription>{gate?.description}</DialogDescription>
        </DialogHeader>

        {approvalRequest && (
          <div className="rounded-lg bg-muted p-4 text-sm max-h-60 overflow-auto">
            <p className="font-medium mb-2">Gate payload:</p>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(approvalRequest.payload, null, 2)}
            </pre>
          </div>
        )}

        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comments">Comments (optional)</Label>
            <Textarea
              id="comments"
              placeholder="Any notes for the team..."
              {...register('comments')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Rejection reason (if rejecting)</Label>
            <Textarea
              id="reason"
              placeholder="Explain what needs to change..."
              {...register('reason')}
            />
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={handleSubmit(onReject)}
            disabled={reject.isPending}
          >
            {reject.isPending ? 'Rejecting...' : 'Reject'}
          </Button>
          <Button
            onClick={handleSubmit(onApprove)}
            disabled={approve.isPending}
          >
            {approve.isPending ? 'Approving...' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
