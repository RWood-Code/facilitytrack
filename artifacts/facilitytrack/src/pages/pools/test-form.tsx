import { useGetPool, useCreateTestResult, useListPools } from "@workspace/api-client-react";
import { getGetPoolQueryKey, getListTestResultsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { effectiveLimits, formatRange, formatMax } from "@/lib/limits";

export default function TestFormPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: pool } = useGetPool(id, { query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) } });
  const { data: pools } = useListPools();
  const createTest = useCreateTestResult();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedPoolId, setSelectedPoolId] = useState<number>(id || 0);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      testedBy: "",
      freeChlorine: "",
      totalAvailableChlorine: "",
      ph: "",
      temperature: "",
      turbidity: "",
      totalAlkalinity: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    const poolId = selectedPoolId || id;
    createTest.mutate({
      data: {
        poolId,
        testedBy: data.testedBy || undefined,
        freeChlorine: data.freeChlorine ? Number(data.freeChlorine) : undefined,
        totalAvailableChlorine: data.totalAvailableChlorine ? Number(data.totalAvailableChlorine) : undefined,
        ph: data.ph ? Number(data.ph) : undefined,
        temperature: data.temperature ? Number(data.temperature) : undefined,
        turbidity: data.turbidity ? Number(data.turbidity) : undefined,
        totalAlkalinity: data.totalAlkalinity ? Number(data.totalAlkalinity) : undefined,
        notes: data.notes || undefined,
      },
    }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListTestResultsQueryKey({ poolId }) });
        toast({
          title: result.isCompliant ? "Test recorded — Compliant" : "Test recorded — NON-COMPLIANT",
          description: result.isCompliant ? "Water quality meets acceptable ranges" : "Water quality is outside the acceptable ranges — immediate action required",
          variant: result.isCompliant ? "default" : "destructive",
        });
        setLocation(id ? `/pools/${id}` : "/pools");
      },
    });
  });

  const isSpa = pool?.poolType === "spa";
  const lim = useMemo(() => pool ? effectiveLimits(pool) : null, [pool]);
  const anyCustom = pool && (pool.customPhMin != null || pool.customPhMax != null || pool.customFreeChlorineMin != null || pool.customFreeChlorineMax != null || pool.customTempMin != null || pool.customTempMax != null || pool.customTurbidityMax != null || pool.customCombinedChlorineMax != null);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(id ? `/pools/${id}` : "/pools")}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-xl font-bold" data-testid="heading-test-form">Record Water Test</h1>
          <p className="text-sm text-muted-foreground">{pool?.name ?? "Select pool"} — NZS 5826:2010</p>
        </div>
      </div>

      {lim && (
        <Card className="border-blue-100 bg-blue-50/50" data-testid="card-acceptable-ranges">
          <CardContent className="p-4 text-xs space-y-1 text-blue-800">
            <p className="font-semibold">
              Acceptable Ranges ({isSpa ? "Spa" : "Pool"})
              {anyCustom ? <span className="font-normal"> — custom values applied</span> : <span className="font-normal"> — NZS 5826:2010 defaults</span>}:
            </p>
            <div className="grid grid-cols-2 gap-1">
              <span>Free Cl₂: {formatRange(lim.freeChlorineMin, lim.freeChlorineMax)} mg/L</span>
              <span>pH: {formatRange(lim.phMin, lim.phMax)}</span>
              <span>Temperature: {formatRange(lim.tempMin, lim.tempMax)}°C</span>
              <span>CAC (TAC−FAC): {formatMax(lim.combinedChlorineMax)} mg/L</span>
              <span>Turbidity: {formatMax(lim.turbidityMax)} NTU</span>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4" />Test Parameters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!id && (
              <div className="space-y-1">
                <Label>Pool</Label>
                <Select onValueChange={v => setSelectedPoolId(Number(v))}>
                  <SelectTrigger data-testid="select-pool"><SelectValue placeholder="Select pool" /></SelectTrigger>
                  <SelectContent>
                    {(pools ?? []).filter(p => p.isActive).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Tested By</Label>
              <Input data-testid="input-tested-by" placeholder="Name of tester" {...register("testedBy")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Free Chlorine (mg/L) <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.1" data-testid="input-free-chlorine" placeholder={lim ? formatRange(lim.freeChlorineMin, lim.freeChlorineMax) : ""} {...register("freeChlorine", { required: true })} />
                {errors.freeChlorine && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-1">
                <Label>Total Available Cl₂ (mg/L)</Label>
                <Input type="number" step="0.1" data-testid="input-total-chlorine" placeholder="e.g. 2.5" {...register("totalAvailableChlorine")} />
              </div>
              <div className="space-y-1">
                <Label>pH <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" data-testid="input-ph" placeholder={lim ? formatRange(lim.phMin, lim.phMax) : ""} {...register("ph", { required: true })} />
                {errors.ph && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-1">
                <Label>Temperature (°C)</Label>
                <Input type="number" step="0.1" data-testid="input-temperature" placeholder={lim ? formatRange(lim.tempMin, lim.tempMax) : ""} {...register("temperature")} />
              </div>
              <div className="space-y-1">
                <Label>Turbidity (NTU)</Label>
                <Input type="number" step="0.01" data-testid="input-turbidity" placeholder={lim ? formatMax(lim.turbidityMax) : ""} {...register("turbidity")} />
              </div>
              <div className="space-y-1">
                <Label>Total Alkalinity (mg/L)</Label>
                <Input type="number" data-testid="input-total-alkalinity" placeholder="80–120" {...register("totalAlkalinity")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea data-testid="input-notes" placeholder="Any observations or corrective actions taken..." {...register("notes")} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setLocation(id ? `/pools/${id}` : "/pools")}>Cancel</Button>
              <Button type="submit" disabled={createTest.isPending} data-testid="button-submit-test">
                {createTest.isPending ? "Recording..." : "Record Test"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
