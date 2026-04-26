import { useGetPool, useListTestResults, useListWaterBalanceTests, useListPoolClosures, useUpdatePool, useUpdatePoolClosure } from "@workspace/api-client-react";
import { getGetPoolQueryKey, getListTestResultsQueryKey, getListPoolClosuresQueryKey, getListPoolsQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { CheckCircle, XCircle, FlaskConical, Droplets, Lock, ArrowLeft, Edit, RotateCcw } from "lucide-react";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { effectiveLimits, formatRange, formatMax, poolTypeLabel } from "@/lib/limits";
import { AuditHistory } from "@/components/AuditHistory";

function ComplianceBadge({ v }: { v: boolean }) {
  return v
    ? <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Pass</Badge>
    : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Fail</Badge>;
}

interface PoolForLimits {
  poolType: string;
  customPhMin?: number | null;
  customPhMax?: number | null;
  customFreeChlorineMin?: number | null;
  customFreeChlorineMax?: number | null;
  customTempMin?: number | null;
  customTempMax?: number | null;
  customTurbidityMax?: number | null;
  customCombinedChlorineMax?: number | null;
}

function PoolLimits({ pool }: { pool: PoolForLimits }) {
  const lim = effectiveLimits(pool);
  const isSpa = pool.poolType === "spa";
  const anyCustom = pool.customPhMin != null || pool.customPhMax != null || pool.customFreeChlorineMin != null || pool.customFreeChlorineMax != null || pool.customTempMin != null || pool.customTempMax != null || pool.customTurbidityMax != null || pool.customCombinedChlorineMax != null;
  return (
    <div className="text-xs text-muted-foreground space-y-0.5" data-testid="pool-limits">
      <p>
        <strong>Acceptable Ranges ({isSpa ? "Spa" : "Pool"})</strong>
        {anyCustom && <span className="ml-1 text-blue-600">· custom values applied</span>}
        {!anyCustom && <span className="ml-1">· NZS 5826:2010 defaults</span>}
      </p>
      <p>
        Free Cl₂: {formatRange(lim.freeChlorineMin, lim.freeChlorineMax)} mg/L &bull;
        {" "}pH: {formatRange(lim.phMin, lim.phMax)} &bull;
        {" "}Temp: {formatRange(lim.tempMin, lim.tempMax)}°C &bull;
        {" "}CAC: {formatMax(lim.combinedChlorineMax)} mg/L &bull;
        {" "}Turbidity: {formatMax(lim.turbidityMax)} NTU
      </p>
    </div>
  );
}

interface EditPoolForm {
  name: string;
  poolType: string;
  volumeLitres: string;
  customPhMin: string;
  customPhMax: string;
  customFreeChlorineMin: string;
  customFreeChlorineMax: string;
  customTempMin: string;
  customTempMax: string;
  customTurbidityMax: string;
  customCombinedChlorineMax: string;
}

function toNum(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fromNum(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

export default function PoolDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user } = useAuth();
  const canManage = isAdminOrHigher(user?.role);
  const { data: pool, isLoading } = useGetPool(id, { query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) } });
  const { data: tests } = useListTestResults({ poolId: id, limit: 20 }, { query: { enabled: !!id, queryKey: getListTestResultsQueryKey({ poolId: id, limit: 20 }) } });
  const { data: wbTests } = useListWaterBalanceTests({ poolId: id, limit: 10 });
  const { data: closures } = useListPoolClosures({ poolId: id, limit: 5 }, { query: { enabled: !!id, queryKey: getListPoolClosuresQueryKey({ poolId: id, limit: 5 }) } });
  const updatePool = useUpdatePool();
  const updateClosure = useUpdatePoolClosure();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<EditPoolForm>({
    defaultValues: {
      name: "", poolType: "pool", volumeLitres: "",
      customPhMin: "", customPhMax: "",
      customFreeChlorineMin: "", customFreeChlorineMax: "",
      customTempMin: "", customTempMax: "",
      customTurbidityMax: "", customCombinedChlorineMax: "",
    },
  });

  useEffect(() => {
    if (pool && editOpen) {
      reset({
        name: pool.name,
        poolType: pool.poolType,
        volumeLitres: fromNum(pool.volumeLitres),
        customPhMin: fromNum(pool.customPhMin),
        customPhMax: fromNum(pool.customPhMax),
        customFreeChlorineMin: fromNum(pool.customFreeChlorineMin),
        customFreeChlorineMax: fromNum(pool.customFreeChlorineMax),
        customTempMin: fromNum(pool.customTempMin),
        customTempMax: fromNum(pool.customTempMax),
        customTurbidityMax: fromNum(pool.customTurbidityMax),
        customCombinedChlorineMax: fromNum(pool.customCombinedChlorineMax),
      });
    }
  }, [pool, editOpen, reset]);

  const onSubmit = handleSubmit((data) => {
    updatePool.mutate({
      id,
      data: {
        name: data.name,
        poolType: data.poolType,
        volumeLitres: toNum(data.volumeLitres),
        customPhMin: toNum(data.customPhMin),
        customPhMax: toNum(data.customPhMax),
        customFreeChlorineMin: toNum(data.customFreeChlorineMin),
        customFreeChlorineMax: toNum(data.customFreeChlorineMax),
        customTempMin: toNum(data.customTempMin),
        customTempMax: toNum(data.customTempMax),
        customTurbidityMax: toNum(data.customTurbidityMax),
        customCombinedChlorineMax: toNum(data.customCombinedChlorineMax),
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
        toast({ title: "Pool updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update pool", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
    });
  });

  const reopenClosure = (closureId: number) => {
    updateClosure.mutate({ id: closureId, data: { reopenedAt: new Date().toISOString() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPoolClosuresQueryKey({ poolId: id, limit: 5 }) });
        toast({ title: "Pool reopened" });
      },
      onError: (err) => toast({ title: "Failed to reopen", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Loading...</div>;
  if (!pool) return <div className="text-center py-20 text-muted-foreground">Pool not found</div>;

  const latest = tests?.[0];
  const lim = effectiveLimits(pool);
  const poolType = watch("poolType");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/pools">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="heading-pool-name">{pool.name}</h1>
          <p className="text-muted-foreground text-sm">{pool.facilityName} · {poolTypeLabel(pool.poolType)} · {pool.volumeLitres ? `${(pool.volumeLitres / 1000).toFixed(0)}kL` : ""}</p>
          {pool.createdAt && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-pool-created">
              Created by {pool.createdByName ?? "Unknown"} on {format(new Date(pool.createdAt), "d MMM yyyy")}
            </p>
          )}
          {pool.updatedAt && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-pool-last-updated">
              Last updated: {format(new Date(pool.updatedAt), "d MMM yyyy HH:mm")}
              {pool.updatedByName ? ` by ${pool.updatedByName}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} data-testid="button-edit-pool"><Edit className="w-4 h-4 mr-1" />Edit</Button>}
          <Link href={`/pools/${id}/test`}>
            <Button size="sm" data-testid="button-record-test"><FlaskConical className="w-4 h-4 mr-1" />Record Test</Button>
          </Link>
          {canManage && <Link href={`/pools/${id}/close`}>
            <Button size="sm" variant="outline" data-testid="button-close-pool"><Lock className="w-4 h-4 mr-1" />Close Pool</Button>
          </Link>}
          {canManage && <Link href={`/pools/${id}/water-balance`}>
            <Button size="sm" variant="outline" data-testid="button-water-balance"><Droplets className="w-4 h-4 mr-1" />Balance</Button>
          </Link>}
        </div>
      </div>

      <PoolLimits pool={pool} />

      {latest && (
        <Card data-testid="card-latest-reading">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Latest Reading
              <ComplianceBadge v={latest.isCompliant} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{format(new Date(latest.testedAt), "d MMM yyyy HH:mm")} — {latest.testedBy}</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Free Cl₂", value: latest.freeChlorine, unit: "mg/L", warn: (v: number) => v < lim.freeChlorineMin || v > lim.freeChlorineMax },
                { label: "pH", value: latest.ph, unit: "", warn: (v: number) => v < lim.phMin || v > lim.phMax },
                { label: "Temperature", value: latest.temperature, unit: "°C", warn: (v: number) => v < lim.tempMin || v > lim.tempMax },
                { label: "CAC", value: latest.combinedChlorine, unit: "mg/L", warn: (v: number) => v >= lim.combinedChlorineMax },
              ].map(m => (
                <div key={m.label} className={`p-3 rounded-lg border text-center ${m.value != null && m.warn(m.value) ? "border-red-200 bg-red-50" : "border-border"}`} data-testid={`reading-${m.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-xl font-bold mt-0.5">{m.value != null ? m.value : "—"}<span className="text-xs font-normal ml-0.5">{m.unit}</span></p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card data-testid="card-test-history">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Test History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left pb-2 pr-3">Date/Time</th>
                      <th className="text-right pb-2 pr-3">Cl₂</th>
                      <th className="text-right pb-2 pr-3">pH</th>
                      <th className="text-right pb-2 pr-3">Temp</th>
                      <th className="text-right pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tests ?? []).map(t => (
                      <tr key={t.id} className="border-b last:border-0" data-testid={`test-row-${t.id}`}>
                        <td className="py-2 pr-3 text-xs">{format(new Date(t.testedAt), "d MMM HH:mm")}</td>
                        <td className="py-2 pr-3 text-right">{t.freeChlorine ?? "—"}</td>
                        <td className="py-2 pr-3 text-right">{t.ph ?? "—"}</td>
                        <td className="py-2 pr-3 text-right">{t.temperature != null ? `${t.temperature}°` : "—"}</td>
                        <td className="py-2 text-right"><ComplianceBadge v={t.isCompliant} /></td>
                      </tr>
                    ))}
                    {!tests?.length && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No test results yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card data-testid="card-closures">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Closures</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(closures ?? []).map(c => (
                  <div key={c.id} className="text-xs border-b pb-2 last:border-0 flex items-start justify-between gap-2" data-testid={`closure-${c.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.reason}</p>
                      <p className="text-muted-foreground">{format(new Date(c.closedAt), "d MMM yyyy")}{c.reopenedAt ? ` → ${format(new Date(c.reopenedAt), "d MMM")}` : " (open)"}</p>
                    </div>
                    {!c.reopenedAt && canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => reopenClosure(c.id)}
                        disabled={updateClosure.isPending}
                        data-testid={`button-reopen-closure-${c.id}`}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />Reopen
                      </Button>
                    )}
                  </div>
                ))}
                {!closures?.length && <p className="text-xs text-muted-foreground">No closures recorded</p>}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-water-balance">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Water Balance Tests</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(wbTests ?? []).map(w => (
                  <div key={w.id} className="text-xs border-b pb-2 last:border-0" data-testid={`wb-${w.id}`}>
                    <p className="font-medium">{format(new Date(w.testedAt), "d MMM yyyy")}</p>
                    <p className="text-muted-foreground">pH {w.ph} · TA {w.totalAlkalinity} · LI {w.langelier}</p>
                  </div>
                ))}
                {!wbTests?.length && <p className="text-xs text-muted-foreground">No balance tests recorded</p>}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-pool-history">
            <CardContent className="pt-4">
              <AuditHistory recordType="pool" recordId={id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Pool</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input data-testid="input-edit-pool-name" {...register("name", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Pool/Room Type</Label>
                <Select value={poolType} onValueChange={v => setValue("poolType", v)}>
                  <SelectTrigger data-testid="select-edit-pool-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pool">Pool</SelectItem>
                    <SelectItem value="spa">Spa</SelectItem>
                    <SelectItem value="sauna">Sauna</SelectItem>
                    <SelectItem value="steam_room">Steam Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Volume (litres)</Label>
                <Input type="number" data-testid="input-edit-pool-volume" {...register("volumeLitres")} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Custom Acceptable Ranges</p>
                <p className="text-xs text-muted-foreground">Leave any field blank to use the NZS 5826:2010 default for {poolType === "spa" ? "spa" : "pool"}.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">pH min <span className="text-muted-foreground">(default 7.2)</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-ph-min" {...register("customPhMin")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">pH max <span className="text-muted-foreground">(default 8.0)</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-ph-max" {...register("customPhMax")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Free Cl₂ min mg/L <span className="text-muted-foreground">(default {poolType === "spa" ? "2.0" : "1.5"})</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-fcl-min" {...register("customFreeChlorineMin")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Free Cl₂ max mg/L <span className="text-muted-foreground">(default 5.0)</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-fcl-max" {...register("customFreeChlorineMax")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Temp min °C <span className="text-muted-foreground">(default {poolType === "spa" ? "36" : "24"})</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-temp-min" {...register("customTempMin")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Temp max °C <span className="text-muted-foreground">(default {poolType === "spa" ? "40" : "35"})</span></Label>
                  <Input type="number" step="0.1" data-testid="input-edit-temp-max" {...register("customTempMax")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Turbidity max NTU <span className="text-muted-foreground">(default {poolType === "spa" ? "1.0" : "0.5"})</span></Label>
                  <Input type="number" step="0.01" data-testid="input-edit-turbidity-max" {...register("customTurbidityMax")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CAC max mg/L <span className="text-muted-foreground">(default 0.5)</span></Label>
                  <Input type="number" step="0.01" data-testid="input-edit-cac-max" {...register("customCombinedChlorineMax")} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updatePool.isPending} data-testid="button-save-pool">
                {updatePool.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
