import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Campaign performance overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Active Campaigns', value: '3' },
          { title: 'Pending Approval', value: '2' },
          { title: 'Campaigns This Month', value: '8' },
          { title: 'Avg. ROAS', value: '3.8×' },
        ].map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Welcome to CampaignOS — your AI-native marketing operating system.</p>
          <p>
            Go to <strong>Campaigns</strong> to view existing campaigns or create a new one.
            The 7-step wizard will guide you through defining a brief, budget, channels, and KPIs,
            then launch the full AI agent pipeline with one click.
          </p>
          <p>
            Monitor real-time agent progress in the <strong>Pipeline Monitor</strong>.
            Approval gates pause the pipeline for your review before proceeding.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
