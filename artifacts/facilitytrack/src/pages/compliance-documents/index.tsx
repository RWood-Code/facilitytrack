import {
  useListComplianceDocuments,
  useCreateComplianceDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListComplianceDocumentsQueryKey } from "@workspace/api-client-react";
import { Plus, FileCheck, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useState } from "react";
import { format } from "date-fns";
import type { ComplianceDocument } from "@workspace/api-client-react";

const DOCUMENT_TYPES = [
  "ILTP Certificate",
  "PoolSafe Accreditation",
  "Emergency Action Plan",
  "Risk Management Plan",
  "Pool Operations Manual",
  "Chemical Safety Data Sheet",
  "Staff Training Record",
  "Water Quality Monitoring Log",
  "Inspection Certificate",
  "Other",
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  current: { label: "Current", variant: "default", icon: <FileCheck className="w-3 h-3" /> },
  expiring_soon: { label: "Expiring Soon", variant: "secondary", icon: <AlertTriangle className="w-3 h-3" /> },
  expired: { label: "Expired", variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
};

export default function ComplianceDocumentsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageDocuments = isAdminOrHigher(user?.role);
  const [open, setOpen] = useState(false);

  const { data: docs, isLoading } = useListComplianceDocuments();

  const mutation = useCreateComplianceDocument({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListComplianceDocumentsQueryKey() });
        toast({ title: "Document added" });
        setOpen(false);
        reset();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to create document", variant: "destructive" });
      },
    },
  });

  const { register, handleSubmit, reset, control } = useForm({
    defaultValues: {
      documentType: "",
      documentName: "",
      description: "",
      issuedBy: "",
      referenceNumber: "",
      issuedDate: "",
      expiryDate: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    mutation.mutate({
      data: {
        documentType: data.documentType,
        documentName: data.documentName,
        description: data.description || undefined,
        issuedBy: data.issuedBy || undefined,
        referenceNumber: data.referenceNumber || undefined,
        issuedDate: data.issuedDate || undefined,
        expiryDate: data.expiryDate || undefined,
        notes: data.notes || undefined,
      },
    });
  });

  const docList: ComplianceDocument[] = docs ?? [];

  const grouped = docList.reduce<Record<string, ComplianceDocument[]>>((acc, doc) => {
    const key = doc.documentType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  const expiringSoonCount = docList.filter(d => d.status === "expiring_soon").length;
  const expiredCount = docList.filter(d => d.status === "expired").length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-compliance-docs">
            <ShieldCheck className="w-6 h-6 text-primary" />
            ILTP / PoolSafe Compliance
          </h1>
          <p className="text-sm text-muted-foreground">
            NZS 5826:2010 compliance documents, ILTP certificates, and PoolSafe accreditation records
          </p>
        </div>
        {canManageDocuments && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-compliance-doc">
              <Plus className="w-4 h-4 mr-1" />Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Compliance Document</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label>Document Type <span className="text-destructive">*</span></Label>
                <Controller
                  name="documentType"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-doc-type"><SelectValue placeholder="Select type…" /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Document Name <span className="text-destructive">*</span></Label>
                <Input data-testid="input-doc-name" placeholder="e.g. ILTP Level 2 — Jane Manager" {...register("documentName", { required: true })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Issued Date</Label>
                  <Input type="date" {...register("issuedDate")} />
                </div>
                <div className="space-y-1">
                  <Label>Expiry Date</Label>
                  <Input type="date" data-testid="input-doc-expiry" {...register("expiryDate")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Issued By</Label>
                  <Input placeholder="e.g. Swimming NZ" {...register("issuedBy")} />
                </div>
                <div className="space-y-1">
                  <Label>Reference Number</Label>
                  <Input placeholder="e.g. ILTP-2024-001" {...register("referenceNumber")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea {...register("notes")} rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-create-compliance-doc-submit">Add Document</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {(expiringSoonCount > 0 || expiredCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium">
              <XCircle className="w-4 h-4" />
              {expiredCount} document{expiredCount > 1 ? "s" : ""} expired
            </div>
          )}
          {expiringSoonCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {expiringSoonCount} expiring within 60 days
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading compliance documents…</div>
      ) : docList.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No compliance documents yet</p>
            <p className="text-sm mt-1">Add ILTP certificates, PoolSafe accreditation, emergency action plans, and other required documents.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([type, items]) => (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{type}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {items.map(doc => {
                  const statusInfo = STATUS_BADGE[doc.status] ?? STATUS_BADGE.current;
                  return (
                    <div key={doc.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{doc.documentName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                          {doc.referenceNumber && <span>Ref: {doc.referenceNumber}</span>}
                          {doc.issuedBy && <span>By: {doc.issuedBy}</span>}
                          {doc.issuedDate && <span>Issued: {format(new Date(doc.issuedDate), "d MMM yyyy")}</span>}
                          {doc.expiryDate && <span>Expires: {format(new Date(doc.expiryDate), "d MMM yyyy")}</span>}
                        </div>
                        {doc.notes && <div className="text-xs text-muted-foreground mt-1 italic">{doc.notes}</div>}
                      </div>
                      <Badge variant={statusInfo.variant} className="shrink-0 flex items-center gap-1">
                        {statusInfo.icon}
                        {statusInfo.label}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
