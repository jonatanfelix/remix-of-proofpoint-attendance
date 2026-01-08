import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Clock, Shield, Info, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  username: z.string().min(1, 'Username tidak boleh kosong'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

type AuthView = 'login' | 'forgot-password' | 'reset-password';

const Auth = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [view, setView] = useState<AuthView>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  
  // Reset password form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for recovery token in URL on mount
  useEffect(() => {
    const handleRecoveryToken = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (accessToken && type === 'recovery') {
        console.log('Recovery token detected, showing reset password form');
        // Set the session with the recovery token
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || '',
        });
        
        if (error) {
          console.error('Error setting session:', error);
          toast({
            title: 'Error',
            description: 'Link reset password tidak valid atau sudah kedaluwarsa.',
            variant: 'destructive',
          });
        } else {
          setView('reset-password');
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };
    
    handleRecoveryToken();
  }, [toast]);

  useEffect(() => {
    if (user && !loading && view !== 'reset-password') {
      navigate('/');
    }
  }, [user, loading, navigate, view]);

  const validateForm = () => {
    setErrors({});
    
    try {
      loginSchema.parse({ username, password });
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          if (error.path[0]) {
            newErrors[error.path[0] as string] = error.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);

    try {
      const { error } = await signIn(username, password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Login Gagal',
            description: 'Username atau password salah. Silakan coba lagi.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Login Gagal',
            description: error.message,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Selamat Datang!',
          description: 'Anda berhasil login.',
        });
        navigate('/');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast({
        title: 'Error',
        description: 'Masukkan email Anda',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      toast({
        title: 'Error',
        description: 'Format email tidak valid',
        variant: 'destructive',
      });
      return;
    }

    setIsResetting(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-reset-password', {
        body: {
          email: resetEmail,
          redirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Email Terkirim!',
        description: 'Cek inbox email Anda untuk link reset password.',
      });
      setView('login');
      setResetEmail('');
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast({
        title: 'Gagal Mengirim Email',
        description: error.message || 'Terjadi kesalahan. Coba lagi nanti.',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'Masukkan password baru',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password minimal 6 karakter',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Password tidak cocok',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Password Berhasil Diubah!',
        description: 'Anda akan dialihkan ke halaman utama.',
      });
      
      // Navigate to home after successful password update
      navigate('/');
    } catch (error: any) {
      console.error('Update password error:', error);
      toast({
        title: 'Gagal Mengubah Password',
        description: error.message || 'Terjadi kesalahan. Coba lagi nanti.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

  const renderCardContent = () => {
    switch (view) {
      case 'reset-password':
        return (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Buat Password Baru</CardTitle>
              <CardDescription>
                Masukkan password baru untuk akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Password Baru</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Minimal 6 karakter"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="border-2 border-foreground pr-10"
                      disabled={isUpdatingPassword}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Ulangi password baru"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="border-2 border-foreground pr-10"
                      disabled={isUpdatingPassword}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full border-2 border-foreground shadow-sm"
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? 'Menyimpan...' : 'Simpan Password Baru'}
                </Button>
              </form>
            </CardContent>
          </>
        );

      case 'forgot-password':
        return (
          <>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView('login')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-2xl">Lupa Password</CardTitle>
              </div>
              <CardDescription>
                Masukkan email Anda untuk menerima link reset password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="border-2 border-foreground"
                    disabled={isResetting}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full border-2 border-foreground shadow-sm"
                  disabled={isResetting}
                >
                  {isResetting ? 'Mengirim...' : 'Kirim Link Reset'}
                </Button>
              </form>
            </CardContent>
          </>
        );

      default:
        return (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Selamat Datang</CardTitle>
              <CardDescription>
                Masukkan kredensial untuk mengakses akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="budi.santoso"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="border-2 border-foreground"
                    disabled={isSubmitting}
                  />
                  {errors.username && (
                    <p className="text-sm text-destructive">{errors.username}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-2 border-foreground pr-10"
                      disabled={isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full border-2 border-foreground shadow-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              {/* Info about signup */}
              <div className="mt-4 p-3 rounded-lg bg-muted border-2 border-foreground">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Pendaftaran akun baru hanya dapat dilakukan oleh Admin. 
                    Hubungi Admin untuk mendapatkan username dan password.
                  </p>
                </div>
              </div>
            </CardContent>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b-2 border-foreground bg-background px-4 py-4">
        <div className="container mx-auto flex items-center gap-2">
          <MapPin className="h-8 w-8" />
          <h1 className="text-2xl font-bold tracking-tight">GeoAttend</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-3xl font-bold">Geo-Verified Attendance</h2>
          <p className="text-muted-foreground">Secure, location-based time tracking for field teams</p>
        </div>

        {/* Features */}
        <div className="mb-8 grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 border-2 border-foreground bg-card p-4 shadow-sm">
            <MapPin className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold">GPS Verified</p>
              <p className="text-sm text-muted-foreground">100m accuracy</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-2 border-foreground bg-card p-4 shadow-sm">
            <Clock className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold">Real-Time</p>
              <p className="text-sm text-muted-foreground">Instant records</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-2 border-foreground bg-card p-4 shadow-sm">
            <Shield className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold">Anti-Fraud</p>
              <p className="text-sm text-muted-foreground">Photo evidence</p>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="w-full max-w-md border-2 border-foreground shadow-md">
          {renderCardContent()}
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-foreground bg-background px-4 py-4">
        <p className="text-center text-sm text-muted-foreground">
          © 2024 GeoAttend. Secure attendance tracking.
        </p>
      </footer>
    </div>
  );
};

export default Auth;
