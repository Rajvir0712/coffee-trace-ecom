import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/FileUpload";
import { LotInput } from "@/components/LotInput";
import { JsonViewer } from "@/components/JsonViewer";
import { StatsCard } from "@/components/StatsCard";
import { LineageFlowGraph } from "@/components/LineageFlowGraph";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JoinStepsViewer } from "@/components/JoinStepsViewer";
import { CoffeeLotLineageTracker, LineageResult, LotStatistics } from "@/lib/excelParser";
import { CocoaTracker, CocoaRecord } from "@/lib/cocoaParser";
import { CocoaViewer } from "@/components/CocoaViewer";
import { analyzeVLOOKUPStructure } from "@/lib/analyzeVLOOKUP";
import { triggerLineageTrace, checkJobStatus, mapJobStatus, queryFabricGraphQL, JobStatus, GraphQLLineageData } from "@/lib/fabricApi";
import { GraphQLDataPreview } from "@/components/GraphQLDataPreview";
import { toast } from "sonner";
import { Coffee, TrendingUp, Package, Calendar, Loader2, Maximize2, Minimize2, Download, Cloud, FileSpreadsheet } from "lucide-react";
import logo from "@/assets/logo.png";

const Index = () => {
  const [productMode, setProductMode] = useState<'coffee' | 'cocoa'>('coffee');
  const [file, setFile] = useState<File | null>(null);
  const [tracker, setTracker] = useState<CoffeeLotLineageTracker | null>(null);
  const [cocoaTracker, setCocoaTracker] = useState<CocoaTracker | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [availableLots, setAvailableLots] = useState<string[]>([]);
  const [availablePurchaseLots, setAvailablePurchaseLots] = useState<string[]>([]);
  const [availableCocoaSalesContracts, setAvailableCocoaSalesContracts] = useState<string[]>([]);
  const [lineageResult, setLineageResult] = useState<LineageResult | null>(null);
  const [lineageResults, setLineageResults] = useState<LineageResult[]>([]);
  const [statistics, setStatistics] = useState<LotStatistics | null>(null);
  const [cocoaRecords, setCocoaRecords] = useState<CocoaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPurchaseMode, setIsPurchaseMode] = useState(false);
  const [joinSteps, setJoinSteps] = useState<Array<{step: string, matches: any[]}>>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  
  // Fabric Lakehouse mode
  const [dataSource, setDataSource] = useState<'excel' | 'fabric'>('excel');
  const [fabricSalesContract, setFabricSalesContract] = useState("");
  const [fabricJobId, setFabricJobId] = useState<string | null>(null);
  const [fabricJobStatus, setFabricJobStatus] = useState<JobStatus | null>(null);
  const [fabricStatusMessage, setFabricStatusMessage] = useState("");
  const [isFabricTriggering, setIsFabricTriggering] = useState(false);
  
  // GraphQL data state
  const [graphqlData, setGraphqlData] = useState<GraphQLLineageData | null>(null);
  const [isGraphqlLoading, setIsGraphqlLoading] = useState(false);
  const [graphqlError, setGraphqlError] = useState<string | null>(null);

  const toText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (typeof v.message === "string") return v.message;
      if (typeof v.error === "string") return v.error;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value ?? "");
  };

  const toastError = (value: unknown, fallback = "Error") => {
    const msg = toText(value).trim();
    toast.error(msg || fallback);
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setLineageResult(null);
    setLineageResults([]);
    setStatistics(null);
    setCocoaRecords([]);
    setLotNumber("");
    setSelectedResultIndex(0);

    try {
      if (productMode === 'coffee') {
        // Analyze VLOOKUP structure
        await analyzeVLOOKUPStructure(selectedFile);
        
        const newTracker = new CoffeeLotLineageTracker();
        await newTracker.loadExcelFile(selectedFile);
        setTracker(newTracker);
        setCocoaTracker(null);
        
        const lots = newTracker.getAllLotNumbers();
        setAvailableLots(lots);
        
        const purchaseLots = newTracker.getAllPurchaseLots();
        setAvailablePurchaseLots(purchaseLots);
        
        toast.success(`Coffee file loaded! Found ${lots.length} production lots and ${purchaseLots.length} purchase lots.`);
      } else {
        const newCocoaTracker = new CocoaTracker();
        await newCocoaTracker.loadExcelFile(selectedFile);
        setCocoaTracker(newCocoaTracker);
        setTracker(null);
        
        const salesContracts = newCocoaTracker.getAllSalesContracts();
        setAvailableCocoaSalesContracts(salesContracts);
        
        toast.success(`Cocoa file loaded! Found ${salesContracts.length} sales contracts.`);
      }
    } catch (error) {
      toast.error(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setFile(null);
      setTracker(null);
      setCocoaTracker(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessLot = () => {
    if (productMode === 'coffee') {
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
          setStatistics(null);
          setSelectedResultIndex(0);
          toast.success(`Found ${results.length} consumption lot(s) from purchase lot`);
        } else {
          setJoinSteps([]);
          const result = tracker.getLotLineage(lotNumber.trim());
          setLineageResult(result);
          setLineageResults([]);

          const stats = tracker.getLotStatistics(lotNumber.trim());
          if ('error' in stats) {
            toastError(stats.error, 'Failed to get lot statistics');
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
    } else {
      // Cocoa mode
      if (!cocoaTracker || !lotNumber.trim()) {
        toast.error("Please load a cocoa file and enter a sale contract #");
        return;
      }

      setIsProcessing(true);

      try {
        const records = cocoaTracker.getRecordsBySalesContract(lotNumber.trim());
        setCocoaRecords(records);
        toast.success(`Found ${records.length} record(s) for sale contract`);
      } catch (error) {
        toast.error(`Error processing sale contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Fabric Lakehouse trigger handler
  const handleFabricTrigger = async () => {
    if (!fabricSalesContract.trim()) {
      toast.error("Please enter a sales contract number");
      return;
    }

    setIsFabricTriggering(true);
    setFabricJobId(null);
    setFabricJobStatus(null);
    setFabricStatusMessage("Triggering notebook...");

    try {
      const result = await triggerLineageTrace(fabricSalesContract.trim());
      
      if (result.job_id) {
        setFabricJobId(result.job_id);
        setFabricJobStatus('InProgress');
        setFabricStatusMessage(`Job started: ${result.job_id}`);
        toast.success("Fabric notebook triggered successfully!");
        
        // Start polling for job status
        pollFabricJobStatus(result.job_id);
      } else {
        throw new Error("No job ID returned");
      }
    } catch (error: unknown) {
      let errorMessage = 'Failed to trigger notebook';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast.error(errorMessage);
      setFabricJobStatus('Failed');
      setFabricStatusMessage(errorMessage);
    } finally {
      setIsFabricTriggering(false);
    }
  };

  const pollFabricJobStatus = async (jobId: string) => {
    const pollInterval = 5000; // 5 seconds
    const maxAttempts = 120; // 10 minutes max
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setFabricJobStatus('Failed');
        setFabricStatusMessage('Polling timeout: Job did not complete in time');
        return;
      }

      try {
        const status = await checkJobStatus(jobId);
        const mappedStatus = mapJobStatus(status.status);
        setFabricJobStatus(mappedStatus);
        setFabricStatusMessage(`Status: ${status.status}`);

        if (mappedStatus === 'Succeeded') {
          toast.success("Fabric notebook completed successfully!");
          // Auto-fetch GraphQL data after job succeeds
          fetchGraphQLData(fabricSalesContract);
          return;
        }

        if (mappedStatus === 'Failed') {
          toastError(status.failure_reason ?? "Notebook job failed", "Notebook job failed");
          return;
        }

        if (mappedStatus === 'Cancelled') {
          toast.error("Notebook job was cancelled");
          return;
        }

        // Continue polling
        attempts++;
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error('Error polling job status:', error);
        // Continue polling even on error
        attempts++;
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling after a short delay
    setTimeout(poll, pollInterval);
  };

  // Fetch GraphQL data from Fabric Lakehouse
  const fetchGraphQLData = async (salesContract?: string) => {
    setIsGraphqlLoading(true);
    setGraphqlError(null);
    
    try {
      const data = await queryFabricGraphQL(salesContract);
      setGraphqlData(data);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch data';
      setGraphqlError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsGraphqlLoading(false);
    }
  };

  const handleRefreshGraphQL = () => {
    fetchGraphQLData(fabricSalesContract || undefined);
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
              {productMode === 'coffee' 
                ? "Trace the complete supply chain journey of coffee lots"
                : "View cocoa sales contract information and traceability data"
              }
            </p>
            
            {/* Product Mode Toggle */}
            <div className="mt-4 flex items-center gap-4 p-3 bg-accent/10 rounded-lg">
              <Label htmlFor="product-mode" className="cursor-pointer font-semibold">
                Product Mode:
              </Label>
              <div className="flex items-center gap-2">
                <span className={productMode === 'coffee' ? "text-primary font-semibold" : "text-muted-foreground"}>
                  Coffee
                </span>
                <Switch
                  id="product-mode"
                  checked={productMode === 'cocoa'}
                  onCheckedChange={(checked) => {
                    setProductMode(checked ? 'cocoa' : 'coffee');
                    // Reset everything
                    setFile(null);
                    setTracker(null);
                    setCocoaTracker(null);
                    setLotNumber("");
                    setLineageResult(null);
                    setLineageResults([]);
                    setStatistics(null);
                    setCocoaRecords([]);
                    setJoinSteps([]);
                    setIsPurchaseMode(false);
                  }}
                />
                <span className={productMode === 'cocoa' ? "text-primary font-semibold" : "text-muted-foreground"}>
                  Cocoa
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-7xl relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Data Source Toggle */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Data Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-4 p-3 bg-accent/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className={`w-4 h-4 ${dataSource === 'excel' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={dataSource === 'excel' ? "text-primary font-semibold" : "text-muted-foreground"}>
                      Excel
                    </span>
                  </div>
                  <Switch
                    checked={dataSource === 'fabric'}
                    onCheckedChange={(checked) => {
                      setDataSource(checked ? 'fabric' : 'excel');
                      // Reset fabric state when switching
                      if (!checked) {
                        setFabricSalesContract("");
                        setFabricJobId(null);
                        setFabricJobStatus(null);
                        setFabricStatusMessage("");
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Cloud className={`w-4 h-4 ${dataSource === 'fabric' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={dataSource === 'fabric' ? "text-primary font-semibold" : "text-muted-foreground"}>
                      Fabric
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Excel Mode - File Upload */}
            {dataSource === 'excel' && (
              <Card>
                <CardHeader>
                  <CardTitle>Upload Excel File</CardTitle>
                  <CardDescription>
                    {productMode === 'coffee'
                      ? "Upload your ACOM Production Consumption Excel file"
                      : "Upload your Cocoa Traceability Excel file"
                    }
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
            )}

            {/* Fabric Mode - Trigger Notebook */}
            {dataSource === 'fabric' && (
              <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cloud className="w-5 h-5" />
                    Fabric Lakehouse
                  </CardTitle>
                  <CardDescription>
                    Trigger lineage tracing on Microsoft Fabric
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fabric-sales-contract">Sales Contract #</Label>
                    <Input
                      id="fabric-sales-contract"
                      placeholder="e.g., 4197250084"
                      value={fabricSalesContract}
                      onChange={(e) => setFabricSalesContract(e.target.value)}
                      disabled={isFabricTriggering || fabricJobStatus === 'InProgress' || fabricJobStatus === 'Queued'}
                    />
                  </div>
                  
                  <Button
                    onClick={handleFabricTrigger}
                    disabled={!fabricSalesContract.trim() || isFabricTriggering || fabricJobStatus === 'InProgress' || fabricJobStatus === 'Queued'}
                    className="w-full"
                    size="lg"
                  >
                    {isFabricTriggering ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Triggering...
                      </>
                    ) : fabricJobStatus === 'Queued' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Queued...
                      </>
                    ) : fabricJobStatus === 'InProgress' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4 mr-2" />
                        Trigger Lineage Trace
                      </>
                    )}
                  </Button>

                  {/* Job Status Display */}
                  {fabricJobId && (
                    <div className="mt-4 p-3 rounded-lg bg-accent/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Job Status</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          fabricJobStatus === 'Succeeded' ? 'bg-green-500/20 text-green-600' :
                          fabricJobStatus === 'Failed' ? 'bg-red-500/20 text-red-600' :
                          fabricJobStatus === 'InProgress' ? 'bg-blue-500/20 text-blue-600' :
                          fabricJobStatus === 'Queued' ? 'bg-yellow-500/20 text-yellow-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {fabricJobStatus || 'Unknown'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{fabricStatusMessage}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        Job ID: {fabricJobId}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* GraphQL Data Preview - shown after job success or when data exists */}
              {(fabricJobStatus === 'Succeeded' || graphqlData || isGraphqlLoading || graphqlError) && (
                <GraphQLDataPreview
                  data={graphqlData}
                  isLoading={isGraphqlLoading}
                  error={graphqlError}
                  onRefresh={handleRefreshGraphQL}
                />
              )}
              </>
            )}

            {/* Excel Mode - Trace Lot Lineage */}
            {dataSource === 'excel' && (
              <Card>
                <CardHeader>
                  <CardTitle>{productMode === 'coffee' ? 'Trace Lot Lineage' : 'View Sale Contract'}</CardTitle>
                  <CardDescription>
                    {productMode === 'coffee'
                      ? (isPurchaseMode 
                        ? "Enter or select a sale contract # to trace forward through production"
                        : "Enter or select a consumption lot to trace its history")
                      : "Enter or select a sale contract # to view all records"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {productMode === 'coffee' && (
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
                  )}
                  <LotInput
                    lotNumber={lotNumber}
                    onLotNumberChange={setLotNumber}
                    availableLots={
                      productMode === 'coffee' 
                        ? (isPurchaseMode ? availablePurchaseLots : availableLots)
                        : availableCocoaSalesContracts
                    }
                    disabled={
                      (productMode === 'coffee' && !tracker) || 
                      (productMode === 'cocoa' && !cocoaTracker) || 
                      isProcessing
                    }
                  />
                  <Button
                    onClick={handleProcessLot}
                    disabled={
                      (productMode === 'coffee' && (!tracker || !lotNumber.trim())) ||
                      (productMode === 'cocoa' && (!cocoaTracker || !lotNumber.trim())) ||
                      isProcessing
                    }
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      productMode === 'coffee' ? "Trace Lineage" : "View Contract"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {statistics && !('error' in statistics) && productMode === 'coffee' && (
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
            {productMode === 'cocoa' && cocoaRecords.length > 0 ? (
              <CocoaViewer records={cocoaRecords} saleContract={lotNumber} />
            ) : (
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
            )}
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
