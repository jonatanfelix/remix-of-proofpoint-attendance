import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, X, RotateCcw } from 'lucide-react';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  employeeName: string;
  recordType: 'CLOCK IN' | 'CLOCK OUT';
  latitude: number;
  longitude: number;
  isLate?: boolean;
  lateMinutes?: number;
}

const CameraCapture = ({
  isOpen,
  onClose,
  onCapture,
  employeeName,
  recordType,
  latitude,
  longitude,
  isLate,
  lateMinutes,
}: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    // Stop existing stream first
    stopCamera();
    
    setIsLoading(true);
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          setIsReady(true);
          setIsLoading(false);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Tidak dapat mengakses kamera. Silakan cek izin kamera di browser.');
      setIsLoading(false);
    }
  }, [stopCamera]);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen]); // Only depend on isOpen

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add watermark
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    // Watermark styling
    const padding = 20;
    const lineHeight = 28;
    const fontSize = 18;
    const hasLateInfo = recordType === 'CLOCK IN' && isLate && lateMinutes && lateMinutes > 0;
    const watermarkHeight = lineHeight * (hasLateInfo ? 6 : 5) + padding * 2;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - watermarkHeight, canvas.width, watermarkHeight);

    // Text styling
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'left';

    const startY = canvas.height - watermarkHeight + padding + fontSize;

    // Record type badge
    ctx.fillStyle = recordType === 'CLOCK IN' ? '#22c55e' : '#ef4444';
    ctx.fillRect(padding, startY - fontSize, 100, fontSize + 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(recordType, padding + 8, startY);

    // Late badge if applicable
    let currentLine = 1;
    if (hasLateInfo) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(padding + 110, startY - fontSize, 140, fontSize + 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`TERLAMBAT ${lateMinutes}m`, padding + 118, startY);
    }

    // Employee name
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`Karyawan: ${employeeName}`, padding, startY + lineHeight * currentLine);
    currentLine++;

    // Timestamp
    ctx.fillText(`Waktu: ${timestamp}`, padding, startY + lineHeight * currentLine);
    currentLine++;

    // GPS coordinates
    ctx.font = `${fontSize - 2}px Arial`;
    ctx.fillText(
      `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      padding,
      startY + lineHeight * currentLine
    );
    currentLine++;

    // Verification text
    ctx.fillStyle = '#9ca3af';
    ctx.font = `italic ${fontSize - 4}px Arial`;
    ctx.fillText('GeoAttend Verified', padding, startY + lineHeight * currentLine);

    // Get the watermarked image
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    
    // Stop camera before closing
    stopCamera();
    
    onCapture(imageDataUrl);
    onClose();
  }, [employeeName, recordType, latitude, longitude, isLate, lateMinutes, onCapture, onClose, stopCamera]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg mx-4 border-2 border-foreground">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Ambil Foto {recordType}</h3>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {error ? (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={startCamera} variant="outline" className="border-2 border-foreground">
                <RotateCcw className="h-4 w-4 mr-2" />
                Coba Lagi
              </Button>
            </div>
          ) : (
            <>
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden mb-4 border-2 border-foreground">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted">
                    <p className="text-muted-foreground">Memulai kamera...</p>
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>

              <Button
                onClick={capturePhoto}
                className="w-full"
                size="lg"
                disabled={isLoading || !isReady}
              >
                <Camera className="h-5 w-5 mr-2" />
                Ambil Foto
              </Button>
            </>
          )}

          {/* Hidden canvas for watermarking */}
          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>
    </div>
  );
};

export default CameraCapture;
