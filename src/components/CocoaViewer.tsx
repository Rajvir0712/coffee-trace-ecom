import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CocoaRecord } from "@/lib/cocoaParser";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CocoaViewerProps {
  records: CocoaRecord[];
  saleContract: string;
}

export const CocoaViewer = ({ records, saleContract }: CocoaViewerProps) => {
  const handleExport = () => {
    if (records.length === 0) {
      toast.error("No data to export");
      return;
    }

    // Create CSV
    const headers = [
      'Company', 'PC', 'Lot Number', 'Lot Code', 'Client', 'Invoice', 
      'Invoice Date', 'Destination', 'Shipment date', 'Sale Contract #',
      'Customer ref', 'Purchase Contract', 'EAL Reference', 'Counterparty',
      'Quantity', 'Unit', 'Lot #', 'Container Number', 'Certified', 'BL #'
    ];

    const csvRows = records.map(record => 
      [
        `"${record.Company || ''}"`,
        `"${record.PC || ''}"`,
        `"${record['Lot Number'] || ''}"`,
        `"${record['Lot Code'] || ''}"`,
        `"${record.Client || ''}"`,
        `"${record.Invoice || ''}"`,
        `"${record['Invoice Date'] || ''}"`,
        `"${record.Destination || ''}"`,
        `"${record['Shipment date'] || ''}"`,
        `"${record['Sale Contract #'] || ''}"`,
        `"${record['Customer ref'] || ''}"`,
        `"${record['Purchase Contract'] || ''}"`,
        `"${record['EAL Reference'] || ''}"`,
        `"${record.Counterparty || ''}"`,
        `"${record.Quantity || ''}"`,
        `"${record.Unit || ''}"`,
        `"${record['Lot #'] || ''}"`,
        `"${record['Container Number'] || ''}"`,
        `"${record.Certified || ''}"`,
        `"${record['BL #'] || ''}"`
      ].join(',')
    );

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cocoa_${saleContract}_export.csv`;
    link.click();
    
    toast.success(`Exported ${records.length} records`);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cocoa Sales Contract Records</CardTitle>
            <CardDescription>
              Showing {records.length} record(s) for Sale Contract # {saleContract}
            </CardDescription>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No records found for this sale contract</p>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>PC</TableHead>
                  <TableHead>Lot Number</TableHead>
                  <TableHead>Lot Code</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Shipment Date</TableHead>
                  <TableHead>Sale Contract #</TableHead>
                  <TableHead>Customer Ref</TableHead>
                  <TableHead>Purchase Contract</TableHead>
                  <TableHead>EAL Reference</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Lot #</TableHead>
                  <TableHead>Container Number</TableHead>
                  <TableHead>Certified</TableHead>
                  <TableHead>BL #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">{record.Company}</TableCell>
                    <TableCell className="font-mono text-xs">{record.PC}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Lot Number']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Lot Code']}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Client}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Invoice}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Invoice Date']}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Destination}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Shipment date']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Sale Contract #']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Customer ref']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Purchase Contract']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['EAL Reference']}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Counterparty}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Quantity}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Unit}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Lot #']}</TableCell>
                    <TableCell className="font-mono text-xs">{record['Container Number']}</TableCell>
                    <TableCell className="font-mono text-xs">{record.Certified}</TableCell>
                    <TableCell className="font-mono text-xs">{record['BL #']}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
