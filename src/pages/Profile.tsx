import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Key, User, Mail, Building2, MapPin, Loader2 } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, employee_type, requires_geofence, company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch company name
  const { data: company } = useQuery({
    queryKey: ['company', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data, error } = await supabase
        .from('companies')
        .select('name')
        .eq('id', profile.company_id)
        .maybeSingle();

      if (error) return null;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  // Fetch user role
  const { data: userRole } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data?.role as string;
    },
    enabled: !!user?.id,
  });

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'Mohon isi password baru dan konfirmasi password.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password minimal 6 karakter.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Password baru dan konfirmasi tidak sama.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Password berhasil diubah.',
      });

      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
    } catch (error: any) {
      toast({
        title: 'Gagal',
        description: error.message || 'Gagal mengubah password.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getRoleBadge = () => {
    switch (userRole) {
      case 'developer':
        return <Badge variant="default">Developer</Badge>;
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>;
      case 'employee':
        return <Badge variant="outline">Karyawan</Badge>;
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-6">
          {/* Profile Info Card */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profil Saya
              </CardTitle>
              <CardDescription>
                Informasi akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Nama</p>
                  <p className="font-medium">{profile?.full_name || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{profile?.email || user?.email || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Perusahaan</p>
                  <p className="font-medium">{company?.name || 'Belum terdaftar'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Tipe Karyawan</p>
                  <p className="font-medium capitalize">
                    {profile?.employee_type === 'office' ? 'Kantor' : 'Lapangan'}
                    {profile?.requires_geofence ? ' (Wajib GPS)' : ' (Bebas Lokasi)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <div className="mt-1">{getRoleBadge()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Keamanan
              </CardTitle>
              <CardDescription>
                Ubah password akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showChangePassword ? (
                <Button
                  variant="outline"
                  className="border-2 border-foreground"
                  onClick={() => setShowChangePassword(true)}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Ganti Password
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Password Baru</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="border-2 border-foreground pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password baru"
                        className="border-2 border-foreground pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword}
                    >
                      {isChangingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Simpan Password
                    </Button>
                    <Button
                      variant="outline"
                      className="border-2 border-foreground"
                      onClick={() => {
                        setShowChangePassword(false);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      disabled={isChangingPassword}
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Profile;
