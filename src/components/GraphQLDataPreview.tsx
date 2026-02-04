import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Database, AlertCircle, Download, Loader2, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface FetchProgress {
  currentPage: number;
  totalRecords: number;
  isComplete: boolean;
}

interface GraphQLDataPreviewProps {
  autoFetch?: boolean;
}

function DataTable({ data, tableName }: { data: Array<Record<string, unknown>>; tableName: string }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Database className="w-12 h-12 mb-2 opacity-50" />
        <p>No data in {tableName}</p>
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

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="rounded-md border">
        <div className="p-4 space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    </div>
  );
}

function downloadAsExcel(data: Array<Record<string, unknown>>, filename: string) {
  if (data.length === 0) return;
  
  const flatData = data.map(row => {
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
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

const PAGE_SIZE = 10000;

export function GraphQLDataPreview({ autoFetch = true }: GraphQLDataPreviewProps) {
  const [allNodes, setAllNodes] = useState<Array<Record<string, unknown>>>([]);
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress>({
    currentPage: 0,
    totalRecords: 0,
    isComplete: false,
  });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const fetchAllPages = useCallback(async () => {
    setIsFetchingAll(true);
    setError(null);
    setAllNodes([]);
    setFetchProgress({ currentPage: 0, totalRecords: 0, isComplete: false });
    abortRef.current = false;

    let cursor: string | undefined = undefined;
    let pageNum = 0;
    const accumulated: Array<Record<string, unknown>> = [];

    try {
      while (!abortRef.current) {
        pageNum++;
        setFetchProgress(prev => ({ ...prev, currentPage: pageNum }));

        const { data, error: fnError } = await supabase.functions.invoke('query-fabric-graphql', {
          body: { pageSize: PAGE_SIZE, cursor }
        });

        if (fnError) throw new Error(fnError.message);
        if (data.error) throw new Error(data.error);

        const nodes = data.lineage_nodes || [];
        accumulated.push(...nodes);
        
        setAllNodes([...accumulated]);
        setFetchProgress(prev => ({ 
          ...prev, 
          totalRecords: accumulated.length 
        }));

        const hasNextPage = data.pagination?.has_next_page || false;
        const endCursor = data.pagination?.end_cursor || null;

        // Stop conditions: no more pages OR fewer than PAGE_SIZE records (last page)
        if (!hasNextPage || nodes.length < PAGE_SIZE) {
          setFetchProgress(prev => ({ ...prev, isComplete: true }));
          break;
        }

        cursor = endCursor;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsFetchingAll(false);
    }
  }, []);

  // Auto-fetch all pages on mount
  useEffect(() => {
    if (autoFetch && allNodes.length === 0 && !isFetchingAll && !fetchProgress.isComplete) {
      fetchAllPages();
    }
  }, [autoFetch, fetchAllPages, allNodes.length, isFetchingAll, fetchProgress.isComplete]);

  const handleDownloadAll = () => {
    if (allNodes.length > 0) {
      downloadAsExcel(allNodes, `lineage_nodes_all_${allNodes.length}_records`);
    }
  };

  const handleRetry = () => {
    fetchAllPages();
  };

  if (error && allNodes.length === 0) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Error Loading Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full flex-1 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Lineage Data Preview
          </CardTitle>
          <CardDescription>
            {isFetchingAll ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching page {fetchProgress.currentPage}...
              </span>
            ) : fetchProgress.isComplete ? (
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Complete • {fetchProgress.currentPage} page{fetchProgress.currentPage > 1 ? 's' : ''} fetched
              </span>
            ) : (
              'Loading data from Fabric Lakehouse...'
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {/* Total Records Counter */}
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-primary">
              {fetchProgress.totalRecords.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">Total Records</span>
          </div>
          {fetchProgress.isComplete && allNodes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAll}
            >
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {isFetchingAll && (
          <div className="mb-4">
            <Progress value={undefined} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1 text-center">
              Fetching all pages automatically...
            </p>
          </div>
        )}

        {error && allNodes.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Error on page {fetchProgress.currentPage}: {error}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {allNodes.length.toLocaleString()} records were fetched before the error.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
              Retry from beginning
            </Button>
          </div>
        )}

        {allNodes.length === 0 && !isFetchingAll ? (
          <LoadingSkeleton />
        ) : (
          <Tabs defaultValue="nodes" className="w-full flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="nodes">
                Nodes ({allNodes.length.toLocaleString()})
              </TabsTrigger>
              <TabsTrigger value="edges" disabled>
                Edges (0)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="nodes" className="mt-4 flex-1">
              <DataTable data={allNodes} tableName="lineage_nodes" />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
