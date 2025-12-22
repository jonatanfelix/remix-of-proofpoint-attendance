import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search, Calendar, Users, Clock, MapPin, Image, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface AttendanceRecord {
  id: string;
  record_type: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  photo_url: string | null;
  user_id: string;
}

interface AttendanceWithProfile extends AttendanceRecord {
  profiles: {
    full_name: string;
    email: string;
  } | null;
}

interface DailyAttendance {
  date: string;
  name: string;
  email: string;
  clockInTime: string | null;
  clockInPhoto: string | null;
  clockInLocation: string | null;
  clockOutTime: string | null;
  clockOutPhoto: string | null;
  clockOutLocation: string | null;
}

const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Fetch all attendance records (admin only)
  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['admin-attendance', searchTerm, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('attendance_records')
        .select('*')
        .order('recorded_at', { ascending: false });

      if (startDate) {
        query = query.gte('recorded_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('recorded_at', `${endDate}T23:59:59`);
      }

      const { data: attendanceData, error } = await query;
      if (error) throw error;

      // Fetch profiles for all unique user_ids
      const userIds = [...new Set(attendanceData.map((r) => r.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, { full_name: p.full_name, email: p.email }])
      );

      // Combine data
      let combined: AttendanceWithProfile[] = attendanceData.map((r) => ({
        ...r,
        profiles: profilesMap.get(r.user_id) || null,
      }));

      // Filter by search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        combined = combined.filter(
          (r) =>
            r.profiles?.full_name?.toLowerCase().includes(term) ||
            r.profiles?.email?.toLowerCase().includes(term)
        );
      }

      return combined;
    },
    enabled: userRole === 'admin',
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: totalEmployees } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: todayRecords } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .gte('recorded_at', today.toISOString());

      const { count: totalLocations } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      return {
        totalEmployees: totalEmployees || 0,
        todayRecords: todayRecords || 0,
        totalLocations: totalLocations || 0,
      };
    },
    enabled: userRole === 'admin',
  });

  // Transform records to daily format for export
  const transformToDaily = (data: AttendanceWithProfile[]): DailyAttendance[] => {
    const dailyMap = new Map<string, DailyAttendance>();

    data.forEach((record) => {
      const date = format(new Date(record.recorded_at), 'dd-MM-yyyy');
      const name = record.profiles?.full_name || 'Unknown';
      const key = `${date}-${record.user_id}`;

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          date,
          name,
          email: record.profiles?.email || '',
          clockInTime: null,
          clockInPhoto: null,
          clockInLocation: null,
          clockOutTime: null,
          clockOutPhoto: null,
          clockOutLocation: null,
        });
      }

      const entry = dailyMap.get(key)!;
      const time = format(new Date(record.recorded_at), 'HH:mm:ss');
      const location = `${record.latitude.toFixed(6)},${record.longitude.toFixed(6)}`;

      if (record.record_type === 'clock_in') {
        entry.clockInTime = time;
        entry.clockInPhoto = record.photo_url || '';
        entry.clockInLocation = location;
      } else {
        entry.clockOutTime = time;
        entry.clockOutPhoto = record.photo_url || '';
        entry.clockOutLocation = location;
      }
    });

    // Sort by date and name
    return Array.from(dailyMap.values()).sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
  };

  const exportToXLSX = () => {
    if (!records || records.length === 0) return;

    const dailyData = transformToDaily(records);

    // Create worksheet data
    const wsData = [
      ['Tanggal', 'Nama', 'Scan Masuk', 'Bukti Foto (Masuk)', 'Bukti Lokasi (Masuk)', 'Scan Pulang', 'Bukti Foto (Pulang)', 'Bukti Lokasi (Pulang)'],
      ...dailyData.map((row) => [
        row.date,
        row.name,
        row.clockInTime || '-',
        row.clockInPhoto || '-',
        row.clockInLocation || '-',
        row.clockOutTime || '-',
        row.clockOutPhoto || '-',
        row.clockOutLocation || '-',
      ]),
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Tanggal
      { wch: 20 }, // Nama
      { wch: 12 }, // Scan Masuk
      { wch: 50 }, // Bukti Foto (Masuk)
      { wch: 25 }, // Bukti Lokasi (Masuk)
      { wch: 12 }, // Scan Pulang
      { wch: 50 }, // Bukti Foto (Pulang)
      { wch: 25 }, // Bukti Lokasi (Pulang)
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Absensi');

    // Generate filename with date range
    const dateRange = startDate && endDate 
      ? `${startDate}_${endDate}` 
      : format(new Date(), 'yyyy-MM-dd');
    
    XLSX.writeFile(wb, `Laporan_Absensi_${dateRange}.xlsx`);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto max-w-2xl px-4 py-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive mb-4">Akses Ditolak</p>
              <p className="text-muted-foreground mb-4">
                Anda tidak memiliki izin untuk melihat halaman ini.
              </p>
              <Button onClick={() => navigate('/')}>Kembali ke Dashboard</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Transform records for display
  const dailyRecords = records ? transformToDaily(records) : [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto max-w-7xl px-4 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Kelola data absensi karyawan</p>
            </div>
            <Button onClick={exportToXLSX} disabled={!records?.length} className="border-2 border-foreground">
              <Download className="h-4 w-4 mr-2" />
              Export XLSX
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.totalEmployees || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Karyawan</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.todayRecords || 0}</p>
                    <p className="text-sm text-muted-foreground">Absensi Hari Ini</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.totalLocations || 0}</p>
                    <p className="text-sm text-muted-foreground">Lokasi Aktif</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Cari Karyawan</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Nama atau email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Tanggal Mulai</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Tanggal Akhir</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Absensi</CardTitle>
            </CardHeader>
            <CardContent>
              {recordsLoading ? (
                <p className="text-center py-8 text-muted-foreground">Memuat data...</p>
              ) : !dailyRecords?.length ? (
                <p className="text-center py-8 text-muted-foreground">Tidak ada data</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Scan Masuk</TableHead>
                        <TableHead>Bukti Foto</TableHead>
                        <TableHead>Lokasi Masuk</TableHead>
                        <TableHead>Scan Pulang</TableHead>
                        <TableHead>Bukti Foto</TableHead>
                        <TableHead>Lokasi Pulang</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyRecords.map((record, idx) => (
                        <TableRow key={`${record.date}-${record.name}-${idx}`}>
                          <TableCell className="font-medium">{record.date}</TableCell>
                          <TableCell>{record.name}</TableCell>
                          <TableCell>
                            {record.clockInTime ? (
                              <Badge variant="default">{record.clockInTime}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.clockInPhoto ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(record.clockInPhoto!, '_blank')}
                              >
                                <Image className="h-4 w-4 mr-1" />
                                Lihat
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.clockInLocation ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`https://www.google.com/maps?q=${record.clockInLocation}`, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Maps
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.clockOutTime ? (
                              <Badge variant="secondary">{record.clockOutTime}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.clockOutPhoto ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(record.clockOutPhoto!, '_blank')}
                              >
                                <Image className="h-4 w-4 mr-1" />
                                Lihat
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.clockOutLocation ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`https://www.google.com/maps?q=${record.clockOutLocation}`, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Maps
                              </Button>
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
      </main>
    </div>
  );
};

export default Admin;
