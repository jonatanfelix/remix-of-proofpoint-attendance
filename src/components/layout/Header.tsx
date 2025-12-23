import { MapPin, LogOut, User, Shield, Home, Settings, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const Header = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  // Check if user is admin
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
      return data?.role;
    },
    enabled: !!user?.id,
  });

  const isAdmin = userRole === 'admin';

  return (
    <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background px-4 py-3">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <MapPin className="h-7 w-7" />
            <h1 className="text-xl font-bold tracking-tight">GeoAttend</h1>
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center gap-1 ml-4">
            <Link
              to="/"
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                location.pathname === '/'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Link>
            {isAdmin && (
              <>
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === '/admin'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Shield className="h-4 w-4" />
                  Rekap
                </Link>
                <Link
                  to="/admin/employees"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === '/admin/employees'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Users className="h-4 w-4" />
                  Karyawan
                </Link>
                <Link
                  to="/admin/settings"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === '/admin/settings'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </>
            )}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="border-2 border-foreground">
              <User className="mr-2 h-4 w-4" />
              <span className="max-w-[120px] truncate">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-2 border-foreground">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              {user?.email}
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild className="cursor-pointer sm:hidden">
                <Link to="/admin">
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Dashboard
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
