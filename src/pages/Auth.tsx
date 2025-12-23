import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Clock, Shield, Info, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const validateForm = () => {
    setErrors({});
    
    try {
      loginSchema.parse({ email, password });
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
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Login Gagal',
            description: 'Email atau password salah. Silakan coba lagi.',
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
      setShowForgotPassword(false);
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

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
          <CardHeader className="space-y-1">
            {showForgotPassword ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowForgotPassword(false)}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-2xl">Lupa Password</CardTitle>
                </div>
                <CardDescription>
                  Masukkan email Anda untuk menerima link reset password
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl">Selamat Datang</CardTitle>
                <CardDescription>
                  Masukkan kredensial untuk mengakses akun Anda
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
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
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-2 border-foreground"
                      disabled={isSubmitting}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => setShowForgotPassword(true)}
                      >
                        Lupa password?
                      </Button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-2 border-foreground"
                      disabled={isSubmitting}
                    />
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
                      Hubungi Admin perusahaan Anda untuk mendapatkan akun.
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
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
