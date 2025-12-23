import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Save, Building, Clock, Target, Loader2, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const radiusRef = useRef(radius);
  const circleRef = useRef<L.Circle | null>(null);

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
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung GPS');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        handleLocationSelect(lat, lng);
        toast.success('Lokasi berhasil didapat dari GPS!');
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        let message = 'Gagal mendapatkan lokasi.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Akses lokasi ditolak. Izinkan akses lokasi di browser.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Lokasi tidak tersedia. Pastikan GPS aktif.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Timeout. Coba lagi.';
        }
        toast.error(message);
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleSave = () => {
    if (!companyName.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    updateMutation.mutate();
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
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto p-4">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Memuat...</div>
          </div>
        </main>
      </div>
    );
  }

  // Not admin/developer - redirect
  if (!isAdminOrDeveloper) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 space-y-6">
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
                  Jam Mulai Kerja
                </Label>
                <Input
                  id="work-start"
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  className="border-2 border-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Karyawan yang clock in setelah jam ini akan ditandai "TERLAMBAT"
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
                  <Label>Latitude</Label>
                  <Input
                    value={latitude?.toFixed(6) || '-'}
                    readOnly
                    className="border-2 border-foreground bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    value={longitude?.toFixed(6) || '-'}
                    readOnly
                    className="border-2 border-foreground bg-muted"
                  />
                </div>
              </div>

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
      </main>
    </div>
  );
};

export default AdminSettings;
