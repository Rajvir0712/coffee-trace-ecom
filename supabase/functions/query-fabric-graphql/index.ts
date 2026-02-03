import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryRequest {
  sales_contract?: string;
  limit?: number;
}

interface GraphQLResponse {
  lineage_nodes: Array<Record<string, unknown>>;
  lineage_edges: Array<Record<string, unknown>>;
}

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get('AZURE_TENANT_ID');
  const clientId = Deno.env.get('AZURE_CLIENT_ID');
  const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Azure credentials');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://api.fabric.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function queryGraphQL(accessToken: string, query: string): Promise<unknown> {
  const graphqlEndpoint = Deno.env.get('FABRIC_GRAPHQL_ENDPOINT');
  
  if (!graphqlEndpoint) {
    throw new Error('Missing FABRIC_GRAPHQL_ENDPOINT configuration');
  }

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GraphQL query failed: ${errorText}`);
  }

  const result = await response.json();
  
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

function buildQueryWithOffset(first: number = 1000, offset: number = 0): string {
  // Try offset-based pagination if cursor doesn't work
  // Some GraphQL APIs support skip/offset parameter
  return `
    query {
      lineage_nodes(first: ${first}, skip: ${offset}) {
        items {
          sale_contract
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

function buildIntrospectionQuery(): string {
  return `
    query {
      __type(name: "lineage_nodes") {
        fields {
          name
        }
      }
    }
  `;
}

function buildFieldDiscoveryQuery(): string {
  // Fabric GraphQL uses a specific introspection pattern
  return `
    query IntrospectionQuery {
      __schema {
        types {
          name
          fields {
            name
          }
        }
      }
    }
  `;
}

function buildQuery(first: number = 1000, after?: string, fields: string[] = ['sale_contract']): string {
  const afterClause = after ? `, after: "${after}"` : '';
  const fieldList = fields.join('\n          ');
  return `
    query {
      lineage_nodes(first: ${first}${afterClause}) {
        items {
          ${fieldList}
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

async function getTableFields(accessToken: string): Promise<string[]> {
  const query = buildIntrospectionQuery();
  const data = await queryGraphQL(accessToken, query) as {
    __type?: {
      fields?: Array<{ name: string }>;
    };
  };

  const fields = data.__type?.fields?.map(f => f.name) || [];
  // Filter out pagination/metadata fields
  const excludeFields = ['endCursor', 'hasNextPage', 'items'];
  return fields.filter(f => !excludeFields.includes(f));
}

async function discoverFields(accessToken: string): Promise<string[]> {
  // Try to discover the actual field names from the schema
  try {
    const query = buildFieldDiscoveryQuery();
    const data = await queryGraphQL(accessToken, query) as {
      __schema?: {
        types?: Array<{ name: string; fields?: Array<{ name: string }> }>;
      };
    };

    const lineageNodesType = data.__schema?.types?.find(t => t.name === 'lineage_nodes');
    if (lineageNodesType?.fields) {
      const fields = lineageNodesType.fields.map(f => f.name);
      console.log(`Discovered fields: ${fields.join(', ')}`);
      return fields;
    }
  } catch (err) {
    console.log('Schema introspection failed:', err);
  }
  return ['sale_contract']; // Fallback
}

async function fetchAllLineageNodes(accessToken: string, batchSize: number = 1000): Promise<Array<Record<string, unknown>>> {
  // Discover available fields from the schema
  console.log('Discovering schema fields...');
  const fields = await discoverFields(accessToken);
  console.log(`Using ${fields.length} fields: ${fields.join(', ')}`);

  const allNodes: Array<Record<string, unknown>> = [];
  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 1000; // Safety limit - up to 1M records with 1000 batch size

  while (hasNextPage && pageCount < maxPages) {
    pageCount++;
    const query = buildQuery(batchSize, cursor, fields);
    console.log(`Fetching page ${pageCount}, cursor: ${cursor ? cursor.substring(0, 50) + '...' : 'none'}`);
    
    const data = await queryGraphQL(accessToken, query) as {
      lineage_nodes?: {
        items?: Array<Record<string, unknown>>;
        endCursor?: string;
        hasNextPage?: boolean;
      };
    };

    const items = data.lineage_nodes?.items || [];
    allNodes.push(...items);

    const prevCursor = cursor;
    hasNextPage = data.lineage_nodes?.hasNextPage ?? false;
    cursor = data.lineage_nodes?.endCursor;

    console.log(`Page ${pageCount}: fetched ${items.length} records, total: ${allNodes.length}, hasNextPage: ${hasNextPage}`);

    // Break if cursor didn't change OR if we got 0 items (prevent infinite loop)
    if (items.length === 0) {
      console.log('No more items returned, stopping pagination');
      break;
    }
    if (hasNextPage && cursor === prevCursor) {
      console.log('WARNING: Cursor did not change, breaking to prevent infinite loop');
      break;
    }
  }

  if (pageCount >= maxPages) {
    console.log(`WARNING: Reached max pages limit (${maxPages})`);
  }

  console.log(`Total records extracted: ${allNodes.length}`);
  return allNodes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { limit = 1000 }: { limit?: number } = await req.json();

    // Get access token using Service Principal
    const accessToken = await getAccessToken();

    // Fetch ALL records using pagination
    console.log('Starting full extraction of lineage_nodes...');
    const allNodes = await fetchAllLineageNodes(accessToken, limit);
    console.log(`Total records extracted: ${allNodes.length}`);

    const response: GraphQLResponse = {
      lineage_nodes: allNodes,
      lineage_edges: [],
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error querying GraphQL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
