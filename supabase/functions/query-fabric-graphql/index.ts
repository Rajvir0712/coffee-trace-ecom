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
  lineage_summary: Array<Record<string, unknown>>;
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

function buildQuery(salesContract?: string, limit: number = 20): string {
  // Build filter if sales_contract is provided
  const nodesFilter = salesContract 
    ? `(first: ${limit}, filter: { sales_contract: { eq: "${salesContract}" } })` 
    : `(first: ${limit})`;
  
  const edgesFilter = salesContract
    ? `(first: ${limit}, filter: { sales_contract: { eq: "${salesContract}" } })`
    : `(first: ${limit})`;
    
  const summaryFilter = salesContract
    ? `(first: ${limit}, filter: { sales_contract: { eq: "${salesContract}" } })`
    : `(first: ${limit})`;

  // Query all three tables - using flexible field selection
  // Since we don't know exact schema, we'll query and let GraphQL return available fields
  return `
    query GetLineageData {
      lineage_nodes${nodesFilter} {
        items {
          sales_contract
          lot_no
          item_no
          description
          certified
          process_type
          output_quantity
          output_date
          location_code
          unit_of_measure
          counterparty
          production_order
          is_origin
          depth
        }
      }
      lineage_edges${edgesFilter} {
        items {
          sales_contract
          source_lot
          target_lot
          relationship
          depth
        }
      }
      lineage_summary${summaryFilter} {
        items {
          sales_contract
          total_lots
          max_depth
          origin_count
          process_types
          trace_timestamp
        }
      }
    }
  `;
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

    const { sales_contract, limit = 20 }: QueryRequest = await req.json();

    // Get access token using Service Principal
    const accessToken = await getAccessToken();

    // Build and execute GraphQL query
    const query = buildQuery(sales_contract, limit);
    const data = await queryGraphQL(accessToken, query);

    // Transform response to expected format
    const typedData = data as {
      lineage_nodes?: { items?: Array<Record<string, unknown>> };
      lineage_edges?: { items?: Array<Record<string, unknown>> };
      lineage_summary?: { items?: Array<Record<string, unknown>> };
    };

    const response: GraphQLResponse = {
      lineage_nodes: typedData.lineage_nodes?.items || [],
      lineage_edges: typedData.lineage_edges?.items || [],
      lineage_summary: typedData.lineage_summary?.items || [],
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
