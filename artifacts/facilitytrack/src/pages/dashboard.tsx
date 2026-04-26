import { useGetDashboardSummary, useGetDashboardPoolStatus, useGetComplianceTrend, useGetRecentActivity, useGetDashboardAlerts } from "@workspace/api-client-react";
import { CheckCircle, XCircle, AlertTriangle, Waves, Wrench, Users, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Link } from "wouter";
import { poolTypeLabel } from "@/lib/limits";

function StatCard({ label, value, icon: Icon, color, testId }: { label: string; value: number | string; icon: React.ElementType; color: string; testId: string }) {
  return (
    <Card data-testid={`card-stat-${testId}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1" data-testid={`value-${testId}`}>{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceBadge({ isCompliant }: { isCompliant: boolean | null }) {
  if (isCompliant === null) return <Badge variant="secondary">No data</Badge>;
  return isCompliant
    ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="w-3 h-3 mr-1" />Compliant</Badge>
    : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Non-compliant</Badge>;
}

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: poolStatus } = useGetDashboardPoolStatus();
  const { data: trend } = useGetComplianceTrend();
  const { data: activity } = useGetRecentActivity({ limit: 10 });
  const { data: alerts } = useGetDashboardAlerts();

  const trendData = (trend ?? []).map(t => ({
    date: format(new Date(t.date), "d MMM"),
    Compliant: t.compliant,
    "Non-compliant": t.nonCompliant,
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground text-sm">NZS 5826:2010 compliance overview — {format(new Date(), "EEEE d MMMM yyyy")}</p>
      </div>

      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${a.severity === "high" ? "bg-red-50 border-red-200 text-red-800" : a.severity === "medium" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800"}`} data-testid={`alert-${a.id}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingSummary ? (
          Array.from({ length: 7 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-12 bg-muted rounded animate-pulse" /></CardContent></Card>)
        ) : (
          <>
            <StatCard label="Tests today" value={summary?.testsToday ?? 0} icon={TrendingUp} color="bg-primary/10 text-primary" testId="tests-today" />
            <StatCard label="Compliant" value={summary?.compliantToday ?? 0} icon={CheckCircle} color="bg-green-100 text-green-700" testId="compliant" />
            <StatCard label="Non-compliant" value={summary?.nonCompliantToday ?? 0} icon={XCircle} color="bg-red-100 text-red-700" testId="non-compliant" />
            <StatCard label="Steam checks" value={summary?.steamChecksToday ?? 0} icon={Clock} color="bg-teal-100 text-teal-700" testId="steam-checks" />
            <StatCard label="Active pools" value={summary?.activePoolCount ?? 0} icon={Waves} color="bg-blue-100 text-blue-700" testId="active-pools" />
            <StatCard label="Open work orders" value={summary?.openWorkOrders ?? 0} icon={Wrench} color="bg-orange-100 text-orange-700" testId="open-orders" />
            <StatCard label="Expiring certs" value={summary?.expiringQualifications ?? 0} icon={Users} color="bg-purple-100 text-purple-700" testId="expiring-certs" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-compliance-trend">
          <CardHeader>
            <CardTitle className="text-base">30-Day Compliance Trend</CardTitle>
            <CardDescription>Water test results over the past 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="compliantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142,69%,40%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(142,69%,40%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="nonCompliantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0,84%,60%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(0,84%,60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Compliant" stroke="hsl(142,69%,40%)" fill="url(#compliantGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Non-compliant" stroke="hsl(0,84%,60%)" fill="url(#nonCompliantGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No test data yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pool-status">
          <CardHeader>
            <CardTitle className="text-base">Pool Status</CardTitle>
            <CardDescription>Latest compliance reading per pool</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(poolStatus ?? []).map(p => (
                <Link key={p.poolId} href={`/pools/${p.poolId}`} data-testid={`pool-status-${p.poolId}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.poolName}</p>
                      <p className="text-xs text-muted-foreground">{p.facilityName} · {poolTypeLabel(p.poolType)}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {p.freeChlorine != null && (
                        <span className="text-xs text-muted-foreground hidden sm:block">Cl₂ {p.freeChlorine} mg/L</span>
                      )}
                      <ComplianceBadge isCompliant={p.isCompliant ?? null} />
                    </div>
                  </div>
                </Link>
              ))}
              {!poolStatus?.length && <p className="text-sm text-muted-foreground py-4 text-center">No active pools</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-activity">
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(activity ?? []).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.isCompliant === false ? "bg-red-500" : a.isCompliant === true ? "bg-green-500" : "bg-blue-400"}`} />
                <p className="text-sm flex-1 truncate" data-testid={`activity-${a.id}`}>{a.description}</p>
                <span className="text-xs text-muted-foreground flex-shrink-0">{format(new Date(a.createdAt), "HH:mm d MMM")}</span>
              </div>
            ))}
            {!activity?.length && <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
