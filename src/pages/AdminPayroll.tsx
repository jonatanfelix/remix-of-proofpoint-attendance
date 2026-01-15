import { useState, useMemo } from 'react';
import { downloadBlob } from '@/lib/download';

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
  Download, DollarSign, Calculator, Clock,
  AlertTriangle, Loader2, FileSpreadsheet, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, differenceInMinutes, differenceInHours, isWeekend } from 'date-fns';
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

interface PayrollData {
  employee: Employee;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  lateDeduction: number; // calculated penalty
  totalWorkHours: number;
  overtimeHours: number;
  sickDays: number;
  leaveDays: number;
  permitDays: number;
}

// Late penalty configuration (Now configurable via DB)
// const LATE_PENALTY_PER_MINUTE = 1000; 
// const STANDARD_WORK_HOURS = 8;

const AdminPayroll = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
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
        .select('work_start_time, late_penalty_per_minute, standard_work_hours')
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch all active employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['payroll-employees'],
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
    queryKey: ['payroll-attendance', selectedMonth],
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
    queryKey: ['payroll-leaves', selectedMonth],
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
    queryKey: ['payroll-holidays', selectedMonth],
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

  // Process payroll data
  const payrollData = useMemo<PayrollData[]>(() => {
    if (!employees || !dateRange) return [];

    const holidayDates = new Set(holidays?.map(h => h.date) || []);

    return employees.map((emp) => {
      let workingDays = 0;
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let totalLateMinutes = 0;
      let totalWorkHours = 0;
      let overtimeHours = 0;
      let lateDeduction = 0;

      const standardWorkHours = (company as any)?.standard_work_hours || 8;
      const latePenaltyPerMinute = (company as any)?.late_penalty_per_minute || 1000;
      let sickDays = 0;
      let leaveDays = 0;
      let permitDays = 0;

      const workStartTime = emp.shifts?.start_time || company?.work_start_time || '08:00:00';
      const workEndTime = emp.shifts?.end_time || '17:00:00';
      const [startHour, startMin] = workStartTime.split(':').map(Number);
      const [endHour, endMin] = workEndTime.split(':').map(Number);

      dateRange.days.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');

        // Skip weekends
        if (isWeekend(day)) return;

        // Skip holidays
        if (holidayDates.has(dateStr)) return;

        // This is a working day
        workingDays++;

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
          if (day <= new Date()) {
            absentDays++;
          }
          return;
        }

        presentDays++;

        // Calculate work hours
        if (clockOuts.length > 0) {
          const firstClockIn = new Date(clockIns[0].recorded_at);
          const lastClockOut = new Date(clockOuts[clockOuts.length - 1].recorded_at);
          const hoursWorked = differenceInMinutes(lastClockOut, firstClockIn) / 60;
          totalWorkHours += hoursWorked;

          // Calculate overtime (hours beyond standard)
          if (hoursWorked > standardWorkHours) {
            overtimeHours += hoursWorked - standardWorkHours;
          }
        }

        // Check lateness (only for office employees)
        if (emp.employee_type === 'office') {
          const firstClockIn = new Date(clockIns[0].recorded_at);
          const workStart = new Date(firstClockIn);
          workStart.setHours(startHour, startMin, 0, 0);

          if (firstClockIn > workStart) {
            lateDays++;
            totalLateMinutes += differenceInMinutes(firstClockIn, workStart);
          }
        }
      });

      return {
        employee: emp,
        workingDays,
        presentDays,
        absentDays,
        lateDays,
        totalLateMinutes,
        lateDeduction: totalLateMinutes * latePenaltyPerMinute,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        sickDays,
        leaveDays,
        permitDays,
      };
    });
  }, [employees, dateRange, attendance, leaves, holidays, company?.work_start_time]);

  // Export to Excel (Payroll Format)
  const exportPayrollXLSX = async () => {
    if (!payrollData.length) return;

    setIsExporting(true);
    try {
      const exportedBy = userProfile?.full_name || user?.email || 'Unknown';
      const exportDate = format(new Date(), 'dd-MM-yyyy HH:mm:ss');
      const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale });

      const wsData = [
        [`Data Payroll - GeoAttend`],
        [`Periode: ${monthLabel}`],
        [`Diekspor oleh: ${exportedBy}`],
        [`Waktu export: ${exportDate}`],
        [`Catatan: Potongan telat = Rp ${(company as any)?.late_penalty_per_minute?.toLocaleString('id-ID') || '1.000'}/menit`],
        [],
        [
          'No', 'Nama Karyawan', 'Departemen', 'Tipe',
          'Hari Kerja', 'Hadir', 'Alpa',
          'Telat (hari)', 'Total Telat (menit)', 'Potongan Telat (Rp)',
          'Total Jam Kerja', 'Jam Lembur',
          'Cuti', 'Sakit', 'Izin'
        ],
        ...payrollData.map((r, idx) => [
          idx + 1,
          r.employee.full_name,
          r.employee.department || '-',
          r.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan',
          r.workingDays,
          r.presentDays,
          r.absentDays,
          r.lateDays,
          r.totalLateMinutes,
          r.lateDeduction,
          r.totalWorkHours,
          r.overtimeHours,
          r.leaveDays,
          r.sickDays,
          r.permitDays,
        ]),
        [],
        ['', '', '', 'TOTAL',
          payrollData.reduce((s, r) => s + r.workingDays, 0),
          payrollData.reduce((s, r) => s + r.presentDays, 0),
          payrollData.reduce((s, r) => s + r.absentDays, 0),
          payrollData.reduce((s, r) => s + r.lateDays, 0),
          payrollData.reduce((s, r) => s + r.totalLateMinutes, 0),
          payrollData.reduce((s, r) => s + r.lateDeduction, 0),
          payrollData.reduce((s, r) => s + r.totalWorkHours, 0),
          payrollData.reduce((s, r) => s + r.overtimeHours, 0),
          payrollData.reduce((s, r) => s + r.leaveDays, 0),
          payrollData.reduce((s, r) => s + r.sickDays, 0),
          payrollData.reduce((s, r) => s + r.permitDays, 0),
        ],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
        { wch: 12 }, { wch: 8 }, { wch: 8 },
        { wch: 12 }, { wch: 18 }, { wch: 18 },
        { wch: 15 }, { wch: 12 },
        { wch: 8 }, { wch: 8 }, { wch: 8 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Payroll Data');

      const fileName = `Payroll_${selectedMonth}`;

      // Log audit
      await supabase.rpc('log_audit_event', {
        p_user_id: user?.id,
        p_user_email: userProfile?.email || user?.email,
        p_user_role: userRole,
        p_company_id: userProfile?.company_id,
        p_action: 'export_data',
        p_resource_type: 'payroll_export',
        p_resource_id: fileName,
        p_details: {
          month: selectedMonth,
          employee_count: payrollData.length,
          total_deduction: payrollData.reduce((s, r) => s + r.lateDeduction, 0),
        },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      // Robust download handling with custom utility
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      downloadBlob(blob, `${fileName}.xlsx`);

      toast.success(`Data payroll diekspor: ${fileName}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal mengekspor data payroll');
    } finally {
      setIsExporting(false);
    }
  };

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!payrollData.length) return null;

    return {
      totalEmployees: payrollData.length,
      totalWorkHours: Math.round(payrollData.reduce((s, r) => s + r.totalWorkHours, 0)),
      totalOvertimeHours: Math.round(payrollData.reduce((s, r) => s + r.overtimeHours, 0) * 10) / 10,
      totalDeduction: payrollData.reduce((s, r) => s + r.lateDeduction, 0),
    };
  }, [payrollData]);

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
              <h1 className="text-2xl font-bold">Integrasi Payroll</h1>
              <p className="text-muted-foreground">
                Export data kehadiran siap hitung penggajian
              </p>
            </div>
            <Button
              onClick={exportPayrollXLSX}
              disabled={!payrollData.length || isExporting}
              className="border-2 border-foreground"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Export Payroll
            </Button>
          </div>

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Format Payroll Ready</p>
                  <p className="text-muted-foreground">
                    Data mencakup: hari kerja, kehadiran, keterlambatan, potongan, jam kerja, dan lembur.
                    Siap diimpor ke sistem penggajian.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Periode Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="space-y-2">
                  <Label>Bulan</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full sm:w-48"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Potongan telat: Rp {(company?.late_penalty_per_minute || 1000).toLocaleString('id-ID')}/menit
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {summaryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-primary" />
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
                    <Clock className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalWorkHours}j</p>
                      <p className="text-xs text-muted-foreground">Total Jam Kerja</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{summaryStats.totalOvertimeHours}j</p>
                      <p className="text-xs text-muted-foreground">Total Lembur</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-lg font-bold">
                        Rp {summaryStats.totalDeduction.toLocaleString('id-ID')}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Potongan</p>
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
                Data Payroll {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !payrollData.length ? (
                <p className="text-center py-8 text-muted-foreground">Tidak ada data</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead className="text-center">Hari Kerja</TableHead>
                        <TableHead className="text-center">Hadir</TableHead>
                        <TableHead className="text-center">Alpa</TableHead>
                        <TableHead className="text-center">Telat</TableHead>
                        <TableHead className="text-right">Potongan</TableHead>
                        <TableHead className="text-center">Jam Kerja</TableHead>
                        <TableHead className="text-center">Lembur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollData.map((r) => (
                        <TableRow key={r.employee.id}>
                          <TableCell className="font-medium">
                            {r.employee.full_name}
                          </TableCell>
                          <TableCell className="text-center">{r.workingDays}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default">{r.presentDays}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.absentDays > 0 ? (
                              <Badge variant="destructive">{r.absentDays}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.lateDays > 0 ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                {r.lateDays}x ({r.totalLateMinutes}m)
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.lateDeduction > 0 ? (
                              <span className="text-destructive font-medium">
                                Rp {r.lateDeduction.toLocaleString('id-ID')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{r.totalWorkHours}j</TableCell>
                          <TableCell className="text-center">
                            {r.overtimeHours > 0 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700">
                                +{r.overtimeHours}j
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
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
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminPayroll;
