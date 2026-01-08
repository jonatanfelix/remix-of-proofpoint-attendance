import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { 
  Users, Clock, CheckCircle, XCircle, AlertTriangle, 
  Coffee, Palmtree, RefreshCw, Loader2, Radio, TrendingUp,
  BarChart3, PieChart
} from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from 'recharts';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  employee_type: 'office' | 'field';
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

type EmployeeStatus = 'present' | 'late' | 'on_leave' | 'holiday' | 'absent' | 'not_yet';

interface EmployeeWithStatus extends Employee {
  status: EmployeeStatus;
  clockInTime: string | null;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

const STATUS_COLORS = {
  present: 'hsl(142, 76%, 36%)', // green
  late: 'hsl(45, 93%, 47%)', // yellow
  on_leave: 'hsl(217, 91%, 60%)', // blue
  absent: 'hsl(0, 84%, 60%)', // red
  not_yet: 'hsl(220, 9%, 46%)', // gray
  holiday: 'hsl(280, 87%, 65%)', // purple
};

const AdminAnalytics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [autoRefresh, setAutoRefresh] = useState(true);

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
  const { data: employees, isLoading: employeesLoading, refetch: refetchEmployees, dataUpdatedAt } = useQuery({
    queryKey: ['analytics-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, department, employee_type')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data as Employee[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Fetch today's attendance
  const { data: todayAttendance, isLoading: attendanceLoading, refetch: refetchAttendance } = useQuery({
    queryKey: ['analytics-attendance', today],
    queryFn: async () => {
      const dayStart = startOfDay(new Date()).toISOString();
      const dayEnd = endOfDay(new Date()).toISOString();

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, record_type, recorded_at')
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at', { ascending: true });

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Fetch today's leaves
  const { data: todayLeaves, refetch: refetchLeaves } = useQuery({
    queryKey: ['analytics-leaves', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: isAdminOrDeveloper,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
  });

  // Fetch today's holiday
  const { data: todayHoliday } = useQuery({
    queryKey: ['analytics-holiday', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, date, name')
        .eq('date', today)
        .eq('is_active', true)
        .maybeSingle();

      if (error) return null;
      return data as Holiday | null;
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch weekly attendance for chart
  const { data: weeklyAttendance } = useQuery({
    queryKey: ['analytics-weekly'],
    queryFn: async () => {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, record_type, recorded_at')
        .gte('recorded_at', weekStart.toISOString())
        .lte('recorded_at', weekEnd.toISOString())
        .eq('record_type', 'clock_in');

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Track last refresh time
  const lastRefreshTime = useMemo(() => {
    return dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();
  }, [dataUpdatedAt]);

  // Process employees with status
  const processedEmployees = useMemo<EmployeeWithStatus[]>(() => {
    if (!employees) return [];

    const workStartTime = company?.work_start_time || '08:00:00';
    const [hours, minutes] = workStartTime.split(':').map(Number);
    const now = new Date();
    const workStart = new Date();
    workStart.setHours(hours, minutes, 0, 0);

    return employees.map((emp) => {
      // Check if holiday
      if (todayHoliday) {
        return { ...emp, status: 'holiday' as EmployeeStatus, clockInTime: null };
      }

      // Check if on leave
      const empLeave = todayLeaves?.find((l) => l.user_id === emp.user_id);
      if (empLeave) {
        return { ...emp, status: 'on_leave' as EmployeeStatus, clockInTime: null };
      }

      // Check attendance
      const empAttendance = todayAttendance?.filter((a) => a.user_id === emp.user_id) || [];
      const clockIn = empAttendance.find((a) => a.record_type === 'clock_in');

      if (!clockIn) {
        if (now < workStart) {
          return { ...emp, status: 'not_yet' as EmployeeStatus, clockInTime: null };
        }
        return { ...emp, status: 'absent' as EmployeeStatus, clockInTime: null };
      }

      const clockInTime = new Date(clockIn.recorded_at);
      const isLate = clockInTime > workStart;

      return {
        ...emp,
        status: isLate ? 'late' as EmployeeStatus : 'present' as EmployeeStatus,
        clockInTime: format(clockInTime, 'HH:mm'),
      };
    });
  }, [employees, todayAttendance, todayLeaves, todayHoliday, company?.work_start_time]);

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      total: processedEmployees.length,
      present: processedEmployees.filter((e) => e.status === 'present').length,
      late: processedEmployees.filter((e) => e.status === 'late').length,
      on_leave: processedEmployees.filter((e) => e.status === 'on_leave').length,
      absent: processedEmployees.filter((e) => e.status === 'absent').length,
      not_yet: processedEmployees.filter((e) => e.status === 'not_yet').length,
      holiday: processedEmployees.filter((e) => e.status === 'holiday').length,
    };
  }, [processedEmployees]);

  // Pie chart data
  const pieData = useMemo(() => {
    if (todayHoliday) {
      return [{ name: 'Libur', value: statusCounts.total, fill: STATUS_COLORS.holiday }];
    }
    return [
      { name: 'Tepat Waktu', value: statusCounts.present, fill: STATUS_COLORS.present },
      { name: 'Terlambat', value: statusCounts.late, fill: STATUS_COLORS.late },
      { name: 'Cuti/Izin', value: statusCounts.on_leave, fill: STATUS_COLORS.on_leave },
      { name: 'Tidak Hadir', value: statusCounts.absent, fill: STATUS_COLORS.absent },
      { name: 'Belum Absen', value: statusCounts.not_yet, fill: STATUS_COLORS.not_yet },
    ].filter((d) => d.value > 0);
  }, [statusCounts, todayHoliday]);

  // Weekly chart data
  const weeklyChartData = useMemo(() => {
    if (!weeklyAttendance || !employees) return [];

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return days.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayAttendance = weeklyAttendance.filter((a) =>
        a.recorded_at.startsWith(dateStr)
      );
      const uniqueUsers = new Set(dayAttendance.map((a) => a.user_id));

      return {
        day: format(day, 'EEE', { locale: idLocale }),
        hadir: uniqueUsers.size,
      };
    });
  }, [weeklyAttendance, employees]);

  // Not yet clocked in employees
  const notClockedIn = processedEmployees.filter(
    (e) => e.status === 'absent' || e.status === 'not_yet'
  );

  const handleRefresh = () => {
    refetchEmployees();
    refetchAttendance();
    refetchLeaves();
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
              <h1 className="text-2xl font-bold">Dashboard Analitik</h1>
              <p className="text-muted-foreground">
                {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  id="auto-refresh"
                />
                <label htmlFor="auto-refresh" className="text-sm text-muted-foreground cursor-pointer">
                  Auto-refresh
                </label>
                {autoRefresh && (
                  <Badge variant="outline" className="gap-1">
                    <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                    Live
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Holiday Banner */}
          {todayHoliday && (
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Palmtree className="h-6 w-6 text-purple-600" />
                  <div>
                    <p className="font-semibold text-purple-800">Hari Libur: {todayHoliday.name}</p>
                    <p className="text-sm text-purple-600">Semua karyawan libur hari ini</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.present}</p>
                    <p className="text-xs text-muted-foreground">Tepat Waktu</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.late}</p>
                    <p className="text-xs text-muted-foreground">Terlambat</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Coffee className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.on_leave}</p>
                    <p className="text-xs text-muted-foreground">Cuti/Izin</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.absent}</p>
                    <p className="text-xs text-muted-foreground">Tidak Hadir</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{statusCounts.not_yet}</p>
                    <p className="text-xs text-muted-foreground">Belum Absen</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Distribusi Kehadiran Hari Ini
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Legend />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Tren Kehadiran Minggu Ini
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyChartData}>
                      <XAxis dataKey="day" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="hadir" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Who hasn't clocked in */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Siapa yang Belum Masuk Hari Ini?
              </CardTitle>
              <CardDescription>
                Karyawan yang belum absen atau tidak hadir
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : notClockedIn.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <p className="text-muted-foreground">Semua karyawan sudah absen!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Departemen</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notClockedIn.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.full_name}</TableCell>
                          <TableCell>{emp.email}</TableCell>
                          <TableCell>{emp.department || '-'}</TableCell>
                          <TableCell>
                            {emp.status === 'not_yet' ? (
                              <Badge variant="outline">
                                <Clock className="h-3 w-3 mr-1" />
                                Belum Absen
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                Tidak Hadir
                              </Badge>
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

          {/* Last Updated */}
          <div className="text-center text-sm text-muted-foreground">
            Terakhir diperbarui: {format(lastRefreshTime, 'HH:mm:ss')}
            {autoRefresh && ' • Auto-refresh setiap 30 detik'}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminAnalytics;
