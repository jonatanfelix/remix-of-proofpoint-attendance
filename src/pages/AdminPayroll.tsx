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
import { Switch } from '@/components/ui/switch';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Download, Calculator, Clock, Users,
  AlertTriangle, Loader2, FileSpreadsheet, Info,
  ChevronDown, Shield, Banknote, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, differenceInMinutes, isWeekend } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import {
  calculateBPJS,
  calculatePPh21Monthly,
  formatCurrency,
  PTKP_VALUES,
  type BPJSRates,
} from '@/lib/payroll';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  employee_type: 'office' | 'field';
  attendance_required: boolean;
  base_salary: number | null;
  salary_type: 'daily' | 'monthly' | null;
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

interface CompanySettings {
  id: string;
  work_start_time: string;
  grace_period_minutes: number;
  late_penalty_per_minute: number;
  standard_work_hours: number;
  overtime_rate_per_hour: number;
  early_leave_deduction_per_minute: number;
  bpjs_kesehatan_employee_rate: number;
  bpjs_kesehatan_employer_rate: number;
  bpjs_tk_jht_employee_rate: number;
  bpjs_tk_jht_employer_rate: number;
  bpjs_tk_jp_employee_rate: number;
  bpjs_tk_jp_employer_rate: number;
  ptkp_status_default: string;
  use_pph21_calculation: boolean;
}

interface PayrollData {
  employee: Employee;
  baseSalary: number;
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  lateDeduction: number;
  earlyLeaveDays: number;
  totalEarlyLeaveMinutes: number;
  earlyLeaveDeduction: number;
  totalWorkHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  sickDays: number;
  leaveDays: number;
  permitDays: number;
  // BPJS
  bpjsKesehatanEmployee: number;
  bpjsJhtEmployee: number;
  bpjsJpEmployee: number;
  totalBpjsEmployee: number;
  // Tax
  pph21: number;
  // Totals
  totalDeductions: number;
  totalAdditions: number;
  netSalary: number;
}

const PTKP_OPTIONS = Object.keys(PTKP_VALUES);

const AdminPayroll = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isExporting, setIsExporting] = useState(false);
  
  // Feature toggles for this session (preview)
  const [showBpjs, setShowBpjs] = useState(false);
  const [showPph21, setShowPph21] = useState(false);
  const [ptkpStatus, setPtkpStatus] = useState('TK/0');
  const [detailOpen, setDetailOpen] = useState(false);

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
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as CompanySettings | null;
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
          id, user_id, full_name, email, department, employee_type, attendance_required,
          base_salary, salary_type,
          shifts (name, start_time, end_time)
        `)
        .eq('is_active', true)
        .eq('attendance_required', true)
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

  // BPJS Rates from company settings
  const bpjsRates: BPJSRates = useMemo(() => ({
    kesehatan_employee: company?.bpjs_kesehatan_employee_rate || 1,
    kesehatan_employer: company?.bpjs_kesehatan_employer_rate || 4,
    tk_jht_employee: company?.bpjs_tk_jht_employee_rate || 2,
    tk_jht_employer: company?.bpjs_tk_jht_employer_rate || 3.7,
    tk_jp_employee: company?.bpjs_tk_jp_employee_rate || 1,
    tk_jp_employer: company?.bpjs_tk_jp_employer_rate || 2,
  }), [company]);

  // Process payroll data
  const payrollData = useMemo<PayrollData[]>(() => {
    if (!employees || !dateRange) return [];

    const holidayDates = new Set(holidays?.map(h => h.date) || []);
    const standardWorkHours = company?.standard_work_hours || 8;
    const latePenaltyPerMinute = company?.late_penalty_per_minute || 0;
    const earlyLeaveDeductionPerMinute = company?.early_leave_deduction_per_minute || 0;
    const overtimeRatePerHour = company?.overtime_rate_per_hour || 0;
    const gracePeriodMinutes = company?.grace_period_minutes || 0;

    return employees.map((emp) => {
      let workingDays = 0;
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let totalLateMinutes = 0;
      let earlyLeaveDays = 0;
      let totalEarlyLeaveMinutes = 0;
      let totalWorkHours = 0;
      let overtimeHours = 0;
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

          // Check early leave (for office employees)
          if (emp.employee_type === 'office') {
            const expectedEnd = new Date(lastClockOut);
            expectedEnd.setHours(endHour, endMin, 0, 0);
            if (lastClockOut < expectedEnd) {
              earlyLeaveDays++;
              totalEarlyLeaveMinutes += differenceInMinutes(expectedEnd, lastClockOut);
            }
          }
        }

        // Check lateness (only for office employees, after grace period)
        if (emp.employee_type === 'office') {
          const firstClockIn = new Date(clockIns[0].recorded_at);
          const workStart = new Date(firstClockIn);
          workStart.setHours(startHour, startMin, 0, 0);

          // Add grace period
          const graceEnd = new Date(workStart.getTime() + gracePeriodMinutes * 60 * 1000);

          if (firstClockIn > graceEnd) {
            lateDays++;
            totalLateMinutes += differenceInMinutes(firstClockIn, workStart) - gracePeriodMinutes;
          }
        }
      });

      // Calculate deductions
      const lateDeduction = Math.max(0, totalLateMinutes) * latePenaltyPerMinute;
      const earlyLeaveDeduction = Math.max(0, totalEarlyLeaveMinutes) * earlyLeaveDeductionPerMinute;
      const overtimeAmount = Math.round(overtimeHours * 10) / 10 * overtimeRatePerHour;

      // Calculate employee salary
      const empBaseSalary = emp.base_salary || 0;
      const empSalaryType = emp.salary_type || 'monthly';
      // If daily, convert to monthly based on working days
      const monthlySalary = empSalaryType === 'daily' 
        ? empBaseSalary * workingDays 
        : empBaseSalary;

      // Calculate BPJS (optional)
      let bpjsKesehatanEmployee = 0;
      let bpjsJhtEmployee = 0;
      let bpjsJpEmployee = 0;
      let totalBpjsEmployee = 0;

      if (showBpjs && monthlySalary > 0) {
        const bpjs = calculateBPJS(monthlySalary, bpjsRates);
        bpjsKesehatanEmployee = bpjs.employee.kesehatan;
        bpjsJhtEmployee = bpjs.employee.jht;
        bpjsJpEmployee = bpjs.employee.jp;
        totalBpjsEmployee = bpjs.employee.total;
      }

      // Calculate PPh 21 (optional)
      let pph21 = 0;
      if (showPph21 && monthlySalary > 0) {
        pph21 = calculatePPh21Monthly(monthlySalary, ptkpStatus);
      }

      const totalDeductions = lateDeduction + earlyLeaveDeduction + totalBpjsEmployee + pph21;
      const totalAdditions = overtimeAmount;
      const netSalary = monthlySalary + totalAdditions - totalDeductions;

      return {
        employee: emp,
        baseSalary: empBaseSalary,
        monthlySalary,
        workingDays,
        presentDays,
        absentDays,
        lateDays,
        totalLateMinutes: Math.max(0, totalLateMinutes),
        lateDeduction,
        earlyLeaveDays,
        totalEarlyLeaveMinutes: Math.max(0, totalEarlyLeaveMinutes),
        earlyLeaveDeduction,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        overtimeAmount,
        sickDays,
        leaveDays,
        permitDays,
        bpjsKesehatanEmployee,
        bpjsJhtEmployee,
        bpjsJpEmployee,
        totalBpjsEmployee,
        pph21,
        totalDeductions,
        totalAdditions,
        netSalary,
      };
    });
  }, [employees, dateRange, attendance, leaves, holidays, company, showBpjs, showPph21, ptkpStatus, bpjsRates]);

  // Export to Excel (Payroll Format)
  const exportPayrollXLSX = async () => {
    if (!payrollData.length) return;

    setIsExporting(true);
    try {
      const exportedBy = userProfile?.full_name || user?.email || 'Unknown';
      const exportDate = format(new Date(), 'dd-MM-yyyy HH:mm:ss');
      const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale });

      // Build dynamic headers based on options
      const headers = [
        'No', 'Nama Karyawan', 'Departemen', 'Tipe',
        'Gaji Pokok', 'Tipe Gaji', 'Gaji Bulanan',
        'Hari Kerja', 'Hadir', 'Alpa',
        'Telat (hari)', 'Telat (menit)', 'Potongan Telat',
        'Pulang Awal (hari)', 'Pulang Awal (menit)', 'Potongan Pulang Awal',
        'Jam Kerja', 'Jam Lembur', 'Uang Lembur',
        'Cuti', 'Sakit', 'Izin',
      ];

      if (showBpjs) {
        headers.push('BPJS Kesehatan', 'BPJS JHT', 'BPJS JP', 'Total BPJS');
      }

      if (showPph21) {
        headers.push('PPh 21');
      }

      headers.push('Total Potongan', 'Total Tambahan', 'Gaji Bersih');

      const wsData = [
        [`Data Payroll - GeoAttend`],
        [`Periode: ${monthLabel}`],
        [`Diekspor oleh: ${exportedBy}`],
        [`Waktu export: ${exportDate}`],
        [],
        [`Pengaturan:`],
        [`- Potongan telat: ${formatCurrency(company?.late_penalty_per_minute || 0)}/menit (setelah toleransi ${company?.grace_period_minutes || 0} menit)`],
        [`- Potongan pulang awal: ${formatCurrency(company?.early_leave_deduction_per_minute || 0)}/menit`],
        [`- Uang lembur: ${formatCurrency(company?.overtime_rate_per_hour || 0)}/jam`],
        showBpjs ? [`- BPJS aktif (dihitung dari gaji per karyawan)`] : [],
        showPph21 ? [`- PPh 21 aktif dengan status PTKP: ${ptkpStatus}`] : [],
        [],
        headers,
        ...payrollData.map((r, idx) => {
          const row: (string | number)[] = [
            idx + 1,
            r.employee.full_name,
            r.employee.department || '-',
            r.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan',
            r.baseSalary,
            r.employee.salary_type === 'daily' ? 'Harian' : 'Bulanan',
            r.monthlySalary,
            r.workingDays,
            r.presentDays,
            r.absentDays,
            r.lateDays,
            r.totalLateMinutes,
            r.lateDeduction,
            r.earlyLeaveDays,
            r.totalEarlyLeaveMinutes,
            r.earlyLeaveDeduction,
            r.totalWorkHours,
            r.overtimeHours,
            r.overtimeAmount,
            r.leaveDays,
            r.sickDays,
            r.permitDays,
          ];

          if (showBpjs) {
            row.push(r.bpjsKesehatanEmployee, r.bpjsJhtEmployee, r.bpjsJpEmployee, r.totalBpjsEmployee);
          }

          if (showPph21) {
            row.push(r.pph21);
          }

          row.push(r.totalDeductions, r.totalAdditions, r.netSalary);
          return row;
        }),
        [],
        // Totals row
        (() => {
          const totalsRow: (string | number)[] = [
            '', '', '', 'TOTAL',
            payrollData.reduce((s, r) => s + r.baseSalary, 0),
            '',
            payrollData.reduce((s, r) => s + r.monthlySalary, 0),
            payrollData.reduce((s, r) => s + r.workingDays, 0),
            payrollData.reduce((s, r) => s + r.presentDays, 0),
            payrollData.reduce((s, r) => s + r.absentDays, 0),
            payrollData.reduce((s, r) => s + r.lateDays, 0),
            payrollData.reduce((s, r) => s + r.totalLateMinutes, 0),
            payrollData.reduce((s, r) => s + r.lateDeduction, 0),
            payrollData.reduce((s, r) => s + r.earlyLeaveDays, 0),
            payrollData.reduce((s, r) => s + r.totalEarlyLeaveMinutes, 0),
            payrollData.reduce((s, r) => s + r.earlyLeaveDeduction, 0),
            payrollData.reduce((s, r) => s + r.totalWorkHours, 0),
            payrollData.reduce((s, r) => s + r.overtimeHours, 0),
            payrollData.reduce((s, r) => s + r.overtimeAmount, 0),
            payrollData.reduce((s, r) => s + r.leaveDays, 0),
            payrollData.reduce((s, r) => s + r.sickDays, 0),
            payrollData.reduce((s, r) => s + r.permitDays, 0),
          ];

          if (showBpjs) {
            totalsRow.push(
              payrollData.reduce((s, r) => s + r.bpjsKesehatanEmployee, 0),
              payrollData.reduce((s, r) => s + r.bpjsJhtEmployee, 0),
              payrollData.reduce((s, r) => s + r.bpjsJpEmployee, 0),
              payrollData.reduce((s, r) => s + r.totalBpjsEmployee, 0)
            );
          }

          if (showPph21) {
            totalsRow.push(payrollData.reduce((s, r) => s + r.pph21, 0));
          }

          totalsRow.push(
            payrollData.reduce((s, r) => s + r.totalDeductions, 0),
            payrollData.reduce((s, r) => s + r.totalAdditions, 0),
            payrollData.reduce((s, r) => s + r.netSalary, 0)
          );
          return totalsRow;
        })(),
      ].filter(row => row.length > 0);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = Array(headers.length).fill({ wch: 15 });

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
          include_bpjs: showBpjs,
          include_pph21: showPph21,
        },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      // Download
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
      totalLateDeduction: payrollData.reduce((s, r) => s + r.lateDeduction, 0),
      totalEarlyLeaveDeduction: payrollData.reduce((s, r) => s + r.earlyLeaveDeduction, 0),
      totalOvertimeAmount: payrollData.reduce((s, r) => s + r.overtimeAmount, 0),
      totalBpjs: payrollData.reduce((s, r) => s + r.totalBpjsEmployee, 0),
      totalPph21: payrollData.reduce((s, r) => s + r.pph21, 0),
      totalDeductions: payrollData.reduce((s, r) => s + r.totalDeductions, 0),
      totalAdditions: payrollData.reduce((s, r) => s + r.totalAdditions, 0),
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
                Data kehadiran lengkap untuk perhitungan gaji
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
              Export Excel
            </Button>
          </div>

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Pengaturan di Admin → Pengaturan</p>
                  <p className="text-muted-foreground">
                    Semua rate (potongan telat, pulang awal, lembur, BPJS) bisa diatur di halaman Pengaturan.
                    Aktifkan opsi BPJS dan PPh 21 di bawah untuk melihat simulasi perhitungan.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters & Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Pengaturan Periode & Opsi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Period */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="space-y-2">
                  <Label>Periode Bulan</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full sm:w-48"
                  />
                </div>
              </div>

              {/* BPJS & PPh21 Toggles */}
              <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between border-2 border-foreground">
                    <span className="flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Opsi Perhitungan BPJS & Pajak (Opsional)
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-4">
                  {/* BPJS Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg border-2 border-foreground bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-blue-600" />
                      <div>
                        <Label className="text-base">Hitung BPJS</Label>
                        <p className="text-sm text-muted-foreground">
                          Kesehatan + Ketenagakerjaan (JHT + JP)
                        </p>
                      </div>
                    </div>
                    <Switch checked={showBpjs} onCheckedChange={setShowBpjs} />
                  </div>

                  {/* PPh21 Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg border-2 border-foreground bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Banknote className="h-5 w-5 text-green-600" />
                      <div>
                        <Label className="text-base">Hitung PPh 21</Label>
                        <p className="text-sm text-muted-foreground">
                          Pajak penghasilan karyawan
                        </p>
                      </div>
                    </div>
                    <Switch checked={showPph21} onCheckedChange={setShowPph21} />
                  </div>

                  {/* Simulation inputs */}
                  {(showBpjs || showPph21) && (
                    <div className="p-4 rounded-lg border-2 border-primary/50 bg-primary/5 space-y-4">
                      <p className="text-sm font-medium text-primary">
                        Perhitungan berdasarkan gaji per karyawan
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {showPph21 && (
                          <div className="space-y-2">
                            <Label>Status PTKP Default</Label>
                            <Select value={ptkpStatus} onValueChange={setPtkpStatus}>
                              <SelectTrigger className="border-2 border-foreground">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PTKP_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        * Gaji pokok diatur di halaman Karyawan. Karyawan tanpa gaji akan menampilkan Rp 0.
                      </p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Current settings summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div className="p-2 rounded bg-muted">
                  <span className="font-medium">Toleransi:</span> {company?.grace_period_minutes || 0} menit
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="font-medium">Denda telat:</span> {formatCurrency(company?.late_penalty_per_minute || 0)}/mnt
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="font-medium">Pulang awal:</span> {formatCurrency(company?.early_leave_deduction_per_minute || 0)}/mnt
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="font-medium">Lembur:</span> {formatCurrency(company?.overtime_rate_per_hour || 0)}/jam
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
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-lg font-bold text-destructive">
                        {formatCurrency(summaryStats.totalDeductions)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Potongan</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(summaryStats.totalAdditions)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Tambahan</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Breakdown */}
          {summaryStats && (showBpjs || showPph21 || summaryStats.totalLateDeduction > 0 || summaryStats.totalEarlyLeaveDeduction > 0) && (
            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rincian Potongan & Tambahan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {summaryStats.totalLateDeduction > 0 && (
                    <div>
                      <p className="text-muted-foreground">Potongan Telat</p>
                      <p className="font-medium text-destructive">{formatCurrency(summaryStats.totalLateDeduction)}</p>
                    </div>
                  )}
                  {summaryStats.totalEarlyLeaveDeduction > 0 && (
                    <div>
                      <p className="text-muted-foreground">Potongan Pulang Awal</p>
                      <p className="font-medium text-destructive">{formatCurrency(summaryStats.totalEarlyLeaveDeduction)}</p>
                    </div>
                  )}
                  {showBpjs && (
                    <div>
                      <p className="text-muted-foreground">BPJS (Karyawan)</p>
                      <p className="font-medium text-destructive">{formatCurrency(summaryStats.totalBpjs)}</p>
                    </div>
                  )}
                  {showPph21 && (
                    <div>
                      <p className="text-muted-foreground">PPh 21</p>
                      <p className="font-medium text-destructive">{formatCurrency(summaryStats.totalPph21)}</p>
                    </div>
                  )}
                  {summaryStats.totalOvertimeAmount > 0 && (
                    <div>
                      <p className="text-muted-foreground">Uang Lembur</p>
                      <p className="font-medium text-green-600">{formatCurrency(summaryStats.totalOvertimeAmount)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Data Payroll {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: idLocale })}
              </CardTitle>
              <CardDescription>
                Hanya menampilkan karyawan dengan absensi wajib
              </CardDescription>
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
                        <TableHead className="text-right">Gaji Pokok</TableHead>
                        <TableHead className="text-center">Hadir</TableHead>
                        <TableHead className="text-center">Alpa</TableHead>
                        <TableHead className="text-center">Telat</TableHead>
                        <TableHead className="text-right">Pot. Telat</TableHead>
                        <TableHead className="text-center">Lembur</TableHead>
                        {showBpjs && <TableHead className="text-right">BPJS</TableHead>}
                        {showPph21 && <TableHead className="text-right">PPh 21</TableHead>}
                        <TableHead className="text-right">Total Pot.</TableHead>
                        <TableHead className="text-right">Gaji Bersih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollData.map((r) => (
                        <TableRow key={r.employee.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{r.employee.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan'}
                                {r.employee.salary_type === 'daily' && ' • Harian'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.monthlySalary > 0 ? (
                              <span className="font-medium">{formatCurrency(r.monthlySalary)}</span>
                            ) : (
                              <span className="text-muted-foreground">Belum diatur</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default">{r.presentDays}/{r.workingDays}</Badge>
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
                                {formatCurrency(r.lateDeduction)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.overtimeHours > 0 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700">
                                +{r.overtimeHours}j
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {showBpjs && (
                            <TableCell className="text-right text-sm">
                              {formatCurrency(r.totalBpjsEmployee)}
                            </TableCell>
                          )}
                          {showPph21 && (
                            <TableCell className="text-right text-sm">
                              {formatCurrency(r.pph21)}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            {r.totalDeductions > 0 ? (
                              <span className="text-destructive font-medium">
                                {formatCurrency(r.totalDeductions)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-green-600">
                              {formatCurrency(r.netSalary)}
                            </span>
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
