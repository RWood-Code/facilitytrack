import { useListPools, useCreatePool, useListFacilities } from "@workspace/api-client-react";
import { getListPoolsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Waves, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState } from "react";
import { poolTypeLabel } from "@/lib/limits";

export default function PoolsPage() {
  const { data: pools, isLoading } = useListPools();
  const { data: facilities } = useListFacilities();
  const createPool = useCreatePool();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm({ defaultValues: { name: "", facilityId: 0, poolType: "pool", volumeLitres: "" } });

  const onSubmit = handleSubmit((data) => {
    createPool.mutate({
      data: { name: data.name, facilityId: Number(data.facilityId), poolType: data.poolType as "pool" | "spa" | "sauna" | "steam_room", volumeLitres: data.volumeLitres ? Number(data.volumeLitres) : undefined }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        toast({ title: "Pool created" });
        setOpen(false);
        reset();
      },
    });
  });

  const grouped = (pools ?? []).reduce((acc, p) => {
    const fac = p.facilityName ?? "Unknown";
    if (!acc[fac]) acc[fac] = [];
    acc[fac].push(p);
    return acc;
  }, {} as Record<string, typeof pools>);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-pools">Pools</h1>
          <p className="text-muted-foreground text-sm">Manage and monitor all aquatic pools</p>
        </div>
        {canManage && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-pool"><Plus className="w-4 h-4 mr-1" />Add Pool</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Pool</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label>Pool Name</Label>
                <Input data-testid="input-pool-name" placeholder="e.g. Main Pool" {...register("name", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Facility</Label>
                <Select onValueChange={v => setValue("facilityId", Number(v))}>
                  <SelectTrigger data-testid="select-facility"><SelectValue placeholder="Select facility" /></SelectTrigger>
                  <SelectContent>
                    {(facilities ?? []).map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Pool/Room Type</Label>
                <Select defaultValue="pool" onValueChange={v => setValue("poolType", v)}>
                  <SelectTrigger data-testid="select-pool-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pool">Pool</SelectItem>
                    <SelectItem value="spa">Spa</SelectItem>
                    <SelectItem value="sauna">Sauna</SelectItem>
                    <SelectItem value="steam_room">Steam Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Volume (litres, optional)</Label>
                <Input type="number" data-testid="input-volume" placeholder="750000" {...register("volumeLitres")} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createPool.isPending} data-testid="button-create-pool-submit">Create Pool</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-20 bg-muted rounded animate-pulse" /></CardContent></Card>)}
        </div>
      ) : Object.entries(grouped).length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No pools yet. Add your first pool to get started.</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([fac, fPools]) => (
          <div key={fac}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{fac}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(fPools ?? []).map(p => (
                <Link key={p.id} href={`/pools/${p.id}`} data-testid={`pool-card-${p.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.poolType === "spa" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                          <Waves className="w-5 h-5" />
                        </div>
                        <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">{p.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                      <h3 className="font-semibold text-sm" data-testid={`pool-name-${p.id}`}>{p.name}</h3>
                      <p className="text-xs text-muted-foreground">{poolTypeLabel(p.poolType)} · {p.volumeLitres ? `${(p.volumeLitres / 1000).toFixed(0)}kL` : "Volume unknown"}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" asChild>
                          <Link href={`/pools/${p.id}/test`} onClick={e => e.stopPropagation()} data-testid={`button-test-pool-${p.id}`}>
                            <FlaskConical className="w-3 h-3 mr-1" />Test
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
