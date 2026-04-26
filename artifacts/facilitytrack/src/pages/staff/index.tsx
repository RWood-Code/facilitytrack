import { useListStaff, useCreateStaff, useListStaffQualifications } from "@workspace/api-client-react";
import { getListStaffQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState } from "react";

export default function StaffPage() {
  const { data: staff, isLoading } = useListStaff();
  const { data: qualifications } = useListStaffQualifications();
  const create = useCreateStaff();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageStaff = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", role: "", notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({ data: { firstName: data.firstName, lastName: data.lastName, email: data.email || undefined, phone: data.phone || undefined, role: data.role || undefined, notes: data.notes || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
        toast({ title: "Staff member added" });
        setOpen(false); reset();
      },
    });
  });

  const getExpiringCount = (staffId: number) =>
    (qualifications ?? []).filter(q => q.staffId === staffId && (q.status === "expiring_soon" || q.status === "expired")).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-staff">Staff</h1>
          <p className="text-sm text-muted-foreground">Manage staff qualifications and training</p>
        </div>
        {canManageStaff && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-staff"><Plus className="w-4 h-4 mr-1" />Add Staff</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>First Name <span className="text-destructive">*</span></Label><Input data-testid="input-first-name" {...register("firstName", { required: true })} /></div>
                <div className="space-y-1"><Label>Last Name <span className="text-destructive">*</span></Label><Input data-testid="input-last-name" {...register("lastName", { required: true })} /></div>
              </div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" data-testid="input-staff-email" {...register("email")} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input data-testid="input-staff-phone" {...register("phone")} /></div>
              <div className="space-y-1"><Label>Role</Label><Input data-testid="input-staff-role" placeholder="e.g. Senior Lifeguard" {...register("role")} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-create-staff-submit">Add</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-16 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(staff ?? []).map(s => {
            const alertCount = getExpiringCount(s.id);
            return (
              <Link key={s.id} href={`/staff/${s.id}`} data-testid={`staff-card-${s.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <div className="flex items-center gap-1">
                        {alertCount > 0 && <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />{alertCount}</Badge>}
                        <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">{s.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm" data-testid={`staff-name-${s.id}`}>{s.firstName} {s.lastName}</h3>
                    {s.role && <p className="text-xs text-muted-foreground">{s.role}</p>}
                    {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {!(staff ?? []).length && <Card className="sm:col-span-2 lg:col-span-3"><CardContent className="py-12 text-center text-muted-foreground">No staff members added yet</CardContent></Card>}
        </div>
      )}
    </div>
  );
}
