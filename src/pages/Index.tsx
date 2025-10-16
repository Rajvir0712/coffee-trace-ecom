import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/FileUpload";
import { LotInput } from "@/components/LotInput";
import { JsonViewer } from "@/components/JsonViewer";
import { StatsCard } from "@/components/StatsCard";
import { LineageFlowGraph } from "@/components/LineageFlowGraph";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CoffeeLotLineageTracker, LineageResult, LotStatistics } from "@/lib/excelParser";
import { toast } from "sonner";
import { Coffee, TrendingUp, Package, Calendar, Loader2, Maximize2, Minimize2 } from "lucide-react";
import logo from "@/assets/logo.png";

const Index = () => {
  const [file, setFile] = useState<File | null>(null);
  const [tracker, setTracker] = useState<CoffeeLotLineageTracker | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [availableLots, setAvailableLots] = useState<string[]>([]);
  const [lineageResult, setLineageResult] = useState<LineageResult | null>(null);
  const [statistics, setStatistics] = useState<LotStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setLineageResult(null);
    setStatistics(null);
    setLotNumber("");

    try {
      const newTracker = new CoffeeLotLineageTracker();
      await newTracker.loadExcelFile(selectedFile);
      setTracker(newTracker);
      
      const lots = newTracker.getAllLotNumbers();
      setAvailableLots(lots);
      
      toast.success(`File loaded successfully! Found ${lots.length} lots.`);
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
      const result = tracker.getLotLineage(lotNumber.trim());
      setLineageResult(result);

      const stats = tracker.getLotStatistics(lotNumber.trim());
      if ('error' in stats) {
        toast.error(stats.error);
        setStatistics(null);
      } else {
        setStatistics(stats);
        toast.success(`Traced ${result.total_lots_traced} lots in the lineage`);
      }
    } catch (error) {
      toast.error(`Error processing lot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
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
      <main className="container mx-auto px-4 py-8 max-w-7xl">
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
                  Enter or select a lot number to trace its history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LotInput
                  lotNumber={lotNumber}
                  onLotNumberChange={setLotNumber}
                  availableLots={availableLots}
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
          <div className={isFullscreen ? "fixed inset-0 z-50 bg-background" : "lg:col-span-2"}>
            <Card className={isFullscreen ? "h-full rounded-none" : "min-h-[600px]"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lineage Results</CardTitle>
                    <CardDescription>
                      Complete lineage tree and statistics for the traced lot
                    </CardDescription>
                  </div>
                  {lineageResult && (
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
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {lineageResult ? (
                  <Tabs defaultValue="graph" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="graph">Flow Graph</TabsTrigger>
                      <TabsTrigger value="json">JSON View</TabsTrigger>
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                    </TabsList>
                    <TabsContent value="graph" className="mt-6">
                      <LineageFlowGraph data={lineageResult.lineage_tree} />
                    </TabsContent>
                    <TabsContent value="json" className="mt-6">
                      <JsonViewer
                        data={lineageResult}
                        filename={`${lotNumber}_lineage`}
                      />
                    </TabsContent>
                    <TabsContent value="summary" className="mt-6">
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
                    </TabsContent>
                  </Tabs>
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
