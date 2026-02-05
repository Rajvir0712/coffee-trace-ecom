import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Database, AlertCircle, Download, Loader2, CheckCircle2, XCircle, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface LotInfo {
  lotNo: string;
  recordCount: number;
}

interface ExportProgress {
  currentLot: string;
  lotsCompleted: LotInfo[];
  totalLots: number;
  totalRecords: number;
  isComplete: boolean;
  error: string | null;
}

interface GraphQLDataPreviewProps {
  autoFetch?: boolean;
}

const LOT_PAGE_SIZE = 10000; // Records per lot query

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function downloadAsExcel(records: Array<Record<string, unknown>>, tableName: string) {
  if (records.length === 0) return;
  
  const flatData = records.map(row => {
    const flatRow: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        flatRow[key] = null;
      } else if (typeof value === 'object') {
        flatRow[key] = JSON.stringify(value);
      } else {
        flatRow[key] = value as string | number | boolean;
      }
    }
    return flatRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(flatData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  
  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${tableName}_export_${timestamp}.xlsx`);
}

function DataTable({ data }: { data: Array<Record<string, unknown>> }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Database className="w-12 h-12 mb-2 opacity-50" />
        <p>No data loaded yet. Click "Export All to Excel" to fetch data.</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="rounded-md border overflow-auto h-[calc(100vh-400px)] min-h-[400px] w-full">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="whitespace-nowrap font-semibold">
                {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx}>
              {columns.map((col) => (
                <TableCell key={col} className="whitespace-nowrap">
                  {formatCellValue(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProgressPanel({ 
  progress, 
  onCancel 
}: { 
  progress: ExportProgress; 
  onCancel: () => void;
}) {
  const percentComplete = progress.totalLots > 0 
    ? Math.round((progress.lotsCompleted.length / progress.totalLots) * 100) 
    : 0;

  return (
    <div className="rounded-lg border bg-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <h3 className="font-semibold text-lg">Exporting Lineage Data...</h3>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>Lot {progress.lotsCompleted.length + 1} of {progress.totalLots}</span>
          <span>{percentComplete}%</span>
        </div>
        <Progress value={percentComplete} className="h-2" />
      </div>
      
      <div className="space-y-1 mb-4 max-h-32 overflow-auto">
        {progress.lotsCompleted.slice(-5).map((lot) => (
          <div key={lot.lotNo} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="truncate">{lot.lotNo}: {lot.recordCount.toLocaleString()} records</span>
          </div>
        ))}
        {progress.currentLot && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            <span className="truncate">{progress.currentLot}: fetching...</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <p className="font-medium">
          Total: <span className="text-primary">{progress.totalRecords.toLocaleString()}</span> records
        </p>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel Export
        </Button>
      </div>
    </div>
  );
}

function SuccessPanel({ 
  totalRecords, 
  onExportAgain 
}: { 
  totalRecords: number; 
  onExportAgain: () => void;
}) {
  const timestamp = new Date().toISOString().split('T')[0];
  
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
        <h3 className="font-semibold text-lg text-green-800 dark:text-green-200">Export Complete!</h3>
      </div>
      
      <p className="text-green-700 dark:text-green-300 mb-2">
        <span className="font-bold">{totalRecords.toLocaleString()}</span> records exported to Excel
      </p>
      <p className="text-sm text-green-600 dark:text-green-400 mb-4">
        File: lineage_nodes_export_{timestamp}.xlsx
      </p>
      
      <Button onClick={onExportAgain} variant="outline" size="sm">
        <Download className="w-4 h-4 mr-2" />
        Export Again
      </Button>
    </div>
  );
}

function ErrorPanel({ 
  error, 
  currentLot,
  totalRecords,
  onRetry, 
  onDownloadPartial,
  onCancel 
}: { 
  error: string;
  currentLot: string;
  totalRecords: number;
  onRetry: () => void;
  onDownloadPartial: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <XCircle className="w-6 h-6 text-destructive" />
        <h3 className="font-semibold text-lg text-destructive">Export Failed</h3>
      </div>
      
      <p className="text-sm text-destructive mb-2">
        Error on lot {currentLot}: {error}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        {totalRecords.toLocaleString()} records fetched before error
      </p>
      
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onRetry} variant="default" size="sm">
          Retry
        </Button>
        {totalRecords > 0 && (
          <Button onClick={onDownloadPartial} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Download Partial ({totalRecords.toLocaleString()})
          </Button>
        )}
        <Button onClick={onCancel} variant="ghost" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function GraphQLDataPreview({ autoFetch = false }: GraphQLDataPreviewProps) {
  const [allRecords, setAllRecords] = useState<Array<Record<string, unknown>>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    currentLot: '',
    lotsCompleted: [],
    totalLots: 0,
    totalRecords: 0,
    isComplete: false,
    error: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const cancelledRef = useRef(false);

  const exportAllToExcel = useCallback(async () => {
    // Reset state
    setIsExporting(true);
    setShowSuccess(false);
    setAllRecords([]);
    setExportProgress({
      currentLot: '',
      lotsCompleted: [],
      totalLots: 0,
      totalRecords: 0,
      isComplete: false,
      error: null,
    });
    cancelledRef.current = false;

    const accumulated: Array<Record<string, unknown>> = [];

    try {
      // Step 1: Fetch all distinct lot_no values
      console.log('[Export] Fetching distinct lot_no values...');
      setExportProgress(prev => ({ ...prev, currentLot: 'Loading lot list...' }));

      const { data: lotsData, error: lotsError } = await supabase.functions.invoke('query-fabric-graphql', {
        body: { action: 'get_lots', pageSize: 100000 }
      });

      if (lotsError) throw new Error(lotsError.message);
      if (lotsData.error) throw new Error(lotsData.error);

      const lots: string[] = lotsData.lots || [];
      console.log(`[Export] Found ${lots.length} distinct lots`);

      if (lots.length === 0) {
        throw new Error('No lots found in the database');
      }

      setExportProgress(prev => ({ ...prev, totalLots: lots.length }));

      // Step 2: Fetch records for each lot
      for (let i = 0; i < lots.length; i++) {
        if (cancelledRef.current) {
          console.log('[Export] Cancelled by user');
          break;
        }

        const lotNo = lots[i];
        setExportProgress(prev => ({ ...prev, currentLot: lotNo }));

        console.log(`[Export] Fetching lot ${i + 1}/${lots.length}: ${lotNo}`);

        const { data, error: fnError } = await supabase.functions.invoke('query-fabric-graphql', {
          body: { action: 'fetch_by_lot', lotNo, pageSize: LOT_PAGE_SIZE }
        });

        if (fnError) throw new Error(fnError.message);
        if (data.error) throw new Error(data.error);

        const nodes = data.lineage_nodes || [];
        console.log(`[Export] Lot ${lotNo}: ${nodes.length} records`);

        // Append records
        accumulated.push(...nodes);
        setAllRecords([...accumulated]);

        // Update progress
        setExportProgress(prev => ({
          ...prev,
          lotsCompleted: [...prev.lotsCompleted, { lotNo, recordCount: nodes.length }],
          totalRecords: accumulated.length,
        }));
      }

      // If not cancelled and we have data, download Excel
      if (!cancelledRef.current && accumulated.length > 0) {
        console.log(`[Export] Generating Excel with ${accumulated.length} records`);
        setExportProgress(prev => ({ ...prev, isComplete: true }));
        downloadAsExcel(accumulated, 'lineage_nodes');
        setShowSuccess(true);
      }

    } catch (err) {
      console.error('[Export] Error:', err);
      setExportProgress(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch data',
      }));
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleCancel = () => {
    cancelledRef.current = true;
    setIsExporting(false);
  };

  const handleDownloadPartial = () => {
    if (allRecords.length > 0) {
      downloadAsExcel(allRecords, 'lineage_nodes_partial');
    }
  };

  const handleClearError = () => {
    setExportProgress(prev => ({ ...prev, error: null }));
  };

  return (
    <Card className="w-full flex-1 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Lineage Data Export
          </CardTitle>
          <CardDescription>
            Fetch all records from Fabric Lakehouse and export to Excel
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {allRecords.length > 0 && !isExporting && (
            <div className="flex flex-col items-end">
              <span className="text-2xl font-bold text-primary">
                {allRecords.length.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">Records Loaded</span>
            </div>
          )}
          <Button
            onClick={exportAllToExcel}
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Export All to Excel
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col">
        {/* Progress Panel */}
        {isExporting && (
          <ProgressPanel 
            progress={exportProgress} 
            onCancel={handleCancel} 
          />
        )}

        {/* Success Panel */}
        {showSuccess && !isExporting && (
          <SuccessPanel 
            totalRecords={allRecords.length} 
            onExportAgain={exportAllToExcel} 
          />
        )}

        {/* Error Panel */}
        {exportProgress.error && !isExporting && (
          <ErrorPanel
            error={exportProgress.error}
            currentLot={exportProgress.currentLot}
            totalRecords={exportProgress.totalRecords}
            onRetry={exportAllToExcel}
            onDownloadPartial={handleDownloadPartial}
            onCancel={handleClearError}
          />
        )}

        {/* Data Table */}
        <DataTable data={allRecords} />
      </CardContent>
    </Card>
  );
}
