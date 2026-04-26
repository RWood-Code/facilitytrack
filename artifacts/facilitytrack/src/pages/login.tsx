import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, usePinLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Waves, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default function LoginPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const login = useLogin();
  const pinLogin = usePinLogin();
  const [pin, setPin] = useState("");

  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSuccess = (user: import("@workspace/api-client-react").AppUser) => {
    queryClient.setQueryData(getGetMeQueryKey(), user);
    window.location.href = "/";
  };

  const onSubmit = form.handleSubmit((data) => {
    login.mutate({ data }, {
      onSuccess,
      onError: () => {
        toast({ title: "Login failed", description: "Invalid email or password", variant: "destructive" });
      },
    });
  });

  const onPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    pinLogin.mutate({ data: { pin } }, {
      onSuccess,
      onError: () => {
        toast({ title: "PIN login failed", description: "Invalid PIN", variant: "destructive" });
        setPin("");
      },
    });
  };

  const handlePinKey = (digit: string) => {
    if (pin.length < 4) setPin(p => p + digit);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Waves className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">FacilityTrack</h1>
          <p className="text-blue-200 mt-1 text-sm">NZS 5826:2010 Compliance Management</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Access your facility management system</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="email">
              <TabsList className="w-full mb-4" data-testid="tabs-login">
                <TabsTrigger value="email" className="flex-1" data-testid="tab-email-login">Email</TabsTrigger>
                <TabsTrigger value="pin" className="flex-1" data-testid="tab-pin-login">PIN Login</TabsTrigger>
              </TabsList>
              <TabsContent value="email">
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="email" type="email" placeholder="you@facility.co.nz" className="pl-10" data-testid="input-email" {...form.register("email")} />
                    </div>
                    {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="password" type="password" placeholder="••••••••" className="pl-10" data-testid="input-password" {...form.register("password")} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={login.isPending} data-testid="button-login-submit">
                    {login.isPending ? "Signing in..." : "Sign in"}
                  </Button>
                  {import.meta.env.DEV && <p className="text-xs text-muted-foreground text-center">Dev: admin@facilitytrack.co.nz / admin123</p>}
                </form>
              </TabsContent>
              <TabsContent value="pin">
                <form onSubmit={onPinSubmit} className="space-y-4">
                  <div className="flex justify-center gap-3 my-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-colors ${i < pin.length ? "border-primary bg-primary/10 text-primary" : "border-border"}`} data-testid={`pin-digit-${i}`}>
                        {i < pin.length ? "•" : ""}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                      <Button key={i} type="button" variant={d === "" ? "ghost" : "outline"} className="h-12 text-lg font-semibold" disabled={d === ""} data-testid={d === "⌫" ? "button-pin-backspace" : d !== "" ? `button-pin-${d}` : undefined}
                        onClick={() => { if (d === "⌫") setPin(p => p.slice(0, -1)); else if (d) handlePinKey(d); }}>
                        {d}
                      </Button>
                    ))}
                  </div>
                  <Button type="submit" className="w-full" disabled={pin.length !== 4 || pinLogin.isPending} data-testid="button-pin-submit">
                    {pinLogin.isPending ? "Signing in..." : "Sign in with PIN"}
                  </Button>
                  {import.meta.env.DEV && <p className="text-xs text-muted-foreground text-center">Dev PINs: 1234 (admin), 5678 (mgr)</p>}
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
