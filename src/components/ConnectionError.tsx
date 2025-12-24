import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ConnectionErrorProps {
  message?: string;
  onRetry?: () => void;
}

const ConnectionError = ({ 
  message = 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
  onRetry 
}: ConnectionErrorProps) => {
  return (
    <Card className="border-2 border-destructive/50 bg-destructive/5">
      <CardContent className="py-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <WifiOff className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">Koneksi Bermasalah</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Coba Lagi
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectionError;
