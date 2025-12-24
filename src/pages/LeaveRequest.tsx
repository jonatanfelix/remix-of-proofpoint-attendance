import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays, Plus, Clock, CheckCircle, XCircle, Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  review_notes: string | null;
  proof_url: string | null;
  created_at: string;
}

const LeaveRequest = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leaveType, setLeaveType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch user's leave requests
  const { data: leaveRequests, isLoading } = useQuery({
    queryKey: ['leave-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: !!user?.id,
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Format file tidak didukung. Gunakan JPG atau PNG.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const clearProofFile = () => {
    setProofFile(null);
    setProofPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload file to storage
  const uploadProofFile = async (file: File, userId: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('leave-proofs')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('leave-proofs')
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  // Submit leave request
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not found');
      if (!leaveType) throw new Error('Pilih jenis izin');
      if (!startDate || !endDate) throw new Error('Tanggal harus diisi');
      
      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (start > end) {
        throw new Error('Tanggal mulai tidak boleh lebih besar dari tanggal selesai');
      }
      
      if (start < today) {
        throw new Error('Tidak dapat mengajukan izin untuk tanggal yang sudah lewat');
      }

      setIsUploading(true);

      // Upload proof file if exists
      let proofUrl: string | null = null;
      if (proofFile) {
        try {
          proofUrl = await uploadProofFile(proofFile, user.id);
        } catch (uploadErr) {
          throw new Error('Gagal mengupload bukti. Coba lagi.');
        }
      }

      const { error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        proof_url: proofUrl,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Pengajuan berhasil dikirim!');
      setLeaveType('');
      setStartDate('');
      setEndDate('');
      setReason('');
      clearProofFile();
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Gagal mengirim pengajuan');
      setIsUploading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pengajuan Izin / Cuti</h1>
          <p className="text-muted-foreground">Ajukan permohonan izin atau cuti Anda</p>
        </div>

        {/* Form */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Ajukan Izin Baru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="leaveType">Jenis Izin</Label>
                  <Select value={leaveType} onValueChange={setLeaveType}>
                    <SelectTrigger className="border-2 border-foreground">
                      <SelectValue placeholder="Pilih jenis izin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cuti">Cuti</SelectItem>
                      <SelectItem value="izin">Izin</SelectItem>
                      <SelectItem value="sakit">Sakit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Tanggal Mulai</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-2 border-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Tanggal Selesai</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="border-2 border-foreground"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="reason">Alasan (opsional)</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Jelaskan alasan pengajuan..."
                    className="border-2 border-foreground"
                    rows={3}
                  />
                </div>
                
                {/* Photo Upload */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Bukti Pendukung (opsional)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Format: JPG, PNG. Maks: 5MB
                  </p>
                  
                  {proofPreview ? (
                    <div className="relative inline-block">
                      <img 
                        src={proofPreview} 
                        alt="Preview" 
                        className="w-32 h-32 object-cover rounded-lg border-2 border-foreground"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={clearProofFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-6 text-center cursor-pointer hover:border-foreground transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Klik untuk upload bukti
                      </p>
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={submitMutation.isPending || isUploading || !leaveType || !startDate || !endDate}
                className="border-2 border-foreground w-full md:w-auto"
              >
                {submitMutation.isPending || isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isUploading ? 'Mengupload...' : 'Mengirim...'}
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Ajukan Izin
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Riwayat Pengajuan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !leaveRequests?.length ? (
              <p className="text-center py-8 text-muted-foreground">
                Belum ada riwayat pengajuan
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Ajuan</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Bukti</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan Admin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {format(new Date(req.created_at), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell>{getLeaveTypeLabel(req.leave_type)}</TableCell>
                        <TableCell>
                          {format(new Date(req.start_date), 'dd MMM', { locale: idLocale })} -{' '}
                          {format(new Date(req.end_date), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
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
                        <TableCell className="max-w-[200px] truncate">
                          {req.review_notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default LeaveRequest;
