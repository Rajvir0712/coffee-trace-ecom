import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FileUpload } from "@/components/FileUpload";
import { LotInput } from "@/components/LotInput";
import { JsonViewer } from "@/components/JsonViewer";
import { StatsCard } from "@/components/StatsCard";
import { LineageFlowGraph } from "@/components/LineageFlowGraph";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JoinStepsViewer } from "@/components/JoinStepsViewer";
import { CoffeeLotLineageTracker, LineageResult, LotStatistics } from "@/lib/excelParser";
import { toast } from "sonner";
import { Coffee, TrendingUp, Package, Calendar, Loader2, Maximize2, Minimize2, Download } from "lucide-react";
import logo from "@/assets/logo.png";

const Index = () => {
  const [file, setFile] = useState<File | null>(null);
  const [tracker, setTracker] = useState<CoffeeLotLineageTracker | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [availableLots, setAvailableLots] = useState<string[]>([]);
  const [availablePurchaseLots, setAvailablePurchaseLots] = useState<string[]>([]);
  const [lineageResult, setLineageResult] = useState<LineageResult | null>(null);
  const [lineageResults, setLineageResults] = useState<LineageResult[]>([]);
  const [statistics, setStatistics] = useState<LotStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPurchaseMode, setIsPurchaseMode] = useState(false);
  const [joinSteps, setJoinSteps] = useState<Array<{step: string, matches: any[]}>>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setLineageResult(null);
    setLineageResults([]);
    setStatistics(null);
    setLotNumber("");
    setSelectedResultIndex(0);

    try {
      const newTracker = new CoffeeLotLineageTracker();
      await newTracker.loadExcelFile(selectedFile);
      setTracker(newTracker);
      
      const lots = newTracker.getAllLotNumbers();
      setAvailableLots(lots);
      
      const purchaseLots = newTracker.getAllPurchaseLots();
      setAvailablePurchaseLots(purchaseLots);
      
      toast.success(`File loaded successfully! Found ${lots.length} production lots and ${purchaseLots.length} purchase lots.`);
    } catch (error) {
      toast.error(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setFile(null);
      setTracker(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessLot = () => {
    if (!tracker || !lotNumber.trim()) {
      toast.error("Please load a file and enter a lot number");
      return;
    }

    setIsProcessing(true);

    try {
      if (isPurchaseMode) {
        const joinStepsData = tracker.getJoinStepsForPurchaseLot(lotNumber.trim());
        setJoinSteps(joinStepsData);
        
        const results = tracker.getPurchaseLotLineage(lotNumber.trim());
        setLineageResults(results);
        setLineageResult(null);
        setStatistics(null); // No direct stats for purchase lots
        setSelectedResultIndex(0);
        toast.success(`Found ${results.length} consumption lot(s) from purchase lot`);
      } else {
        setJoinSteps([]);
        const result = tracker.getLotLineage(lotNumber.trim());
        setLineageResult(result);
        setLineageResults([]);

        const stats = tracker.getLotStatistics(lotNumber.trim());
        if ('error' in stats) {
          toast.error(stats.error);
          setStatistics(null);
        } else {
          setStatistics(stats);
          toast.success(`Traced ${result.total_lots_traced} lots in the lineage`);
        }
      }
    } catch (error) {
      toast.error(`Error processing lot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportLastStep = () => {
    // Check if we're in purchase mode with join steps data
    if (joinSteps.length > 0 && joinSteps.length >= 6) {
      // Export Step 5 data (index 5 = step 5)
      const step5 = joinSteps[5];
      
      if (!step5.matches || step5.matches.length === 0) {
        toast.error("No step 5 data to export");
        return;
      }

      // Build comprehensive export data - include ALL nodes in lineage tree
      const exportRows: any[] = [];
      
      step5.matches.forEach((match: any) => {
        const consumptionLot = match.consumptionLot;
        
        // Get full lineage tree for this consumption lot
        if (tracker) {
          const lineage = tracker.getLotLineage(consumptionLot);
          
          // Recursively collect all nodes from the lineage tree
          const collectAllNodes = (node: any, parentLot: string = '', relationship: string = ''): void => {
            const details = node.details || {};
            
            // Get sources for this node
            const sources = node.sources || [];
            const sourceLots = sources.map((s: any) => s.lot_no).join('; ');
            
            exportRows.push({
              consumption_lot: consumptionLot,
              lot_no: node.lot_no,
              parent_lot: parentLot,
              relationship: relationship || node.relationship || '',
              process_types: (node.process_types || []).join('; '),
              item_no: details.item_no || '',
              description: details.description || '',
              certified: details.certified || '',
              unit_of_measure: details.unit_of_measure || '',
              quantity: details.output_quantity || details.transfer?.transfer_quantity || details.purchase?.quantity || '',
              date: details.output_date || details.transfer?.transfer_date || details.purchase?.date || '',
              location_code: details.location_code || '',
              counterparty: details.counterparty || '',
              production_order: details.production_order || '',
              source_lots: sourceLots,
              is_origin: node.is_origin ? 'Yes' : 'No'
            });
            
            // Recursively process source nodes
            sources.forEach((source: any) => {
              collectAllNodes(source, node.lot_no, source.relationship || 'source');
            });
            
            // Process destination nodes if any
            const destinations = node.destinations || [];
            destinations.forEach((dest: any) => {
              collectAllNodes(dest, node.lot_no, dest.relationship || 'destination');
            });
          };
          
          // Start collecting from the root node
          collectAllNodes(lineage.lineage_tree, '', 'Root');
        }
      });

      // Create CSV
      const headers = [
        'Consumption Lot (Step 5)',
        'Lot No',
        'Parent Lot',
        'Relationship',
        'Process Types',
        'Item No',
        'Description',
        'Certified',
        'Unit of Measure',
        'Quantity',
        'Date',
        'Location Code',
        'Counterparty',
        'Production Order',
        'Source Lots',
        'Is Origin'
      ];

      const csvRows = exportRows.map(row => 
        [
          `"${row.consumption_lot}"`,
          `"${row.lot_no}"`,
          `"${row.parent_lot}"`,
          `"${row.relationship}"`,
          `"${row.process_types}"`,
          `"${row.item_no}"`,
          `"${row.description}"`,
          `"${row.certified}"`,
          `"${row.unit_of_measure}"`,
          `"${row.quantity}"`,
          `"${row.date}"`,
          `"${row.location_code}"`,
          `"${row.counterparty}"`,
          `"${row.production_order}"`,
          `"${row.source_lots}"`,
          `"${row.is_origin}"`
        ].join(',')
      );

      const csvContent = [headers.join(','), ...csvRows].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `step5_full_lineage_${lotNumber}.csv`;
      link.click();
      
      toast.success(`Exported ${exportRows.length} total lots from step 5 lineage trees`);
    } else {
      // Original export for non-purchase mode
      const result = lineageResults.length > 0 ? lineageResults[selectedResultIndex] : lineageResult;
      
      if (!result) {
        toast.error("No data to export");
        return;
      }

      const exportData = {
        consumption_lot: result.query_lot,
        item_no: result.lineage_tree.details.item_no || 'N/A',
        description: result.lineage_tree.details.description || 'N/A',
        certified: result.lineage_tree.details.certified || 'N/A',
        process_types: result.lineage_tree.process_types?.join(', ') || 'N/A',
        total_lots_traced: result.total_lots_traced,
      };

      const csvContent = [
        'Consumption Lot,Item No,Description,Certified,Process Types,Total Lots Traced',
        `"${exportData.consumption_lot}","${exportData.item_no}","${exportData.description}","${exportData.certified}","${exportData.process_types}",${exportData.total_lots_traced}`
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${result.query_lot}_export.csv`;
      link.click();
      
      toast.success("Data exported successfully");
    }
  };

  const handleExportPurchaseOnly = () => {
    // Check if we're in purchase mode with join steps data
    if (joinSteps.length > 0 && joinSteps.length >= 6) {
      // Export Step 5 data (index 5 = step 5)
      const step5 = joinSteps[5];
      
      if (!step5.matches || step5.matches.length === 0) {
        toast.error("No step 5 data to export");
        return;
      }

      // Build comprehensive export data - include ALL nodes in lineage tree
      const exportRows: any[] = [];
      
      step5.matches.forEach((match: any) => {
        const consumptionLot = match.consumptionLot;
        
        // Get full lineage tree for this consumption lot
        if (tracker) {
          const lineage = tracker.getLotLineage(consumptionLot);
          
          // Recursively collect all nodes from the lineage tree
          const collectAllNodes = (node: any, parentLot: string = '', relationship: string = ''): void => {
            const details = node.details || {};
            
            // Get sources for this node
            const sources = node.sources || [];
            const sourceLots = sources.map((s: any) => s.lot_no).join('; ');
            
            // Only add if process_types contains 'Purchase'
            const processTypes = (node.process_types || []).join('; ');
            if (processTypes.includes('Purchase')) {
              exportRows.push({
                consumption_lot: consumptionLot,
                lot_no: node.lot_no,
                parent_lot: parentLot,
                relationship: relationship || node.relationship || '',
                process_types: processTypes,
                item_no: details.item_no || '',
                description: details.description || '',
                certified: details.certified || '',
                unit_of_measure: details.unit_of_measure || '',
                quantity: details.output_quantity || details.transfer?.transfer_quantity || details.purchase?.quantity || '',
                date: details.output_date || details.transfer?.transfer_date || details.purchase?.date || '',
                location_code: details.location_code || '',
                counterparty: details.counterparty || '',
                production_order: details.production_order || '',
                source_lots: sourceLots,
                is_origin: node.is_origin ? 'Yes' : 'No'
              });
            }
            
            // Recursively process source nodes
            sources.forEach((source: any) => {
              collectAllNodes(source, node.lot_no, source.relationship || 'source');
            });
            
            // Process destination nodes if any
            const destinations = node.destinations || [];
            destinations.forEach((dest: any) => {
              collectAllNodes(dest, node.lot_no, dest.relationship || 'destination');
            });
          };
          
          // Start collecting from the root node
          collectAllNodes(lineage.lineage_tree, '', 'Root');
        }
      });

      if (exportRows.length === 0) {
        toast.error("No purchase lots found in the lineage");
        return;
      }

      // Create CSV
      const headers = [
        'Consumption Lot (Step 5)',
        'Lot No',
        'Parent Lot',
        'Relationship',
        'Process Types',
        'Item No',
        'Description',
        'Certified',
        'Unit of Measure',
        'Quantity',
        'Date',
        'Location Code',
        'Counterparty',
        'Production Order',
        'Source Lots',
        'Is Origin'
      ];

      const csvRows = exportRows.map(row => 
        [
          `"${row.consumption_lot}"`,
          `"${row.lot_no}"`,
          `"${row.parent_lot}"`,
          `"${row.relationship}"`,
          `"${row.process_types}"`,
          `"${row.item_no}"`,
          `"${row.description}"`,
          `"${row.certified}"`,
          `"${row.unit_of_measure}"`,
          `"${row.quantity}"`,
          `"${row.date}"`,
          `"${row.location_code}"`,
          `"${row.counterparty}"`,
          `"${row.production_order}"`,
          `"${row.source_lots}"`,
          `"${row.is_origin}"`
        ].join(',')
      );

      const csvContent = [headers.join(','), ...csvRows].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `step5_purchase_only_${lotNumber}.csv`;
      link.click();
      
      toast.success(`Exported ${exportRows.length} purchase lots from step 5 lineage trees`);
    } else {
      toast.error("Purchase-only export is only available in Sale Contract # Mode");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-6 relative">
          <div className="absolute right-4 top-4">
            <ThemeToggle />
          </div>
          <div className="flex flex-col items-center text-center">
            <img src={logo} alt="ECOM Logo" className="h-16 w-auto object-contain mb-4" />
            <h1 className="text-3xl font-bold text-primary mb-2">ECOM Traceability Tracker</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Trace the complete supply chain journey of coffee lots
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-7xl relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Excel File</CardTitle>
                <CardDescription>
                  Upload your ACOM Production Consumption Excel file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload
                  onFileSelect={handleFileSelect}
                  selectedFile={file}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trace Lot Lineage</CardTitle>
                <CardDescription>
                  {isPurchaseMode 
                    ? "Enter or select a sale contract # to trace forward through production"
                    : "Enter or select a consumption lot to trace its history"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-accent/10 rounded-lg">
                  <Label htmlFor="purchase-mode" className="cursor-pointer">
                    {isPurchaseMode ? "Sale Contract # Mode" : "Consumption Lot Mode"}
                  </Label>
                  <Switch
                    id="purchase-mode"
                    checked={isPurchaseMode}
                    onCheckedChange={(checked) => {
                      setIsPurchaseMode(checked);
                      setLotNumber("");
                      setLineageResult(null);
                      setLineageResults([]);
                      setStatistics(null);
                      setSelectedResultIndex(0);
                    }}
                    disabled={!tracker}
                  />
                </div>
                <LotInput
                  lotNumber={lotNumber}
                  onLotNumberChange={setLotNumber}
                  availableLots={isPurchaseMode ? availablePurchaseLots : availableLots}
                  disabled={!tracker || isProcessing}
                />
                <Button
                  onClick={handleProcessLot}
                  disabled={!tracker || !lotNumber.trim() || isProcessing}
                  className="w-full"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Trace Lineage"
                  )}
                </Button>
              </CardContent>
            </Card>

            {statistics && !('error' in statistics) && (
              <Card>
                <CardHeader>
                  <CardTitle>Lot Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatsCard
                    title="Total Records"
                    value={statistics.total_records}
                    icon={Package}
                  />
                  <StatsCard
                    title="Process Types"
                    value={Object.keys(statistics.process_types).length}
                    icon={Coffee}
                    description={Object.entries(statistics.process_types)
                      .map(([type, count]) => `${type}: ${count}`)
                      .join(", ")}
                  />
                  {statistics.date_range.earliest && (
                    <StatsCard
                      title="Date Range"
                      value={statistics.date_range.earliest}
                      icon={Calendar}
                      description={`to ${statistics.date_range.latest || 'N/A'}`}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel - Results */}
          <div className={isFullscreen ? "fixed inset-0 z-50 bg-background p-4 overflow-auto" : "lg:col-span-2"}>
            <Card className={isFullscreen ? "h-full rounded-lg border-2" : "min-h-[600px]"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lineage Results</CardTitle>
                    <CardDescription>
                      Complete lineage tree and statistics for the traced lot
                    </CardDescription>
                  </div>
                  {(lineageResult || lineageResults.length > 0) && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportLastStep}
                        className="shrink-0"
                        title="Export all lots"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        All Lots
                      </Button>
                      {joinSteps.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleExportPurchaseOnly}
                          className="shrink-0"
                          title="Export purchase lots only"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Purchase Only
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="shrink-0"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-4 w-4" />
                        ) : (
                          <Maximize2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {lineageResult || lineageResults.length > 0 ? (
                  <div className="space-y-6">
                    {joinSteps.length > 0 && (
                      <JoinStepsViewer steps={joinSteps} />
                    )}
                    <Tabs defaultValue="graph" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="graph">Flow Graph</TabsTrigger>
                        <TabsTrigger value="json">JSON View</TabsTrigger>
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                      </TabsList>
                      <TabsContent value="graph" className="mt-6">
                        {lineageResults.length > 0 ? (
                          <>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                              <div className="text-sm text-muted-foreground">Consumption lot</div>
                              <Select value={String(selectedResultIndex)} onValueChange={(v) => setSelectedResultIndex(parseInt(v))}>
                                <SelectTrigger className="w-full sm:w-[360px] bg-card z-50">
                                  <SelectValue placeholder="Select lot" />
                                </SelectTrigger>
                                <SelectContent className="z-[60] bg-popover">
                                  {lineageResults.map((result, index) => (
                                    <SelectItem key={index} value={String(index)}>
                                      {result.query_lot}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="text-xs text-muted-foreground sm:ml-auto">
                                {selectedResultIndex + 1} of {lineageResults.length}
                              </div>
                            </div>
                            {lineageResults[selectedResultIndex] && (
                              <LineageFlowGraph data={lineageResults[selectedResultIndex].lineage_tree} />
                            )}
                          </>
                        ) : lineageResult ? (
                          <LineageFlowGraph data={lineageResult.lineage_tree} />
                        ) : null}
                      </TabsContent>
                    <TabsContent value="json" className="mt-6">
                      <JsonViewer
                        data={lineageResults.length > 0 ? lineageResults[selectedResultIndex] : lineageResult}
                        filename={`${lotNumber}_lineage`}
                      />
                    </TabsContent>
                    <TabsContent value="summary" className="mt-6">
                      {lineageResults.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="text-sm text-muted-foreground">Consumption lot</div>
                            <Select value={String(selectedResultIndex)} onValueChange={(v) => setSelectedResultIndex(parseInt(v))}>
                              <SelectTrigger className="w-full sm:w-[360px] bg-card z-50">
                                <SelectValue placeholder="Select lot" />
                              </SelectTrigger>
                              <SelectContent className="z-[60] bg-popover">
                                {lineageResults.map((result, index) => (
                                  <SelectItem key={index} value={String(index)}>
                                    {result.query_lot}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground sm:ml-auto">
                              {selectedResultIndex + 1} of {lineageResults.length}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-accent/10 rounded-lg">
                              <div className="text-sm text-muted-foreground">Consumption Lot</div>
                              <div className="text-lg font-semibold mt-1">
                                {lineageResults[selectedResultIndex]?.query_lot}
                              </div>
                            </div>
                            <div className="p-4 bg-accent/10 rounded-lg">
                              <div className="text-sm text-muted-foreground">Total Lots Traced</div>
                              <div className="text-lg font-semibold mt-1">
                                {lineageResults[selectedResultIndex]?.total_lots_traced}
                              </div>
                            </div>
                          </div>
                          <div className="p-4 bg-card border rounded-lg">
                            <h4 className="font-semibold mb-2">Lineage Details</h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Item: </span>
                                <span className="font-medium">
                                  {lineageResults[selectedResultIndex]?.lineage_tree.details.description || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Item No: </span>
                                <span className="font-medium">
                                  {lineageResults[selectedResultIndex]?.lineage_tree.details.item_no || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Certified: </span>
                                <span className="font-medium">
                                  {lineageResults[selectedResultIndex]?.lineage_tree.details.certified || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Process Types: </span>
                                <span className="font-medium">
                                  {lineageResults[selectedResultIndex]?.lineage_tree.process_types?.join(', ') || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : lineageResult ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-accent/10 rounded-lg">
                              <div className="text-sm text-muted-foreground">Query Lot</div>
                              <div className="text-lg font-semibold mt-1">
                                {lineageResult.query_lot}
                              </div>
                            </div>
                            <div className="p-4 bg-accent/10 rounded-lg">
                              <div className="text-sm text-muted-foreground">
                                Total Lots Traced
                              </div>
                              <div className="text-lg font-semibold mt-1">
                                {lineageResult.total_lots_traced}
                              </div>
                            </div>
                          </div>
                          <div className="p-4 bg-card border rounded-lg">
                            <h4 className="font-semibold mb-2">Lineage Details</h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Item: </span>
                                <span className="font-medium">
                                  {lineageResult.lineage_tree.details.description || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Item No: </span>
                                <span className="font-medium">
                                  {lineageResult.lineage_tree.details.item_no || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Certified: </span>
                                <span className="font-medium">
                                  {lineageResult.lineage_tree.details.certified || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Process Types: </span>
                                <span className="font-medium">
                                  {lineageResult.lineage_tree.process_types?.join(', ') || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </TabsContent>
                  </Tabs>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] text-center">
                    <Coffee className="w-16 h-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      No Results Yet
                    </h3>
                    <p className="text-muted-foreground max-w-md">
                      Upload an Excel file and enter a lot number to trace its complete lineage
                      through the supply chain.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/30 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>ECOM Traceability Tracker - Tracing supply chain transparency</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
