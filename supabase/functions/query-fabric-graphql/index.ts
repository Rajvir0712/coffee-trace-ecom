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

// Known fields for lineage tables (introspection is disabled on Fabric GraphQL)
const LINEAGE_NODES_FIELDS = [
  'node_id',
  'node_type',
  'node_name',
  'lot_number',
  'sales_contract',
  'quantity',
  'uom',
  'source_table',
  'created_at'
];

const LINEAGE_EDGES_FIELDS = [
  'edge_id',
  'source_node_id',
  'target_node_id',
  'relationship_type',
  'quantity',
  'created_at'
];

function buildQuery(limit: number = 20): string {
  const nodesFieldsStr = LINEAGE_NODES_FIELDS.join('\n          ');
  const edgesFieldsStr = LINEAGE_EDGES_FIELDS.join('\n          ');

  return `
    query GetLineageData {
      lineage_nodes(first: ${limit}) {
        items {
          ${nodesFieldsStr}
        }
      }
      lineage_edges(first: ${limit}) {
        items {
          ${edgesFieldsStr}
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

    const { limit = 20 }: QueryRequest = await req.json();

    // Get access token using Service Principal
    const accessToken = await getAccessToken();

    // Build and execute query with known fields
    const query = buildQuery(limit);
    console.log('Executing query with known fields');
    
    const data = await queryGraphQL(accessToken, query);
    
    const typedData = data as {
      lineage_nodes?: { items?: Array<Record<string, unknown>> };
      lineage_edges?: { items?: Array<Record<string, unknown>> };
    };

    const response: GraphQLResponse = {
      lineage_nodes: typedData.lineage_nodes?.items || [],
      lineage_edges: typedData.lineage_edges?.items || [],
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
