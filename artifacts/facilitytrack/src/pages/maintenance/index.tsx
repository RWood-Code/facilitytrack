import { useListMaintenanceSchedules, useCreateMaintenanceSchedule, useUpdateMaintenanceSchedule } from "@workspace/api-client-react";
import { getListMaintenanceSchedulesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, CheckCircle } from "lucide-react";
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
import { format, isPast } from "date-fns";

export default function MaintenancePage() {
  const { data: schedules, isLoading } = useListMaintenanceSchedules();
  const create = useCreateMaintenanceSchedule();
  const update = useUpdateMaintenanceSchedule();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageSchedules = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: { title: "", frequency: "weekly", nextDueAt: "", notes: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({ data: { title: data.title, frequency: data.frequency as "daily" | "weekly" | "monthly" | "quarterly" | "annually", nextDueAt: data.nextDueAt || undefined, notes: data.notes || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaintenanceSchedulesQueryKey() });
        toast({ title: "Schedule created" });
        setOpen(false); reset();
      },
    });
  });

  const markDone = (id: number) => {
    update.mutate({ id, data: { lastCompletedAt: new Date().toISOString(), status: "active" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaintenanceSchedulesQueryKey() });
        toast({ title: "Marked as completed" });
      },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-maintenance">Maintenance Schedules</h1>
          <p className="text-sm text-muted-foreground">Recurring maintenance tasks</p>
        </div>
        {canManageSchedules && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-schedule"><Plus className="w-4 h-4 mr-1" />Add Schedule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Maintenance Schedule</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Title <span className="text-destructive">*</span></Label><Input data-testid="input-schedule-title" placeholder="e.g. Filter backwash" {...register("title", { required: true })} /></div>
              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select defaultValue="weekly" onValueChange={v => setValue("frequency", v)}>
                  <SelectTrigger data-testid="select-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Next Due</Label><Input type="date" data-testid="input-next-due" {...register("nextDueAt")} /></div>
              <div className="space-y-1"><Label>Notes</Label><Input data-testid="input-schedule-notes" {...register("notes")} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-create-schedule-submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-12 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <div className="space-y-2">
          {(schedules ?? []).map(s => {
            const overdue = s.nextDueAt && isPast(new Date(s.nextDueAt));
            return (
              <Card key={s.id} className={overdue ? "border-orange-200" : ""} data-testid={`schedule-card-${s.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Calendar className={`w-4 h-4 flex-shrink-0 ${overdue ? "text-orange-500" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm" data-testid={`schedule-title-${s.id}`}>{s.title}</h3>
                        <Badge variant="secondary" className="text-xs capitalize">{s.frequency}</Badge>
                        <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs">{s.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.lastCompletedAt && <span>Last done: {format(new Date(s.lastCompletedAt), "d MMM yyyy")} · </span>}
                        {s.nextDueAt && <span className={overdue ? "text-orange-600 font-medium" : ""}>Next: {format(new Date(s.nextDueAt), "d MMM yyyy")}{overdue ? " (overdue)" : ""}</span>}
                      </div>
                    </div>
                  </div>
                  {canManageSchedules && (
                    <Button size="sm" variant="outline" onClick={() => markDone(s.id)} data-testid={`button-mark-done-${s.id}`}>
                      <CheckCircle className="w-4 h-4 mr-1" />Done
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!(schedules ?? []).length && <Card><CardContent className="py-12 text-center text-muted-foreground">No maintenance schedules</CardContent></Card>}
        </div>
      )}
    </div>
  );
}
