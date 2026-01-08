import { Clock, LayoutDashboard, History, CalendarDays, Users, Settings, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const userMenuItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Clock In/Out', url: '/clock', icon: Clock },
  { title: 'History', url: '/history', icon: History },
  { title: 'Leave Requests', url: '/leave-request', icon: CalendarDays },
];

const adminMenuItems = [
  { title: 'Manage Users', url: '/admin/employees', icon: Users },
  { title: 'Settings', url: '/admin/settings', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  // Check user role
  const { data: userRole } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) return null;
      return data?.role as string;
    },
    enabled: !!user?.id,
  });

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const isAdminOrDeveloper = userRole === 'admin' || userRole === 'developer';
  const isActive = (path: string) => location.pathname === path;

  const userInitials = profile?.full_name 
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <Sidebar className="border-r border-sidebar-border">
      {/* Header - Logo */}
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-sidebar-foreground">
            <Clock className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-foreground">GeoAttend</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {/* User Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {userMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className={cn(
                      'w-full justify-start gap-3 px-3 py-2.5 rounded-md transition-colors',
                      isActive(item.url)
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Menu */}
        {isAdminOrDeveloper && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={cn(
                        'w-full justify-start gap-3 px-3 py-2.5 rounded-md transition-colors',
                        isActive(item.url)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer - User Profile */}
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-sidebar-border">
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm font-medium">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">
                {profile?.full_name || 'User'}
              </span>
              <span className="text-xs text-sidebar-foreground/50 truncate max-w-[120px]">
                {user?.email}
              </span>
            </div>
          </div>
          <button
            onClick={signOut}
            className="p-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-md transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
