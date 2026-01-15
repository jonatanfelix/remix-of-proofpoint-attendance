import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { CalendarIcon, Clock, RefreshCw, LogIn, LogOut, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceRecord {
  id: string;
  record_type: 'clock_in' | 'clock_out';
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  photo_url: string | null;
}

const History = () => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  const startDate = startOfMonth(selectedMonth);
  const endDate = endOfMonth(selectedMonth);

  const { data: records, isLoading } = useQuery({
    queryKey: ['attendance-history', user?.id, format(startDate, 'yyyy-MM'), format(endDate, 'yyyy-MM')],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('recorded_at', startDate.toISOString())
        .lte('recorded_at', endDate.toISOString())
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!user?.id,
  });

  // Group records by date
  const groupedRecords = records?.reduce((acc, record) => {
    const dateKey = format(parseISO(record.recorded_at), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>) || {};

  const sortedDates = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a));

  return (
    <AppLayout>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Riwayat Absensi</h1>
          </div>

          {/* Month Selector */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pilih Bulan</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="border-2 border-foreground">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(selectedMonth, 'MMMM yyyy', { locale: localeID })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={selectedMonth}
                      onSelect={(date) => date && setSelectedMonth(date)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Stats Summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-3xl font-bold text-primary">
                  {records?.filter(r => r.record_type === 'clock_in').length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Total Clock In</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-3xl font-bold text-destructive">
                  {records?.filter(r => r.record_type === 'clock_out').length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Total Clock Out</p>
              </CardContent>
            </Card>
          </div>

          {/* Records List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Detail Absensi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sortedDates.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    Tidak ada data absensi di bulan ini
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedDates.map((dateKey) => (
                    <div key={dateKey} className="border rounded-lg p-4">
                      <p className="font-medium mb-3">
                        {format(parseISO(dateKey), 'EEEE, d MMMM yyyy', { locale: localeID })}
                      </p>
                      <div className="space-y-2">
                        {groupedRecords[dateKey].map((record) => (
                          <div
                            key={record.id}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-md',
                              record.record_type === 'clock_in'
                                ? 'bg-primary/10'
                                : 'bg-destructive/10'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              {record.record_type === 'clock_in' ? (
                                <LogIn className="h-5 w-5 text-primary" />
                              ) : (
                                <LogOut className="h-5 w-5 text-destructive" />
                              )}
                              <div>
                                <Badge
                                  variant={record.record_type === 'clock_in' ? 'default' : 'destructive'}
                                >
                                  {record.record_type === 'clock_in' ? 'Clock In' : 'Clock Out'}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                {format(parseISO(record.recorded_at), 'HH:mm')}
                              </p>
                              {record.accuracy_meters && (
                                <p className="text-xs text-muted-foreground">
                                  ±{Math.round(record.accuracy_meters)}m
                                </p>
                              )}
                              {record.photo_url && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 text-xs mt-1"
                                  onClick={() => window.open(record.photo_url || '', '_blank')}
                                >
                                  Lihat Foto
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default History;