import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import type { AuditLog } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  poolType: "Pool/Room Type",
  isActive: "Active",
  volumeLitres: "Volume",
  customPhMin: "pH min",
  customPhMax: "pH max",
  customFreeChlorineMin: "Free Cl₂ min",
  customFreeChlorineMax: "Free Cl₂ max",
  customTempMin: "Temp min",
  customTempMax: "Temp max",
  customTurbidityMax: "Turbidity max",
  customCombinedChlorineMax: "CAC max",
  notes: "Notes",
  title: "Title",
  description: "Description",
  priority: "Priority",
  status: "Status",
  assignedTo: "Assignee",
  assetId: "Asset",
  dueDate: "Due date",
  completedAt: "Completed at",
};

function fieldLabel(f: string): string {
  return FIELD_LABELS[f] ?? f;
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      return format(d, "d MMM yyyy");
    }
    return v;
  }
  return String(v);
}

function entrySentence(entry: AuditLog): string[] {
  const who = entry.userName ?? "Someone";
  const when = format(new Date(entry.createdAt), "d MMM yyyy HH:mm");
  const changes = entry.changes ?? {};
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    return [`${who} edited this on ${when}`];
  }
  return keys.map((k) => {
    const c = changes[k] as { from: unknown; to: unknown };
    return `${who} changed ${fieldLabel(k)} from ${formatValue(c.from)} to ${formatValue(c.to)} on ${when}`;
  });
}

interface Props {
  recordType: string;
  recordId: number;
  previewLimit?: number;
}

export function AuditHistory({ recordType, recordId, previewLimit = 5 }: Props) {
  const [fullOpen, setFullOpen] = useState(false);
  const previewParams = { recordType, recordId, limit: previewLimit + 1 };
  const { data: preview, isLoading } = useListAuditLogs(
    previewParams,
    {
      query: {
        enabled: !!recordId,
        queryKey: getListAuditLogsQueryKey(previewParams),
        staleTime: 0,
        refetchOnMount: "always",
      },
    },
  );

  const previewEntries = (preview ?? []).slice(0, previewLimit);
  const hasMore = (preview ?? []).length > previewLimit;

  return (
    <div data-testid={`audit-history-${recordType}-${recordId}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <History className="w-4 h-4" /> History
        </h3>
        {(hasMore || previewEntries.length >= previewLimit) && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setFullOpen(true)}
            data-testid={`button-view-full-history-${recordType}-${recordId}`}
          >
            View full history
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading history…</p>
      ) : previewEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No edits recorded yet.</p>
      ) : (
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {previewEntries.flatMap((e) =>
            entrySentence(e).map((s, i) => (
              <li key={`${e.id}-${i}`} className="leading-snug" data-testid={`audit-entry-${e.id}-${i}`}>
                {s}
              </li>
            )),
          )}
        </ul>
      )}
      <FullHistoryDialog open={fullOpen} onOpenChange={setFullOpen} recordType={recordType} recordId={recordId} />
    </div>
  );
}

function FullHistoryDialog({
  open,
  onOpenChange,
  recordType,
  recordId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recordType: string;
  recordId: number;
}) {
  const PAGE = 50;
  const [offset, setOffset] = useState(0);
  const fullParams = { recordType, recordId, limit: PAGE, offset };
  const { data, isLoading } = useListAuditLogs(
    fullParams,
    {
      query: {
        enabled: open,
        queryKey: getListAuditLogsQueryKey(fullParams),
        staleTime: 0,
        refetchOnMount: "always",
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOffset(0); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Full change history</DialogTitle></DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !(data ?? []).length && offset === 0 ? (
          <p className="text-sm text-muted-foreground">No edits recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(data ?? []).flatMap((e) =>
              entrySentence(e).map((s, i) => (
                <li key={`${e.id}-${i}`} className="border-b pb-2 last:border-0" data-testid={`full-history-entry-${e.id}-${i}`}>
                  {s}
                </li>
              )),
            )}
          </ul>
        )}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            data-testid="button-history-prev"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Showing {offset + 1}–{offset + (data?.length ?? 0)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(data?.length ?? 0) < PAGE}
            onClick={() => setOffset(offset + PAGE)}
            data-testid="button-history-next"
          >
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
