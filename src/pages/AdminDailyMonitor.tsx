import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Users, Calendar, Clock, CheckCircle, XCircle, AlertTriangle, 
  Palmtree, Coffee, Loader2, RefreshCw, Search, Filter, Radio, Download
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  job_title: string | null;
  shift_id: string | null;
  employee_type: 'office' | 'field';
  shifts: {
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface AttendanceRecord {
  id: string;
  user_id: string;
  record_type: string;
  recorded_at: string;
}

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

type EmployeeStatus = 'on_time' | 'late' | 'on_leave' | 'holiday' | 'absent' | 'not_yet';

interface EmployeeWithStatus extends Employee {
  status: EmployeeStatus;
  clockInTime: string | null;
  clockOutTime: string | null;
  lateMinutes: number;
  leaveType: string | null;
  holidayName: string | null;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

const AdminDailyMonitor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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

  // Get user profile for audit logging
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, company_id')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch company settings for work start time
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('work_start_time')
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return data;
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch all active employees with their shifts
  const { data: employees, isLoading: employeesLoading, refetch: refetchEmployees } = useQuery({
    queryKey: ['active-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          user_id,
          full_name,
          email,
          department,
          job_title,
          shift_id,
          employee_type,
          shifts (
            name,
            start_time,
            end_time
          )
        `)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data as Employee[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Fetch attendance for selected date with proper timezone handling
  const { data: attendance, isLoading: attendanceLoading, refetch: refetchAttendance, dataUpdatedAt } = useQuery({
    queryKey: ['daily-attendance', selectedDate],
    queryFn: async () => {
      // Create proper date boundaries with timezone
      const dateObj = parseISO(selectedDate);
      const dayStart = startOfDay(dateObj).toISOString();
      const dayEnd = endOfDay(dateObj).toISOString();

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, record_type, recorded_at')
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at', { ascending: true }); // Order for consistent first clock_in

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Track last refresh time from query's dataUpdatedAt (fixes memory leak)
  const lastRefreshTime = useMemo(() => {
    return dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();
  }, [dataUpdatedAt]);

  // Fetch approved leaves that overlap with selected date (with auto-refresh)
  const { data: leaves, refetch: refetchLeaves } = useQuery({
    queryKey: ['daily-leaves', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate);

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Fetch holiday for selected date
  const { data: holiday } = useQuery({
    queryKey: ['daily-holiday', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, date, name')
        .eq('date', selectedDate)
        .eq('is_active', true)
        .maybeSingle();

      if (error) return null;
      return data as Holiday | null;
    },
    enabled: isAdminOrDeveloper,
  });

  // Process employees with their status (memoized for performance)
  const processedEmployees = useMemo<EmployeeWithStatus[]>(() => {
    if (!employees) return [];
    
    return employees.map((emp) => {
      // Check if it's a holiday
      if (holiday) {
        return {
          ...emp,
          status: 'holiday' as EmployeeStatus,
          clockInTime: null,
          clockOutTime: null,
          lateMinutes: 0,
          leaveType: null,
          holidayName: holiday.name,
        };
      }

      // Check if employee is on leave
      const employeeLeave = leaves?.find((l) => l.user_id === emp.user_id);
      if (employeeLeave) {
        return {
          ...emp,
          status: 'on_leave' as EmployeeStatus,
          clockInTime: null,
          clockOutTime: null,
          lateMinutes: 0,
          leaveType: employeeLeave.leave_type,
          holidayName: null,
        };
      }

      // Get attendance records for this employee (sorted by recorded_at from query)
      const empAttendance = attendance?.filter((a) => a.user_id === emp.user_id) || [];
      // Get first clock_in and last clock_out to handle multiple records
      const clockIns = empAttendance.filter((a) => a.record_type === 'clock_in');
      const clockOuts = empAttendance.filter((a) => a.record_type === 'clock_out');
      const firstClockIn = clockIns.length > 0 ? clockIns[0] : null;
      const lastClockOut = clockOuts.length > 0 ? clockOuts[clockOuts.length - 1] : null;

      if (!firstClockIn) {
        // Check if it's still before work start time (for today only)
        const isToday = selectedDate === today;
        const now = new Date();
        const workStartTime = emp.shifts?.start_time || company?.work_start_time || '08:00:00';
        const [hours, minutes] = workStartTime.split(':').map(Number);
        const workStart = new Date();
        workStart.setHours(hours, minutes, 0, 0);

        if (isToday && now < workStart) {
          return {
            ...emp,
            status: 'not_yet' as EmployeeStatus,
            clockInTime: null,
            clockOutTime: null,
            lateMinutes: 0,
            leaveType: null,
            holidayName: null,
          };
        }

        return {
          ...emp,
          status: 'absent' as EmployeeStatus,
          clockInTime: null,
          clockOutTime: null,
          lateMinutes: 0,
          leaveType: null,
          holidayName: null,
        };
      }

      // Calculate lateness using first clock_in
      const clockInTime = new Date(firstClockIn.recorded_at);
      const workStartTime = emp.shifts?.start_time || company?.work_start_time || '08:00:00';
      const [hours, minutes] = workStartTime.split(':').map(Number);
      const workStart = new Date(clockInTime);
      workStart.setHours(hours, minutes, 0, 0);

      const lateMs = clockInTime.getTime() - workStart.getTime();
      const lateMinutes = Math.max(0, Math.floor(lateMs / 60000));

      return {
        ...emp,
        status: lateMinutes > 0 ? 'late' as EmployeeStatus : 'on_time' as EmployeeStatus,
        clockInTime: format(clockInTime, 'HH:mm'),
        clockOutTime: lastClockOut ? format(new Date(lastClockOut.recorded_at), 'HH:mm') : null,
        lateMinutes,
        leaveType: null,
        holidayName: null,
      };
    });
  }, [employees, holiday, leaves, attendance, selectedDate, today, company?.work_start_time]);

  // Get unique departments for filter
  const departments = [...new Set(employees?.map((e) => e.department).filter(Boolean) || [])];

  // Filter employees
  let filteredEmployees = processedEmployees;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredEmployees = filteredEmployees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(term) ||
        e.email.toLowerCase().includes(term)
    );
  }

  if (statusFilter !== 'all') {
    filteredEmployees = filteredEmployees.filter((e) => e.status === statusFilter);
  }

  if (departmentFilter !== 'all') {
    filteredEmployees = filteredEmployees.filter((e) => e.department === departmentFilter);
  }

  // Calculate stats
  const stats = {
    total: processedEmployees.length,
    onTime: processedEmployees.filter((e) => e.status === 'on_time').length,
    late: processedEmployees.filter((e) => e.status === 'late').length,
    onLeave: processedEmployees.filter((e) => e.status === 'on_leave').length,
    absent: processedEmployees.filter((e) => e.status === 'absent').length,
    notYet: processedEmployees.filter((e) => e.status === 'not_yet').length,
    holiday: processedEmployees.filter((e) => e.status === 'holiday').length,
  };

  const getStatusBadge = (emp: EmployeeWithStatus) => {
    switch (emp.status) {
      case 'on_time':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Tepat Waktu
          </Badge>
        );
      case 'late':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Terlambat {emp.lateMinutes} menit
          </Badge>
        );
      case 'on_leave':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Coffee className="h-3 w-3 mr-1" />
            {emp.leaveType === 'cuti' ? 'CUTI' : emp.leaveType === 'sakit' ? 'SAKIT' : 'IZIN'}
          </Badge>
        );
      case 'holiday':
        return (
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            <Palmtree className="h-3 w-3 mr-1" />
            LIBUR
          </Badge>
        );
      case 'absent':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            TIDAK HADIR
          </Badge>
        );
      case 'not_yet':
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Belum Absen
          </Badge>
        );
      default:
        return null;
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

  const getStatusLabel = (status: EmployeeStatus) => {
    switch (status) {
      case 'on_time': return 'Tepat Waktu';
      case 'late': return 'Terlambat';
      case 'on_leave': return 'Cuti/Izin';
      case 'holiday': return 'Libur';
      case 'absent': return 'Tidak Hadir';
      case 'not_yet': return 'Belum Absen';
      default: return status;
    }
  };

  const exportDailyToXLSX = async () => {
    if (!filteredEmployees || filteredEmployees.length === 0) return;

    setIsExporting(true);
    try {
      const exportedBy = userProfile?.full_name || user?.email || 'Unknown';
      const exportDate = format(new Date(), 'dd-MM-yyyy HH:mm:ss');
      const formattedDate = format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy', { locale: idLocale });

      // Create worksheet data with watermark
      const wsData = [
        [`Laporan Monitoring Harian - GeoAttend`],
        [`Tanggal: ${formattedDate}`],
        [`Diekspor oleh: ${exportedBy}`],
        [`Waktu export: ${exportDate}`],
        [],
        ['Nama', 'Email', 'Departemen', 'Shift', 'Status', 'Clock In', 'Clock Out', 'Keterangan'],
        ...filteredEmployees.map((emp) => [
          emp.full_name,
          emp.email,
          emp.department || '-',
          emp.shifts?.name || '-',
          getStatusLabel(emp.status),
          emp.clockInTime || '-',
          emp.clockOutTime || '-',
          emp.status === 'late' ? `Terlambat ${emp.lateMinutes} menit` :
          emp.status === 'on_leave' ? getLeaveTypeLabel(emp.leaveType || '') :
          emp.status === 'holiday' ? emp.holidayName : '-'
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 20 },
        { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 25 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Daily Monitor');

      const fileName = `Daily_Monitor_${selectedDate}`;

      // Log audit event
      await supabase.rpc('log_audit_event', {
        p_user_id: user?.id,
        p_user_email: userProfile?.email || user?.email,
        p_user_role: userRole,
        p_company_id: userProfile?.company_id,
        p_action: 'export_data',
        p_resource_type: 'daily_monitor',
        p_resource_id: fileName,
        p_details: {
          date: selectedDate,
          record_count: filteredEmployees.length,
          status_filter: statusFilter,
          department_filter: departmentFilter,
        },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      XLSX.writeFile(wb, `${fileName}.xlsx`);
      toast.success(`Data diekspor: ${fileName}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengekspor data');
    } finally {
      setIsExporting(false);
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
              <Button onClick={() => navigate('/')}>Kembali ke Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const isLoading = employeesLoading || attendanceLoading;

  return (
    <AppLayout>
      <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Monitoring Harian</h1>
              <p className="text-muted-foreground">
                {format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto border-2 border-foreground"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  refetchAttendance();
                  refetchEmployees();
                  refetchLeaves();
                }}
                className="border-2 border-foreground"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                onClick={exportDailyToXLSX}
                disabled={!filteredEmployees?.length || isExporting}
                className="border-2 border-foreground"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export
              </Button>
            </div>
          </div>
          
          {/* Auto-refresh status bar */}
          <Card className="border border-muted">
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={autoRefresh}
                      onCheckedChange={setAutoRefresh}
                      id="auto-refresh"
                    />
                    <label htmlFor="auto-refresh" className="text-sm font-medium cursor-pointer">
                      Auto-refresh
                    </label>
                  </div>
                  {autoRefresh && (
                    <Badge variant="outline" className="animate-pulse">
                      <Radio className="h-3 w-3 mr-1 text-green-500" />
                      Live setiap 30 detik
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Terakhir diperbarui: {format(lastRefreshTime, 'HH:mm:ss')}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Holiday Banner */}
        {holiday && (
          <Card className="border-2 border-purple-500 bg-purple-50 dark:bg-purple-950">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Palmtree className="h-6 w-6 text-purple-600" />
                <div>
                  <p className="font-semibold text-purple-800 dark:text-purple-200">Hari Libur: {holiday.name}</p>
                  <p className="text-sm text-purple-600 dark:text-purple-400">Semua karyawan libur pada hari ini</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-2 border-foreground">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-green-500 bg-green-50 dark:bg-green-950">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.onTime}</p>
                  <p className="text-xs text-green-600">Tepat Waktu</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.late}</p>
                  <p className="text-xs text-orange-600">Terlambat</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-blue-500 bg-blue-50 dark:bg-blue-950">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Coffee className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.onLeave}</p>
                  <p className="text-xs text-blue-600">Izin/Cuti</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-red-500 bg-red-50 dark:bg-red-950">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.absent}</p>
                  <p className="text-xs text-red-600">Tidak Hadir</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-muted">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.notYet}</p>
                  <p className="text-xs text-muted-foreground">Belum Absen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-2 border-foreground">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <SelectItem value="on_time">Tepat Waktu</SelectItem>
                    <SelectItem value="late">Terlambat</SelectItem>
                    <SelectItem value="on_leave">Izin/Cuti</SelectItem>
                    <SelectItem value="absent">Tidak Hadir</SelectItem>
                    <SelectItem value="not_yet">Belum Absen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="border-2 border-foreground">
                  <SelectValue placeholder="Filter departemen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Departemen</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept!}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Employee Table */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daftar Kehadiran
              <Badge variant="outline" className="ml-2">
                {filteredEmployees.length} karyawan
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                Tidak ada data karyawan
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Departemen</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{emp.full_name}</p>
                            <p className="text-xs text-muted-foreground">{emp.job_title || emp.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{emp.department || '-'}</TableCell>
                        <TableCell>
                          {emp.shifts ? (
                            <div className="text-sm">
                              <p>{emp.shifts.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {emp.shifts.start_time.slice(0, 5)} - {emp.shifts.end_time.slice(0, 5)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {emp.clockInTime ? (
                            <Badge variant="outline" className="font-mono">
                              {emp.clockInTime}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {emp.clockOutTime ? (
                            <Badge variant="outline" className="font-mono">
                              {emp.clockOutTime}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(emp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminDailyMonitor;
