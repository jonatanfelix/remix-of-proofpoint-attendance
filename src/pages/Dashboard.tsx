import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/layout/Header';
import StatusCard from '@/components/attendance/StatusCard';
import AttendanceButtons from '@/components/attendance/AttendanceButtons';
import RecentHistory from '@/components/attendance/RecentHistory';
import CameraCapture from '@/components/attendance/CameraCapture';
import { getCurrentPosition, GeolocationError } from '@/lib/geolocation';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AttendanceRecord {
  id: string;
  record_type: 'clock_in' | 'clock_out';
  recorded_at: string;
  photo_url: string | null;
}

interface ProfileData {
  full_name: string;
}

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

  // Fetch user profile for camera watermark
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data as ProfileData | null;
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

  // Get current attendance status
  const getAttendanceStatus = useCallback(() => {
    if (!recentRecords || recentRecords.length === 0) return 'not_present';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = recentRecords.filter((r) => {
      const recordDate = new Date(r.recorded_at);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    if (todayRecords.length === 0) return 'not_present';

    const lastRecord = todayRecords[0];
    return lastRecord.record_type === 'clock_in' ? 'clocked_in' : 'clocked_out';
  }, [recentRecords]);

  const status = getAttendanceStatus();

  const lastClockIn = recentRecords?.find((r) => r.record_type === 'clock_in');
  const lastClockOut = recentRecords?.find((r) => r.record_type === 'clock_out');

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

  // Clock in/out mutation
  const attendanceMutation = useMutation({
    mutationFn: async ({ recordType, photoUrl }: { recordType: 'clock_in' | 'clock_out'; photoUrl: string | null }) => {
      if (!user?.id || !currentPosition) {
        throw new Error('Lokasi belum tersedia. Silakan refresh lokasi.');
      }

      if (!photoUrl) {
        throw new Error('Foto wajib diambil untuk absensi.');
      }

      const { error } = await supabase.from('attendance_records').insert({
        user_id: user.id,
        location_id: null,
        record_type: recordType,
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        accuracy_meters: currentPosition.accuracy,
        recorded_at: new Date().toISOString(),
        photo_url: photoUrl,
      });

      if (error) throw error;
    },
    onSuccess: (_, { recordType }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      toast({
        title: recordType === 'clock_in' ? 'Berhasil Clock In!' : 'Berhasil Clock Out!',
        description: `Tercatat pada ${new Date().toLocaleTimeString()}`,
      });
    },
    onError: (error) => {
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

  // No geofencing - can clock in/out from anywhere as long as we have GPS
  const canClockIn = currentPosition !== null && status !== 'clocked_in';
  const canClockOut = currentPosition !== null && status === 'clocked_in';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-6">
          {/* Status Card */}
          <StatusCard
            status={status}
            lastClockIn={lastClockIn ? new Date(lastClockIn.recorded_at) : null}
            lastClockOut={lastClockOut ? new Date(lastClockOut.recorded_at) : null}
          />

          {/* GPS Status (simplified - no geofencing) */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${currentPosition ? 'bg-primary/10' : 'bg-muted'}`}>
                    <MapPin className={`h-5 w-5 ${currentPosition ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
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
                        ? `Akurasi: ${Math.round(currentPosition.accuracy)}m`
                        : 'Klik refresh untuk mendapatkan lokasi'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={refreshLocation}
                  disabled={locationLoading}
                  className="border-2 border-foreground"
                >
                  <RefreshCw className={`h-4 w-4 ${locationLoading ? 'animate-spin' : ''}`} />
                </Button>
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
          <RecentHistory
            records={recentRecords || []}
            isLoading={recordsLoading}
          />
        </div>
      </main>

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
        />
      )}
    </div>
  );
};

export default Dashboard;
