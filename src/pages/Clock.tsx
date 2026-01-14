import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import StatusCard from '@/components/attendance/StatusCard';
import AttendanceButtons from '@/components/attendance/AttendanceButtons';
import CameraCapture, { preloadFaceDetector } from '@/components/attendance/CameraCapture';
import LocationMap from '@/components/attendance/LocationMap';
import GoogleMapsLink from '@/components/GoogleMapsLink';
import { getCurrentPosition, GeolocationError, calculateDistance } from '@/lib/geolocation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { type RecordType, type AttendanceStatus } from '@/components/attendance/AttendanceButtons';

interface AttendanceRecord {
  id: string;
  record_type: RecordType;
  recorded_at: string;
  photo_url: string | null;
}

interface ShiftData {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  working_days: number[];
}

interface ProfileData {
  full_name: string;
  requires_geofence: boolean;
  company_id: string | null;
  employee_type: 'office' | 'field';
  shift_id: string | null;
  shift?: ShiftData | null;
}

interface CompanySettings {
  id: string;
  name: string;
  office_latitude: number | null;
  office_longitude: number | null;
  radius_meters: number;
  work_start_time: string;
  grace_period_minutes: number;
}

const Clock = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [pendingRecordType, setPendingRecordType] = useState<RecordType | null>(null);

  // Fetch user profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          full_name, 
          requires_geofence, 
          company_id, 
          employee_type, 
          shift_id,
          shift:shifts(id, name, start_time, end_time, working_days)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data as ProfileData | null;
    },
    enabled: !!user?.id,
  });

  // Fetch company settings based on user's company_id
  const { data: company } = useQuery({
    queryKey: ['company-settings', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .maybeSingle();

      if (error) return null;
      return data as CompanySettings | null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  // Fetch recent attendance records
  const { data: recentRecords } = useQuery({
    queryKey: ['attendance-records', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!user?.id,
  });

  // Track current date - updates when day changes
  const [currentDateKey, setCurrentDateKey] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  });

  // Check for date change every minute
  useEffect(() => {
    const checkDateChange = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newDateKey = today.getTime();
      if (newDateKey !== currentDateKey) {
        setCurrentDateKey(newDateKey);
        // Refresh attendance records when date changes
        queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      }
    };

    const interval = setInterval(checkDateChange, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [currentDateKey, queryClient]);

  const todayDateString = currentDateKey;

  const status = useMemo((): AttendanceStatus => {
    if (!recentRecords || recentRecords.length === 0) return 'not_present';

    const todayRecords = recentRecords.filter((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString;
    });

    if (todayRecords.length === 0) return 'not_present';

    const lastRecord = todayRecords[0];
    if (lastRecord.record_type === 'clock_out') return 'clocked_out';
    if (lastRecord.record_type === 'break_out') return 'on_break';
    if (lastRecord.record_type === 'clock_in' || lastRecord.record_type === 'break_in') return 'clocked_in';
    return 'not_present';
  }, [recentRecords, todayDateString]);

  const todayClockIn = useMemo(() => {
    if (!recentRecords) return null;
    
    return recentRecords.find((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString && r.record_type === 'clock_in';
    });
  }, [recentRecords, todayDateString]);

  // Get today's last clock in/out specifically
  const todayLastClockIn = useMemo(() => {
    if (!recentRecords) return null;
    return recentRecords.find((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString && r.record_type === 'clock_in';
    });
  }, [recentRecords, todayDateString]);

  const todayLastClockOut = useMemo(() => {
    if (!recentRecords) return null;
    return recentRecords.find((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString && r.record_type === 'clock_out';
    });
  }, [recentRecords, todayDateString]);

  // Check if today is a working day for this user's shift
  const isTodayWorkingDay = useMemo(() => {
    if (!profile?.shift?.working_days) return true; // No shift = allow
    const todayDayOfWeek = new Date().getDay();
    return profile.shift.working_days.includes(todayDayOfWeek);
  }, [profile?.shift?.working_days]);

  const effectiveWorkStartTime = useMemo(() => {
    if (profile?.shift?.start_time) return profile.shift.start_time;
    if (company?.work_start_time) return company.work_start_time;
    return '08:00:00';
  }, [profile?.shift?.start_time, company?.work_start_time]);

  // Calculate lateness - ONLY for office employees, considering grace period
  const gracePeriodMinutes = company?.grace_period_minutes || 0;
  
  const calculateLateness = useCallback((checkCurrentTime: boolean = false) => {
    // If profile not loaded yet, don't calculate lateness
    if (!profile) {
      return { isLate: false, lateMinutes: 0 };
    }
    
    // Field employees don't have lateness - they work based on duration
    if (profile.employee_type === 'field') {
      return { isLate: false, lateMinutes: 0 };
    }

    const now = new Date();
    const [hours, minutes] = effectiveWorkStartTime.split(':').map(Number);
    
    const workStartToday = new Date(now);
    workStartToday.setHours(hours, minutes, 0, 0);

    // Add grace period to work start time
    const graceEndTime = new Date(workStartToday.getTime() + gracePeriodMinutes * 60000);

    if (checkCurrentTime) {
      const diffMs = now.getTime() - graceEndTime.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      return {
        isLate: diffMinutes > 0,
        lateMinutes: diffMinutes > 0 ? diffMinutes : 0,
      };
    }

    if (!todayClockIn) return { isLate: false, lateMinutes: 0 };

    const clockInTime = new Date(todayClockIn.recorded_at);
    const diffMs = clockInTime.getTime() - graceEndTime.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    return {
      isLate: diffMinutes > 0,
      lateMinutes: diffMinutes > 0 ? diffMinutes : 0,
    };
  }, [todayClockIn, effectiveWorkStartTime, profile, gracePeriodMinutes]);

  const { isLate, lateMinutes } = calculateLateness(false);
  const currentTimeLateness = calculateLateness(true);

  const refreshLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);

    try {
      const position = await getCurrentPosition();
      setCurrentPosition(position);
    } catch (err) {
      const error = err as GeolocationError;
      setLocationError(error.message);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // Pre-load face detection model when Clock page loads
  useEffect(() => {
    console.log('Pre-loading face detection model...');
    preloadFaceDetector()
      .then(() => console.log('Face detection model pre-loaded successfully'))
      .catch((err) => console.error('Failed to pre-load face detection model:', err));
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // Upload photo with retry mechanism
  const uploadPhoto = async (imageDataUrl: string, recordType: RecordType, maxRetries = 3): Promise<string | null> => {
    const base64Data = imageDataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const fileName = `${user?.id}/${Date.now()}_${recordType}.jpg`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { error } = await supabase.storage
          .from('attendance-photos')
          .upload(fileName, blob, { contentType: 'image/jpeg' });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('attendance-photos')
          .getPublicUrl(fileName);

        return urlData.publicUrl;
      } catch (err) {
        console.error(`Photo upload attempt ${attempt + 1} failed:`, err);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    return null;
  };

  const attendanceMutation = useMutation({
    mutationFn: async ({ recordType, photoUrl }: { recordType: RecordType; photoUrl: string | null }) => {
      if (!user?.id || !currentPosition) {
        throw new Error('Lokasi belum tersedia. Silakan refresh lokasi.');
      }

      if (!photoUrl) {
        throw new Error('Foto wajib diambil untuk absensi.');
      }

      const { data, error } = await supabase.functions.invoke('clock-attendance', {
        body: {
          record_type: recordType,
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          accuracy_meters: currentPosition.accuracy,
          photo_url: photoUrl,
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      setShowCamera(false);
      toast({
        title: data?.message || 'Berhasil!',
        description: `Tercatat pada ${new Date().toLocaleTimeString()}`,
      });
    },
    onError: (error: Error) => {
      setShowCamera(false);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mencatat absensi',
        variant: 'destructive',
      });
    },
  });

  const handleAction = (recordType: RecordType) => {
    if (!currentPosition) {
      toast({
        title: 'Lokasi Diperlukan',
        description: 'Silakan tunggu atau refresh lokasi terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    // Check working days for clock_in only
    if (recordType === 'clock_in' && !isTodayWorkingDay) {
      toast({
        title: 'Hari Libur Shift',
        description: `Hari ini bukan hari kerja untuk shift ${profile?.shift?.name || 'Anda'}.`,
        variant: 'destructive',
      });
      return;
    }

    if (profile?.requires_geofence && company?.office_latitude && company?.office_longitude) {
      const distance = calculateDistance(
        currentPosition.latitude,
        currentPosition.longitude,
        company.office_latitude,
        company.office_longitude
      );

      if (distance > company.radius_meters) {
        toast({
          title: 'Di Luar Jangkauan',
          description: `Anda berada ${Math.round(distance)}m dari kantor. Maksimal ${company.radius_meters}m untuk absen.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setPendingRecordType(recordType);
    setShowCamera(true);
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    if (!pendingRecordType) return;

    const photoUrl = await uploadPhoto(imageDataUrl, pendingRecordType);

    if (!photoUrl) {
      toast({
        title: 'Error',
        description: 'Gagal mengupload foto setelah 3 percobaan. Silakan coba lagi.',
        variant: 'destructive',
      });
      setShowCamera(false);
      setPendingRecordType(null);
      return;
    }

    // Submit attendance record - camera will close via onSuccess/onError
    const recordType = pendingRecordType;
    setPendingRecordType(null);
    attendanceMutation.mutate({ recordType, photoUrl });
  };

  const handleCameraClose = () => {
    if (!attendanceMutation.isPending) {
      setShowCamera(false);
      setPendingRecordType(null);
    }
  };

  const distanceToOffice =
    currentPosition && company?.office_latitude && company?.office_longitude
      ? calculateDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          company.office_latitude,
          company.office_longitude
        )
      : null;

  const isWithinGeofence =
    distanceToOffice !== null && company ? distanceToOffice <= company.radius_meters : true;

  const geofenceCheck = () => {
    if (!profile?.requires_geofence) return true;
    if (!company?.office_latitude || !company?.office_longitude) return true;
    return isWithinGeofence;
  };
  const canPerformAction = currentPosition !== null && geofenceCheck();

  if (profileLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Memuat...</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Clock In/Out</h1>

          {/* Status Card */}
          <StatusCard
            status={status}
            lastClockIn={todayLastClockIn ? new Date(todayLastClockIn.recorded_at) : null}
            lastClockOut={todayLastClockOut ? new Date(todayLastClockOut.recorded_at) : null}
            isLate={isLate}
            lateMinutes={lateMinutes}
            workStartTime={effectiveWorkStartTime}
            employeeType={profile?.employee_type || 'office'}
            shiftName={profile?.shift?.name}
          />

          {/* Geofence Status */}
          {profile && (
            <Card className={profile.requires_geofence ? 'border-2 border-primary' : 'border-2 border-muted'}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {profile.requires_geofence ? (
                      <>
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Wajib Absen di Kantor</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Bebas Lokasi</span>
                      </>
                    )}
                  </div>
                  {profile.requires_geofence && distanceToOffice !== null && (
                    <Badge variant={isWithinGeofence ? 'default' : 'destructive'}>
                      {isWithinGeofence ? '✓ Dalam Jangkauan' : `${Math.round(distanceToOffice)}m dari kantor`}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning if outside geofence */}
          {profile?.requires_geofence && !isWithinGeofence && distanceToOffice !== null && (
            <Card className="border-2 border-destructive bg-destructive/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Di Luar Jangkauan Kantor</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Anda berada {Math.round(distanceToOffice)}m dari kantor. 
                      Maksimal {company?.radius_meters || 100}m untuk bisa absen.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* GPS Status dengan Peta */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Lokasi Anda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentPosition ? (
                <LocationMap
                  latitude={currentPosition.latitude}
                  longitude={currentPosition.longitude}
                  accuracy={currentPosition.accuracy}
                />
              ) : locationError ? (
                <Card className="border-2 border-destructive bg-destructive/5">
                  <CardContent className="py-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                      <AlertTriangle className="h-10 w-10 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">GPS Tidak Tersedia</p>
                        <p className="text-sm text-muted-foreground mt-1">{locationError}</p>
                      </div>
                      <Button onClick={refreshLocation} disabled={locationLoading} className="mt-2">
                        <RefreshCw className={`h-4 w-4 mr-2 ${locationLoading ? 'animate-spin' : ''}`} />
                        Coba Lagi
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="w-full h-48 rounded-lg border-2 border-dashed border-foreground/20 flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground text-sm">
                    {locationLoading ? 'Mendapatkan lokasi...' : 'Lokasi belum tersedia'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {locationLoading
                        ? 'Mendapatkan lokasi...'
                        : locationError
                        ? 'Lokasi Error'
                        : currentPosition
                        ? 'Lokasi Tersedia'
                        : 'Lokasi Belum Tersedia'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {locationError
                        ? locationError
                        : currentPosition
                        ? `Akurasi: ±${Math.round(currentPosition.accuracy)}m`
                        : 'Klik tombol Update Lokasi'}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    onClick={refreshLocation}
                    disabled={locationLoading}
                    className="border-2 border-foreground shrink-0"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${locationLoading ? 'animate-spin' : ''}`} />
                    Update
                  </Button>
                </div>

                {currentPosition && (
                  <div className="flex flex-wrap gap-2">
                    <GoogleMapsLink
                      query={`${currentPosition.latitude},${currentPosition.longitude}`}
                      className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium border-2 border-foreground bg-background hover:bg-accent hover:text-accent-foreground rounded-md"
                      title="Buka di Google Maps"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Buka di Google Maps
                    </GoogleMapsLink>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-2 border-foreground"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `${currentPosition.latitude},${currentPosition.longitude}`
                          );
                          toast({ title: 'Disalin', description: 'Koordinat berhasil disalin.' });
                        } catch {
                          toast({ title: 'Gagal', description: 'Tidak bisa menyalin koordinat.', variant: 'destructive' });
                        }
                      }}
                    >
                      Salin Koordinat
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Attendance Buttons */}
          <AttendanceButtons
            status={status}
            isSubmitting={attendanceMutation.isPending}
            canPerformAction={canPerformAction}
            onAction={handleAction}
          />
        </div>

        {/* Camera Capture Modal */}
        {currentPosition && (
          <CameraCapture
            isOpen={showCamera}
            onClose={handleCameraClose}
            onCapture={handleCameraCapture}
            employeeName={profile?.full_name || user?.email || 'Employee'}
            recordType={
              pendingRecordType === 'clock_in' ? 'CLOCK IN' :
              pendingRecordType === 'clock_out' ? 'CLOCK OUT' :
              pendingRecordType === 'break_out' ? 'ISTIRAHAT KELUAR' :
              pendingRecordType === 'break_in' ? 'KEMBALI ISTIRAHAT' : 'ABSENSI'
            }
            latitude={currentPosition.latitude}
            longitude={currentPosition.longitude}
            isLate={pendingRecordType === 'clock_in' ? currentTimeLateness.isLate : false}
            lateMinutes={pendingRecordType === 'clock_in' ? currentTimeLateness.lateMinutes : 0}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default Clock;