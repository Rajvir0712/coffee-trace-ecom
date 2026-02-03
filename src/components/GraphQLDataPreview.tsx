import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Database, AlertCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";

export interface GraphQLLineageData {
  lineage_nodes: Array<Record<string, unknown>>;
  lineage_edges: Array<Record<string, unknown>>;
  pagination_info?: {
    total_records: number;
    pages_fetched: number;
    batch_size: number;
  };
}

interface GraphQLDataPreviewProps {
  data: GraphQLLineageData | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
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

  // Get column headers from the first item
  const columns = Object.keys(data[0]);

  return (
    <div className="rounded-md border overflow-auto max-h-[400px]">
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
  
  // Flatten any nested objects for Excel compatibility
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

export function GraphQLDataPreview({ data, isLoading, error, onRefresh }: GraphQLDataPreviewProps) {
  if (error) {
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
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Lineage Data Preview
          </CardTitle>
          <CardDescription>
            Data from Fabric Lakehouse GraphQL API
            {data?.pagination_info && (
              <span className="ml-2 text-xs font-medium text-primary">
                • {data.pagination_info.total_records.toLocaleString()} records from {data.pagination_info.pages_fetched} page(s) @ {data.pagination_info.batch_size.toLocaleString()}/page
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {data && data.lineage_nodes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAsExcel(data.lineage_nodes, 'lineage_nodes')}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <Tabs defaultValue="nodes" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="nodes">
                Nodes ({data.lineage_nodes.length})
              </TabsTrigger>
              <TabsTrigger value="edges">
                Edges ({data.lineage_edges.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="nodes" className="mt-4">
              <DataTable data={data.lineage_nodes} tableName="lineage_nodes" />
            </TabsContent>
            <TabsContent value="edges" className="mt-4">
              <DataTable data={data.lineage_edges} tableName="lineage_edges" />
            </TabsContent>
          </Tabs>
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
