import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CalendarCheck, Clock, CheckCircle, XCircle, Search, Filter, Loader2, Image as ImageIcon, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface LeaveRequestWithProfile {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  review_notes: string | null;
  proof_url: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
    department: string | null;
  } | null;
}

const AdminLeaves = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestWithProfile | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');

  // Check if user is admin
  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.role;
    },
    enabled: !!user?.id,
  });

  const isAdminOrDeveloper = userRole === 'admin' || userRole === 'developer';

  // Fetch leave requests
  const { data: leaveRequests, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-leave-requests', searchTerm, statusFilter],
    queryFn: async () => {
      // First get leave requests
      let query = supabase
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: requestsData, error: requestsError } = await query;
      if (requestsError) throw requestsError;

      // Get unique user_ids
      const userIds = [...new Set(requestsData.map((r) => r.user_id))];
      
      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, department')
        .in('user_id', userIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p])
      );

      // Combine and filter
      let combined: LeaveRequestWithProfile[] = requestsData.map((r) => ({
        ...r,
        profiles: profilesMap.get(r.user_id) || null,
      }));

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        combined = combined.filter(
          (r) =>
            r.profiles?.full_name?.toLowerCase().includes(term) ||
            r.profiles?.email?.toLowerCase().includes(term)
        );
      }

      return combined;
    },
    enabled: isAdminOrDeveloper,
  });

  // Get user profile for audit logging
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('email, company_id')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Review mutation with audit logging
  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes, requestData }: { id: string; status: string; notes: string; requestData: LeaveRequestWithProfile }) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq('id', id);

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_audit_event', {
        p_user_id: user?.id,
        p_user_email: userProfile?.email || user?.email,
        p_user_role: userRole,
        p_company_id: userProfile?.company_id,
        p_action: status === 'approved' ? 'approve_leave' : 'reject_leave',
        p_resource_type: 'leave_request',
        p_resource_id: id,
        p_details: {
          employee_name: requestData.profiles?.full_name,
          leave_type: requestData.leave_type,
          start_date: requestData.start_date,
          end_date: requestData.end_date,
          review_notes: notes,
        },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-leave-requests'] });
      toast.success(status === 'approved' ? 'Pengajuan disetujui!' : 'Pengajuan ditolak!');
      setShowDialog(false);
      setSelectedRequest(null);
      setReviewNotes('');
    },
    onError: (error) => {
      toast.error('Gagal memproses: ' + error.message);
    },
  });

  const handleAction = (request: LeaveRequestWithProfile, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(action);
    setReviewNotes('');
    setShowDialog(true);
  };

  const confirmAction = () => {
    if (!selectedRequest) return;
    reviewMutation.mutate({
      id: selectedRequest.id,
      status: actionType === 'approve' ? 'approved' : 'rejected',
      notes: reviewNotes,
      requestData: selectedRequest,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Menunggu</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Disetujui</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ditolak</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLeaveTypeLabel = (type: string) => {
    switch (type) {
      case 'cuti':
        return 'Cuti';
      case 'izin':
        return 'Izin';
      case 'sakit':
        return 'Sakit';
      default:
        return type;
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdminOrDeveloper) {
    return (
      <AppLayout>
        <div className="container mx-auto max-w-2xl px-4 py-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive mb-4">Akses Ditolak</p>
              <p className="text-muted-foreground mb-4">
                Anda tidak memiliki izin untuk melihat halaman ini.
              </p>
              <Button onClick={() => navigate('/')}>Kembali ke Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const pendingCount = leaveRequests?.filter((r) => r.status === 'pending').length || 0;

  return (
    <AppLayout>
      <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Kelola Pengajuan Izin</h1>
            <p className="text-muted-foreground">Setujui atau tolak pengajuan izin karyawan</p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {pendingCount} Menunggu
            </Badge>
          )}
        </div>

        {/* Filters */}
        <Card className="border-2 border-foreground">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-2 border-foreground"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="border-2 border-foreground">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="approved">Disetujui</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Daftar Pengajuan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <p className="text-destructive">Gagal memuat data pengajuan</p>
                <Button variant="outline" onClick={() => refetch()}>Coba Lagi</Button>
              </div>
            ) : !leaveRequests?.length ? (
              <div className="flex flex-col items-center py-16 text-center">
                <PartyPopper className="h-16 w-16 text-primary mb-4" />
                <h3 className="font-bold text-xl mb-2">All caught up! 🎉</h3>
                <p className="text-muted-foreground max-w-md">
                  {statusFilter === 'pending' 
                    ? 'Tidak ada pengajuan yang menunggu persetujuan. Semua sudah diproses!' 
                    : 'Belum ada pengajuan izin dari karyawan.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Ajuan</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Bukti</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {format(new Date(req.created_at), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell>{req.profiles?.full_name || 'Unknown'}</TableCell>
                        <TableCell>{getLeaveTypeLabel(req.leave_type)}</TableCell>
                        <TableCell>
                          {format(new Date(req.start_date), 'dd MMM', { locale: idLocale })} -{' '}
                          {format(new Date(req.end_date), 'dd MMM', { locale: idLocale })}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {req.reason || '-'}
                        </TableCell>
                        <TableCell>
                          {req.proof_url ? (
                            <a 
                              href={req.proof_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <ImageIcon className="h-4 w-4" />
                              Lihat
                            </a>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                        <TableCell>
                          {req.status === 'pending' ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleAction(req, 'approve')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleAction(req, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sudah diproses</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === 'approve' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest && (
                  <>
                    <strong>{selectedRequest.profiles?.full_name}</strong> mengajukan{' '}
                    <strong>{getLeaveTypeLabel(selectedRequest.leave_type)}</strong> dari{' '}
                    {format(new Date(selectedRequest.start_date), 'dd MMM yyyy', { locale: idLocale })} s/d{' '}
                    {format(new Date(selectedRequest.end_date), 'dd MMM yyyy', { locale: idLocale })}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reviewNotes">Catatan (opsional)</Label>
                <Textarea
                  id="reviewNotes"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Tambahkan catatan untuk karyawan..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Batal
              </Button>
              <Button
                variant={actionType === 'approve' ? 'default' : 'destructive'}
                onClick={confirmAction}
                disabled={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : actionType === 'approve' ? (
                  'Setujui'
                ) : (
                  'Tolak'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AdminLeaves;
