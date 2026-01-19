import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Download, Printer, Building2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { formatCurrency } from '@/lib/payroll';

interface PayrollData {
  employee: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    department: string | null;
    employee_type: 'office' | 'field';
    salary_type: 'daily' | 'monthly' | null;
  };
  baseSalary: number;
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  lateDeduction: number;
  earlyLeaveDays: number;
  totalEarlyLeaveMinutes: number;
  earlyLeaveDeduction: number;
  totalWorkHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  sickDays: number;
  leaveDays: number;
  permitDays: number;
  bpjsKesehatanEmployee: number;
  bpjsJhtEmployee: number;
  bpjsJpEmployee: number;
  totalBpjsEmployee: number;
  pph21: number;
  totalDeductions: number;
  totalAdditions: number;
  netSalary: number;
}

interface PayslipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrollData: PayrollData | null;
  period: string; // yyyy-MM format
  companyName?: string;
  showBpjs: boolean;
  showPph21: boolean;
}

export function PayslipDialog({
  open,
  onOpenChange,
  payrollData,
  period,
  companyName = 'Perusahaan',
  showBpjs,
  showPph21,
}: PayslipDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!payrollData) return null;

  const periodLabel = format(parseISO(`${period}-01`), 'MMMM yyyy', { locale: idLocale });

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Slip Gaji - ${payrollData.employee.full_name} - ${periodLabel}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: white; color: #1a1a1a; }
            .payslip { max-width: 600px; margin: 0 auto; border: 2px solid #1a1a1a; padding: 24px; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #1a1a1a; }
            .company-name { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
            .payslip-title { font-size: 16px; color: #666; }
            .employee-info { margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .info-row { display: flex; justify-content: space-between; }
            .info-label { color: #666; }
            .info-value { font-weight: 600; }
            .section { margin-bottom: 16px; }
            .section-title { font-weight: bold; font-size: 14px; margin-bottom: 8px; padding: 6px 8px; background: #f5f5f5; border: 1px solid #e0e0e0; }
            .detail-row { display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #eee; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { color: #333; }
            .detail-value { font-weight: 500; text-align: right; }
            .deduction { color: #dc2626; }
            .addition { color: #16a34a; }
            .total-section { margin-top: 20px; padding-top: 16px; border-top: 2px solid #1a1a1a; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
            .net-salary { font-size: 20px; font-weight: bold; color: #16a34a; }
            .footer { margin-top: 24px; padding-top: 16px; border-top: 1px dashed #ccc; text-align: center; font-size: 12px; color: #666; }
            @media print {
              body { padding: 0; }
              .payslip { border: none; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Preview Slip Gaji</span>
            <Button onClick={handlePrint} size="sm" className="gap-2">
              <Printer className="h-4 w-4" />
              Cetak / PDF
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="payslip">
          {/* Header */}
          <div className="header text-center mb-6 pb-4 border-b-2 border-foreground">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Building2 className="h-6 w-6" />
              <h1 className="company-name text-xl font-bold">{companyName}</h1>
            </div>
            <p className="payslip-title text-muted-foreground">SLIP GAJI KARYAWAN</p>
            <p className="text-sm font-medium mt-1">Periode: {periodLabel}</p>
          </div>

          {/* Employee Info */}
          <div className="employee-info grid grid-cols-2 gap-3 mb-6 text-sm">
            <div className="info-row flex justify-between">
              <span className="info-label text-muted-foreground">Nama</span>
              <span className="info-value font-semibold">{payrollData.employee.full_name}</span>
            </div>
            <div className="info-row flex justify-between">
              <span className="info-label text-muted-foreground">Departemen</span>
              <span className="info-value font-semibold">{payrollData.employee.department || '-'}</span>
            </div>
            <div className="info-row flex justify-between">
              <span className="info-label text-muted-foreground">Tipe</span>
              <span className="info-value font-semibold">
                {payrollData.employee.employee_type === 'office' ? 'Kantor' : 'Lapangan'}
              </span>
            </div>
            <div className="info-row flex justify-between">
              <span className="info-label text-muted-foreground">Tipe Gaji</span>
              <span className="info-value font-semibold">
                {payrollData.employee.salary_type === 'daily' ? 'Harian' : 'Bulanan'}
              </span>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Attendance Summary */}
          <div className="section mb-4">
            <div className="section-title bg-muted rounded px-3 py-2 font-semibold text-sm mb-2">
              RINGKASAN KEHADIRAN
            </div>
            <div className="space-y-1 text-sm">
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Hari Kerja</span>
                <span className="font-medium">{payrollData.workingDays} hari</span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Hadir</span>
                <span className="font-medium">{payrollData.presentDays} hari</span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Alpa</span>
                <span className="font-medium">{payrollData.absentDays} hari</span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Telat</span>
                <span className="font-medium">
                  {payrollData.lateDays}x ({payrollData.totalLateMinutes} menit)
                </span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Cuti / Sakit / Izin</span>
                <span className="font-medium">
                  {payrollData.leaveDays} / {payrollData.sickDays} / {payrollData.permitDays}
                </span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Total Jam Kerja</span>
                <span className="font-medium">{payrollData.totalWorkHours} jam</span>
              </div>
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Lembur</span>
                <span className="font-medium">{payrollData.overtimeHours} jam</span>
              </div>
            </div>
          </div>

          {/* Income */}
          <div className="section mb-4">
            <div className="section-title bg-muted rounded px-3 py-2 font-semibold text-sm mb-2">
              PENDAPATAN
            </div>
            <div className="space-y-1 text-sm">
              <div className="detail-row flex justify-between py-1.5 px-2">
                <span>Gaji Pokok {payrollData.employee.salary_type === 'daily' && `(${payrollData.workingDays} hari)`}</span>
                <span className="detail-value font-medium">{formatCurrency(payrollData.monthlySalary)}</span>
              </div>
              {payrollData.overtimeAmount > 0 && (
                <div className="detail-row flex justify-between py-1.5 px-2">
                  <span>Uang Lembur ({payrollData.overtimeHours} jam)</span>
                  <span className="detail-value font-medium addition text-green-600">
                    +{formatCurrency(payrollData.overtimeAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Deductions */}
          <div className="section mb-4">
            <div className="section-title bg-muted rounded px-3 py-2 font-semibold text-sm mb-2">
              POTONGAN
            </div>
            <div className="space-y-1 text-sm">
              {payrollData.lateDeduction > 0 && (
                <div className="detail-row flex justify-between py-1.5 px-2">
                  <span>Potongan Telat ({payrollData.totalLateMinutes} menit)</span>
                  <span className="detail-value font-medium deduction text-destructive">
                    -{formatCurrency(payrollData.lateDeduction)}
                  </span>
                </div>
              )}
              {payrollData.earlyLeaveDeduction > 0 && (
                <div className="detail-row flex justify-between py-1.5 px-2">
                  <span>Potongan Pulang Awal ({payrollData.totalEarlyLeaveMinutes} menit)</span>
                  <span className="detail-value font-medium deduction text-destructive">
                    -{formatCurrency(payrollData.earlyLeaveDeduction)}
                  </span>
                </div>
              )}
              {showBpjs && payrollData.totalBpjsEmployee > 0 && (
                <>
                  <div className="detail-row flex justify-between py-1.5 px-2">
                    <span>BPJS Kesehatan</span>
                    <span className="detail-value font-medium deduction text-destructive">
                      -{formatCurrency(payrollData.bpjsKesehatanEmployee)}
                    </span>
                  </div>
                  <div className="detail-row flex justify-between py-1.5 px-2">
                    <span>BPJS JHT</span>
                    <span className="detail-value font-medium deduction text-destructive">
                      -{formatCurrency(payrollData.bpjsJhtEmployee)}
                    </span>
                  </div>
                  <div className="detail-row flex justify-between py-1.5 px-2">
                    <span>BPJS JP</span>
                    <span className="detail-value font-medium deduction text-destructive">
                      -{formatCurrency(payrollData.bpjsJpEmployee)}
                    </span>
                  </div>
                </>
              )}
              {showPph21 && payrollData.pph21 > 0 && (
                <div className="detail-row flex justify-between py-1.5 px-2">
                  <span>PPh 21</span>
                  <span className="detail-value font-medium deduction text-destructive">
                    -{formatCurrency(payrollData.pph21)}
                  </span>
                </div>
              )}
              {payrollData.totalDeductions === 0 && (
                <div className="detail-row flex justify-between py-1.5 px-2 text-muted-foreground">
                  <span>Tidak ada potongan</span>
                  <span>-</span>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Totals */}
          <div className="total-section space-y-2 pt-4 border-t-2 border-foreground">
            <div className="total-row flex justify-between text-sm">
              <span>Total Pendapatan</span>
              <span className="font-semibold">
                {formatCurrency(payrollData.monthlySalary + payrollData.totalAdditions)}
              </span>
            </div>
            <div className="total-row flex justify-between text-sm">
              <span>Total Potongan</span>
              <span className="font-semibold text-destructive">
                -{formatCurrency(payrollData.totalDeductions)}
              </span>
            </div>
            <Separator />
            <div className="total-row flex justify-between items-center pt-2">
              <span className="text-lg font-bold">GAJI BERSIH</span>
              <span className="net-salary text-xl font-bold text-green-600">
                {formatCurrency(payrollData.netSalary)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="footer mt-6 pt-4 border-t border-dashed text-center text-xs text-muted-foreground">
            <p>Slip gaji ini dibuat secara otomatis oleh sistem.</p>
            <p>Dicetak pada: {format(new Date(), 'dd MMMM yyyy HH:mm', { locale: idLocale })}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
