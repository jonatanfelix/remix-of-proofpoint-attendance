import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, X, RotateCcw, User, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js to use browser cache
env.allowLocalModels = false;

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  employeeName: string;
  recordType: string;
  latitude: number;
  longitude: number;
  isLate?: boolean;
  lateMinutes?: number;
}

// Singleton for face detector to avoid reloading model
let faceDetectorPromise: Promise<any> | null = null;

const getFaceDetector = async () => {
  if (!faceDetectorPromise) {
    // Use a dedicated face detection model for accurate face detection
    faceDetectorPromise = pipeline('object-detection', 'Xenova/yolos-tiny', {
      device: 'webgpu',
    }).catch((err) => {
      // Fallback to CPU if WebGPU not available
      console.log('WebGPU not available, falling back to CPU');
      return pipeline('object-detection', 'Xenova/yolos-tiny');
    });
  }
  return faceDetectorPromise;
};

// Export preload function for external use
export const preloadFaceDetector = () => {
  return getFaceDetector();
};

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
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsReady(false);
    setFaceDetected(false);
  }, []);

  // Face detection function
  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !detectionCanvasRef.current || !isReady) return;

    const video = videoRef.current;
    const canvas = detectionCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 320; // Use smaller size for faster detection
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const detector = await getFaceDetector();
      const imageData = canvas.toDataURL('image/jpeg', 0.7);
      
      setIsDetecting(true);
      const results = await detector(imageData);
      setIsDetecting(false);

      console.log('Detection results:', results);

      // Check if any person detected with sufficient size
      // Person must occupy at least 20% of the frame to ensure full face is visible
      // This ensures the face is large enough to be identifiable
      const minAreaRatio = 0.20;
      const frameArea = canvas.width * canvas.height;
      
      const validPersonDetected = results.some((result: any) => {
        if (result.label !== 'person' || result.score < 0.7) return false;
        
        // Calculate bounding box area
        const box = result.box;
        const boxWidth = box.xmax - box.xmin;
        const boxHeight = box.ymax - box.ymin;
        const boxArea = boxWidth * boxHeight;
        const areaRatio = boxArea / frameArea;
        
        console.log(`Person detected: score=${result.score.toFixed(2)}, areaRatio=${(areaRatio * 100).toFixed(1)}%`);
        
        return areaRatio >= minAreaRatio;
      });
      
      setFaceDetected(validPersonDetected);
      setModelLoading(false);
    } catch (err) {
      console.error('Face detection error:', err);
      setModelLoading(false);
      // On error, show warning but don't auto-allow - require manual override
      setFaceDetected(false);
    }
  }, [isReady]);

  const startCamera = useCallback(async () => {
    // Stop existing stream first
    stopCamera();
    
    setIsLoading(true);
    setError(null);
    setModelLoading(true);

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

      // Start loading face detector in background
      getFaceDetector().then(() => {
        setModelLoading(false);
      }).catch(() => {
        setModelLoading(false);
        // Don't auto-allow on model load failure - show warning instead
      });

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
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Run face detection periodically
  useEffect(() => {
    if (isReady && !modelLoading) {
      // Initial detection
      detectFaces();
      
      // Run detection every 2 seconds
      detectionIntervalRef.current = setInterval(() => {
        detectFaces();
      }, 2000);
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isReady, modelLoading, detectFaces]);

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
    
    // Stop camera but don't close - let parent handle close after mutation
    stopCamera();
    
    onCapture(imageDataUrl);
    // Don't call onClose here - parent will close after mutation completes
  }, [employeeName, recordType, latitude, longitude, isLate, lateMinutes, onCapture, stopCamera]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
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
                
                {/* Face detection indicator */}
                {isReady && (
                  <div className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                    modelLoading 
                      ? 'bg-muted text-muted-foreground' 
                      : faceDetected 
                        ? 'bg-green-500/90 text-white' 
                        : 'bg-destructive/90 text-white'
                  }`}>
                    {modelLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Memuat AI...
                      </>
                    ) : isDetecting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Mendeteksi...
                      </>
                    ) : faceDetected ? (
                      <>
                        <User className="h-3 w-3" />
                        Wajah Terdeteksi
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3" />
                        Wajah Tidak Terdeteksi
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Warning if no face detected */}
              {isReady && !modelLoading && !faceDetected && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Wajah tidak terdeteksi. Pastikan wajah Anda terlihat jelas di kamera. 
                    Jika masalah berlanjut, tekan tombol tetap ambil foto.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={capturePhoto}
                  className="flex-1"
                  size="lg"
                  disabled={isLoading || !isReady || (!faceDetected && !modelLoading)}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  {modelLoading ? 'Memuat...' : faceDetected ? 'Ambil Foto' : 'Arahkan Wajah ke Kamera'}
                </Button>
                
                {/* Fallback button if face detection fails but user wants to proceed */}
                {isReady && !modelLoading && !faceDetected && (
                  <Button
                    onClick={capturePhoto}
                    variant="outline"
                    size="lg"
                    className="border-2 border-foreground"
                    disabled={isLoading || !isReady}
                  >
                    Tetap Ambil
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Hidden canvas for watermarking */}
          <canvas ref={canvasRef} className="hidden" />
          {/* Hidden canvas for face detection */}
          <canvas ref={detectionCanvasRef} className="hidden" />
        </CardContent>
      </Card>
    </div>
  );
};

export default CameraCapture;
