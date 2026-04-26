import { useListTestResults, useListPoolClosures, useListPools } from "@workspace/api-client-react";
import { FileText, CheckCircle, XCircle, Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadCsv(rows: object[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(h => {
        const val = (row as Record<string, unknown>)[h];
        if (val == null) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(opts: {
  facilityLabel: string;
  poolLabel: string;
  dateFrom: string;
  dateTo: string;
  total: number;
  compliant: number;
  nonCompliant: number;
  tests: Array<{
    id: number;
    testedAt: string;
    poolName?: string | null;
    testedBy?: string | null;
    freeChlorine?: number | null;
    ph?: number | null;
    temperature?: number | null;
    combinedChlorine?: number | null;
    totalAvailableChlorine?: number | null;
    turbidity?: number | null;
    totalAlkalinity?: number | null;
    isCompliant?: boolean | null;
    notes?: string | null;
  }>;
  closures: Array<{
    id: number;
    closedAt: string;
    poolName?: string | null;
    reason?: string | null;
    closureCode?: string | null;
    closedBy?: string | null;
    reopenedAt?: string | null;
  }>;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const BRAND_BLUE = [30, 64, 175] as [number, number, number];
  const BRAND_DARK = [17, 24, 39] as [number, number, number];
  const GREY = [107, 114, 128] as [number, number, number];
  const PASS_GREEN = [21, 128, 61] as [number, number, number];
  const FAIL_RED = [185, 28, 28] as [number, number, number];

  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pageW, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("FacilityTrack", margin, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Water Quality Compliance Report", pageW - margin, 13, { align: "right" });

  y = 28;

  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("Compliance Report", margin, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  doc.text(`Facility: ${opts.facilityLabel}`, margin, y);
  doc.text(`Period: ${format(new Date(opts.dateFrom), "d MMM yyyy")} – ${format(new Date(opts.dateTo), "d MMM yyyy")}`, pageW - margin, y, { align: "right" });
  y += 4;
  doc.text(`Pool: ${opts.poolLabel}`, margin, y);
  doc.text("NZS 5826:2010 Compliance Record", pageW - margin, y, { align: "right" });
  y += 4;
  doc.text(`Generated: ${format(new Date(), "d MMM yyyy HH:mm")}`, margin, y);
  y += 8;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  const summaryColW = (pageW - margin * 2) / 3;
  const summaryBoxes = [
    { label: "Total Tests", value: String(opts.total), color: BRAND_BLUE },
    { label: "Compliant", value: `${opts.compliant} (${opts.total > 0 ? Math.round((opts.compliant / opts.total) * 100) : 0}%)`, color: PASS_GREEN },
    { label: "Non-Compliant", value: `${opts.nonCompliant} (${opts.total > 0 ? Math.round((opts.nonCompliant / opts.total) * 100) : 0}%)`, color: FAIL_RED },
  ];

  summaryBoxes.forEach((box, i) => {
    const x = margin + i * summaryColW;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, y, summaryColW - 3, 18, 2, 2, "F");
    doc.setTextColor(...box.color);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(box.value, x + (summaryColW - 3) / 2, y + 10, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY);
    doc.text(box.label, x + (summaryColW - 3) / 2, y + 16, { align: "center" });
  });
  y += 24;

  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Water Quality Test Results", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Date", "Pool", "Cl₂ (mg/L)", "pH", "Temp (°C)", "CAC (mg/L)", "Status"]],
    body: opts.tests.map(t => [
      t.testedAt ? format(new Date(t.testedAt), "d MMM yyyy HH:mm") : "—",
      t.poolName ?? "—",
      t.freeChlorine != null ? String(t.freeChlorine) : "—",
      t.ph != null ? String(t.ph) : "—",
      t.temperature != null ? String(t.temperature) : "—",
      t.combinedChlorine != null ? String(t.combinedChlorine) : "—",
      t.isCompliant ? "Pass" : "Fail",
    ]),
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: BRAND_DARK },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const val = data.cell.raw as string;
        doc.setTextColor(...(val === "Pass" ? PASS_GREEN : FAIL_RED));
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2 + 1.5;
        doc.text(val, cx, cy, { align: "center" });
        doc.setTextColor(...BRAND_DARK);
        doc.setFont("helvetica", "normal");
      }
    },
    columnStyles: {
      0: { cellWidth: 32 },
      6: { halign: "center", fontStyle: "bold" },
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (opts.closures.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Pool Closures", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Closed", "Pool", "Reason", "NZS Code", "Closed By", "Reopened"]],
      body: opts.closures.map(c => [
        c.closedAt ? format(new Date(c.closedAt), "d MMM yyyy") : "—",
        c.poolName ?? "—",
        c.reason ?? "—",
        c.closureCode ?? "—",
        c.closedBy ?? "—",
        c.reopenedAt ? format(new Date(c.reopenedAt), "d MMM yyyy") : "Still closed",
      ]),
      headStyles: {
        fillColor: BRAND_BLUE,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: BRAND_DARK },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 8;
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(0, footerY - 4, pageW, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("FacilityTrack — Confidential Compliance Record", margin, footerY + 1);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, footerY + 1, { align: "right" });
  }

  const filename = `facilitytrack-compliance-report-${opts.dateFrom}-to-${opts.dateTo}.pdf`;
  doc.save(filename);
}

export default function ReportsPage() {
  const [selectedPool, setSelectedPool] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: pools } = useListPools();
  const { data: tests } = useListTestResults({ poolId: selectedPool ?? undefined, dateFrom, dateTo, limit: 500 });
  const { data: closures } = useListPoolClosures({ poolId: selectedPool ?? undefined, dateFrom, dateTo, limit: 100 });

  const compliant = (tests ?? []).filter(t => t.isCompliant).length;
  const nonCompliant = (tests ?? []).filter(t => !t.isCompliant).length;
  const total = (tests ?? []).length;

  const selectedPoolData = selectedPool ? (pools ?? []).find(p => p.id === selectedPool) : null;
  const poolLabel = selectedPoolData?.name ?? "All Pools";

  const facilityLabel = selectedPoolData?.facilityName
    ?? (() => {
        const names = [...new Set((pools ?? []).map(p => p.facilityName).filter((n): n is string => Boolean(n)))];
        return names.length === 1 ? names[0] : "All Facilities";
      })();

  const handleExportTests = () => {
    const rows = (tests ?? []).map(t => ({
      Date: t.testedAt ? format(new Date(t.testedAt), "yyyy-MM-dd HH:mm") : "",
      Pool: t.poolName ?? "",
      "Tested By": t.testedBy ?? "",
      "Free Cl2 (mg/L)": t.freeChlorine ?? "",
      "Total Cl2 (mg/L)": t.totalAvailableChlorine ?? "",
      "CAC (mg/L)": t.combinedChlorine ?? "",
      "pH": t.ph ?? "",
      "Temperature (°C)": t.temperature ?? "",
      "Turbidity (NTU)": t.turbidity ?? "",
      "Alkalinity (mg/L)": t.totalAlkalinity ?? "",
      "Compliant": t.isCompliant ? "Yes" : "No",
      "Notes": t.notes ?? "",
    }));
    downloadCsv(rows, `facilitytrack-water-tests-${dateFrom}-to-${dateTo}.csv`);
  };

  const handleExportClosures = () => {
    const rows = (closures ?? []).map(c => ({
      "Closed At": c.closedAt ? format(new Date(c.closedAt), "yyyy-MM-dd HH:mm") : "",
      Pool: c.poolName ?? "",
      Reason: c.reason ?? "",
      "NZS Code": c.closureCode ?? "",
      "Closed By": c.closedBy ?? "",
      "Reopened At": c.reopenedAt ? format(new Date(c.reopenedAt), "yyyy-MM-dd HH:mm") : "",
    }));
    downloadCsv(rows, `facilitytrack-closures-${dateFrom}-to-${dateTo}.csv`);
  };

  const handleExportPdf = () => {
    exportPdf({
      facilityLabel,
      poolLabel,
      dateFrom,
      dateTo,
      total,
      compliant,
      nonCompliant,
      tests: tests ?? [],
      closures: closures ?? [],
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-reports">Reports</h1>
        <p className="text-sm text-muted-foreground">Compliance summaries, CSV and PDF export</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>Pool</Label>
              <Select value={selectedPool ? String(selectedPool) : "all-pools"} onValueChange={v => setSelectedPool(v === "all-pools" ? null : Number(v))}>
                <SelectTrigger className="w-44" data-testid="select-report-pool"><SelectValue placeholder="All pools" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-pools">All pools</SelectItem>
                  {(pools ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-md px-3 h-9 text-sm" data-testid="input-date-from" />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-md px-3 h-9 text-sm" data-testid="input-date-to" />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleExportPdf}
              data-testid="button-export-pdf"
              className="bg-blue-700 hover:bg-blue-800 text-white"
            >
              <FileDown className="w-4 h-4 mr-1" />Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportTests} disabled={!total} data-testid="button-export-tests-csv">
              <Download className="w-4 h-4 mr-1" />Export Tests CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportClosures} disabled={!(closures ?? []).length} data-testid="button-export-closures-csv">
              <Download className="w-4 h-4 mr-1" />Export Closures CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-total-tests">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold" data-testid="value-total-tests">{total}</p>
            <p className="text-sm text-muted-foreground">Total Tests</p>
          </CardContent>
        </Card>
        <Card className="border-green-200" data-testid="card-compliant-tests">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-green-700" data-testid="value-compliant-tests">{compliant}</p>
            <p className="text-sm text-muted-foreground">Compliant ({total > 0 ? Math.round((compliant / total) * 100) : 0}%)</p>
          </CardContent>
        </Card>
        <Card className="border-red-200" data-testid="card-noncompliant-tests">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-red-700" data-testid="value-noncompliant-tests">{nonCompliant}</p>
            <p className="text-sm text-muted-foreground">Non-compliant ({total > 0 ? Math.round((nonCompliant / total) * 100) : 0}%)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />Water Quality Test Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-test-results">
              <thead className="border-b">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left pb-2 pr-4">Date</th>
                  <th className="text-left pb-2 pr-4">Pool</th>
                  <th className="text-right pb-2 pr-4">Cl₂</th>
                  <th className="text-right pb-2 pr-4">pH</th>
                  <th className="text-right pb-2 pr-4">Temp</th>
                  <th className="text-right pb-2 pr-4">CAC</th>
                  <th className="text-right pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(tests ?? []).map(t => (
                  <tr key={t.id} className="border-b last:border-0" data-testid={`report-row-${t.id}`}>
                    <td className="py-2 pr-4 text-xs">{format(new Date(t.testedAt), "d MMM yyyy HH:mm")}</td>
                    <td className="py-2 pr-4">{t.poolName ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{t.freeChlorine ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{t.ph ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{t.temperature != null ? `${t.temperature}°` : "—"}</td>
                    <td className="py-2 pr-4 text-right">{t.combinedChlorine ?? "—"}</td>
                    <td className="py-2 text-right">{t.isCompliant ? <Badge className="bg-green-100 text-green-800 text-xs">Pass</Badge> : <Badge variant="destructive" className="text-xs">Fail</Badge>}</td>
                  </tr>
                ))}
                {!(tests ?? []).length && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No data for selected period</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(closures ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pool Closures</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="table-closures">
              <thead className="border-b">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left pb-2 pr-4">Closed</th>
                  <th className="text-left pb-2 pr-4">Pool</th>
                  <th className="text-left pb-2 pr-4">Reason</th>
                  <th className="text-left pb-2">Reopened</th>
                </tr>
              </thead>
              <tbody>
                {(closures ?? []).map(c => (
                  <tr key={c.id} className="border-b last:border-0" data-testid={`closure-report-row-${c.id}`}>
                    <td className="py-2 pr-4 text-xs">{format(new Date(c.closedAt), "d MMM yyyy")}</td>
                    <td className="py-2 pr-4">{c.poolName ?? "—"}</td>
                    <td className="py-2 pr-4">{c.reason}</td>
                    <td className="py-2">{c.reopenedAt ? format(new Date(c.reopenedAt), "d MMM yyyy") : <Badge variant="destructive" className="text-xs">Still closed</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
