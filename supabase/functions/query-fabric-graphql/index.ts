import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Build cursor-based query with ordering for consistent pagination
function buildCursorQuery(first: number, after?: string): string {
  const afterClause = after ? `, after: "${after}"` : '';
  return `
    query {
      lineage_nodes(first: ${first}${afterClause}, orderBy: {sale_contract: ASC}) {
        items {
          sale_contract
          lot_no
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

// Fallback query without orderBy if it's not supported
function buildSimpleCursorQuery(first: number, after?: string): string {
  const afterClause = after ? `, after: "${after}"` : '';
  return `
    query {
      lineage_nodes(first: ${first}${afterClause}) {
        items {
          sale_contract
          lot_no
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

async function fetchAllLineageNodes(accessToken: string, batchSize: number = 100000): Promise<Array<Record<string, unknown>>> {
  const allNodes: Array<Record<string, unknown>> = [];
  let cursor: string | undefined = undefined;
  let hasNextPage = true;
  let pageCount = 0;
  const maxPages = 10000; // Safety limit
  let useOrderBy = true;

  while (hasNextPage && pageCount < maxPages) {
    pageCount++;
    
    // Try with orderBy first, fall back to simple query if it fails
    let query = useOrderBy ? buildCursorQuery(batchSize, cursor) : buildSimpleCursorQuery(batchSize, cursor);
    console.log(`Fetching page ${pageCount}, cursor: ${cursor ? cursor.substring(0, 50) + '...' : 'none'}`);
    
    let data: {
      lineage_nodes?: {
        items?: Array<Record<string, unknown>>;
        endCursor?: string;
        hasNextPage?: boolean;
      };
    };

    try {
      data = await queryGraphQL(accessToken, query) as typeof data;
    } catch (err) {
      if (useOrderBy && pageCount === 1) {
        // If orderBy fails on first try, switch to simple query
        console.log('orderBy not supported, falling back to simple cursor query');
        useOrderBy = false;
        query = buildSimpleCursorQuery(batchSize, cursor);
        data = await queryGraphQL(accessToken, query) as typeof data;
      } else {
        throw err;
      }
    }

    const items = data.lineage_nodes?.items || [];
    allNodes.push(...items);

    const prevCursor = cursor;
    hasNextPage = data.lineage_nodes?.hasNextPage ?? false;
    cursor = data.lineage_nodes?.endCursor;

    console.log(`Page ${pageCount}: fetched ${items.length} records, total: ${allNodes.length}, hasNextPage: ${hasNextPage}`);

    // Stop conditions
    if (items.length === 0) {
      console.log('No more items returned, reached end of data');
      break;
    }
    
    // Break if cursor didn't advance (prevent infinite loop)
    if (hasNextPage && cursor === prevCursor) {
      console.log('WARNING: Cursor unchanged, stopping to prevent infinite loop');
      break;
    }
    
    // If hasNextPage is false, we're done
    if (!hasNextPage) {
      console.log('hasNextPage is false, extraction complete');
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

    // Fetch ALL records using cursor-based pagination
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
