import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Database, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface DataSource {
  name: string;
  data: any[];
  loading: boolean;
  error: string | null;
}

export const GraphQLApiTest = () => {
  const [endpoint, setEndpoint] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [activeDataSource, setActiveDataSource] = useState<string>("");

  // Introspection query to get all types
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        queryType {
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    }
  `;

  const executeGraphQLQuery = async (query: string) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
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
    if (!bearerToken.trim()) {
      toast.error("Please enter a Bearer token");
      return;
    }

    setIsConnecting(true);
    setDataSources([]);

    try {
      // First, run introspection to discover available queries
      const introspectionResult = await executeGraphQLQuery(introspectionQuery);
      
      if (introspectionResult.errors) {
        throw new Error(introspectionResult.errors[0]?.message || "Introspection failed");
      }

      const queryFields = introspectionResult.data?.__schema?.queryType?.fields || [];
      
      // Filter for likely data source queries (typically return lists)
      const dataSourceQueries = queryFields.filter((field: any) => {
        const typeName = field.type?.name || field.type?.ofType?.name || "";
        const kind = field.type?.kind || field.type?.ofType?.kind || "";
        // Look for list types or connection types
        return kind === "LIST" || typeName.includes("Connection") || !field.name.startsWith("__");
      });

      if (dataSourceQueries.length === 0) {
        toast.warning("No data source queries found in the API");
        setIsConnected(true);
        setIsConnecting(false);
        return;
      }

      // Initialize data sources from discovered queries
      const sources: DataSource[] = dataSourceQueries.map((field: any) => ({
        name: field.name,
        data: [],
        loading: false,
        error: null,
      }));

      setDataSources(sources);
      setIsConnected(true);
      setActiveDataSource(sources[0]?.name || "");
      toast.success(`Connected! Found ${sources.length} data source(s)`);

    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchDataSource = async (sourceName: string) => {
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
      let result = await executeGraphQLQuery(query);
      
      // If that doesn't work, try without pagination
      if (result.errors) {
        const simpleQuery = `
          query {
            ${sourceName} {
              __typename
            }
          }
        `;
        
        // Get the structure first
        const structureResult = await executeGraphQLQuery(`
          query {
            __type(name: "${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}") {
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        `);

        // Try to build a proper query based on the structure
        const fields = structureResult.data?.__type?.fields?.map((f: any) => f.name).join("\n") || "";
        
        if (fields) {
          const detailedQuery = `
            query {
              ${sourceName} {
                ${fields}
              }
            }
          `;
          result = await executeGraphQLQuery(detailedQuery);
        } else {
          // Fallback: try common field patterns
          const fallbackQuery = `
            query {
              ${sourceName} {
                id
              }
            }
          `;
          result = await executeGraphQLQuery(fallbackQuery);
        }
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
            GraphQL API Connection
          </CardTitle>
          <CardDescription>
            Enter your GraphQL endpoint and Bearer token to test the connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
            <div className="space-y-2">
              <Label htmlFor="token">Bearer Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Enter your Bearer token"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
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
                "Connect & Discover Data Sources"
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
            No data sources discovered. The API may not expose queryable types.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
