import { useListAssets, useCreateAsset } from "@workspace/api-client-react";
import { getListAssetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Package, AlertCircle, CheckCircle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState } from "react";
import { format } from "date-fns";

const STATUS_ICON: Record<string, React.ReactNode> = {
  operational: <CheckCircle className="w-4 h-4 text-green-500" />,
  maintenance: <AlertCircle className="w-4 h-4 text-orange-500" />,
  decommissioned: <Package className="w-4 h-4 text-gray-400" />,
};

export default function AssetsPage() {
  const { data: assets, isLoading } = useListAssets();
  const create = useCreateAsset();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageAssets = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: { name: "", category: "", status: "operational", manufacturer: "", model: "", location: "", notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({ data: { name: data.name, category: data.category || undefined, status: data.status as "operational" | "maintenance" | "decommissioned", manufacturer: data.manufacturer || undefined, model: data.model || undefined, location: data.location || undefined, notes: data.notes || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset added" });
        setOpen(false); reset();
      },
    });
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-assets">Asset Register</h1>
          <p className="text-sm text-muted-foreground">Equipment and facility assets</p>
        </div>
        {canManageAssets && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-asset"><Plus className="w-4 h-4 mr-1" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Name <span className="text-destructive">*</span></Label><Input data-testid="input-asset-name" placeholder="e.g. Main Circulation Pump" {...register("name", { required: true })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Category</Label><Input data-testid="input-asset-category" placeholder="e.g. Pump" {...register("category")} /></div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select defaultValue="operational" onValueChange={v => setValue("status", v)}>
                    <SelectTrigger data-testid="select-asset-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operational">Operational</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="decommissioned">Decommissioned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Manufacturer</Label><Input data-testid="input-asset-manufacturer" {...register("manufacturer")} /></div>
                <div className="space-y-1"><Label>Model</Label><Input data-testid="input-asset-model" {...register("model")} /></div>
              </div>
              <div className="space-y-1"><Label>Location</Label><Input data-testid="input-asset-location" placeholder="e.g. Plant Room A" {...register("location")} /></div>
              <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-asset-notes" {...register("notes")} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-create-asset-submit">Add Asset</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-16 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(assets ?? []).map(a => (
            <Card key={a.id} className="hover:shadow-md transition-shadow" data-testid={`asset-card-${a.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {STATUS_ICON[a.status]}
                    <Badge variant="secondary" className="text-xs">{a.category ?? "General"}</Badge>
                  </div>
                  <Badge variant={a.status === "operational" ? "default" : "secondary"} className="text-xs capitalize">{a.status}</Badge>
                </div>
                <h3 className="font-semibold text-sm" data-testid={`asset-name-${a.id}`}>{a.name}</h3>
                {a.manufacturer && <p className="text-xs text-muted-foreground">{a.manufacturer} {a.model}</p>}
                {a.location && <p className="text-xs text-muted-foreground">{a.location}</p>}
                {a.nextServiceDate && (
                  <p className="text-xs mt-2 text-orange-600">Next service: {format(new Date(a.nextServiceDate), "d MMM yyyy")}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {!(assets ?? []).length && <Card className="sm:col-span-2 lg:col-span-3"><CardContent className="py-12 text-center text-muted-foreground">No assets added yet</CardContent></Card>}
        </div>
      )}
    </div>
  );
}
