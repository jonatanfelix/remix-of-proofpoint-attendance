import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import StatusCard from '@/components/attendance/StatusCard';
import AttendanceButtons from '@/components/attendance/AttendanceButtons';
import RecentHistory from '@/components/attendance/RecentHistory';
import CameraCapture from '@/components/attendance/CameraCapture';
import LocationMap from '@/components/attendance/LocationMap';
import GoogleMapsLink from '@/components/GoogleMapsLink';
import { getCurrentPosition, GeolocationError } from '@/lib/geolocation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AttendanceRecord {
  id: string;
  record_type: 'clock_in' | 'clock_out';
  recorded_at: string;
  photo_url: string | null;
}

interface ShiftData {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
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
}

// Calculate distance between two coordinates in meters (Haversine formula)
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const Dashboard = () => {
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

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [pendingRecordType, setPendingRecordType] = useState<'clock_in' | 'clock_out' | null>(null);

  // Fetch user profile with geofence settings and shift info
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
          shift:shifts(id, name, start_time, end_time)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data as ProfileData | null;
    },
    enabled: !!user?.id,
  });

  // Fetch company settings
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return data as CompanySettings | null;
    },
    enabled: !!user?.id,
  });

  // Fetch recent attendance records
  const { data: recentRecords, isLoading: recordsLoading } = useQuery({
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

  // Memoize today's date string to avoid recalculating every render
  // This will update if the component remounts (e.g., page refresh)
  const todayDateString = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }, []);

  // Get current attendance status
  const status = useMemo(() => {
    if (!recentRecords || recentRecords.length === 0) return 'not_present';

    const todayRecords = recentRecords.filter((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString;
    });

    if (todayRecords.length === 0) return 'not_present';

    const lastRecord = todayRecords[0];
    return lastRecord.record_type === 'clock_in' ? 'clocked_in' : 'clocked_out';
  }, [recentRecords, todayDateString]);

  // Get today's clock in record specifically
  const todayClockIn = useMemo(() => {
    if (!recentRecords) return null;
    
    return recentRecords.find((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === todayDateString && r.record_type === 'clock_in';
    });
  }, [recentRecords, todayDateString]);

  const lastClockIn = recentRecords?.find((r) => r.record_type === 'clock_in');
  const lastClockOut = recentRecords?.find((r) => r.record_type === 'clock_out');

  // Get effective work start time: prefer user's shift, fallback to company default
  const effectiveWorkStartTime = useMemo(() => {
    // Priority 1: User's assigned shift start_time
    if (profile?.shift?.start_time) {
      return profile.shift.start_time;
    }
    // Priority 2: Company default work_start_time
    if (company?.work_start_time) {
      return company.work_start_time;
    }
    // Fallback: 08:00
    return '08:00:00';
  }, [profile?.shift?.start_time, company?.work_start_time]);

  // Calculate lateness based on existing clock-in or current time for new clock-in
  const calculateLateness = useCallback((checkCurrentTime: boolean = false) => {
    const now = new Date();
    const [hours, minutes] = effectiveWorkStartTime.split(':').map(Number);
    
    const workStartToday = new Date(now);
    workStartToday.setHours(hours, minutes, 0, 0);

    // If checking current time (for camera preview) or already have clock-in
    if (checkCurrentTime) {
      const diffMs = now.getTime() - workStartToday.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      return {
        isLate: diffMinutes > 0,
        lateMinutes: diffMinutes > 0 ? diffMinutes : 0,
      };
    }

    // Check existing clock-in record
    if (!todayClockIn) return { isLate: false, lateMinutes: 0 };

    const clockInTime = new Date(todayClockIn.recorded_at);
    const diffMs = clockInTime.getTime() - workStartToday.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    return {
      isLate: diffMinutes > 0,
      lateMinutes: diffMinutes > 0 ? diffMinutes : 0,
    };
  }, [todayClockIn, effectiveWorkStartTime]);

  // For status card - show lateness from existing record
  const { isLate, lateMinutes } = calculateLateness(false);
  
  // For camera preview - check current time lateness
  const currentTimeLateness = calculateLateness(true);

  // Refresh location (just get GPS, no geofencing check)
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

  // Initial location fetch
  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // Upload photo to storage
  const uploadPhoto = async (imageDataUrl: string, recordType: 'clock_in' | 'clock_out'): Promise<string | null> => {
    try {
      // Convert base64 to blob
      const base64Data = imageDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      // Generate unique filename
      const fileName = `${user?.id}/${Date.now()}_${recordType}.jpg`;

      const { error } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (err) {
      console.error('Photo upload error:', err);
      return null;
    }
  };

  // Clock in/out mutation - now uses backend edge function for security
  const attendanceMutation = useMutation({
    mutationFn: async ({ recordType, photoUrl }: { recordType: 'clock_in' | 'clock_out'; photoUrl: string | null }) => {
      if (!user?.id || !currentPosition) {
        throw new Error('Lokasi belum tersedia. Silakan refresh lokasi.');
      }

      if (!photoUrl) {
        throw new Error('Foto wajib diambil untuk absensi.');
      }

      // Call backend edge function for secure validation
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
      
      // Check for business logic errors from edge function
      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data, { recordType }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      toast({
        title: recordType === 'clock_in' ? 'Berhasil Clock In!' : 'Berhasil Clock Out!',
        description: `Tercatat pada ${new Date().toLocaleTimeString()}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Gagal mencatat absensi',
        variant: 'destructive',
      });
    },
  });

  const handleClockIn = () => {
    if (!currentPosition) {
      toast({
        title: 'Lokasi Diperlukan',
        description: 'Silakan tunggu atau refresh lokasi terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    // Check geofence if required
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

    setPendingRecordType('clock_in');
    setShowCamera(true);
  };

  const handleClockOut = () => {
    if (!currentPosition) {
      toast({
        title: 'Lokasi Diperlukan',
        description: 'Silakan tunggu atau refresh lokasi terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    // Check geofence if required (same logic for clock out)
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

    setPendingRecordType('clock_out');
    setShowCamera(true);
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    if (!pendingRecordType) return;

    // Upload photo first
    const photoUrl = await uploadPhoto(imageDataUrl, pendingRecordType);

    if (!photoUrl) {
      toast({
        title: 'Error',
        description: 'Gagal mengupload foto. Silakan coba lagi.',
        variant: 'destructive',
      });
      setShowCamera(false);
      setPendingRecordType(null);
      return;
    }

    // Submit attendance record
    attendanceMutation.mutate({ recordType: pendingRecordType, photoUrl });
    setPendingRecordType(null);
  };

  const handleCameraClose = () => {
    setShowCamera(false);
    setPendingRecordType(null);
  };

  // Calculate distance to office for display
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

  // Check if can clock in/out based on geofence requirements
  const geofenceCheck = () => {
    if (!profile?.requires_geofence) return true; // No geofence required
    if (!company?.office_latitude || !company?.office_longitude) return true; // No office location set
    return isWithinGeofence;
  };

  const canClockIn = currentPosition !== null && status !== 'clocked_in' && geofenceCheck();
  const canClockOut = currentPosition !== null && status === 'clocked_in' && geofenceCheck();

  // Show loading state while profile is being fetched
  if (profileLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Memuat profil...</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show warning banner if no company assigned (but don't block the dashboard)
  // This should rarely happen since only admins can create users
  const showCompanyWarning = profile && !profile.company_id;

  return (
    <AppLayout>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-6">
          {/* Warning if no company assigned */}
          {showCompanyWarning && (
            <Card className="border-2 border-warning bg-warning/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Belum Terdaftar di Perusahaan</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Akun Anda belum terhubung ke perusahaan. Hubungi Admin untuk didaftarkan.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status Card */}
          <StatusCard
            status={status}
            lastClockIn={lastClockIn ? new Date(lastClockIn.recorded_at) : null}
            lastClockOut={lastClockOut ? new Date(lastClockOut.recorded_at) : null}
            isLate={isLate}
            lateMinutes={lateMinutes}
            workStartTime={effectiveWorkStartTime}
            employeeType={profile?.employee_type || 'office'}
            shiftName={profile?.shift?.name}
          />

          {/* Geofence Status Banner */}
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
              {/* Map */}
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
                        <p className="text-sm text-muted-foreground mt-1">
                          {locationError}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Pastikan GPS/Lokasi diaktifkan di pengaturan browser dan perangkat Anda.
                        </p>
                      </div>
                      <Button
                        onClick={refreshLocation}
                        disabled={locationLoading}
                        className="mt-2"
                      >
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

              {/* Location Info */}
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
                          toast({
                            title: 'Disalin',
                            description: 'Koordinat berhasil disalin.',
                          });
                        } catch {
                          toast({
                            title: 'Gagal',
                            description: 'Tidak bisa menyalin koordinat.',
                            variant: 'destructive',
                          });
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
            canClockIn={canClockIn}
            canClockOut={canClockOut}
            isSubmitting={attendanceMutation.isPending}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
          />

          {/* Recent History */}
          <RecentHistory records={recentRecords || []} isLoading={recordsLoading} />
        </div>

        {/* Camera Capture Modal - Required for attendance */}
        {currentPosition && (
          <CameraCapture
            isOpen={showCamera}
            onClose={handleCameraClose}
            onCapture={handleCameraCapture}
            employeeName={profile?.full_name || user?.email || 'Employee'}
            recordType={pendingRecordType === 'clock_in' ? 'CLOCK IN' : 'CLOCK OUT'}
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

export default Dashboard;
