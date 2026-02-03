import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GraphQLResponse {
  lineage_nodes: Array<Record<string, unknown>>;
  lineage_edges: Array<Record<string, unknown>>;
  pagination: {
    page_size: number;
    record_count: number;
    end_cursor: string | null;
    has_next_page: boolean;
  };
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

// All fields to extract
const LINEAGE_NODE_FIELDS = `
  sale_contract
  lot_no
  parent_lot
  depth
  path
  status
  process_types
  is_terminal
  terminal_reason
  relationship
  item_no
  description
  certified
  unit_of_measure
  production_order
  output_quantity
  output_date
  purchase_quantity
  purchase_date
  trace_complete
  trace_timestamp
`;

// Build cursor-based query with ordering for consistent pagination
function buildCursorQuery(first: number, after?: string): string {
  const afterClause = after ? `, after: "${after}"` : '';
  return `
    query {
      lineage_nodes(first: ${first}${afterClause}, orderBy: {sale_contract: ASC}) {
        items {
          ${LINEAGE_NODE_FIELDS}
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
          ${LINEAGE_NODE_FIELDS}
        }
        endCursor
        hasNextPage
      }
    }
  `;
}

interface PageResult {
  nodes: Array<Record<string, unknown>>;
  endCursor: string | null;
  hasNextPage: boolean;
}

async function fetchSinglePage(accessToken: string, pageSize: number, cursor?: string): Promise<PageResult> {
  let useOrderBy = true;
  let query = buildCursorQuery(pageSize, cursor);
  
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
    // If orderBy fails, switch to simple query
    console.log('orderBy not supported, falling back to simple cursor query');
    useOrderBy = false;
    query = buildSimpleCursorQuery(pageSize, cursor);
    data = await queryGraphQL(accessToken, query) as typeof data;
  }

  const items = data.lineage_nodes?.items || [];
  const endCursor = data.lineage_nodes?.endCursor || null;
  const hasNextPage = data.lineage_nodes?.hasNextPage ?? false;

  console.log(`Fetched ${items.length} records, hasNextPage: ${hasNextPage}`);
  
  return { nodes: items, endCursor, hasNextPage };
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

    const { pageSize = 10000, cursor }: { pageSize?: number; cursor?: string } = await req.json();

    // Get access token using Service Principal
    const accessToken = await getAccessToken();

    // Fetch single page of records
    console.log(`Fetching page with size ${pageSize}, cursor: ${cursor || 'none'}`);
    const result = await fetchSinglePage(accessToken, pageSize, cursor);

    const response: GraphQLResponse = {
      lineage_nodes: result.nodes,
      lineage_edges: [],
      pagination: {
        page_size: pageSize,
        record_count: result.nodes.length,
        end_cursor: result.endCursor,
        has_next_page: result.hasNextPage,
      },
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
