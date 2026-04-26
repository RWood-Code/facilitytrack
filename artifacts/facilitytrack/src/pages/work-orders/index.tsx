import { useListWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useListStaff, useListAssets } from "@workspace/api-client-react";
import { getListWorkOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Filter, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import type { WorkOrder } from "@workspace/api-client-react";
import { AuditHistory } from "@/components/AuditHistory";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-slate-100 text-slate-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const UNASSIGNED = "unassigned";

interface EditForm {
  title: string;
  description: string;
  priority: string;
  status: string;
  assignedTo: string;
  assetId: string;
  dueDate: string;
  notes: string;
}

export default function WorkOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const { data: workOrders, isLoading } = useListWorkOrders({ status: statusFilter || undefined, priority: priorityFilter || undefined });
  const { data: staff } = useListStaff({ isActive: true });
  const { data: assets } = useListAssets();
  const create = useCreateWorkOrder();
  const updateWO = useUpdateWorkOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageWorkOrders = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);

  const { register, handleSubmit, reset, setValue, watch: watchCreate } = useForm({
    defaultValues: { title: "", description: "", priority: "medium", assetId: UNASSIGNED, notes: "" },
  });

  const editForm = useForm<EditForm>({
    defaultValues: { title: "", description: "", priority: "medium", status: "open", assignedTo: UNASSIGNED, assetId: UNASSIGNED, dueDate: "", notes: "" },
  });

  useEffect(() => {
    if (editing) {
      editForm.reset({
        title: editing.title,
        description: editing.description ?? "",
        priority: editing.priority,
        status: editing.status,
        assignedTo: editing.assignedTo != null ? String(editing.assignedTo) : UNASSIGNED,
        assetId: editing.assetId != null ? String(editing.assetId) : UNASSIGNED,
        dueDate: editing.dueDate ? format(new Date(editing.dueDate), "yyyy-MM-dd") : "",
        notes: editing.notes ?? "",
      });
    }
  }, [editing, editForm]);

  const onSubmit = handleSubmit((data) => {
    create.mutate({
      data: {
        title: data.title,
        description: data.description || undefined,
        priority: data.priority as "low" | "medium" | "high" | "urgent",
        assetId: data.assetId === UNASSIGNED ? undefined : Number(data.assetId),
        notes: data.notes || undefined,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        toast({ title: "Work order created" });
        setOpen(false); reset();
      },
      onError: () => {
        toast({ title: "Failed to create work order", variant: "destructive" });
      },
    });
  });

  const onEditSubmit = editForm.handleSubmit((data) => {
    if (!editing) return;
    const statusChanged = data.status !== editing.status;
    let completedAt: string | null | undefined;
    if (statusChanged) {
      if (data.status === "completed") {
        completedAt = new Date().toISOString();
      } else {
        completedAt = null;
      }
    }
    updateWO.mutate({
      id: editing.id,
      data: {
        title: data.title || undefined,
        description: data.description || null,
        priority: data.priority,
        status: data.status,
        assignedTo: data.assignedTo === UNASSIGNED ? null : Number(data.assignedTo),
        assetId: data.assetId === UNASSIGNED ? null : Number(data.assetId),
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
        notes: data.notes || null,
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
        toast({ title: "Work order updated" });
        setEditing(null);
      },
      onError: (err) => toast({ title: "Failed to update", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
    });
  });

  const completeWO = (id: number) => {
    updateWO.mutate({ id, data: { status: "completed", completedAt: new Date().toISOString() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        toast({ title: "Work order completed" });
      },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-work-orders">Work Orders</h1>
          <p className="text-sm text-muted-foreground">Track maintenance and repair tasks</p>
        </div>
        {canManageWorkOrders && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-work-order"><Plus className="w-4 h-4 mr-1" />New Order</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Title <span className="text-destructive">*</span></Label><Input data-testid="input-wo-title" placeholder="e.g. Backwash filter" {...register("title", { required: true })} /></div>
              <div className="space-y-1"><Label>Description</Label><Textarea data-testid="input-wo-description" {...register("description")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select defaultValue="medium" onValueChange={v => setValue("priority", v)}>
                    <SelectTrigger data-testid="select-wo-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Asset</Label>
                  <Select value={watchCreate("assetId")} onValueChange={v => setValue("assetId", v)}>
                    <SelectTrigger data-testid="select-wo-asset"><SelectValue placeholder="No asset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>No asset</SelectItem>
                      {(assets ?? []).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Input data-testid="input-wo-notes" {...register("notes")} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-create-wo-submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <div className="flex gap-2 flex-wrap">
        {["", "open", "in_progress", "completed", "cancelled"].map(s => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} data-testid={`filter-status-${s || "all"}`}>
            {s === "" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
        <div className="ml-auto">
          <Select value={priorityFilter || "all"} onValueChange={v => setPriorityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-32" data-testid="select-priority-filter"><Filter className="w-3 h-3 mr-1" /><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-12 bg-muted rounded animate-pulse" /></CardContent></Card>)}</div>
      ) : (
        <div className="space-y-2">
          {(workOrders ?? []).map(wo => (
            <Card key={wo.id} className="hover:shadow-sm transition-shadow" data-testid={`wo-card-${wo.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[wo.priority]}`}>{wo.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[wo.status]}`}>{wo.status.replace("_", " ")}</span>
                    <h3 className="font-medium text-sm" data-testid={`wo-title-${wo.id}`}>{wo.title}</h3>
                  </div>
                  {wo.description && <p className="text-xs text-muted-foreground mt-1 truncate">{wo.description}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid={`wo-created-${wo.id}`}>
                    Created by {wo.createdByName ?? "Unknown"} on {format(new Date(wo.createdAt), "d MMM yyyy")}
                    {wo.dueDate ? ` · Due ${format(new Date(wo.dueDate), "d MMM")}` : ""}
                    {wo.assignedToName ? ` · ${wo.assignedToName}` : ""}
                    {wo.assetName ? ` · Asset: ${wo.assetName}` : ""}
                  </p>
                  {wo.updatedAt && new Date(wo.updatedAt).getTime() !== new Date(wo.createdAt).getTime() && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5" data-testid={`wo-last-edited-${wo.id}`}>
                      Last edited {format(new Date(wo.updatedAt), "d MMM yyyy HH:mm")}
                      {wo.updatedByName ? ` by ${wo.updatedByName}` : ""}
                    </p>
                  )}
                </div>
                {canManageWorkOrders && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(wo)} data-testid={`button-edit-wo-${wo.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    {wo.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => completeWO(wo.id)} data-testid={`button-complete-wo-${wo.id}`}>Complete</Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!(workOrders ?? []).length && <Card><CardContent className="py-12 text-center text-muted-foreground">No work orders found</CardContent></Card>}
        </div>
      )}

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Work Order</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={onEditSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input data-testid="input-edit-wo-title" {...editForm.register("title", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea data-testid="input-edit-wo-description" {...editForm.register("description")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select value={editForm.watch("priority")} onValueChange={v => editForm.setValue("priority", v)}>
                    <SelectTrigger data-testid="select-edit-wo-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={editForm.watch("status")} onValueChange={v => editForm.setValue("status", v)}>
                    <SelectTrigger data-testid="select-edit-wo-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" data-testid="input-edit-wo-due-date" {...editForm.register("dueDate")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Assignee</Label>
                  <Select value={editForm.watch("assignedTo")} onValueChange={v => editForm.setValue("assignedTo", v)}>
                    <SelectTrigger data-testid="select-edit-wo-assignee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(staff ?? []).map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Asset</Label>
                  <Select value={editForm.watch("assetId")} onValueChange={v => editForm.setValue("assetId", v)}>
                    <SelectTrigger data-testid="select-edit-wo-asset"><SelectValue placeholder="No asset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>No asset</SelectItem>
                      {(assets ?? []).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input data-testid="input-edit-wo-notes" {...editForm.register("notes")} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={updateWO.isPending} data-testid="button-save-wo">
                  {updateWO.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
              <div className="border-t pt-3 mt-2">
                <AuditHistory recordType="work_order" recordId={editing.id} />
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
