import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ImportResult {
  row: number;
  name: string;
  email: string;
  status: 'success' | 'error' | 'pending';
  message?: string;
}

interface Shift {
  id: string;
  name: string;
}

interface ImportEmployeesProps {
  shifts: Shift[];
  isDeveloper: boolean;
  onSuccess: () => void;
}

// Template columns - these match what we expect in the Excel file
const TEMPLATE_COLUMNS = [
  'nama_lengkap',
  'email',
  'password',
  'jabatan',
  'departemen',
  'shift',
  'role'
];

const TEMPLATE_EXAMPLE_DATA = [
  {
    nama_lengkap: 'John Doe',
    email: 'john.doe@company.com',
    password: 'password123',
    jabatan: 'Software Engineer',
    departemen: 'IT',
    shift: 'Regular (08:00 - 17:00)',
    role: 'employee'
  },
  {
    nama_lengkap: 'Jane Smith',
    email: 'jane.smith@company.com',
    password: 'password456',
    jabatan: 'HR Manager',
    departemen: 'HR',
    shift: 'Regular (08:00 - 17:00)',
    role: 'employee'
  }
];

export const ImportEmployees = ({ shifts, isDeveloper, onSuccess }: ImportEmployeesProps) => {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importComplete, setImportComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate and download template
  const handleDownloadTemplate = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create instructions sheet
    const instructionsData = [
      ['PETUNJUK PENGGUNAAN TEMPLATE IMPORT KARYAWAN'],
      [''],
      ['1. Isi data karyawan pada sheet "Data Karyawan"'],
      ['2. Kolom dengan tanda (*) wajib diisi'],
      ['3. Jangan mengubah nama kolom (baris pertama)'],
      ['4. Password minimal 6 karakter'],
      ['5. Role hanya boleh diisi: employee atau admin (default: employee)'],
      ['6. Shift harus sesuai dengan nama shift yang tersedia di sistem'],
      [''],
      ['DAFTAR SHIFT TERSEDIA:'],
      ...shifts.map((s, i) => [`${i + 1}. ${s.name}`]),
      [''],
      ['CATATAN:'],
      ['- Jika role tidak diisi, akan otomatis menjadi "employee"'],
      ['- Admin hanya bisa membuat role "employee"'],
      ['- Developer bisa membuat role "employee" atau "admin"'],
    ];
    
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
    wsInstructions['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Petunjuk');
    
    // Create data sheet with headers and example
    const dataWithHeaders = [
      ['nama_lengkap*', 'email*', 'password*', 'jabatan', 'departemen', 'shift', 'role'],
      ...TEMPLATE_EXAMPLE_DATA.map(row => [
        row.nama_lengkap,
        row.email,
        row.password,
        row.jabatan,
        row.departemen,
        row.shift,
        row.role
      ])
    ];
    
    const wsData = XLSX.utils.aoa_to_sheet(dataWithHeaders);
    wsData['!cols'] = [
      { wch: 25 }, // nama_lengkap
      { wch: 30 }, // email
      { wch: 15 }, // password
      { wch: 25 }, // jabatan
      { wch: 15 }, // departemen
      { wch: 25 }, // shift
      { wch: 10 }, // role
    ];
    XLSX.utils.book_append_sheet(wb, wsData, 'Data Karyawan');
    
    // Download file
    XLSX.writeFile(wb, 'Template_Import_Karyawan.xlsx');
    toast.success('Template berhasil diunduh!');
  };

  // Find shift ID by name
  const findShiftId = (shiftName: string): string | null => {
    if (!shiftName) return null;
    const shift = shifts.find(s => 
      s.name.toLowerCase().includes(shiftName.toLowerCase()) ||
      shiftName.toLowerCase().includes(s.name.toLowerCase())
    );
    return shift?.id || null;
  };

  // Wait and retry profile update (handle race condition with trigger)
  const updateProfileWithRetry = async (
    userId: string, 
    updates: { job_title?: string | null; department?: string | null; shift_id?: string | null },
    maxRetries = 3,
    delayMs = 500
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', userId);
      
      if (!error) return true;
      
      console.log(`Profile update attempt ${attempt + 1} failed, retrying...`);
    }
    return false;
  };

  // Import single employee
  const importEmployee = async (
    row: { nama_lengkap: string; email: string; password: string; jabatan?: string; departemen?: string; shift?: string; role?: string }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      // Validate required fields
      if (!row.nama_lengkap || !row.email || !row.password) {
        return { success: false, message: 'Nama, email, dan password wajib diisi' };
      }

      if (row.password.length < 6) {
        return { success: false, message: 'Password minimal 6 karakter' };
      }

      // Determine role
      let role = 'employee';
      if (row.role) {
        const normalizedRole = row.role.toLowerCase().trim();
        if (normalizedRole === 'admin') {
          if (!isDeveloper) {
            return { success: false, message: 'Admin hanya bisa membuat role employee' };
          }
          role = 'admin';
        } else if (normalizedRole !== 'employee') {
          return { success: false, message: 'Role harus employee atau admin' };
        }
      }

      // Create user via edge function
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: row.email.trim(),
          password: row.password,
          fullName: row.nama_lengkap.trim(),
          role: role,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Update additional fields if provided
      const shiftId = row.shift ? findShiftId(row.shift) : null;
      if (row.jabatan || row.departemen || shiftId) {
        const updateSuccess = await updateProfileWithRetry(data.user.id, {
          job_title: row.jabatan?.trim() || null,
          department: row.departemen?.trim() || null,
          shift_id: shiftId,
        });

        if (!updateSuccess) {
          return { success: true, message: 'Dibuat, tapi data tambahan gagal disimpan' };
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Import error:', error);
      return { success: false, message: error.message || 'Gagal membuat user' };
    }
  };

  // Handle file selection and import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setShowImportDialog(true);
    setIsImporting(true);
    setImportProgress(0);
    setImportResults([]);
    setImportComplete(false);

    try {
      // Read file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Find data sheet
      let sheetName = 'Data Karyawan';
      if (!workbook.SheetNames.includes(sheetName)) {
        // Try first sheet that's not instructions
        sheetName = workbook.SheetNames.find(s => s !== 'Petunjuk') || workbook.SheetNames[0];
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
      
      if (jsonData.length === 0) {
        toast.error('File tidak berisi data');
        setIsImporting(false);
        return;
      }

      // Normalize column names (remove * and trim)
      const normalizedData = jsonData.map(row => {
        const normalized: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.replace('*', '').trim().toLowerCase();
          normalized[normalizedKey] = row[key];
        });
        return normalized;
      });

      // Initialize results
      const initialResults: ImportResult[] = normalizedData.map((row, index) => ({
        row: index + 2, // +2 because Excel is 1-indexed and has header
        name: String(row.nama_lengkap || ''),
        email: String(row.email || ''),
        status: 'pending' as const,
      }));
      setImportResults(initialResults);

      // Process each row
      let successCount = 0;
      for (let i = 0; i < normalizedData.length; i++) {
        const row = normalizedData[i];
        
        const result = await importEmployee({
          nama_lengkap: String(row.nama_lengkap || ''),
          email: String(row.email || ''),
          password: String(row.password || ''),
          jabatan: row.jabatan ? String(row.jabatan) : undefined,
          departemen: row.departemen ? String(row.departemen) : undefined,
          shift: row.shift ? String(row.shift) : undefined,
          role: row.role ? String(row.role) : undefined,
        });

        // Update result
        setImportResults(prev => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: result.success ? 'success' : 'error',
            message: result.message,
          };
          return updated;
        });

        if (result.success) successCount++;
        
        // Update progress
        setImportProgress(Math.round(((i + 1) / normalizedData.length) * 100));
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setImportComplete(true);
      setIsImporting(false);

      // Show summary
      const failCount = normalizedData.length - successCount;
      if (failCount === 0) {
        toast.success(`Berhasil import ${successCount} karyawan!`);
      } else if (successCount === 0) {
        toast.error(`Gagal import semua ${failCount} karyawan`);
      } else {
        toast.warning(`${successCount} berhasil, ${failCount} gagal`);
      }

      // Refresh employee list
      onSuccess();

    } catch (error: any) {
      console.error('File read error:', error);
      toast.error('Gagal membaca file: ' + error.message);
      setIsImporting(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const successCount = importResults.filter(r => r.status === 'success').length;
  const errorCount = importResults.filter(r => r.status === 'error').length;

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={handleDownloadTemplate}
          className="border-2 border-foreground"
        >
          <Download className="h-4 w-4 mr-2" />
          Template Excel
        </Button>
        <Button 
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-foreground"
        >
          <Upload className="h-4 w-4 mr-2" />
          Import Excel
        </Button>
      </div>

      {/* Import Progress Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => {
        if (!isImporting) setShowImportDialog(open);
      }}>
        <DialogContent className="border-2 border-foreground max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {isImporting ? 'Mengimport Karyawan...' : 'Hasil Import'}
            </DialogTitle>
            <DialogDescription>
              {isImporting 
                ? `Memproses ${importResults.length} data karyawan`
                : `Selesai memproses ${importResults.length} data`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} className="h-2" />
            </div>

            {/* Summary badges */}
            {importComplete && (
              <div className="flex gap-4">
                <Badge variant="default" className="bg-green-600 text-base py-1 px-3">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Berhasil: {successCount}
                </Badge>
                <Badge variant="destructive" className="text-base py-1 px-3">
                  <XCircle className="h-4 w-4 mr-1" />
                  Gagal: {errorCount}
                </Badge>
              </div>
            )}

            {/* Results list */}
            <ScrollArea className="h-[300px] rounded-lg border-2 border-foreground">
              <div className="p-4 space-y-2">
                {importResults.map((result, index) => (
                  <div 
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      result.status === 'success' 
                        ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
                        : result.status === 'error'
                        ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                        : 'bg-muted border-muted-foreground/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.status === 'pending' && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {result.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {result.status === 'error' && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <div className="font-medium text-sm">
                          Baris {result.row}: {result.name || '(Nama kosong)'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.email || '(Email kosong)'}
                        </div>
                      </div>
                    </div>
                    {result.message && (
                      <div className={`text-xs max-w-[200px] text-right ${
                        result.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        {result.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end">
            <Button 
              onClick={() => setShowImportDialog(false)}
              disabled={isImporting}
            >
              {isImporting ? 'Mohon Tunggu...' : 'Tutup'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
