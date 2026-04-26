import { Link, useLocation } from "wouter";
import { useLogout, useListNotifications } from "@workspace/api-client-react";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard, Waves, Thermometer, Wrench, Package, Calendar,
  Users, FileText, Settings, Building2, Bell, LogOut, Menu, X, Wind, ShieldCheck
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ALL_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", adminOnly: false },
  { label: "Pools", icon: Waves, href: "/pools", adminOnly: false },
  { label: "Steam Room", icon: Wind, href: "/steam-room", adminOnly: false },
  { label: "Work Orders", icon: Wrench, href: "/work-orders", adminOnly: true },
  { label: "Assets", icon: Package, href: "/assets", adminOnly: true },
  { label: "Maintenance", icon: Calendar, href: "/maintenance", adminOnly: true },
  { label: "Staff", icon: Users, href: "/staff", adminOnly: true },
  { label: "Compliance Docs", icon: ShieldCheck, href: "/compliance-documents", adminOnly: true },
  { label: "Reports", icon: FileText, href: "/reports", adminOnly: true },
  { label: "Facilities", icon: Building2, href: "/facilities", adminOnly: true },
  { label: "Settings", icon: Settings, href: "/settings", adminOnly: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = isAdminOrHigher(user?.role);
  const nav = ALL_NAV.filter(item => !item.adminOnly || isAdmin);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { data: notifications } = useListNotifications({ isRead: false, limit: 50 });
  const unreadCount = notifications?.length ?? 0;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/login";
      },
    });
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-sidebar text-sidebar-foreground w-64 min-w-[16rem]">
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">FacilityTrack</span>
        </div>
        <p className="text-xs text-sidebar-foreground/50 mt-1 ml-10">NZS 5826:2010</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {nav.map(({ label, icon: Icon, href }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative flex-shrink-0 z-10">
            <Sidebar />
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-card flex-shrink-0">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} data-testid="button-menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 px-1 min-w-[1.1rem] h-[1.1rem] text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground" data-testid="badge-unread-count">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
