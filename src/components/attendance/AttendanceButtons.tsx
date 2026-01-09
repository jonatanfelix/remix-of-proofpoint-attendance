import { LogIn, LogOut, Coffee, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type RecordType = 'clock_in' | 'clock_out' | 'break_out' | 'break_in';

export type AttendanceStatus = 'not_present' | 'clocked_in' | 'on_break' | 'clocked_out';

interface AttendanceButtonsProps {
  status: AttendanceStatus;
  isSubmitting: boolean;
  canPerformAction: boolean;
  onAction: (recordType: RecordType) => void;
}

const AttendanceButtons = ({
  status,
  isSubmitting,
  canPerformAction,
  onAction,
}: AttendanceButtonsProps) => {
  // Determine which buttons to show based on status
  const showClockIn = status === 'not_present' || status === 'clocked_out';
  const showClockOut = status === 'clocked_in';
  const showBreakOut = status === 'clocked_in';
  const showBreakIn = status === 'on_break';

  return (
    <Card className="border-2 border-foreground">
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4 text-center">Absensi</h3>
        
        {/* Main Clock In/Out Buttons */}
        <div className="grid gap-4 sm:grid-cols-2">
          {showClockIn && (
            <Button
              size="lg"
              className="h-24 border-2 border-foreground text-xl font-bold shadow-md disabled:opacity-50 sm:col-span-2"
              disabled={!canPerformAction || isSubmitting}
              onClick={() => onAction('clock_in')}
            >
              {isSubmitting ? (
                <Loader2 className="mr-3 h-8 w-8 animate-spin" />
              ) : (
                <LogIn className="mr-3 h-8 w-8" />
              )}
              HADIR
            </Button>
          )}

          {showBreakIn && (
            <Button
              size="lg"
              variant="secondary"
              className="h-24 border-2 border-foreground text-xl font-bold shadow-md disabled:opacity-50 sm:col-span-2"
              disabled={!canPerformAction || isSubmitting}
              onClick={() => onAction('break_in')}
            >
              {isSubmitting ? (
                <Loader2 className="mr-3 h-8 w-8 animate-spin" />
              ) : (
                <Coffee className="mr-3 h-8 w-8" />
              )}
              KEMBALI ISTIRAHAT
            </Button>
          )}

          {(showClockOut || showBreakOut) && (
            <>
              <Button
                size="lg"
                variant="outline"
                className="h-24 border-2 border-foreground text-xl font-bold shadow-md disabled:opacity-50"
                disabled={!canPerformAction || isSubmitting || !showBreakOut}
                onClick={() => onAction('break_out')}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-3 h-8 w-8 animate-spin" />
                ) : (
                  <Coffee className="mr-3 h-8 w-8" />
                )}
                ISTIRAHAT
              </Button>

              <Button
                size="lg"
                variant="destructive"
                className="h-24 border-2 border-foreground text-xl font-bold shadow-md disabled:opacity-50"
                disabled={!canPerformAction || isSubmitting || !showClockOut}
                onClick={() => onAction('clock_out')}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-3 h-8 w-8 animate-spin" />
                ) : (
                  <LogOut className="mr-3 h-8 w-8" />
                )}
                PULANG
              </Button>
            </>
          )}
        </div>
        
        {!canPerformAction && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            Menunggu lokasi tersedia...
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceButtons;
