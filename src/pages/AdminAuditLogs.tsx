import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import EmptyState from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { FileText, Search, Filter, RefreshCw, User, Clock, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  user_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  clock_in: { label: 'Clock In', variant: 'default' },
  clock_out: { label: 'Clock Out', variant: 'secondary' },
  approve_leave: { label: 'Approve Cuti', variant: 'default' },
  reject_leave: { label: 'Reject Cuti', variant: 'destructive' },
  create_employee: { label: 'Tambah Karyawan', variant: 'default' },
  update_employee: { label: 'Edit Karyawan', variant: 'secondary' },
  update_location: { label: 'Edit Lokasi', variant: 'secondary' },
  update_shift: { label: 'Edit Shift', variant: 'secondary' },
  export_data: { label: 'Export Data', variant: 'outline' },
};

const AdminAuditLogs = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['audit-logs', actionFilter],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  const filteredLogs = logs?.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.user_email?.toLowerCase().includes(query) ||
      log.action.toLowerCase().includes(query) ||
      log.resource_type.toLowerCase().includes(query)
    );
  });

  const getActionBadge = (action: string) => {
    const config = ACTION_LABELS[action] || { label: action, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDetails = (details: Record<string, unknown> | null) => {
    if (!details) return '-';
    const entries = Object.entries(details).slice(0, 3);
    return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ');
  };

  return (
    <AppLayout>
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Audit Logs</h1>
              <p className="text-sm text-muted-foreground">
                Jejak aktivitas sistem yang tidak dapat diubah
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari email, action..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Action</SelectItem>
                    <SelectItem value="clock_in">Clock In</SelectItem>
                    <SelectItem value="clock_out">Clock Out</SelectItem>
                    <SelectItem value="approve_leave">Approve Cuti</SelectItem>
                    <SelectItem value="reject_leave">Reject Cuti</SelectItem>
                    <SelectItem value="create_employee">Tambah Karyawan</SelectItem>
                    <SelectItem value="update_employee">Edit Karyawan</SelectItem>
                    <SelectItem value="export_data">Export Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{logs?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Total Logs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {logs?.filter((l) => l.action === 'clock_in' || l.action === 'clock_out').length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Absensi</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {new Set(logs?.map((l) => l.user_id)).size || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Unique Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {logs?.filter((l) => l.details && (l.details as Record<string, unknown>).suspected_mock).length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Suspicious</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Log Aktivitas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredLogs || filteredLogs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Belum Ada Log"
                  description="Aktivitas sistem akan tercatat di sini"
                />
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead className="hidden md:table-cell">Details</TableHead>
                        <TableHead className="hidden lg:table-cell">IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm">
                              {format(new Date(log.created_at), 'dd MMM yyyy', { locale: localeId })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), 'HH:mm:ss')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium truncate max-w-[150px]">
                              {log.user_email || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {log.user_role}
                            </div>
                          </TableCell>
                          <TableCell>{getActionBadge(log.action)}</TableCell>
                          <TableCell>
                            <div className="text-sm">{log.resource_type}</div>
                            {log.resource_id && (
                              <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                                {log.resource_id.slice(0, 8)}...
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {formatDetails(log.details)}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="text-xs text-muted-foreground">
                              {log.ip_address || '-'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminAuditLogs;
