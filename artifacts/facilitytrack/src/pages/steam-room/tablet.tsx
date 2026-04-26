import { useCreateSteamRoomCheck, useListPools } from "@workspace/api-client-react";
import { getListSteamRoomChecksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function SteamRoomTabletPage() {
  const { data: pools } = useListPools();
  const create = useCreateSteamRoomCheck();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [poolId, setPoolId] = useState<number | null>(null);
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [isClean, setIsClean] = useState<boolean | null>(null);
  const [isOperational, setIsOperational] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!poolId || isClean === null || isOperational === null) return;
    create.mutate({
      data: { poolId, temperature: temperature ? Number(temperature) : undefined, humidity: humidity ? Number(humidity) : undefined, isClean, isOperational, entryType: "tablet_entry" },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSteamRoomChecksQueryKey() });
        setSubmitted(true);
        setTimeout(() => { setSubmitted(false); setPoolId(null); setTemperature(""); setHumidity(""); setIsClean(null); setIsOperational(null); }, 3000);
      },
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-green-800">Check Recorded</h2>
          <p className="text-green-600 mt-2">Returning to form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/steam-room"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <h1 className="text-2xl font-bold" data-testid="heading-tablet">Steam Room — Quick Entry</h1>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Select Steam Room</label>
          <div className="grid grid-cols-2 gap-3">
            {(pools ?? []).filter(p => p.poolType === "spa" || p.name.toLowerCase().includes("steam")).map(p => (
              <button key={p.id} onClick={() => setPoolId(p.id)} className={`p-5 rounded-xl border-2 text-left transition-all text-sm font-medium ${poolId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} data-testid={`tablet-pool-${p.id}`}>
                {p.name}
              </button>
            ))}
            {(pools ?? []).filter(p => p.poolType !== "spa" && !p.name.toLowerCase().includes("steam")).map(p => (
              <button key={p.id} onClick={() => setPoolId(p.id)} className={`p-5 rounded-xl border-2 text-left transition-all text-sm font-medium ${poolId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} data-testid={`tablet-pool-${p.id}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Temperature (°C)</label>
            <input type="number" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} className="w-full h-14 text-2xl font-bold text-center border-2 rounded-xl focus:outline-none focus:border-primary" placeholder="42" data-testid="tablet-input-temp" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Humidity (%)</label>
            <input type="number" value={humidity} onChange={e => setHumidity(e.target.value)} className="w-full h-14 text-2xl font-bold text-center border-2 rounded-xl focus:outline-none focus:border-primary" placeholder="88" data-testid="tablet-input-humidity" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Condition</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setIsClean(true)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${isClean === true ? "border-green-500 bg-green-50" : "border-border"}`} data-testid="tablet-clean-yes">
                <CheckCircle className={`w-7 h-7 ${isClean === true ? "text-green-500" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Clean</span>
              </button>
              <button onClick={() => setIsClean(false)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${isClean === false ? "border-red-500 bg-red-50" : "border-border"}`} data-testid="tablet-clean-no">
                <XCircle className={`w-7 h-7 ${isClean === false ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Unclean</span>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Operational?</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setIsOperational(true)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${isOperational === true ? "border-green-500 bg-green-50" : "border-border"}`} data-testid="tablet-operational-yes">
                <CheckCircle className={`w-7 h-7 ${isOperational === true ? "text-green-500" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Yes</span>
              </button>
              <button onClick={() => setIsOperational(false)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${isOperational === false ? "border-red-500 bg-red-50" : "border-border"}`} data-testid="tablet-operational-no">
                <XCircle className={`w-7 h-7 ${isOperational === false ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">No</span>
              </button>
            </div>
          </div>
        </div>

        <Button className="w-full h-16 text-lg" onClick={handleSubmit} disabled={!poolId || isClean === null || isOperational === null || create.isPending} data-testid="tablet-submit">
          {create.isPending ? "Recording..." : "Submit Check"}
        </Button>
      </div>
    </div>
  );
}
