import { Clock, LogIn, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  record_type: 'clock_in' | 'clock_out' | 'break_out' | 'break_in';
  recorded_at: string;
  photo_url?: string | null;
}

interface RecentHistoryProps {
  records: AttendanceRecord[];
  isLoading: boolean;
}

const RecentHistory = ({ records, isLoading }: RecentHistoryProps) => {
  if (isLoading) {
    return (
      <Card className="border-2 border-foreground shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card className="border-2 border-foreground shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            No attendance records yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-foreground shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {records.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                {record.record_type === 'clock_in' ? (
                  <LogIn className="h-5 w-5" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">
                    {record.record_type === 'clock_in' ? 'Clock In' : 
                     record.record_type === 'clock_out' ? 'Clock Out' :
                     record.record_type === 'break_out' ? 'Istirahat Keluar' : 'Kembali Istirahat'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(record.recorded_at), 'MMM d, HH:mm')}
                  </p>
                </div>
              </div>
              {record.photo_url && (
                <img
                  src={record.photo_url}
                  alt="Attendance photo"
                  className="h-10 w-10 border-2 border-foreground object-cover"
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentHistory;
