import { useListAppUsers, useCreateAppUser, useDeleteAppUser } from "@workspace/api-client-react";
import { getListAppUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { BackupCard } from "@/components/BackupCard";

export default function SettingsPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useListAppUsers();
  const create = useCreateAppUser();
  const deleteUser = useDeleteAppUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: { email: "", firstName: "", lastName: "", role: "user", password: "", pin: "" },
  });

  const onSubmit = handleSubmit((data) => {
    create.mutate({ data: { email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role as "superuser" | "admin" | "user", password: data.password, pin: data.pin || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAppUsersQueryKey() });
        toast({ title: "User created" });
        setOpen(false); reset();
      },
      onError: () => toast({ title: "Failed to create user", variant: "destructive" }),
    });
  });

  const handleDelete = (id: number) => {
    if (id === currentUser?.id) return;
    deleteUser.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAppUsersQueryKey() }); toast({ title: "User deleted" }); },
    });
  };

  const ROLE_COLORS: Record<string, string> = { superuser: "bg-purple-100 text-purple-800", admin: "bg-blue-100 text-blue-800", user: "bg-gray-100 text-gray-800" };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-settings">Settings</h1>
        <p className="text-sm text-muted-foreground">User and system configuration</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" />App Users</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-new-user"><Plus className="w-4 h-4 mr-1" />Add User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>First Name <span className="text-destructive">*</span></Label><Input data-testid="input-user-first-name" {...register("firstName", { required: true })} /></div>
                  <div className="space-y-1"><Label>Last Name <span className="text-destructive">*</span></Label><Input data-testid="input-user-last-name" {...register("lastName", { required: true })} /></div>
                </div>
                <div className="space-y-1"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" data-testid="input-user-email" {...register("email", { required: true })} /></div>
                <div className="space-y-1"><Label>Password <span className="text-destructive">*</span></Label><Input type="password" data-testid="input-user-password" {...register("password", { required: true })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Select defaultValue="user" onValueChange={v => setValue("role", v)}>
                      <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="superuser">Superuser</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>PIN (4 digits)</Label><Input maxLength={4} data-testid="input-user-pin" placeholder="e.g. 1234" {...register("pin")} /></div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending} data-testid="button-create-user-submit">Create User</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)
            ) : (
              (users ?? []).map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`user-row-${u.id}`}>
                  <div>
                    <p className="font-medium text-sm" data-testid={`user-name-${u.id}`}>{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>{u.role}</span>
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(u.id)} data-testid={`button-delete-user-${u.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <BackupCard />
    </div>
  );
}
