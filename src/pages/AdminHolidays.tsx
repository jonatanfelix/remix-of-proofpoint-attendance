import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays, Plus, Trash2, Edit, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isSameDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Holiday {
  id: string;
  date: string;
  end_date: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
}

const AdminHolidays = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Check if user is admin
  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data?.role;
    },
    enabled: !!user?.id,
  });

  const isAdminOrDeveloper = userRole === 'admin' || userRole === 'developer';

  // Fetch holidays
  const { data: holidays, isLoading } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      return data as Holiday[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Add holiday mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newStartDate || !newName.trim()) throw new Error('Tanggal mulai dan nama harus diisi');

      const effectiveEndDate = newEndDate || newStartDate;
      
      if (effectiveEndDate < newStartDate) {
        throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai');
      }

      const { error } = await supabase.from('holidays').insert({
        date: newStartDate,
        end_date: effectiveEndDate,
        name: newName.trim(),
        description: newDescription.trim() || null,
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Tanggal ini sudah terdaftar sebagai hari libur');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Hari libur berhasil ditambahkan!');
      setNewStartDate('');
      setNewEndDate('');
      setNewName('');
      setNewDescription('');
    },
    onError: (error) => {
      toast.error(error.message || 'Gagal menambahkan hari libur');
    },
  });

  // Update holiday mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingHoliday) return;

      const effectiveEndDate = editEndDate || editStartDate;
      
      if (effectiveEndDate < editStartDate) {
        throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai');
      }

      const { error } = await supabase
        .from('holidays')
        .update({
          date: editStartDate,
          end_date: effectiveEndDate,
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', editingHoliday.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Hari libur berhasil diperbarui!');
      setEditingHoliday(null);
    },
    onError: (error: Error) => {
      toast.error('Gagal memperbarui: ' + error.message);
    },
  });

  // Delete holiday mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Hari libur berhasil dihapus!');
    },
    onError: (error) => {
      toast.error('Gagal menghapus: ' + error.message);
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate();
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setEditStartDate(holiday.date);
    setEditEndDate(holiday.end_date || holiday.date);
    setEditName(holiday.name);
    setEditDescription(holiday.description || '');
  };

  const handleCancelEdit = () => {
    setEditingHoliday(null);
    setEditStartDate('');
    setEditEndDate('');
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = () => {
    updateMutation.mutate();
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
              <Button onClick={() => navigate('/')}>Kembali ke Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Separate upcoming and past holidays (consider end_date for upcoming check)
  const today = new Date().toISOString().split('T')[0];
  const upcomingHolidays = holidays?.filter((h) => (h.end_date || h.date) >= today) || [];
  const pastHolidays = holidays?.filter((h) => (h.end_date || h.date) < today) || [];

  // Helper to format date range
  const formatDateRange = (startDate: string, endDate: string | null) => {
    const start = parseISO(startDate);
    const end = endDate ? parseISO(endDate) : start;
    
    if (isSameDay(start, end)) {
      return format(start, 'EEEE, dd MMM yyyy', { locale: idLocale });
    }
    return `${format(start, 'dd MMM yyyy', { locale: idLocale })} - ${format(end, 'dd MMM yyyy', { locale: idLocale })}`;
  };

  return (
    <AppLayout>
      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Kelola Hari Libur</h1>
          <p className="text-muted-foreground">Tambah dan kelola hari libur perusahaan</p>
        </div>

        {/* Add Form */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Tambah Hari Libur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newStartDate">Tanggal Mulai</Label>
                  <Input
                    id="newStartDate"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="border-2 border-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newEndDate">Tanggal Selesai</Label>
                  <Input
                    id="newEndDate"
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    min={newStartDate}
                    placeholder="Sama dengan tanggal mulai"
                    className="border-2 border-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Kosongkan jika hanya 1 hari</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newName">Nama Hari Libur</Label>
                  <Input
                    id="newName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Hari Raya Idul Fitri"
                    className="border-2 border-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newDescription">Deskripsi (opsional)</Label>
                  <Input
                    id="newDescription"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Catatan tambahan..."
                    className="border-2 border-foreground"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={addMutation.isPending || !newStartDate || !newName.trim()}
                className="border-2 border-foreground"
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Tambah Hari Libur
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Hari Libur Mendatang
              {upcomingHolidays.length > 0 && (
                <Badge variant="secondary">{upcomingHolidays.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !upcomingHolidays.length ? (
              <p className="text-center py-8 text-muted-foreground">
                Tidak ada hari libur mendatang
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingHolidays.map((holiday) => (
                      <TableRow key={holiday.id}>
                        {editingHoliday?.id === holiday.id ? (
                          <>
                            <TableCell className="space-y-2">
                              <Input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="w-36"
                              />
                              <Input
                                type="date"
                                value={editEndDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                min={editStartDate}
                                className="w-36"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={handleSaveEdit}
                                  disabled={updateMutation.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">
                              {formatDateRange(holiday.date, holiday.end_date)}
                            </TableCell>
                            <TableCell>{holiday.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {holiday.description || '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(holiday)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteMutation.mutate(holiday.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Holidays */}
        {pastHolidays.length > 0 && (
          <Card className="border-2 border-muted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-5 w-5" />
                Hari Libur Lalu
                <Badge variant="outline">{pastHolidays.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastHolidays.map((holiday) => (
                      <TableRow key={holiday.id} className="opacity-60">
                        <TableCell className="font-medium">
                          {formatDateRange(holiday.date, holiday.end_date)}
                        </TableCell>
                        <TableCell>{holiday.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {holiday.description || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(holiday.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminHolidays;
