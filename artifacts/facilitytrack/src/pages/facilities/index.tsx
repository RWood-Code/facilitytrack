import { useListFacilities, useCreateFacility, useUpdateFacility } from "@workspace/api-client-react";
import { getListFacilitiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState } from "react";

export default function FacilitiesPage() {
  const { data: facilities, isLoading } = useListFacilities();
  const create = useCreateFacility();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageFacilities = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", address: "", phone: "", email: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({ data: { name: data.name, address: data.address || undefined, phone: data.phone || undefined, email: data.email || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacilitiesQueryKey() });
        toast({ title: "Facility created" });
        setOpen(false); reset();
      },
    });
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-facilities">Facilities</h1>
          <p className="text-sm text-muted-foreground">Manage your aquatic facilities</p>
        </div>
        {canManageFacilities && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-facility"><Plus className="w-4 h-4 mr-1" />Add Facility</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Facility</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Name <span className="text-destructive">*</span></Label><Input data-testid="input-facility-name" {...register("name", { required: true })} /></div>
              <div className="space-y-1"><Label>Address</Label><Input data-testid="input-facility-address" {...register("address")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Phone</Label><Input data-testid="input-facility-phone" {...register("phone")} /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" data-testid="input-facility-email" {...register("email")} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-create-facility-submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-20 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {(facilities ?? []).map(f => (
            <Card key={f.id} className="hover:shadow-md transition-shadow" data-testid={`facility-card-${f.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold" data-testid={`facility-name-${f.id}`}>{f.name}</h3>
                    {f.address && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{f.address}</p>}
                    {f.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{f.phone}</p>}
                    {f.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{f.email}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!(facilities ?? []).length && <Card className="sm:col-span-2"><CardContent className="py-12 text-center text-muted-foreground">No facilities added yet</CardContent></Card>}
        </div>
      )}
    </div>
  );
}
