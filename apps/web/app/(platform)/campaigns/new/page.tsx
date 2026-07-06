import { WizardShell } from './_components/WizardShell'

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Campaign</h1>
        <p className="text-muted-foreground">
          Walk through 7 steps to configure and launch your campaign.
        </p>
      </div>
      <WizardShell />
    </div>
  )
}
