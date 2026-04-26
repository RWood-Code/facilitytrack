import { useGetPool, useCreatePoolClosure, useListPools } from "@workspace/api-client-react";
import { getGetPoolQueryKey, getListPoolClosuresQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CLOSURE_CODES = [
  { code: "C01", label: "C01 — Faecal contamination" },
  { code: "C02", label: "C02 — Non-compliant water quality" },
  { code: "C03", label: "C03 — Equipment failure" },
  { code: "C04", label: "C04 — Medical emergency" },
  { code: "C05", label: "C05 — Scheduled maintenance" },
  { code: "C06", label: "C06 — Other" },
];

export default function ClosePoolPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: pool } = useGetPool(id, { query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) } });
  const { data: pools } = useListPools();
  const createClosure = useCreatePoolClosure();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: { closedBy: "", closureCode: "", reason: "", notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    createClosure.mutate({
      data: { poolId: id, closedBy: data.closedBy || undefined, closureCode: data.closureCode || undefined, reason: data.reason, notes: data.notes || undefined },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPoolClosuresQueryKey({ poolId: id }) });
        toast({ title: "Pool closure logged", variant: "destructive" });
        setLocation(`/pools/${id}`);
      },
    });
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/pools/${id}`)}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-xl font-bold">Log Pool Closure</h1>
          <p className="text-sm text-muted-foreground">{pool?.name}</p>
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <Card className="border-red-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2 text-red-700"><Lock className="w-4 h-4" />Closure Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Closure Code</Label>
              <Select onValueChange={v => { setValue("closureCode", v.split(" — ")[0]); setValue("reason", CLOSURE_CODES.find(c => c.code === v.split(" — ")[0])?.label.split(" — ")[1] ?? ""); }}>
                <SelectTrigger data-testid="select-closure-code"><SelectValue placeholder="Select code" /></SelectTrigger>
                <SelectContent>
                  {CLOSURE_CODES.map(c => <SelectItem key={c.code} value={c.label}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Input data-testid="input-closure-reason" placeholder="Describe the closure reason" {...register("reason", { required: true })} />
              {errors.reason && <p className="text-xs text-destructive">Reason is required</p>}
            </div>
            <div className="space-y-1">
              <Label>Closed By</Label>
              <Input data-testid="input-closed-by" placeholder="Name" {...register("closedBy")} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea data-testid="input-closure-notes" placeholder="Any additional information..." {...register("notes")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLocation(`/pools/${id}`)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={createClosure.isPending} data-testid="button-submit-closure">Log Closure</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
