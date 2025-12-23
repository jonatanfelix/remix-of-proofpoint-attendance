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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users, Search, MapPin, MapPinOff, Edit, UserPlus, Shield, ShieldCheck, Code, Briefcase, HardHat } from 'lucide-react';
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
  employee_type: 'office' | 'field';
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
  const [editEmployeeType, setEditEmployeeType] = useState<'office' | 'field'>('office');
  
  // Add employee form state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'employee' | 'admin'>('employee');
  const [isCreating, setIsCreating] = useState(false);

  // Check user role
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
      return data?.role as string;
    },
    enabled: !!user?.id,
  });

  const isDeveloper = userRole === 'developer';
  const isAdminOrDeveloper = userRole === 'admin' || userRole === 'developer';

  // Fetch all employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['admin-employees', searchTerm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Update employee mutation
  const updateMutation = useMutation({
    mutationFn: async ({ userId, requiresGeofence, employeeType }: { userId: string; requiresGeofence: boolean; employeeType: 'office' | 'field' }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          requires_geofence: requiresGeofence,
          employee_type: employeeType
        })
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
    setEditEmployeeType(employee.employee_type || 'office');
  };

  const handleSaveEdit = () => {
    if (!editingEmployee) return;
    updateMutation.mutate({
      userId: editingEmployee.user_id,
      requiresGeofence: editRequiresGeofence,
      employeeType: editEmployeeType,
    });
  };

  // Create user handler
  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newFullName) {
      toast.error('Semua field harus diisi');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: newEmail,
          password: newPassword,
          fullName: newFullName,
          role: newRole,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(`${newRole === 'admin' ? 'Admin' : 'Karyawan'} berhasil ditambahkan!`);
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      setShowAddDialog(false);
      resetAddForm();
    } catch (error: any) {
      console.error('Create user error:', error);
      toast.error(error.message || 'Gagal menambahkan user');
    } finally {
      setIsCreating(false);
    }
  };

  const resetAddForm = () => {
    setNewEmail('');
    setNewPassword('');
    setNewFullName('');
    setNewRole('employee');
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

  // Get role badge
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'developer':
        return (
          <Badge variant="default" className="bg-primary">
            <Code className="h-3 w-3 mr-1" />
            Developer
          </Badge>
        );
      case 'admin':
        return (
          <Badge variant="default">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Shield className="h-3 w-3 mr-1" />
            Karyawan
          </Badge>
        );
    }
  };

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

  // Not admin or developer - redirect
  if (!isAdminOrDeveloper) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manajemen Karyawan</h1>
            <p className="text-muted-foreground">Kelola daftar karyawan dan pengaturan absensi</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="border-2 border-foreground">
            <UserPlus className="h-4 w-4 mr-2" />
            Tambah {isDeveloper ? 'User' : 'Karyawan'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total User</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => e.role === 'admin' || e.role === 'developer').length || 0}
                </span>
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
            <CardTitle>Daftar User</CardTitle>
            <CardDescription>Klik Edit untuk mengubah pengaturan geofence</CardDescription>
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
                    <TableHead>Tipe</TableHead>
                    <TableHead>Geofence</TableHead>
                    <TableHead>Terdaftar</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Tidak ada user ditemukan
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees?.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                        <TableCell>{getRoleBadge(employee.role)}</TableCell>
                        <TableCell>
                          {employee.employee_type === 'field' ? (
                            <Badge variant="outline" className="border-orange-500 text-orange-600">
                              <HardHat className="h-3 w-3 mr-1" />
                              Lapangan
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-500 text-blue-600">
                              <Briefcase className="h-3 w-3 mr-1" />
                              Kantoran
                            </Badge>
                          )}
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

            <div className="space-y-2">
              <Label>Tipe Karyawan</Label>
              <Select value={editEmployeeType} onValueChange={(v) => setEditEmployeeType(v as 'office' | 'field')}>
                <SelectTrigger className="border-2 border-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Kantoran - Tampilkan jam masuk & pulang
                    </div>
                  </SelectItem>
                  <SelectItem value="field">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4" />
                      Lapangan - Hitung total jam kerja
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {editEmployeeType === 'field' 
                  ? 'Karyawan lapangan: Total jam kerja dihitung dari clock-in sampai clock-out'
                  : 'Karyawan kantoran: Hanya tampilkan jam masuk dan jam pulang'}
              </p>
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

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="border-2 border-foreground">
          <DialogHeader>
            <DialogTitle>Tambah User Baru</DialogTitle>
            <DialogDescription>
              {isDeveloper 
                ? 'Sebagai Developer, Anda bisa menambahkan Admin atau Karyawan'
                : 'Sebagai Admin, Anda hanya bisa menambahkan Karyawan'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nama Lengkap</Label>
              <Input
                id="new-name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="John Doe"
                className="border-2 border-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="john@company.com"
                className="border-2 border-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="border-2 border-foreground"
              />
            </div>

            {isDeveloper && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as 'employee' | 'admin')}>
                  <SelectTrigger className="border-2 border-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Karyawan
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Admin
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Admin dapat mengelola karyawan dan pengaturan. Karyawan hanya dapat mengakses dashboard absensi.
                </p>
              </div>
            )}

            {!isDeveloper && (
              <div className="p-3 rounded-lg bg-muted border-2 border-foreground">
                <p className="text-sm text-muted-foreground">
                  User baru akan dibuat sebagai <strong>Karyawan</strong>
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetAddForm(); }}>
              Batal
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreating}>
              {isCreating ? 'Membuat...' : 'Tambah User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployees;
