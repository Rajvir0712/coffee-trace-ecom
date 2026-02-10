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
  page_info
`;

const LINEAGE_FARMER_FIELDS = `
  sale_contract
  query_lot
  lot_no
  item_number
  location_code
  counterparty
`;

const LINEAGE_PURCON_FIELDS = `
  lot_no
  page_info
`;

const LINEAGE_LOTS_FIELDS = `
  lot_no
  page_info
`;


function buildDistinctPagesQuery(first: number): string {
  return `
    query {
      lineage_nodes(first: ${first}) {
        items {
          page_info
          sale_contract
        }
      }
    }
  `;
}

// Build query filtered by page_info (Int type)
function buildPageFilteredQuery(pageInfo: number, first: number): string {
  return `
    query {
      lineage_nodes(filter: { page_info: { eq: ${pageInfo} } }, first: ${first}) {
        items {
          ${LINEAGE_NODE_FIELDS}
        }
      }
    }
  `;
}

// Build cursor-based query WITHOUT orderBy (cursor contains ordering state already)
function buildCursorQuery(first: number, after?: string): string {
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

// Build query to fetch all lineage_farmers
function buildFarmersQuery(first: number): string {
  return `
    query {
      lineage_farmers(first: ${first}) {
        items {
          ${LINEAGE_FARMER_FIELDS}
        }
      }
    }
  `;
}

// Build query to fetch all lineage_purcon
function buildPurconQuery(first: number): string {
  return `
    query {
      lineage_purcon(first: ${first}) {
        items {
          ${LINEAGE_PURCON_FIELDS}
        }
      }
    }
  `;
}

// Build query to fetch all lineage_lots
function buildLotsQuery(first: number): string {
  return `
    query {
      lineage_lots(first: ${first}) {
        items {
          ${LINEAGE_LOTS_FIELDS}
        }
      }
    }
  `;
}

interface PageResult {
  nodes: Array<Record<string, unknown>>;
  endCursor: string | null;
  hasNextPage: boolean;
}

async function fetchDistinctPages(accessToken: string, maxPages: number = 100000): Promise<number[]> {
  const query = buildDistinctPagesQuery(maxPages);
  console.log('Fetching distinct page_info values...');
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_nodes?: {
      items?: Array<{ page_info: number; sale_contract: string }>;
    };
  };

  const items = data.lineage_nodes?.items || [];
  const uniquePages = [...new Set(items.map(item => item.page_info).filter(p => p !== null && p !== undefined))];
  console.log(`Found ${uniquePages.length} distinct page_info values`);
  
  return uniquePages;
}

async function fetchByPageInfo(accessToken: string, pageInfo: number, pageSize: number): Promise<Array<Record<string, unknown>>> {
  const query = buildPageFilteredQuery(pageInfo, pageSize);
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_nodes?: {
      items?: Array<Record<string, unknown>>;
    };
  };

  return data.lineage_nodes?.items || [];
}

async function fetchFarmers(accessToken: string, maxRecords: number = 100000): Promise<Array<Record<string, unknown>>> {
  const query = buildFarmersQuery(maxRecords);
  console.log('Fetching lineage_farmers...');
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_farmers?: {
      items?: Array<Record<string, unknown>>;
    };
  };

  const items = data.lineage_farmers?.items || [];
  console.log(`Fetched ${items.length} farmer records`);
  return items;
}

async function fetchPurcon(accessToken: string, maxRecords: number = 100000): Promise<Array<Record<string, unknown>>> {
  const query = buildPurconQuery(maxRecords);
  console.log('Fetching lineage_purcon...');
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_purcon?: {
      items?: Array<Record<string, unknown>>;
    };
  };

  const items = data.lineage_purcon?.items || [];
  console.log(`Fetched ${items.length} purcon records`);
  return items;
}

async function fetchLots(accessToken: string, maxRecords: number = 100000): Promise<Array<Record<string, unknown>>> {
  const query = buildLotsQuery(maxRecords);
  console.log('Fetching lineage_lots...');
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_lots?: {
      items?: Array<Record<string, unknown>>;
    };
  };

  const items = data.lineage_lots?.items || [];
  console.log(`Fetched ${items.length} lots records`);
  return items;
}

async function fetchSinglePage(accessToken: string, pageSize: number, cursor?: string): Promise<PageResult> {
  const query = buildCursorQuery(pageSize, cursor);
  
  console.log('GraphQL Query:', query);
  
  const data = await queryGraphQL(accessToken, query) as {
    lineage_nodes?: {
      items?: Array<Record<string, unknown>>;
      endCursor?: string;
      hasNextPage?: boolean;
    };
  };

  const items = data.lineage_nodes?.items || [];
  const endCursor = data.lineage_nodes?.endCursor || null;
  const hasNextPage = data.lineage_nodes?.hasNextPage ?? false;

  console.log(`Fetched ${items.length} records, hasNextPage: ${hasNextPage}, endCursor: ${endCursor ? endCursor.substring(0, 50) + '...' : 'null'}`);
  
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

    const body = await req.json();
    const { 
      action = 'fetch', // 'fetch' | 'get_pages' | 'fetch_by_page' | 'fetch_farmers' | 'fetch_purcon' | 'fetch_lots'
      pageSize = 10000, 
      cursor,
      pageInfo 
    }: { 
      action?: string;
      pageSize?: number; 
      cursor?: string;
      pageInfo?: string;
    } = body;

    // Get access token using Service Principal
    const accessToken = await getAccessToken();

    // Handle different actions
    if (action === 'get_pages') {
      // Get distinct page_info values
      const pages = await fetchDistinctPages(accessToken, pageSize);
      return new Response(
        JSON.stringify({ pages, count: pages.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'fetch_by_page' && pageInfo) {
      // Fetch records for a specific page
      console.log(`Fetching records for page_info: ${pageInfo}`);
      const nodes = await fetchByPageInfo(accessToken, pageInfo, pageSize);
      return new Response(
        JSON.stringify({ 
          lineage_nodes: nodes, 
          page_info: pageInfo,
          record_count: nodes.length 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'fetch_farmers') {
      // Fetch all lineage_farmers (no pagination needed)
      const farmers = await fetchFarmers(accessToken, pageSize);
      return new Response(
        JSON.stringify({ 
          lineage_farmers: farmers, 
          record_count: farmers.length 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'fetch_lots') {
      const lots = await fetchLots(accessToken, pageSize);
      return new Response(
        JSON.stringify({ 
          lineage_lots: lots, 
          record_count: lots.length 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'fetch_purcon') {
      const purcon = await fetchPurcon(accessToken, pageSize);
      return new Response(
        JSON.stringify({ 
          lineage_purcon: purcon, 
          record_count: purcon.length 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
