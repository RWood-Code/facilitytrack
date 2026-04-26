import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, AlertTriangle, Wrench, Award, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const TYPE_ICON: Record<string, React.ReactNode> = {
  compliance_alert: <AlertTriangle className="w-4 h-4 text-red-500" />,
  work_order: <Wrench className="w-4 h-4 text-blue-500" />,
  qualification_expiry: <Award className="w-4 h-4 text-orange-500" />,
  info: <Info className="w-4 h-4 text-gray-500" />,
};

export default function NotificationsPage() {
  const { data: notifications } = useListNotifications({ limit: 100 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const unread = (notifications ?? []).filter(n => !n.isRead).length;

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
  };

  const handleMarkAll = () => {
    markAll.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-notifications">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll} data-testid="button-mark-all-read">
            <CheckCheck className="w-4 h-4 mr-1" />Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {(notifications ?? []).map(n => (
              <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.isRead ? "bg-primary/5" : ""}`} data-testid={`notification-${n.id}`}>
                <div className="flex-shrink-0 mt-0.5">{TYPE_ICON[n.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm" data-testid={`notification-title-${n.id}`}>{n.title}</p>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.createdAt), "d MMM yyyy HH:mm")}</p>
                </div>
                {!n.isRead && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleMarkRead(n.id)} data-testid={`button-mark-read-${n.id}`}>Read</Button>
                )}
              </div>
            ))}
            {!(notifications ?? []).length && (
              <div className="p-12 text-center">
                <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No notifications</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
