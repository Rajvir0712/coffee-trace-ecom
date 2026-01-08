import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Database, RefreshCw, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";

interface DataSource {
  name: string;
  data: any[];
  loading: boolean;
  error: string | null;
}

export const GraphQLApiTest = () => {
  const [endpoint, setEndpoint] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [activeDataSource, setActiveDataSource] = useState<string>("");
  const [newDataSourceName, setNewDataSourceName] = useState("");

  // Get access token using Service Principal
  const getAccessToken = async (): Promise<string> => {
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: applicationId,
      client_secret: clientSecret,
      scope: "https://analysis.windows.net/powerbi/api/.default",
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  };

  const executeGraphQLQuery = async (query: string, token: string) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  };

  const handleConnect = async () => {
    if (!endpoint.trim()) {
      toast.error("Please enter a GraphQL endpoint URL");
      return;
    }
    if (!tenantId.trim()) {
      toast.error("Please enter a Tenant ID");
      return;
    }
    if (!applicationId.trim()) {
      toast.error("Please enter an Application ID");
      return;
    }
    if (!clientSecret.trim()) {
      toast.error("Please enter a Client Secret");
      return;
    }

    setIsConnecting(true);

    try {
      // Get access token using Service Principal
      const token = await getAccessToken();
      setAccessToken(token);
      setIsConnected(true);
      toast.success("Connected successfully! Add data source names to query.");
    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAddDataSource = () => {
    if (!newDataSourceName.trim()) {
      toast.error("Please enter a data source name");
      return;
    }

    if (dataSources.some(ds => ds.name === newDataSourceName.trim())) {
      toast.error("Data source already exists");
      return;
    }

    const newSource: DataSource = {
      name: newDataSourceName.trim(),
      data: [],
      loading: false,
      error: null,
    };

    setDataSources(prev => [...prev, newSource]);
    setActiveDataSource(newDataSourceName.trim());
    setNewDataSourceName("");
    toast.success(`Added data source: ${newDataSourceName}`);
  };

  const handleRemoveDataSource = (name: string) => {
    setDataSources(prev => prev.filter(ds => ds.name !== name));
    if (activeDataSource === name) {
      setActiveDataSource(dataSources[0]?.name || "");
    }
    toast.success(`Removed data source: ${name}`);
  };

  const fetchDataSource = async (sourceName: string) => {
    if (!accessToken) {
      toast.error("Not connected. Please connect first.");
      return;
    }

    setDataSources(prev => prev.map(ds => 
      ds.name === sourceName ? { ...ds, loading: true, error: null } : ds
    ));

    try {
      // Build a query for this data source with first 1000
      const query = `
        query {
          ${sourceName}(first: 1000) {
            edges {
              node {
                __typename
              }
            }
          }
        }
      `;

      // First try with pagination
      let result = await executeGraphQLQuery(query, accessToken);
      
      // If that doesn't work, try without pagination
      if (result.errors) {
        const simpleQuery = `
          query {
            ${sourceName}
          }
        `;
        result = await executeGraphQLQuery(simpleQuery, accessToken);
      }

      if (result.errors) {
        throw new Error(result.errors[0]?.message || "Query failed");
      }

      // Extract data - handle various response shapes
      let data = result.data?.[sourceName];
      
      // Handle connection pattern
      if (data?.edges) {
        data = data.edges.map((edge: any) => edge.node);
      }
      
      // Ensure it's an array
      if (!Array.isArray(data)) {
        data = data ? [data] : [];
      }

      // Limit to first 1000
      data = data.slice(0, 1000);

      setDataSources(prev => prev.map(ds => 
        ds.name === sourceName ? { ...ds, data, loading: false } : ds
      ));

      toast.success(`Loaded ${data.length} rows from ${sourceName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setDataSources(prev => prev.map(ds => 
        ds.name === sourceName ? { ...ds, loading: false, error: errorMessage } : ds
      ));
      toast.error(`Failed to fetch ${sourceName}: ${errorMessage}`);
    }
  };

  const getColumnHeaders = (data: any[]): string[] => {
    if (data.length === 0) return [];
    const allKeys = new Set<string>();
    data.slice(0, 100).forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(key => allKeys.add(key));
      }
    });
    return Array.from(allKeys);
  };

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const currentDataSource = dataSources.find(ds => ds.name === activeDataSource);

  return (
    <div className="space-y-6">
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            GraphQL API Connection (Service Principal)
          </CardTitle>
          <CardDescription>
            Enter your GraphQL endpoint and Service Principal credentials to connect
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="endpoint">GraphQL Endpoint URL</Label>
            <Input
              id="endpoint"
              placeholder="https://api.example.com/graphql"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={isConnecting}
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID</Label>
              <Input
                id="tenantId"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                disabled={isConnecting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicationId">Application ID (Client ID)</Label>
              <Input
                id="applicationId"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                disabled={isConnecting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                placeholder="Enter your Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={isConnecting}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
            
            {isConnected && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Connected</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Data Source */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Add Data Sources</CardTitle>
            <CardDescription>
              Manually enter the names of data sources (query names) to fetch
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter data source name (e.g., users, products)"
                value={newDataSourceName}
                onChange={(e) => setNewDataSourceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddDataSource()}
              />
              <Button onClick={handleAddDataSource}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Sources */}
      {dataSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Sources ({dataSources.length})</CardTitle>
            <CardDescription>
              Select a data source to fetch and view the first 1000 rows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeDataSource} onValueChange={setActiveDataSource}>
              <ScrollArea className="w-full">
                <TabsList className="inline-flex w-auto">
                  {dataSources.map((ds) => (
                    <TabsTrigger key={ds.name} value={ds.name} className="min-w-[100px]">
                      {ds.name}
                      {ds.data.length > 0 && (
                        <span className="ml-2 text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                          {ds.data.length}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollArea>

              {dataSources.map((ds) => (
                <TabsContent key={ds.name} value={ds.name} className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Button 
                        onClick={() => fetchDataSource(ds.name)}
                        disabled={ds.loading}
                        variant="outline"
                      >
                        {ds.loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {ds.data.length > 0 ? "Refresh Data" : "Fetch First 1000 Rows"}
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={() => handleRemoveDataSource(ds.name)}
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                      
                      {ds.error && (
                        <div className="flex items-center gap-2 text-destructive">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm">{ds.error}</span>
                        </div>
                      )}
                    </div>

                    {ds.data.length > 0 && (
                      <ScrollArea className="h-[500px] rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {getColumnHeaders(ds.data).map((header) => (
                                <TableHead key={header} className="font-semibold">
                                  {header}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ds.data.map((row, idx) => (
                              <TableRow key={idx}>
                                {getColumnHeaders(ds.data).map((header) => (
                                  <TableCell key={header} className="max-w-[300px] truncate">
                                    {formatCellValue(row[header])}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}

                    {ds.data.length === 0 && !ds.loading && !ds.error && (
                      <div className="text-center py-12 text-muted-foreground">
                        Click "Fetch First 1000 Rows" to load data from this source
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {isConnected && dataSources.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add data source names above to start querying the API
          </CardContent>
        </Card>
      )}
    </div>
  );
};
