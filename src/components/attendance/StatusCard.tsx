import { Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface StatusCardProps {
  status: 'not_present' | 'clocked_in' | 'clocked_out';
  lastClockIn?: Date | null;
  lastClockOut?: Date | null;
  isLate?: boolean;
  lateMinutes?: number;
  workStartTime?: string;
}

const StatusCard = ({ 
  status, 
  lastClockIn, 
  lastClockOut,
  isLate,
  lateMinutes,
  workStartTime 
}: StatusCardProps) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'clocked_in':
        return {
          icon: <CheckCircle className="h-8 w-8" />,
          title: 'Sedang Bekerja',
          subtitle: lastClockIn
            ? `Clock in jam ${format(lastClockIn, 'HH:mm')}`
            : 'Anda sedang bertugas',
          bgClass: 'bg-accent',
        };
      case 'clocked_out':
        return {
          icon: <XCircle className="h-8 w-8" />,
          title: 'Shift Selesai',
          subtitle: lastClockOut
            ? `Clock out jam ${format(lastClockOut, 'HH:mm')}`
            : 'Sampai jumpa besok',
          bgClass: 'bg-secondary',
        };
      default:
        return {
          icon: <Clock className="h-8 w-8" />,
          title: 'Belum Hadir',
          subtitle: workStartTime 
            ? `Jam masuk: ${workStartTime.slice(0, 5)}`
            : 'Clock in untuk memulai shift',
          bgClass: 'bg-muted',
        };
    }
  };

  const { icon, title, subtitle, bgClass } = getStatusInfo();

  return (
    <Card className={`border-2 border-foreground ${bgClass} shadow-sm`}>
      <CardContent className="flex items-center gap-4 p-6">
        {icon}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold">{title}</h3>
            {isLate && lateMinutes && lateMinutes > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Terlambat {lateMinutes} menit
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatusCard;
