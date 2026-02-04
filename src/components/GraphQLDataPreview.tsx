import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, AlertCircle, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface PageData {
  nodes: Array<Record<string, unknown>>;
  endCursor: string | null;
  hasNextPage: boolean;
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
  const [pages, setPages] = useState<Map<number, PageData>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPageData = pages.get(currentPage);

  const fetchPage = useCallback(async (pageNum: number, cursor?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('query-fabric-graphql', {
        body: { pageSize: PAGE_SIZE, cursor }
      });

      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);

      const pageData: PageData = {
        nodes: data.lineage_nodes || [],
        endCursor: data.pagination?.end_cursor || null,
        hasNextPage: data.pagination?.has_next_page || false,
      };

      setPages(prev => new Map(prev).set(pageNum, pageData));
      setCurrentPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-fetch page 1 on mount
  useEffect(() => {
    if (autoFetch && pages.size === 0) {
      fetchPage(1);
    }
  }, [autoFetch, fetchPage, pages.size]);

  const handleNextPage = () => {
    const nextPageNum = currentPage + 1;
    const existingPage = pages.get(nextPageNum);
    
    if (existingPage) {
      setCurrentPage(nextPageNum);
    } else if (currentPageData?.hasNextPage && currentPageData.endCursor) {
      fetchPage(nextPageNum, currentPageData.endCursor);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleDownloadCurrentPage = () => {
    if (currentPageData?.nodes) {
      downloadAsExcel(currentPageData.nodes, `lineage_nodes_page_${currentPage}`);
    }
  };

  if (error && pages.size === 0) {
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
          <Button variant="outline" size="sm" onClick={() => fetchPage(1)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const startRow = (currentPage - 1) * PAGE_SIZE + 1;
  const endRow = startRow + (currentPageData?.nodes.length || 0) - 1;
  const hasNextPage = currentPageData?.hasNextPage || pages.has(currentPage + 1);
  const hasPrevPage = currentPage > 1;

  return (
    <Card className="w-full flex-1 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Lineage Data Preview
          </CardTitle>
          <CardDescription>
            {currentPageData ? (
              <>
                Page {currentPage} • Rows {startRow.toLocaleString()} - {endRow.toLocaleString()}
                {currentPageData.hasNextPage && <span className="text-primary"> • More available</span>}
              </>
            ) : (
              'Loading data from Fabric Lakehouse...'
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {currentPageData && currentPageData.nodes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCurrentPage}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Page {currentPage}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && pages.size === 0 ? (
          <LoadingSkeleton />
        ) : currentPageData ? (
          <>
            <Tabs defaultValue="nodes" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="nodes">
                  Nodes ({currentPageData.nodes.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="edges" disabled>
                  Edges (0)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="nodes" className="mt-4">
                <DataTable data={currentPageData.nodes} tableName="lineage_nodes" />
              </TabsContent>
            </Tabs>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={!hasPrevPage || isLoading}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>Page {currentPage}</span>
                {Array.from(pages.keys()).length > 1 && (
                  <span className="text-xs">
                    ({Array.from(pages.keys()).length} pages loaded)
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNextPage || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-1" />
                )}
                Next
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Database className="w-12 h-12 mb-2 opacity-50" />
            <p>No data loaded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
