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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCurrentPosition } from '@/lib/geolocation';
import {
  MapPin, Save, Building, Clock, Target, Loader2, Navigation,
  Plus, Trash2, Edit, Check, X, Shield, Banknote
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
  late_penalty_per_minute: number;
  standard_work_hours: number;
  bpjs_kesehatan_employee_rate: number;
  bpjs_kesehatan_employer_rate: number;
  bpjs_tk_jht_employee_rate: number;
  bpjs_tk_jht_employer_rate: number;
  bpjs_tk_jp_employee_rate: number;
  bpjs_tk_jp_employer_rate: number;
  ptkp_status_default: string;
  use_pph21_calculation: boolean;
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
  const [latePenalty, setLatePenalty] = useState(1000);
  const [standardWorkHours, setStandardWorkHours] = useState(8);

  // BPJS Configuration
  const [bpjsKesehatanEmployee, setBpjsKesehatanEmployee] = useState(1.0);
  const [bpjsKesehatanEmployer, setBpjsKesehatanEmployer] = useState(4.0);
  const [bpjsTkJhtEmployee, setBpjsTkJhtEmployee] = useState(2.0);
  const [bpjsTkJhtEmployer, setBpjsTkJhtEmployer] = useState(3.7);
  const [bpjsTkJpEmployee, setBpjsTkJpEmployee] = useState(1.0);
  const [bpjsTkJpEmployer, setBpjsTkJpEmployer] = useState(2.0);

  // Tax Configuration
  const [ptkpDefault, setPtkpDefault] = useState('TK/0');
  const [usePph21, setUsePph21] = useState(false);

  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

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
      return data as unknown as CompanySettings | null;
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
      setAnnualLeaveQuota(company.annual_leave_quota ?? 12);
      setOvertimeStartAfter(company.overtime_start_after_minutes || 0);
      setOvertimeRate(company.overtime_rate_per_hour || 0);
      setEarlyLeaveDeduction(company.early_leave_deduction_per_minute || 0);
      setLatePenalty(company.late_penalty_per_minute || 1000);
      setStandardWorkHours(company.standard_work_hours || 8);

      // BPJS Configuration
      setBpjsKesehatanEmployee(company.bpjs_kesehatan_employee_rate || 1.0);
      setBpjsKesehatanEmployer(company.bpjs_kesehatan_employer_rate || 4.0);
      setBpjsTkJhtEmployee(company.bpjs_tk_jht_employee_rate || 2.0);
      setBpjsTkJhtEmployer(company.bpjs_tk_jht_employer_rate || 3.7);
      setBpjsTkJpEmployee(company.bpjs_tk_jp_employee_rate || 1.0);
      setBpjsTkJpEmployer(company.bpjs_tk_jp_employer_rate || 2.0);

      // Tax Configuration
      setPtkpDefault(company.ptkp_status_default || 'TK/0');
      setUsePph21(company.use_pph21_calculation || false);
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
          late_penalty_per_minute: latePenalty,
          standard_work_hours: standardWorkHours,
          bpjs_kesehatan_employee_rate: bpjsKesehatanEmployee,
          bpjs_kesehatan_employer_rate: bpjsKesehatanEmployer,
          bpjs_tk_jht_employee_rate: bpjsTkJhtEmployee,
          bpjs_tk_jht_employer_rate: bpjsTkJhtEmployer,
          bpjs_tk_jp_employee_rate: bpjsTkJpEmployee,
          bpjs_tk_jp_employer_rate: bpjsTkJpEmployer,
          ptkp_status_default: ptkpDefault,
          use_pph21_calculation: usePph21,
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
      // 1. Check if any users are using this shift
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('shift_id', shiftId);

      if (countError) throw countError;

      // 2. If users exist, ask for confirmation
      if (count && count > 0) {
        const confirmed = window.confirm(
          `Shift ini sedang digunakan oleh ${count} karyawan. \n\nApakah Anda yakin ingin menghapus shift ini? \nKaryawan tersebut akan dikembalikan ke jam kerja default.`
        );

        if (!confirmed) {
          throw new Error('Penghapusan dibatalkan');
        }

        // 3. Unassign users (set shift_id to null)
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ shift_id: null })
          .eq('shift_id', shiftId);

        if (updateError) throw updateError;
      }

      // 4. Delete the shift
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
      if (error.message !== 'Penghapusan dibatalkan') {
        toast.error('Gagal menghapus shift: ' + error.message);
      }
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

  // Initialize map when location tab becomes visible
  useEffect(() => {
    if (activeTab !== 'location') return;
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

    // Fix for map not rendering tiles correctly
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

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
  }, [activeTab]);

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

  // If user sets lat/lng before the map is ready (e.g. via GPS), apply it once map exists
  useEffect(() => {
    if (activeTab !== 'location') return;
    if (!mapReady || !mapInstanceRef.current) return;
    if (latitude == null || longitude == null) return;

    const lat = latitude;
    const lng = longitude;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(mapInstanceRef.current);
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(radiusRef.current);
    } else {
      circleRef.current = L.circle([lat, lng], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        radius: radiusRef.current,
      }).addTo(mapInstanceRef.current);
    }

    mapInstanceRef.current.setView([lat, lng], 17);
  }, [activeTab, mapReady, latitude, longitude]);

  // Invalidate map size when switching to location tab
  useEffect(() => {
    if (activeTab === 'location' && mapInstanceRef.current) {
      // Small delay to ensure the tab content is visible
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 100);
    }
  }, [activeTab]);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pengaturan Perusahaan</h1>
            <p className="text-muted-foreground">Konfigurasi lokasi kantor, jam kerja, dan payroll</p>
          </div>
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

        <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="general" className="flex items-center gap-2 py-3">
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline">Umum</span>
            </TabsTrigger>
            <TabsTrigger value="location" className="flex items-center gap-2 py-3">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Lokasi</span>
            </TabsTrigger>
            <TabsTrigger value="payroll" className="flex items-center gap-2 py-3">
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">Payroll</span>
            </TabsTrigger>
            <TabsTrigger value="shifts" className="flex items-center gap-2 py-3">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Shift</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab: Umum */}
          <TabsContent value="general" className="space-y-6">
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="standard-hours">Jam Kerja Standar (jam/hari)</Label>
                    <Input
                      id="standard-hours"
                      type="number"
                      min={1}
                      max={24}
                      value={standardWorkHours}
                      onChange={(e) => setStandardWorkHours(Number(e.target.value))}
                      className="border-2 border-foreground"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Settings */}
              <Card className="border-2 border-foreground">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Pengaturan Absensi
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      Contoh: 15 = tidak dihitung terlambat jika masuk s/d 08:15
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
                      Jarak maksimal dari titik kantor untuk bisa absen
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
                      Lembur dihitung setelah X menit dari jam pulang shift
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Lokasi */}
          <TabsContent value="location" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Coordinates */}
              <Card className="border-2 border-foreground">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Koordinat Kantor
                  </CardTitle>
                  <CardDescription>
                    Gunakan GPS atau klik pada peta untuk menentukan lokasi
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  {latitude && longitude ? (
                    <div className="p-3 rounded-lg bg-primary/10 border-2 border-primary">
                      <p className="text-sm font-medium text-primary">
                        ✓ Lokasi kantor sudah ditentukan
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-destructive/10 border-2 border-destructive">
                      <p className="text-sm font-medium text-destructive">
                        ⚠ Klik peta untuk menentukan lokasi
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Map */}
              <Card className="border-2 border-foreground">
                <CardHeader>
                  <CardTitle>Peta Lokasi Kantor</CardTitle>
                  <CardDescription>
                    Klik pada peta untuk memilih titik pusat kantor
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    ref={mapRef}
                    className="h-[350px] rounded-lg overflow-hidden border-2 border-foreground"
                    style={{ minHeight: '350px' }}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Payroll */}
          <TabsContent value="payroll" className="space-y-6">
            {/* Deduction Settings */}
            <Card className="border-2 border-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Pengaturan Potongan & Lembur
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="late-penalty">Denda Telat per Menit (Rp)</Label>
                    <Input
                      id="late-penalty"
                      type="number"
                      min={0}
                      value={latePenalty}
                      onChange={(e) => setLatePenalty(Number(e.target.value))}
                      className="border-2 border-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      Dihitung setelah toleransi
                    </p>
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
                      Isi 0 jika tidak ada potongan
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
                </div>
              </CardContent>
            </Card>

            {/* BPJS Configuration */}
            <Card className="border-2 border-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Konfigurasi BPJS
                </CardTitle>
                <CardDescription>
                  Rate potongan BPJS dalam persen (%). Isi 0 jika tidak digunakan.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* BPJS Kesehatan */}
                  <div className="p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 space-y-3">
                    <p className="font-medium text-blue-700 dark:text-blue-300">BPJS Kesehatan</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Karyawan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsKesehatanEmployee}
                          onChange={(e) => setBpjsKesehatanEmployee(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Perusahaan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsKesehatanEmployer}
                          onChange={(e) => setBpjsKesehatanEmployer(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* BPJS TK JHT */}
                  <div className="p-4 rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 space-y-3">
                    <p className="font-medium text-green-700 dark:text-green-300">BPJS TK - JHT</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Karyawan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsTkJhtEmployee}
                          onChange={(e) => setBpjsTkJhtEmployee(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Perusahaan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsTkJhtEmployer}
                          onChange={(e) => setBpjsTkJhtEmployer(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* BPJS TK JP */}
                  <div className="p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 space-y-3">
                    <p className="font-medium text-purple-700 dark:text-purple-300">BPJS TK - JP</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Karyawan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsTkJpEmployee}
                          onChange={(e) => setBpjsTkJpEmployee(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Perusahaan (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={10}
                          value={bpjsTkJpEmployer}
                          onChange={(e) => setBpjsTkJpEmployer(Number(e.target.value))}
                          className="border-2 border-foreground h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tax Configuration */}
            <Card className="border-2 border-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Konfigurasi Pajak PPh 21
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ptkp-default">Status PTKP Default</Label>
                    <Select value={ptkpDefault} onValueChange={setPtkpDefault}>
                      <SelectTrigger id="ptkp-default" className="border-2 border-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TK/0">TK/0 - Tidak Kawin, 0 Tanggungan</SelectItem>
                        <SelectItem value="TK/1">TK/1 - Tidak Kawin, 1 Tanggungan</SelectItem>
                        <SelectItem value="TK/2">TK/2 - Tidak Kawin, 2 Tanggungan</SelectItem>
                        <SelectItem value="TK/3">TK/3 - Tidak Kawin, 3 Tanggungan</SelectItem>
                        <SelectItem value="K/0">K/0 - Kawin, 0 Tanggungan</SelectItem>
                        <SelectItem value="K/1">K/1 - Kawin, 1 Tanggungan</SelectItem>
                        <SelectItem value="K/2">K/2 - Kawin, 2 Tanggungan</SelectItem>
                        <SelectItem value="K/3">K/3 - Kawin, 3 Tanggungan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border-2 border-foreground bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-base">Aktifkan PPh 21 Default</Label>
                      <p className="text-sm text-muted-foreground">
                        {usePph21
                          ? 'PPh 21 dihitung otomatis di payroll'
                          : 'PPh 21 tidak dihitung otomatis'}
                      </p>
                    </div>
                    <Switch
                      checked={usePph21}
                      onCheckedChange={setUsePph21}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Shift */}
          <TabsContent value="shifts" className="space-y-6">
            <Card className="border-2 border-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Manajemen Shift
                </CardTitle>
                <CardDescription>
                  Kelola shift kerja termasuk hari kerja dan durasi istirahat
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add new shift */}
                <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5 space-y-4">
                  <p className="font-medium text-sm">Tambah Shift Baru</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      placeholder="Nama shift"
                      value={newShiftName}
                      onChange={(e) => setNewShiftName(e.target.value)}
                      className="border-2 border-foreground"
                    />
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Mulai:</Label>
                      <Input
                        type="time"
                        value={newShiftStart}
                        onChange={(e) => setNewShiftStart(e.target.value)}
                        className="border-2 border-foreground"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Selesai:</Label>
                      <Input
                        type="time"
                        value={newShiftEnd}
                        onChange={(e) => setNewShiftEnd(e.target.value)}
                        className="border-2 border-foreground"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Istirahat:</Label>
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
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs">Hari Kerja:</Label>
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

                  <Button
                    onClick={() => addShiftMutation.mutate()}
                    disabled={addShiftMutation.isPending || !newShiftName.trim() || newShiftWorkingDays.length === 0}
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
                        className="p-4 rounded-lg border-2 border-foreground"
                      >
                        {editingShift?.id === shift.id ? (
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <Input
                                value={editShiftName}
                                onChange={(e) => setEditShiftName(e.target.value)}
                                className="border-2 border-foreground"
                              />
                              <Input
                                type="time"
                                value={editShiftStart}
                                onChange={(e) => setEditShiftStart(e.target.value)}
                                className="border-2 border-foreground"
                              />
                              <Input
                                type="time"
                                value={editShiftEnd}
                                onChange={(e) => setEditShiftEnd(e.target.value)}
                                className="border-2 border-foreground"
                              />
                              <div className="flex items-center gap-2">
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
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Label className="text-xs">Hari Kerja:</Label>
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
                            <div className="space-y-2">
                              <p className="font-medium">{shift.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} • Istirahat {shift.break_duration_minutes || 60} menit
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {DAYS_OF_WEEK.map((day) => (
                                  <span
                                    key={day.value}
                                    className={`text-xs px-1.5 py-0.5 rounded ${(shift.working_days || [1, 2, 3, 4, 5]).includes(day.value)
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AdminSettings;
