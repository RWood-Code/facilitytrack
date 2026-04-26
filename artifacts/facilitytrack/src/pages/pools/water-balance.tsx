import { useGetPool, useCreateWaterBalanceTest } from "@workspace/api-client-react";
import { getGetPoolQueryKey, getListWaterBalanceTestsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function WaterBalancePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: pool } = useGetPool(id, { query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) } });
  const createWB = useCreateWaterBalanceTest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { register, handleSubmit } = useForm({
    defaultValues: { testedBy: "", ph: "", totalAlkalinity: "", calciumHardness: "", cyanuricAcid: "", totalDissolvedSolids: "", langelier: "", notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    createWB.mutate({
      data: {
        poolId: id,
        testedBy: data.testedBy || undefined,
        ph: data.ph ? Number(data.ph) : undefined,
        totalAlkalinity: data.totalAlkalinity ? Number(data.totalAlkalinity) : undefined,
        calciumHardness: data.calciumHardness ? Number(data.calciumHardness) : undefined,
        cyanuricAcid: data.cyanuricAcid ? Number(data.cyanuricAcid) : undefined,
        totalDissolvedSolids: data.totalDissolvedSolids ? Number(data.totalDissolvedSolids) : undefined,
        langelier: data.langelier ? Number(data.langelier) : undefined,
        notes: data.notes || undefined,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWaterBalanceTestsQueryKey({ poolId: id }) });
        toast({ title: "Water balance test recorded" });
        setLocation(`/pools/${id}`);
      },
    });
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/pools/${id}`)}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-xl font-bold">Water Balance Test</h1>
          <p className="text-sm text-muted-foreground">{pool?.name}</p>
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Droplets className="w-4 h-4" />Langelier Saturation Index</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Tested By</Label>
              <Input data-testid="input-wb-tested-by" placeholder="Tester name" {...register("testedBy")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>pH</Label><Input type="number" step="0.01" data-testid="input-wb-ph" placeholder="7.2–7.8" {...register("ph")} /></div>
              <div className="space-y-1"><Label>Total Alkalinity (ppm)</Label><Input type="number" data-testid="input-wb-ta" placeholder="80–120" {...register("totalAlkalinity")} /></div>
              <div className="space-y-1"><Label>Calcium Hardness (ppm)</Label><Input type="number" data-testid="input-wb-ch" placeholder="200–400" {...register("calciumHardness")} /></div>
              <div className="space-y-1"><Label>Cyanuric Acid (ppm)</Label><Input type="number" data-testid="input-wb-cya" placeholder="30–50" {...register("cyanuricAcid")} /></div>
              <div className="space-y-1"><Label>TDS (ppm)</Label><Input type="number" data-testid="input-wb-tds" placeholder="< 1500" {...register("totalDissolvedSolids")} /></div>
              <div className="space-y-1"><Label>Langelier Index</Label><Input type="number" step="0.01" data-testid="input-wb-li" placeholder="-0.5 to +0.5" {...register("langelier")} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-wb-notes" {...register("notes")} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLocation(`/pools/${id}`)}>Cancel</Button>
              <Button type="submit" disabled={createWB.isPending} data-testid="button-submit-wb">Record</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
