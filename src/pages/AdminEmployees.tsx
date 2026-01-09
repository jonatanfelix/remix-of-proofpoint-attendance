import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, Search, MapPin, MapPinOff, Edit, UserPlus, Shield, ShieldCheck, 
  Code, Briefcase, HardHat, Clock, Filter, CheckCircle2, XCircle, Building2,
  Download, Upload, AlertTriangle
} from 'lucide-react';
import { ImportEmployees } from '@/components/employees/ImportEmployees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

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
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  shift_id: string | null;
  shift?: Shift | null;
}

const AdminEmployees = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);
  const [editRequiresGeofence, setEditRequiresGeofence] = useState(true);
  const [editEmployeeType, setEditEmployeeType] = useState<'office' | 'field'>('office');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editShiftId, setEditShiftId] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState(true);
  
  // Add employee form state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'employee' | 'admin'>('employee');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newShiftId, setNewShiftId] = useState<string>('');
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

  // Fetch shifts
  const { data: shifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as Shift[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch all employees with shift info
  const { data: employees, isLoading: employeesLoading, isError: employeesError, refetch: refetchEmployees } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          shift:shifts(id, name, start_time, end_time)
        `)
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Get unique departments for filter
  const departments = [...new Set(employees?.map(e => e.department).filter(Boolean) || [])];

  // Update employee mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: {
      userId: string;
      requiresGeofence: boolean;
      employeeType: 'office' | 'field';
      jobTitle: string;
      department: string;
      shiftId: string | null;
      isActive: boolean;
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          requires_geofence: updates.requiresGeofence,
          employee_type: updates.employeeType,
          job_title: updates.jobTitle || null,
          department: updates.department || null,
          shift_id: updates.shiftId || null,
          is_active: updates.isActive,
        })
        .eq('user_id', updates.userId);
      
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
    setEditJobTitle(employee.job_title || '');
    setEditDepartment(employee.department || '');
    setEditShiftId(employee.shift_id || '');
    setEditIsActive(employee.is_active);
  };

  const handleSaveEdit = () => {
    if (!editingEmployee) return;
    updateMutation.mutate({
      userId: editingEmployee.user_id,
      requiresGeofence: editRequiresGeofence,
      employeeType: editEmployeeType,
      jobTitle: editJobTitle,
      department: editDepartment,
      shiftId: editShiftId === 'none' ? null : editShiftId || null,
      isActive: editIsActive,
    });
  };

  // Helper function to wait and retry profile update
  const updateProfileWithRetry = async (
    userId: string, 
    updates: { job_title?: string | null; department?: string | null; shift_id?: string | null },
    maxRetries = 3,
    delayMs = 500
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Wait before attempting (give trigger time to create profile)
      await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', userId);
      
      if (!error) return true;
      
      console.log(`Profile update attempt ${attempt + 1} failed, retrying...`);
    }
    return false;
  };

  // Create user handler
  const handleCreateUser = async () => {
    if (!newPassword || !newFullName) {
      toast.error('Nama dan Password harus diisi');
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
          password: newPassword,
          fullName: newFullName,
          role: newRole,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Update additional fields if provided (with retry to handle race condition)
      const shiftIdToSave = newShiftId === 'none' ? null : newShiftId || null;
      if (newJobTitle || newDepartment || shiftIdToSave) {
        const updateSuccess = await updateProfileWithRetry(data.user.id, {
          job_title: newJobTitle || null,
          department: newDepartment || null,
          shift_id: shiftIdToSave,
        });

        if (!updateSuccess) {
          console.error('Failed to update additional fields after retries');
          toast.warning('User dibuat, tapi data tambahan gagal disimpan. Silakan edit manual.');
        }
      }

      toast.success(`${newRole === 'admin' ? 'Admin' : 'Karyawan'} berhasil ditambahkan! Username: ${data.user.username}`);
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
    setNewPassword('');
    setNewFullName('');
    setNewRole('employee');
    setNewJobTitle('');
    setNewDepartment('');
    setNewShiftId('');
  };

  // Filter employees
  const filteredEmployees = employees?.filter((emp) => {
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        emp.full_name.toLowerCase().includes(term) ||
        emp.email.toLowerCase().includes(term) ||
        (emp.job_title?.toLowerCase().includes(term) ?? false) ||
        (emp.department?.toLowerCase().includes(term) ?? false);
      if (!matchesSearch) return false;
    }
    
    // Department filter
    if (filterDepartment !== 'all' && emp.department !== filterDepartment) return false;
    
    // Shift filter
    if (filterShift !== 'all' && emp.shift_id !== filterShift) return false;
    
    // Status filter
    if (filterStatus === 'active' && !emp.is_active) return false;
    if (filterStatus === 'inactive' && emp.is_active) return false;
    
    return true;
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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Check if employee has inconsistent configuration
  const hasInconsistentConfig = (employee: Profile) => {
    // office employee should have geofence, field employee should not
    if (employee.employee_type === 'office' && !employee.requires_geofence) return true;
    if (employee.employee_type === 'field' && employee.requires_geofence) return true;
    return false;
  };

  const getInconsistentMessage = (employee: Profile) => {
    if (employee.employee_type === 'office' && !employee.requires_geofence) {
      return 'Karyawan Kantoran tidak wajib geofence';
    }
    if (employee.employee_type === 'field' && employee.requires_geofence) {
      return 'Karyawan Lapangan wajib geofence';
    }
    return '';
  };

  // Count employees with inconsistent config
  const inconsistentCount = employees?.filter(hasInconsistentConfig).length || 0;

  // Loading state
  if (roleLoading || employeesLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Memuat...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Error state
  if (employeesError) {
    return (
      <AppLayout>
        <div className="container mx-auto p-4">
          <Card className="border-2 border-destructive/50 bg-destructive/5">
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center gap-4">
                <Users className="h-12 w-12 text-destructive" />
                <div>
                  <h3 className="font-semibold mb-1">Gagal Memuat Data Karyawan</h3>
                  <p className="text-sm text-muted-foreground">Terjadi kesalahan saat mengambil data. Periksa koneksi internet Anda.</p>
                </div>
                <Button onClick={() => refetchEmployees()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Not admin or developer - redirect
  if (!isAdminOrDeveloper) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Manajemen Karyawan</h1>
            <p className="text-muted-foreground">Kelola daftar karyawan, shift, dan pengaturan absensi</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ImportEmployees 
              shifts={shifts || []} 
              isDeveloper={isDeveloper}
              onSuccess={() => refetchEmployees()}
            />
            <Button onClick={() => setShowAddDialog(true)} className="border-2 border-foreground">
              <UserPlus className="h-4 w-4 mr-2" />
              Tambah {isDeveloper ? 'User' : 'Karyawan'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Aktif</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => e.is_active).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Non-Aktif</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => !e.is_active).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Kantoran</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => e.employee_type === 'office').length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lapangan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <HardHat className="h-5 w-5 text-orange-600" />
                <span className="text-2xl font-bold">
                  {employees?.filter((e) => e.employee_type === 'field').length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          {inconsistentCount > 0 && (
            <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-600">Perlu Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-2xl font-bold text-amber-600">
                    {inconsistentCount}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Search & Filters */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter & Pencarian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              {/* Search */}
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, jabatan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-2 border-foreground"
                />
              </div>

              {/* Department Filter */}
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="border-2 border-foreground">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Departemen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Departemen</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept!}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Shift Filter */}
              <Select value={filterShift} onValueChange={setFilterShift}>
                <SelectTrigger className="border-2 border-foreground">
                  <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Shift</SelectItem>
                  {shifts?.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>{shift.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="border-2 border-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Non-Aktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle>Daftar Karyawan</CardTitle>
            <CardDescription>
              Menampilkan {filteredEmployees?.length || 0} dari {employees?.length || 0} karyawan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border-2 border-foreground overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Departemen</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Tidak ada karyawan ditemukan
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees?.map((employee) => (
                      <TableRow key={employee.id} className={!employee.is_active ? 'opacity-60' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border-2 border-foreground">
                              <AvatarImage src={employee.avatar_url || undefined} />
                              <AvatarFallback>{getInitials(employee.full_name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {employee.full_name}
                                {getRoleBadge(employee.role)}
                              </div>
                              <div className="text-sm text-muted-foreground">{employee.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee.job_title || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {employee.department || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {employee.shift ? (
                            <Badge variant="outline" className="font-normal">
                              <Clock className="h-3 w-3 mr-1" />
                              {employee.shift.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
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
                            {hasInconsistentConfig(employee) && (
                              <span title={getInconsistentMessage(employee)}>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee.is_active ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Aktif
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Non-Aktif
                            </Badge>
                          )}
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
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
        <DialogContent className="border-2 border-foreground max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Karyawan</DialogTitle>
            <DialogDescription>
              Ubah data untuk {editingEmployee?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input value={editingEmployee?.full_name || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingEmployee?.email || ''} disabled className="bg-muted" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-job-title">Jabatan</Label>
                <Input
                  id="edit-job-title"
                  value={editJobTitle}
                  onChange={(e) => setEditJobTitle(e.target.value)}
                  placeholder="Contoh: Software Engineer"
                  className="border-2 border-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-department">Departemen</Label>
                <Input
                  id="edit-department"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  placeholder="Contoh: IT, HR, Finance"
                  className="border-2 border-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Shift Kerja</Label>
              <Select value={editShiftId} onValueChange={setEditShiftId}>
                <SelectTrigger className="border-2 border-foreground">
                  <SelectValue placeholder="Pilih shift..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak ada shift</SelectItem>
                  {shifts?.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.name} ({shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      Kantoran
                    </div>
                  </SelectItem>
                  <SelectItem value="field">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4" />
                      Lapangan
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border-2 border-foreground p-4">
              <div className="space-y-1">
                <Label className="text-base">Wajib Absen di Kantor</Label>
                <p className="text-sm text-muted-foreground">
                  {editRequiresGeofence 
                    ? 'Harus dalam radius kantor untuk absen'
                    : 'Bisa absen dari mana saja'}
                </p>
              </div>
              <Switch
                checked={editRequiresGeofence}
                onCheckedChange={setEditRequiresGeofence}
              />
            </div>

            {/* Warning for inconsistent configuration */}
            {((editEmployeeType === 'office' && !editRequiresGeofence) || 
              (editEmployeeType === 'field' && editRequiresGeofence)) && (
              <div className="flex items-start gap-3 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Konfigurasi Tidak Konsisten
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    {editEmployeeType === 'office' && !editRequiresGeofence 
                      ? 'Karyawan Kantoran biasanya wajib absen di kantor (geofence aktif).'
                      : 'Karyawan Lapangan biasanya tidak wajib absen di kantor (geofence non-aktif).'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border-2 border-foreground p-4">
              <div className="space-y-1">
                <Label className="text-base">Status Aktif</Label>
                <p className="text-sm text-muted-foreground">
                  {editIsActive 
                    ? 'Karyawan aktif dan bisa melakukan absensi'
                    : 'Karyawan non-aktif, tidak bisa absen'}
                </p>
              </div>
              <Switch
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
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
        <DialogContent className="border-2 border-foreground max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="new-name">Nama Lengkap *</Label>
              <Input
                id="new-name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="John Doe"
                className="border-2 border-foreground"
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="new-password">Password *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="border-2 border-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-job-title">Jabatan</Label>
                <Input
                  id="new-job-title"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  placeholder="Software Engineer"
                  className="border-2 border-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-department">Departemen</Label>
                <Input
                  id="new-department"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  placeholder="IT"
                  className="border-2 border-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Shift Kerja</Label>
              <Select value={newShiftId} onValueChange={setNewShiftId}>
                <SelectTrigger className="border-2 border-foreground">
                  <SelectValue placeholder="Pilih shift..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak ada shift</SelectItem>
                  {shifts?.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.name} ({shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </AppLayout>
  );
};

export default AdminEmployees;
