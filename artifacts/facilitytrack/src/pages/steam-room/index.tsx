import { useListSteamRoomChecks, useCreateSteamRoomCheck, useListPools } from "@workspace/api-client-react";
import { getListSteamRoomChecksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Wind, CheckCircle, XCircle, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";

export default function SteamRoomPage() {
  const { data: checks, isLoading } = useListSteamRoomChecks({ limit: 50 });
  const { data: pools } = useListPools();
  const create = useCreateSteamRoomCheck();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: { poolId: 0, checkedBy: "", temperature: "", humidity: "", isClean: true, isOperational: true, notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({
      data: { poolId: Number(data.poolId), checkedBy: data.checkedBy || undefined, temperature: data.temperature ? Number(data.temperature) : undefined, humidity: data.humidity ? Number(data.humidity) : undefined, isClean: Boolean(data.isClean), isOperational: Boolean(data.isOperational), entryType: "day_log", notes: data.notes || undefined },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSteamRoomChecksQueryKey() });
        toast({ title: "Steam room check recorded" });
        setOpen(false); reset();
      },
    });
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-steam-room">Steam Room</h1>
          <p className="text-sm text-muted-foreground">Daily condition logs and checks</p>
        </div>
        <div className="flex gap-2">
          <Link href="/steam-room/tablet">
            <Button variant="outline" size="sm" data-testid="button-tablet-mode"><Tablet className="w-4 h-4 mr-1" />Tablet Mode</Button>
          </Link>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-new-check"><Plus className="w-4 h-4 mr-1" />Log Check</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Steam Room Check</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label>Steam Room / Pool</Label>
                  <Select onValueChange={v => setValue("poolId", Number(v))}>
                    <SelectTrigger data-testid="select-pool-steam"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(pools ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Checked By</Label><Input data-testid="input-checked-by" {...register("checkedBy")} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Temperature (°C)</Label><Input type="number" step="0.1" data-testid="input-steam-temp" {...register("temperature")} /></div>
                  <div className="space-y-1"><Label>Humidity (%)</Label><Input type="number" data-testid="input-steam-humidity" {...register("humidity")} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Clean?</Label>
                    <Select defaultValue="true" onValueChange={v => setValue("isClean", v === "true")}>
                      <SelectTrigger data-testid="select-is-clean"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Operational?</Label>
                    <Select defaultValue="true" onValueChange={v => setValue("isOperational", v === "true")}>
                      <SelectTrigger data-testid="select-is-operational"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1"><Label>Notes</Label><Input data-testid="input-steam-notes" {...register("notes")} /></div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending} data-testid="button-submit-steam-check">Log Check</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-8 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left p-4">Date/Time</th>
                  <th className="text-left p-4">Pool</th>
                  <th className="text-right p-4">Temp</th>
                  <th className="text-right p-4">Humidity</th>
                  <th className="text-center p-4">Clean</th>
                  <th className="text-center p-4">Operational</th>
                  <th className="text-left p-4">By</th>
                </tr>
              </thead>
              <tbody>
                {(checks ?? []).map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`steam-row-${c.id}`}>
                    <td className="p-4">{format(new Date(c.checkedAt), "d MMM HH:mm")}</td>
                    <td className="p-4">{c.poolName ?? "—"}</td>
                    <td className="p-4 text-right">{c.temperature != null ? `${c.temperature}°C` : "—"}</td>
                    <td className="p-4 text-right">{c.humidity != null ? `${c.humidity}%` : "—"}</td>
                    <td className="p-4 text-center">{c.isClean ? <CheckCircle className="w-4 h-4 text-green-600 mx-auto" /> : <XCircle className="w-4 h-4 text-red-600 mx-auto" />}</td>
                    <td className="p-4 text-center">{c.isOperational ? <CheckCircle className="w-4 h-4 text-green-600 mx-auto" /> : <XCircle className="w-4 h-4 text-red-600 mx-auto" />}</td>
                    <td className="p-4 text-muted-foreground">{c.checkedBy ?? "—"}</td>
                  </tr>
                ))}
                {!checks?.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No checks recorded yet</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
