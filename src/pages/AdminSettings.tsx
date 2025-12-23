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
import { MapPin, Save, Building, Clock, Target, Search, Loader2 } from 'lucide-react';
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
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
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
    enabled: userRole === 'admin',
  });

  // Set initial values when company data loads
  useEffect(() => {
    if (company) {
      setCompanyName(company.name);
      setLatitude(company.office_latitude);
      setLongitude(company.office_longitude);
      setRadius(company.radius_meters);
      setWorkStartTime(company.work_start_time?.slice(0, 5) || '08:00');
    }
  }, [company]);

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
    setLatitude(lat);
    setLongitude(lng);
    toast.info(`Lokasi dipilih: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

    // Update marker and circle on map
    if (mapInstanceRef.current) {
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
          radius: radius,
        }).addTo(mapInstanceRef.current);
      }

      mapInstanceRef.current.setView([lat, lng], 17);
    }
  };

  // Search location by address/Plus Code
  const handleSearchLocation = async () => {
    if (!searchAddress.trim()) {
      toast.error('Masukkan alamat atau Plus Code');
      return;
    }

    setIsSearching(true);
    try {
      // Use OpenStreetMap Nominatim API for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`,
        {
          headers: {
            'User-Agent': 'AttendanceApp/1.0',
          },
        }
      );

      const results = await response.json();

      if (results.length === 0) {
        toast.error('Lokasi tidak ditemukan. Coba alamat yang lebih spesifik.');
        return;
      }

      const { lat, lon, display_name } = results[0];
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lon);

      handleLocationSelect(parsedLat, parsedLng);
      toast.success(`Lokasi ditemukan: ${display_name}`);
    } catch (error) {
      console.error('Geocoding error:', error);
      toast.error('Gagal mencari lokasi. Coba lagi.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = () => {
    if (!companyName.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    updateMutation.mutate();
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultCenter: [number, number] = latitude && longitude 
      ? [latitude, longitude] 
      : [-6.2088, 106.8456];

    mapInstanceRef.current = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: latitude && longitude ? 17 : 12,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Add click handler
    mapInstanceRef.current.on('click', (e: L.LeafletMouseEvent) => {
      handleLocationSelect(e.latlng.lat, e.latlng.lng);
    });

    // Add initial marker if location exists
    if (latitude && longitude) {
      markerRef.current = L.marker([latitude, longitude]).addTo(mapInstanceRef.current);
      circleRef.current = L.circle([latitude, longitude], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        radius: radius,
      }).addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

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

  // Not admin - redirect
  if (userRole !== 'admin') {
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
                Cari lokasi dengan alamat atau Plus Code dari Google Maps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search Address Input */}
              <div className="space-y-2">
                <Label htmlFor="search-address" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Cari Lokasi
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="search-address"
                    value={searchAddress}
                    onChange={(e) => setSearchAddress(e.target.value)}
                    placeholder="Contoh: H67Q+HH Prabumulih atau Jl. Sudirman No.1, Jakarta"
                    className="border-2 border-foreground flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchLocation();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleSearchLocation}
                    disabled={isSearching}
                    className="border-2 border-foreground"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy Plus Code dari Google Maps (klik lokasi → copy kode seperti "H67Q+HH Prabumulih")
                </p>
              </div>

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
