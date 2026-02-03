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

function buildQuery(first: number = 1000, after?: string): string {
  const afterClause = after ? `, after: "${after}"` : '';
  return `
    query {
      lineage_nodes(first: ${first}${afterClause}) {
        items {
          sale_contract
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

async function fetchAllLineageNodes(accessToken: string, batchSize: number = 1000): Promise<Array<Record<string, unknown>>> {
  const allNodes: Array<Record<string, unknown>> = [];
  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let pageCount = 0;

  while (hasNextPage) {
    pageCount++;
    const query = buildQuery(batchSize, cursor);
    console.log(`Fetching page ${pageCount}...`);
    
    const data = await queryGraphQL(accessToken, query) as {
      lineage_nodes?: {
        items?: Array<Record<string, unknown>>;
        endCursor?: string;
        hasNextPage?: boolean;
      };
    };

    const items = data.lineage_nodes?.items || [];
    allNodes.push(...items);

    hasNextPage = data.lineage_nodes?.hasNextPage ?? false;
    cursor = data.lineage_nodes?.endCursor;

    console.log(`Page ${pageCount}: fetched ${items.length} records, total: ${allNodes.length}, hasNextPage: ${hasNextPage}`);
  }

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

    // Parse request (limit is now batch size for pagination)
    const { limit = 1000 }: QueryRequest = await req.json();

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
