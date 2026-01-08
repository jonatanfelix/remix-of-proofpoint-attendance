import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Download, FileSpreadsheet, Calendar, Users, Clock, 
  AlertTriangle, XCircle, LogOut as EarlyLeaveIcon, Loader2 
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, differenceInMinutes, isWeekend } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
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

interface EmployeeRecap {
  employee: Employee;
  totalDays: number;
  presentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  earlyLeaveDays: number;
  totalEarlyMinutes: number;
  absentDays: number;
  leaveDays: number;
  sickDays: number;
  permitDays: number;
  holidayDays: number;
  weekendDays: number;
}

const AdminReports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [reportType, setReportType] = useState<'monthly' | 'daily'>('monthly');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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

  // Get user profile for audit
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

  // Fetch company settings
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('work_start_time')
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch all active employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['report-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, user_id, full_name, email, department, employee_type,
          shifts (name, start_time, end_time)
        `)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data as Employee[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Date range for the selected month
  const dateRange = useMemo(() => {
    const monthDate = parseISO(`${selectedMonth}-01`);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [selectedMonth]);

  // Fetch attendance for the month
  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['report-attendance', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, record_type, recorded_at')
        .gte('recorded_at', dateRange.start.toISOString())
        .lte('recorded_at', dateRange.end.toISOString())
        .order('recorded_at', { ascending: true });

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: isAdminOrDeveloper && !!dateRange,
  });

  // Fetch leaves for the month
  const { data: leaves } = useQuery({
    queryKey: ['report-leaves', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', format(dateRange.end, 'yyyy-MM-dd'))
        .gte('end_date', format(dateRange.start, 'yyyy-MM-dd'));

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: isAdminOrDeveloper && !!dateRange,
  });

  // Fetch holidays for the month
  const { data: holidays } = useQuery({
    queryKey: ['report-holidays', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, date, name')
        .eq('is_active', true)
        .gte('date', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('date', format(dateRange.end, 'yyyy-MM-dd'));

      if (error) throw error;
      return data as Holiday[];
    },
    enabled: isAdminOrDeveloper && !!dateRange,
  });

  // Process recap data
  const recapData = useMemo<EmployeeRecap[]>(() => {
    if (!employees || !dateRange) return [];

    const holidayDates = new Set(holidays?.map(h => h.date) || []);

    return employees.map((emp) => {
      let presentDays = 0;
      let lateDays = 0;
      let totalLateMinutes = 0;
      let earlyLeaveDays = 0;
      let totalEarlyMinutes = 0;
      let absentDays = 0;
      let leaveDays = 0;
      let sickDays = 0;
      let permitDays = 0;
      let holidayCount = 0;
      let weekendCount = 0;

      const workStartTime = emp.shifts?.start_time || company?.work_start_time || '08:00:00';
      const workEndTime = emp.shifts?.end_time || '17:00:00';
      const [startHour, startMin] = workStartTime.split(':').map(Number);
      const [endHour, endMin] = workEndTime.split(':').map(Number);

      dateRange.days.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');

        // Skip weekends
        if (isWeekend(day)) {
          weekendCount++;
          return;
        }

        // Skip holidays
        if (holidayDates.has(dateStr)) {
          holidayCount++;
          return;
        }

        // Check if on leave
        const empLeave = leaves?.find(
          (l) =>
            l.user_id === emp.user_id &&
            dateStr >= l.start_date &&
            dateStr <= l.end_date
        );
        if (empLeave) {
          if (empLeave.leave_type === 'sakit') sickDays++;
          else if (empLeave.leave_type === 'izin') permitDays++;
          else leaveDays++;
          return;
        }

        // Check attendance
        const dayAttendance = attendance?.filter(
          (a) =>
            a.user_id === emp.user_id &&
            a.recorded_at.startsWith(dateStr)
        ) || [];

        const clockIns = dayAttendance.filter((a) => a.record_type === 'clock_in');
        const clockOuts = dayAttendance.filter((a) => a.record_type === 'clock_out');

        if (clockIns.length === 0) {
          // Only count as absent if date is not in future
          if (day <= new Date()) {
            absentDays++;
          }
          return;
        }

        presentDays++;

        // Check lateness (only for office employees)
        if (emp.employee_type === 'office') {
          const firstClockIn = new Date(clockIns[0].recorded_at);
          const workStart = new Date(firstClockIn);
          workStart.setHours(startHour, startMin, 0, 0);

          if (firstClockIn > workStart) {
            lateDays++;
            totalLateMinutes += differenceInMinutes(firstClockIn, workStart);
          }

          // Check early leave
          if (clockOuts.length > 0) {
            const lastClockOut = new Date(clockOuts[clockOuts.length - 1].recorded_at);
            const workEnd = new Date(lastClockOut);
            workEnd.setHours(endHour, endMin, 0, 0);

            if (lastClockOut < workEnd) {
              earlyLeaveDays++;
              totalEarlyMinutes += differenceInMinutes(workEnd, lastClockOut);
            }
          }
        }
      });

      return {
        employee: emp,
        totalDays: dateRange.days.length,
        presentDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        totalEarlyMinutes,
        absentDays,
        leaveDays,
        sickDays,
        permitDays,
        holidayDays: holidayCount,
        weekendDays: weekendCount,
      };
    });
  }, [employees, dateRange, attendance, leaves, holidays, company?.work_start_time]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!recapData.length) return null;

    return {
      totalEmployees: recapData.length,
      totalLateDays: recapData.reduce((sum, r) => sum + r.lateDays, 0),
      totalAbsentDays: recapData.reduce((sum, r) => sum + r.absentDays, 0),
      totalEarlyLeaveDays: recapData.reduce((sum, r) => sum + r.earlyLeaveDays, 0),
      avgLateMinutes: Math.round(
        recapData.reduce((sum, r) => sum + r.totalLateMinutes, 0) / 
        Math.max(recapData.reduce((sum, r) => sum + r.lateDays, 0), 1)
      ),
    };
  }, [recapData]);

  // Export to Excel
  const exportToXLSX = async () => {
    if (!recapData.length) return;

    setIsExporting(true);
    try {
      const exportedBy = userProfile?.full_name || user?.email || 'Unknown';
      const exportDate = format(new Date(), 'dd-MM-yyyy HH:mm:ss');
      const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale });

      const wsData = [
        [`Laporan Rekapitulasi Kehadiran - GeoAttend`],
        [`Periode: ${monthLabel}`],
        [`Diekspor oleh: ${exportedBy}`],
        [`Waktu export: ${exportDate}`],
        [],
        [
          'Nama', 'Departemen', 'Tipe', 'Hari Kerja', 'Hadir', 'Terlambat', 
          'Total Telat (menit)', 'Pulang Cepat', 'Total Cepat (menit)', 
          'Alpa', 'Cuti', 'Sakit', 'Izin', 'Libur', 'Weekend'
        ],
        ...recapData.map((r) => [
          r.employee.full_name,
          r.employee.department || '-',
          r.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan',
          r.totalDays - r.weekendDays - r.holidayDays,
          r.presentDays,
          r.lateDays,
          r.totalLateMinutes,
          r.earlyLeaveDays,
          r.totalEarlyMinutes,
          r.absentDays,
          r.leaveDays,
          r.sickDays,
          r.permitDays,
          r.holidayDays,
          r.weekendDays,
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
        { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Rekapitulasi');

      const fileName = `Rekap_Kehadiran_${selectedMonth}`;

      // Log audit
      await supabase.rpc('log_audit_event', {
        p_user_id: user?.id,
        p_user_email: userProfile?.email || user?.email,
        p_user_role: userRole,
        p_company_id: userProfile?.company_id,
        p_action: 'export_data',
        p_resource_type: 'monthly_report',
        p_resource_id: fileName,
        p_details: {
          month: selectedMonth,
          employee_count: recapData.length,
        },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      XLSX.writeFile(wb, `${fileName}.xlsx`);
      toast.success(`Laporan diekspor: ${fileName}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengekspor laporan');
    } finally {
      setIsExporting(false);
    }
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
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
      <div className="container mx-auto max-w-7xl px-4 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Laporan Rekapitulasi</h1>
              <p className="text-muted-foreground">
                Generate laporan kehadiran otomatis (telat, pulang cepat, alpa)
              </p>
            </div>
            <Button 
              onClick={exportToXLSX} 
              disabled={!recapData.length || isExporting}
              className="border-2 border-foreground"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Export Excel
            </Button>
          </div>

          {/* Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filter Periode</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-2">
                  <Label>Bulan</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full sm:w-48"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {summaryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalEmployees}</p>
                      <p className="text-xs text-muted-foreground">Karyawan</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalLateDays}</p>
                      <p className="text-xs text-muted-foreground">Total Telat</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.avgLateMinutes}m</p>
                      <p className="text-xs text-muted-foreground">Rata-rata Telat</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <EarlyLeaveIcon className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalEarlyLeaveDays}</p>
                      <p className="text-xs text-muted-foreground">Pulang Cepat</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalAbsentDays}</p>
                      <p className="text-xs text-muted-foreground">Total Alpa</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Rekap {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !recapData.length ? (
                <p className="text-center py-8 text-muted-foreground">Tidak ada data</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Departemen</TableHead>
                        <TableHead className="text-center">Hadir</TableHead>
                        <TableHead className="text-center">Telat</TableHead>
                        <TableHead className="text-center">Pulang Cepat</TableHead>
                        <TableHead className="text-center">Alpa</TableHead>
                        <TableHead className="text-center">Cuti/Izin/Sakit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recapData.map((r) => (
                        <TableRow key={r.employee.id}>
                          <TableCell className="font-medium">
                            {r.employee.full_name}
                            <Badge variant="outline" className="ml-2 text-xs">
                              {r.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan'}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.employee.department || '-'}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default">{r.presentDays}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.lateDays > 0 ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                {r.lateDays} ({r.totalLateMinutes}m)
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.earlyLeaveDays > 0 ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {r.earlyLeaveDays}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.absentDays > 0 ? (
                              <Badge variant="destructive">{r.absentDays}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              {r.leaveDays > 0 && <Badge variant="outline">C:{r.leaveDays}</Badge>}
                              {r.permitDays > 0 && <Badge variant="outline">I:{r.permitDays}</Badge>}
                              {r.sickDays > 0 && <Badge variant="outline">S:{r.sickDays}</Badge>}
                              {r.leaveDays + r.permitDays + r.sickDays === 0 && (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminReports;
