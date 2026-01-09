import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentPosition } from '@/lib/geolocation';
import { 
  MapPin, Save, Building, Clock, Target, Loader2, Navigation, 
  Plus, Trash2, Edit, Check, X 
} from 'lucide-react';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  working_days: number[];
  break_duration_minutes: number;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Min', fullLabel: 'Minggu' },
  { value: 1, label: 'Sen', fullLabel: 'Senin' },
  { value: 2, label: 'Sel', fullLabel: 'Selasa' },
  { value: 3, label: 'Rab', fullLabel: 'Rabu' },
  { value: 4, label: 'Kam', fullLabel: 'Kamis' },
  { value: 5, label: 'Jum', fullLabel: 'Jumat' },
  { value: 6, label: 'Sab', fullLabel: 'Sabtu' },
];

// Fix for default marker icon
delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface CompanySettings {
  id: string;
  name: string;
  office_latitude: number | null;
  office_longitude: number | null;
  radius_meters: number;
  work_start_time: string;
  grace_period_minutes: number;
  annual_leave_quota: number;
  overtime_start_after_minutes: number;
  overtime_rate_per_hour: number;
  early_leave_deduction_per_minute: number;
}

const AdminSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radius, setRadius] = useState(100);
  const [workStartTime, setWorkStartTime] = useState('08:00');
  const [gracePeriod, setGracePeriod] = useState(0);
  const [annualLeaveQuota, setAnnualLeaveQuota] = useState(12);
  const [overtimeStartAfter, setOvertimeStartAfter] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(0);
  const [earlyLeaveDeduction, setEarlyLeaveDeduction] = useState(0);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const radiusRef = useRef(radius);
  const circleRef = useRef<L.Circle | null>(null);

  // Shift management state
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('08:00');
  const [newShiftEnd, setNewShiftEnd] = useState('17:00');
  const [newShiftWorkingDays, setNewShiftWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [newShiftBreakDuration, setNewShiftBreakDuration] = useState(60);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [editShiftWorkingDays, setEditShiftWorkingDays] = useState<number[]>([]);
  const [editShiftBreakDuration, setEditShiftBreakDuration] = useState(60);

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
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as CompanySettings | null;
    },
    enabled: isAdminOrDeveloper,
  });

  // Fetch shifts
  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Shift[];
    },
    enabled: isAdminOrDeveloper,
  });

  // Set initial values when company data loads
  useEffect(() => {
    if (company) {
      console.log('[AdminSettings] Company data loaded:', company);
      setCompanyName(company.name);
      setLatitude(company.office_latitude);
      setLongitude(company.office_longitude);
      setRadius(company.radius_meters);
      radiusRef.current = company.radius_meters;
      setWorkStartTime(company.work_start_time?.slice(0, 5) || '08:00');
      setGracePeriod(company.grace_period_minutes || 0);
      setAnnualLeaveQuota(company.annual_leave_quota || 12);
      setOvertimeStartAfter(company.overtime_start_after_minutes || 0);
      setOvertimeRate(company.overtime_rate_per_hour || 0);
      setEarlyLeaveDeduction(company.early_leave_deduction_per_minute || 0);
    }
  }, [company]);

  // Keep radiusRef in sync
  useEffect(() => {
    radiusRef.current = radius;
  }, [radius]);

  // Update company settings
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('Company not found');
      
      const { error } = await supabase
        .from('companies')
        .update({
          name: companyName,
          office_latitude: latitude,
          office_longitude: longitude,
          radius_meters: radius,
          work_start_time: workStartTime,
          grace_period_minutes: gracePeriod,
          annual_leave_quota: annualLeaveQuota,
          overtime_start_after_minutes: overtimeStartAfter,
          overtime_rate_per_hour: overtimeRate,
          early_leave_deduction_per_minute: earlyLeaveDeduction,
        })
        .eq('id', company.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Pengaturan berhasil disimpan!');
    },
    onError: (error) => {
      toast.error('Gagal menyimpan: ' + error.message);
    },
  });

  const handleLocationSelect = (lat: number, lng: number) => {
    console.log('[AdminSettings] handleLocationSelect called with:', lat, lng);
    setLatitude(lat);
    setLongitude(lng);
    toast.info(`Lokasi dipilih: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

    // Update marker and circle on map
    if (mapInstanceRef.current) {
      console.log('[AdminSettings] Updating map marker and circle');
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(mapInstanceRef.current);
      }

      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
      } else {
        circleRef.current = L.circle([lat, lng], {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          radius: radiusRef.current,
        }).addTo(mapInstanceRef.current);
      }

      mapInstanceRef.current.setView([lat, lng], 17);
    } else {
      console.log('[AdminSettings] Map instance not ready');
    }
  };

  // Get current location using GPS
  const handleUseMyLocation = async () => {
    setIsGettingLocation(true);

    try {
      const pos = await getCurrentPosition();
      console.log('[AdminSettings] GPS position:', pos);

      handleLocationSelect(pos.latitude, pos.longitude);

      const acc = Math.round(pos.accuracy);
      if (acc > 2000) {
        toast.warning(`Akurasi lokasi rendah (±${acc}m). Coba nyalakan GPS di HP atau pindah ke area terbuka.`);
      } else {
        toast.success(`Lokasi didapat dari GPS (akurasi ±${acc}m).`);
      }
    } catch (e: any) {
      console.error('[AdminSettings] GPS error:', e);
      toast.error(e?.message || 'Gagal mendapatkan lokasi dari GPS.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSave = () => {
    if (!companyName.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    updateMutation.mutate();
  };

  // Shift mutations
  const addShiftMutation = useMutation({
    mutationFn: async () => {
      if (!newShiftName.trim()) throw new Error('Nama shift harus diisi');
      if (newShiftWorkingDays.length === 0) throw new Error('Pilih minimal 1 hari kerja');
      
      const { error } = await supabase
        .from('shifts')
        .insert({
          name: newShiftName.trim(),
          start_time: newShiftStart,
          end_time: newShiftEnd,
          working_days: newShiftWorkingDays,
          break_duration_minutes: newShiftBreakDuration,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift berhasil ditambahkan!');
      setNewShiftName('');
      setNewShiftStart('08:00');
      setNewShiftEnd('17:00');
      setNewShiftWorkingDays([1, 2, 3, 4, 5]);
      setNewShiftBreakDuration(60);
    },
    onError: (error) => {
      toast.error('Gagal menambah shift: ' + error.message);
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async () => {
      if (!editingShift) return;
      
      const { error } = await supabase
        .from('shifts')
        .update({
          name: editShiftName.trim(),
          start_time: editShiftStart,
          end_time: editShiftEnd,
          working_days: editShiftWorkingDays,
          break_duration_minutes: editShiftBreakDuration,
        })
        .eq('id', editingShift.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift berhasil diperbarui!');
      setEditingShift(null);
    },
    onError: (error) => {
      toast.error('Gagal memperbarui shift: ' + error.message);
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', shiftId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift berhasil dihapus!');
    },
    onError: (error) => {
      toast.error('Gagal menghapus shift: ' + error.message);
    },
  });

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setEditShiftName(shift.name);
    setEditShiftStart(shift.start_time.slice(0, 5));
    setEditShiftEnd(shift.end_time.slice(0, 5));
    setEditShiftWorkingDays(shift.working_days || [1, 2, 3, 4, 5]);
    setEditShiftBreakDuration(shift.break_duration_minutes || 60);
  };

  const handleCancelEditShift = () => {
    setEditingShift(null);
    setEditShiftName('');
    setEditShiftStart('');
    setEditShiftEnd('');
    setEditShiftWorkingDays([]);
    setEditShiftBreakDuration(60);
  };

  const toggleWorkingDay = (day: number, isNew: boolean) => {
    if (isNew) {
      setNewShiftWorkingDays(prev => 
        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
      );
    } else {
      setEditShiftWorkingDays(prev => 
        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
      );
    }
  };

  // Initialize map only once, separately from data
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    console.log('[AdminSettings] Initializing map');
    
    // Default to Jakarta if no company location yet
    const defaultLat = -6.2088;
    const defaultLng = 106.8456;

    mapInstanceRef.current = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Add click handler - directly update state and map
    mapInstanceRef.current.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      console.log('[AdminSettings] Map clicked at:', lat, lng);
      
      // Update state
      setLatitude(lat);
      setLongitude(lng);
      toast.info(`Lokasi dipilih: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

      // Update marker
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else if (mapInstanceRef.current) {
        markerRef.current = L.marker([lat, lng]).addTo(mapInstanceRef.current);
      }

      // Update circle
      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
      } else if (mapInstanceRef.current) {
        circleRef.current = L.circle([lat, lng], {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          radius: radiusRef.current,
        }).addTo(mapInstanceRef.current);
      }

      mapInstanceRef.current?.setView([lat, lng], 17);
    });

    setMapReady(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  // Update map when company data loads
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || companyLoading) return;
    
    const centerLat = company?.office_latitude;
    const centerLng = company?.office_longitude;
    
    if (centerLat != null && centerLng != null) {
      console.log('[AdminSettings] Setting map to company location:', centerLat, centerLng);
      
      mapInstanceRef.current.setView([centerLat, centerLng], 17);

      // Add or update marker
      if (markerRef.current) {
        markerRef.current.setLatLng([centerLat, centerLng]);
      } else {
        markerRef.current = L.marker([centerLat, centerLng]).addTo(mapInstanceRef.current);
      }

      // Add or update circle
      if (circleRef.current) {
        circleRef.current.setLatLng([centerLat, centerLng]);
        circleRef.current.setRadius(company?.radius_meters ?? 100);
      } else {
        circleRef.current = L.circle([centerLat, centerLng], {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          radius: company?.radius_meters ?? 100,
        }).addTo(mapInstanceRef.current);
      }
    }
  }, [mapReady, company, companyLoading]);

  // Update circle radius when radius changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  // Loading state
  if (roleLoading || companyLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Memuat...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Not admin/developer - redirect
  if (!isAdminOrDeveloper) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pengaturan Perusahaan</h1>
          <p className="text-muted-foreground">Konfigurasi lokasi kantor dan jam kerja</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Company Info */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Informasi Perusahaan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Nama Perusahaan</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="PT. Contoh Indonesia"
                  className="border-2 border-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="work-start" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Jam Mulai Kerja Default
                </Label>
                <Input
                  id="work-start"
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Digunakan jika karyawan tidak memiliki shift
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grace-period">Toleransi Keterlambatan (menit)</Label>
                <Input
                  id="grace-period"
                  type="number"
                  min={0}
                  max={60}
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: 15 menit = tidak dihitung terlambat jika masuk s/d 08:15
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="radius" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Radius Geofence (meter)
                </Label>
                <Input
                  id="radius"
                  type="number"
                  min={50}
                  max={1000}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Jarak maksimal karyawan dari titik kantor untuk bisa absen
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Operational Settings */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pengaturan Operasional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="annual-leave">Kuota Cuti Tahunan (hari)</Label>
                <Input
                  id="annual-leave"
                  type="number"
                  min={0}
                  max={30}
                  value={annualLeaveQuota}
                  onChange={(e) => setAnnualLeaveQuota(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Jumlah hari cuti yang diberikan per karyawan per tahun
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="overtime-start">Lembur Mulai Setelah (menit)</Label>
                <Input
                  id="overtime-start"
                  type="number"
                  min={0}
                  value={overtimeStartAfter}
                  onChange={(e) => setOvertimeStartAfter(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Contoh: 30 = lembur dihitung setelah 30 menit dari jam pulang shift
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="overtime-rate">Rate Lembur per Jam (Rp)</Label>
                <Input
                  id="overtime-rate"
                  type="number"
                  min={0}
                  value={overtimeRate}
                  onChange={(e) => setOvertimeRate(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="early-leave">Potongan Pulang Awal per Menit (Rp)</Label>
                <Input
                  id="early-leave"
                  type="number"
                  min={0}
                  value={earlyLeaveDeduction}
                  onChange={(e) => setEarlyLeaveDeduction(Number(e.target.value))}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Isi 0 jika tidak ada potongan untuk pulang lebih awal
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Coordinates Display */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Koordinat Kantor
              </CardTitle>
              <CardDescription>
                Gunakan GPS atau klik pada peta untuk menentukan lokasi kantor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Use My Location Button */}
              <Button
                type="button"
                onClick={handleUseMyLocation}
                disabled={isGettingLocation}
                className="w-full border-2 border-foreground"
                variant="outline"
              >
                {isGettingLocation ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                {isGettingLocation ? 'Mendapatkan lokasi...' : 'Gunakan Lokasi Saya Saat Ini'}
              </Button>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="office-lat">Latitude</Label>
                  <Input
                    id="office-lat"
                    type="number"
                    inputMode="decimal"
                    step="0.000001"
                    value={latitude ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLatitude(v === '' ? null : Number(v));
                    }}
                    className="border-2 border-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-lng">Longitude</Label>
                  <Input
                    id="office-lng"
                    type="number"
                    inputMode="decimal"
                    step="0.000001"
                    value={longitude ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLongitude(v === '' ? null : Number(v));
                    }}
                    className="border-2 border-foreground"
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={latitude == null || longitude == null}
                onClick={() => {
                  if (latitude == null || longitude == null) return;
                  handleLocationSelect(latitude, longitude);
                }}
              >
                Terapkan Koordinat
              </Button>

              <p className="text-xs text-muted-foreground">
                Tips: jika GPS browser meleset (sering terjadi di laptop/PC), salin koordinat dari Google Maps lalu klik "Terapkan Koordinat".
              </p>

              {latitude && longitude && (
                <div className="p-3 rounded-lg bg-primary/10 border-2 border-primary">
                  <p className="text-sm font-medium text-primary">
                    ✓ Lokasi kantor sudah ditentukan
                  </p>
                </div>
              )}

              {!latitude || !longitude ? (
                <div className="p-3 rounded-lg bg-destructive/10 border-2 border-destructive">
                  <p className="text-sm font-medium text-destructive">
                    ⚠ Cari alamat atau klik peta untuk menentukan lokasi
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Shift Management */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Manajemen Shift
            </CardTitle>
            <CardDescription>
              Kelola shift kerja karyawan termasuk hari kerja dan durasi istirahat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new shift */}
            <div className="p-4 rounded-lg border-2 border-foreground bg-muted/30 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Nama shift (contoh: Pagi)"
                  value={newShiftName}
                  onChange={(e) => setNewShiftName(e.target.value)}
                  className="border-2 border-foreground flex-1"
                />
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Mulai:</Label>
                    <Input
                      type="time"
                      value={newShiftStart}
                      onChange={(e) => setNewShiftStart(e.target.value)}
                      className="border-2 border-foreground w-28"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Selesai:</Label>
                    <Input
                      type="time"
                      value={newShiftEnd}
                      onChange={(e) => setNewShiftEnd(e.target.value)}
                      className="border-2 border-foreground w-28"
                    />
                  </div>
                </div>
              </div>
              
              {/* Working days selection */}
              <div className="space-y-2">
                <Label className="text-xs">Hari Kerja:</Label>
                <div className="flex flex-wrap gap-1">
                  {DAYS_OF_WEEK.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      size="sm"
                      variant={newShiftWorkingDays.includes(day.value) ? 'default' : 'outline'}
                      className="h-8 px-2 text-xs border-2 border-foreground"
                      onClick={() => toggleWorkingDay(day.value, true)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Break duration */}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Durasi Istirahat:</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={newShiftBreakDuration}
                  onChange={(e) => setNewShiftBreakDuration(Number(e.target.value))}
                  className="border-2 border-foreground w-20"
                />
                <span className="text-xs text-muted-foreground">menit</span>
              </div>

              <Button 
                onClick={() => addShiftMutation.mutate()}
                disabled={addShiftMutation.isPending || !newShiftName.trim() || newShiftWorkingDays.length === 0}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1" />
                Tambah Shift
              </Button>
            </div>

            {/* Shift list */}
            <div className="space-y-3">
              {shiftsLoading ? (
                <p className="text-muted-foreground text-center py-4">Memuat shift...</p>
              ) : shifts?.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Belum ada shift. Tambahkan shift pertama di atas.</p>
              ) : (
                shifts?.map((shift) => (
                  <div 
                    key={shift.id}
                    className="p-3 rounded-lg border-2 border-foreground"
                  >
                    {editingShift?.id === shift.id ? (
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            value={editShiftName}
                            onChange={(e) => setEditShiftName(e.target.value)}
                            className="border-2 border-foreground flex-1"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="time"
                              value={editShiftStart}
                              onChange={(e) => setEditShiftStart(e.target.value)}
                              className="border-2 border-foreground w-28"
                            />
                            <Input
                              type="time"
                              value={editShiftEnd}
                              onChange={(e) => setEditShiftEnd(e.target.value)}
                              className="border-2 border-foreground w-28"
                            />
                          </div>
                        </div>
                        
                        {/* Edit working days */}
                        <div className="space-y-2">
                          <Label className="text-xs">Hari Kerja:</Label>
                          <div className="flex flex-wrap gap-1">
                            {DAYS_OF_WEEK.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                size="sm"
                                variant={editShiftWorkingDays.includes(day.value) ? 'default' : 'outline'}
                                className="h-8 px-2 text-xs border-2 border-foreground"
                                onClick={() => toggleWorkingDay(day.value, false)}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Edit break duration */}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap">Durasi Istirahat:</Label>
                          <Input
                            type="number"
                            min={0}
                            max={120}
                            value={editShiftBreakDuration}
                            onChange={(e) => setEditShiftBreakDuration(Number(e.target.value))}
                            className="border-2 border-foreground w-20"
                          />
                          <span className="text-xs text-muted-foreground">menit</span>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateShiftMutation.mutate()}
                            disabled={updateShiftMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Simpan
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEditShift}
                            className="border-2 border-foreground"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Batal
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-medium">{shift.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} • Istirahat {shift.break_duration_minutes || 60} menit
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {DAYS_OF_WEEK.map((day) => (
                              <span
                                key={day.value}
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  (shift.working_days || [1,2,3,4,5]).includes(day.value)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {day.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditShift(shift)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteShiftMutation.mutate(shift.id)}
                            disabled={deleteShiftMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle>Peta Lokasi Kantor</CardTitle>
            <CardDescription>
              Klik pada peta untuk memilih titik pusat kantor. Area biru menunjukkan radius geofence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              ref={mapRef}
              className="h-[400px] rounded-lg overflow-hidden border-2 border-foreground"
              style={{ minHeight: '400px' }}
            />
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="border-2 border-foreground"
            size="lg"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminSettings;
