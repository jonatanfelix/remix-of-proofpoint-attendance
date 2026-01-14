import { Clock, CheckCircle, XCircle, AlertTriangle, Timer, Coffee } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInMinutes } from 'date-fns';
import { type AttendanceStatus } from './AttendanceButtons';

interface StatusCardProps {
  status: AttendanceStatus;
  lastClockIn?: Date | null;
  lastClockOut?: Date | null;
  isLate?: boolean;
  lateMinutes?: number;
  workStartTime?: string;
  employeeType?: 'office' | 'field';
  shiftName?: string;
}

const StatusCard = ({ 
  status, 
  lastClockIn, 
  lastClockOut,
  isLate,
  lateMinutes,
  workStartTime,
  employeeType = 'office',
  shiftName
}: StatusCardProps) => {
  
  // Calculate work hours for field employees
  const calculateWorkHours = () => {
    if (!lastClockIn) return null;
    
    const endTime = lastClockOut || new Date();
    const totalMinutes = differenceInMinutes(endTime, lastClockIn);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return { hours, minutes, totalMinutes };
  };

  const workHours = employeeType === 'field' ? calculateWorkHours() : null;

  const getStatusInfo = () => {
    // Field employees - show work duration based info
    if (employeeType === 'field') {
      switch (status) {
        case 'clocked_in':
          return {
            icon: <CheckCircle className="h-8 w-8" />,
            title: 'Sedang Bekerja',
            subtitle: workHours
              ? `Sudah bekerja ${workHours.hours} jam ${workHours.minutes} menit`
              : lastClockIn
                ? `Mulai jam ${format(lastClockIn, 'HH:mm')}`
                : 'Anda sedang bertugas',
            bgClass: 'bg-accent',
          };
        case 'on_break':
          return {
            icon: <Coffee className="h-8 w-8" />,
            title: 'Sedang Istirahat',
            subtitle: lastClockIn
              ? `Mulai jam ${format(lastClockIn, 'HH:mm')}`
              : 'Istirahat sejenak',
            bgClass: 'bg-secondary',
          };
        case 'clocked_out':
          return {
            icon: <XCircle className="h-8 w-8" />,
            title: 'Selesai Bekerja',
            subtitle: workHours
              ? `Total kerja: ${workHours.hours} jam ${workHours.minutes} menit`
              : 'Sampai jumpa besok',
            bgClass: 'bg-secondary',
          };
        default:
          return {
            icon: <Clock className="h-8 w-8" />,
            title: 'Belum Mulai',
            subtitle: 'Clock in untuk mulai bekerja',
            bgClass: 'bg-muted',
          };
      }
    }

    // Office employees - show shift-based info with lateness
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
      case 'on_break':
        return {
          icon: <Coffee className="h-8 w-8" />,
          title: 'Sedang Istirahat',
          subtitle: lastClockIn
            ? `Clock in jam ${format(lastClockIn, 'HH:mm')}`
            : 'Istirahat sejenak',
          bgClass: 'bg-secondary',
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
            ? `Jam masuk${shiftName ? ` (${shiftName})` : ''}: ${workStartTime.slice(0, 5)}`
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
            {/* Only show late badge for office employees who are clocked in (not clocked out) */}
            {employeeType === 'office' && status === 'clocked_in' && isLate && lateMinutes && lateMinutes > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Terlambat {lateMinutes} menit
              </Badge>
            )}
            {/* Show work duration badge for field employees */}
            {employeeType === 'field' && status !== 'not_present' && workHours && (
              <Badge variant="outline" className="flex items-center gap-1 border-primary text-primary">
                <Timer className="h-3 w-3" />
                {workHours.hours}j {workHours.minutes}m
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
