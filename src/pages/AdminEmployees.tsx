import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, Search, MapPin, MapPinOff, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  requires_geofence: boolean;
  company_id: string | null;
  created_at: string;
}

const AdminEmployees = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);
  const [editRequiresGeofence, setEditRequiresGeofence] = useState(true);

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

  // Fetch all employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['admin-employees', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      return data as Profile[];
    },
    enabled: userRole === 'admin',
  });

  // Update employee mutation
  const updateMutation = useMutation({
    mutationFn: async ({ userId, requiresGeofence }: { userId: string; requiresGeofence: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ requires_geofence: requiresGeofence })
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      toast.success('Data karyawan berhasil diperbarui!');
      setEditingEmployee(null);
    },
    onError: (error) => {
      toast.error('Gagal memperbarui: ' + error.message);
    },
  });

  const handleEditClick = (employee: Profile) => {
    setEditingEmployee(employee);
    setEditRequiresGeofence(employee.requires_geofence);
  };

  const handleSaveEdit = () => {
    if (!editingEmployee) return;
    updateMutation.mutate({
      userId: editingEmployee.user_id,
      requiresGeofence: editRequiresGeofence,
    });
  };

  // Filter employees
  const filteredEmployees = employees?.filter((emp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      emp.full_name.toLowerCase().includes(term) ||
      emp.email.toLowerCase().includes(term)
    );
  });

  // Loading state
  if (roleLoading || employeesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto p-4">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Memuat...</div>
          </div>
        </main>
      </div>
    );
  }

  // Not admin - redirect
  if (userRole !== 'admin') {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Karyawan</h1>
          <p className="text-muted-foreground">Kelola daftar karyawan dan pengaturan absensi</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Karyawan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{employees?.length || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Wajib Geofence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => e.requires_geofence).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bebas Lokasi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPinOff className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => !e.requires_geofence).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Table */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle>Daftar Karyawan</CardTitle>
            <CardDescription>Klik Edit untuk mengubah pengaturan geofence karyawan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-2 border-foreground"
              />
            </div>

            {/* Table */}
            <div className="rounded-lg border-2 border-foreground overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Geofence</TableHead>
                    <TableHead>Terdaftar</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Tidak ada karyawan ditemukan
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees?.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                        <TableCell>
                          <Badge variant={employee.role === 'admin' ? 'default' : 'secondary'}>
                            {employee.role === 'admin' ? 'Admin' : 'Karyawan'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {employee.requires_geofence ? (
                            <Badge variant="outline" className="border-primary text-primary">
                              <MapPin className="h-3 w-3 mr-1" />
                              Wajib Kantor
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                              <MapPinOff className="h-3 w-3 mr-1" />
                              Bebas Lokasi
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(employee.created_at), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(employee)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
        <DialogContent className="border-2 border-foreground">
          <DialogHeader>
            <DialogTitle>Edit Karyawan</DialogTitle>
            <DialogDescription>
              Ubah pengaturan absensi untuk {editingEmployee?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Nama</Label>
              <Input value={editingEmployee?.full_name || ''} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editingEmployee?.email || ''} disabled className="bg-muted" />
            </div>

            <div className="flex items-center justify-between rounded-lg border-2 border-foreground p-4">
              <div className="space-y-1">
                <Label className="text-base">Wajib Absen di Kantor</Label>
                <p className="text-sm text-muted-foreground">
                  {editRequiresGeofence 
                    ? 'Karyawan harus berada dalam radius kantor untuk absen'
                    : 'Karyawan bisa absen dari mana saja (untuk pekerja lapangan)'}
                </p>
              </div>
              <Switch
                checked={editRequiresGeofence}
                onCheckedChange={setEditRequiresGeofence}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingEmployee(null)}>
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployees;
