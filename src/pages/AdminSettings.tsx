import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Save, Building, Clock, Target } from 'lucide-react';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CompanySettings {
  id: string;
  name: string;
  office_latitude: number | null;
  office_longitude: number | null;
  radius_meters: number;
  work_start_time: string;
}

interface MapClickHandlerProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

const MapClickHandler = ({ onLocationSelect }: MapClickHandlerProps) => {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const AdminSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radius, setRadius] = useState(100);
  const [workStartTime, setWorkStartTime] = useState('08:00');

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
  };

  const handleSave = () => {
    if (!companyName.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    updateMutation.mutate();
  };

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

  const mapCenter: [number, number] = latitude && longitude 
    ? [latitude, longitude] 
    : [-6.2088, 106.8456]; // Default: Jakarta

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
                Klik pada peta untuk menentukan lokasi kantor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    ⚠ Klik peta untuk menentukan lokasi kantor
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
            <div className="h-[400px] rounded-lg overflow-hidden border-2 border-foreground">
              <MapContainer
                center={mapCenter}
                zoom={latitude && longitude ? 17 : 12}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onLocationSelect={handleLocationSelect} />
                
                {latitude && longitude && (
                  <>
                    <Marker position={[latitude, longitude]} />
                    <Circle
                      center={[latitude, longitude]}
                      radius={radius}
                      pathOptions={{
                        color: 'hsl(var(--primary))',
                        fillColor: 'hsl(var(--primary))',
                        fillOpacity: 0.2,
                      }}
                    />
                  </>
                )}
              </MapContainer>
            </div>
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
