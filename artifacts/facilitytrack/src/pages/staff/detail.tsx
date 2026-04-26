import { useGetStaffMember, useListStaffQualifications, useListTrainingRecords, useCreateStaffQualification, useCreateTrainingRecord } from "@workspace/api-client-react";
import { getGetStaffMemberQueryKey, getListStaffQualificationsQueryKey, getListTrainingRecordsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Award, BookOpen, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { format } from "date-fns";
import { useState } from "react";

const STATUS_BADGE: Record<string, React.ReactNode> = {
  current: <Badge className="bg-green-100 text-green-800 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Current</Badge>,
  expiring_soon: <Badge className="bg-orange-100 text-orange-800 text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Expiring</Badge>,
  expired: <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>,
};

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: staff, isLoading } = useGetStaffMember(id, { query: { enabled: !!id, queryKey: getGetStaffMemberQueryKey(id) } });
  const { data: quals } = useListStaffQualifications({ staffId: id });
  const { data: training } = useListTrainingRecords({ staffId: id });
  const createQual = useCreateStaffQualification();
  const createTraining = useCreateTrainingRecord();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageStaff = isAdminOrHigher(user?.role);
  const [qualOpen, setQualOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);

  const qualForm = useForm({ defaultValues: { qualificationName: "", issuer: "", issuedDate: "", expiryDate: "", certificateNumber: "", notes: "" } });
  const trainingForm = useForm({ defaultValues: { trainingName: "", provider: "", completedAt: "", durationHours: "", notes: "" } });

  const onQualSubmit = qualForm.handleSubmit((data) => {
    createQual.mutate({ data: { staffId: id, qualificationName: data.qualificationName, issuer: data.issuer || undefined, issuedDate: data.issuedDate || undefined, expiryDate: data.expiryDate || undefined, certificateNumber: data.certificateNumber || undefined } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListStaffQualificationsQueryKey({ staffId: id }) }); toast({ title: "Qualification added" }); setQualOpen(false); qualForm.reset(); },
    });
  });

  const onTrainingSubmit = trainingForm.handleSubmit((data) => {
    createTraining.mutate({ data: { staffId: id, trainingName: data.trainingName, provider: data.provider || undefined, completedAt: data.completedAt || undefined, durationHours: data.durationHours ? Number(data.durationHours) : undefined } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTrainingRecordsQueryKey({ staffId: id }) }); toast({ title: "Training record added" }); setTrainingOpen(false); trainingForm.reset(); },
    });
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Loading...</div>;
  if (!staff) return <div className="text-center py-20 text-muted-foreground">Staff member not found</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/staff")}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-staff-name">{staff.firstName} {staff.lastName}</h1>
          <p className="text-sm text-muted-foreground">{staff.role ?? "Staff"} · {staff.isActive ? "Active" : "Inactive"}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" />Qualifications</CardTitle>
            {canManageStaff && <Dialog open={qualOpen} onOpenChange={setQualOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="button-add-qual"><Plus className="w-3 h-3 mr-1" />Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Qualification</DialogTitle></DialogHeader>
                <form onSubmit={onQualSubmit} className="space-y-3">
                  <div className="space-y-1"><Label>Qualification <span className="text-destructive">*</span></Label><Input data-testid="input-qual-name" placeholder="e.g. Pool Lifeguard Certificate" {...qualForm.register("qualificationName", { required: true })} /></div>
                  <div className="space-y-1"><Label>Issuer</Label><Input data-testid="input-qual-issuer" placeholder="e.g. Water Safety NZ" {...qualForm.register("issuer")} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Issued Date</Label><Input type="date" data-testid="input-qual-issued" {...qualForm.register("issuedDate")} /></div>
                    <div className="space-y-1"><Label>Expiry Date</Label><Input type="date" data-testid="input-qual-expiry" {...qualForm.register("expiryDate")} /></div>
                  </div>
                  <div className="space-y-1"><Label>Certificate No.</Label><Input data-testid="input-qual-cert" {...qualForm.register("certificateNumber")} /></div>
                  <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setQualOpen(false)}>Cancel</Button><Button type="submit" data-testid="button-submit-qual">Add</Button></div>
                </form>
              </DialogContent>
            </Dialog>}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(quals ?? []).map(q => (
                <div key={q.id} className="p-3 border rounded-lg" data-testid={`qual-${q.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{q.qualificationName}</p>
                      {q.issuer && <p className="text-xs text-muted-foreground">{q.issuer}</p>}
                      {q.expiryDate && <p className="text-xs text-muted-foreground">Expires: {format(new Date(q.expiryDate), "d MMM yyyy")}</p>}
                    </div>
                    {STATUS_BADGE[q.status]}
                  </div>
                </div>
              ))}
              {!(quals ?? []).length && <p className="text-sm text-muted-foreground">No qualifications on record</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" />Training Records</CardTitle>
            {canManageStaff && <Dialog open={trainingOpen} onOpenChange={setTrainingOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="button-add-training"><Plus className="w-3 h-3 mr-1" />Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Training Record</DialogTitle></DialogHeader>
                <form onSubmit={onTrainingSubmit} className="space-y-3">
                  <div className="space-y-1"><Label>Training Name <span className="text-destructive">*</span></Label><Input data-testid="input-training-name" placeholder="e.g. CPR Refresher" {...trainingForm.register("trainingName", { required: true })} /></div>
                  <div className="space-y-1"><Label>Provider</Label><Input data-testid="input-training-provider" {...trainingForm.register("provider")} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Completed</Label><Input type="date" data-testid="input-training-date" {...trainingForm.register("completedAt")} /></div>
                    <div className="space-y-1"><Label>Hours</Label><Input type="number" step="0.5" data-testid="input-training-hours" {...trainingForm.register("durationHours")} /></div>
                  </div>
                  <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTrainingOpen(false)}>Cancel</Button><Button type="submit" data-testid="button-submit-training">Add</Button></div>
                </form>
              </DialogContent>
            </Dialog>}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(training ?? []).map(t => (
                <div key={t.id} className="text-sm p-3 border rounded-lg" data-testid={`training-${t.id}`}>
                  <p className="font-medium">{t.trainingName}</p>
                  <p className="text-xs text-muted-foreground">{t.provider ? `${t.provider} · ` : ""}{t.completedAt ? format(new Date(t.completedAt), "d MMM yyyy") : "Date TBC"}{t.durationHours ? ` · ${t.durationHours}h` : ""}</p>
                </div>
              ))}
              {!(training ?? []).length && <p className="text-sm text-muted-foreground">No training records</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
