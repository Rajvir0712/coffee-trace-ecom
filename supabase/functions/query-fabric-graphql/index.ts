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

// Introspection query to discover available fields for a type
async function getTypeFields(accessToken: string, typeName: string): Promise<string[]> {
  const introspectionQuery = `
    query IntrospectType {
      __type(name: "${typeName}") {
        fields {
          name
        }
      }
    }
  `;

  try {
    const data = await queryGraphQL(accessToken, introspectionQuery) as {
      __type?: { fields?: Array<{ name: string }> };
    };
    
    if (data.__type?.fields) {
      return data.__type.fields.map(f => f.name);
    }
    return [];
  } catch (error) {
    console.error(`Failed to introspect type ${typeName}:`, error);
    return [];
  }
}

// Get fields for the items type within a connection
async function getItemsTypeFields(accessToken: string, connectionTypeName: string): Promise<string[]> {
  // First, try to get the items type directly
  // The pattern is usually: lineage_nodes -> lineage_nodesConnection -> items -> lineage_nodes (the actual record type)
  
  // Try common naming patterns
  const possibleTypeNames = [
    connectionTypeName,  // e.g., "lineage_nodes"
    `${connectionTypeName}_row`,  // e.g., "lineage_nodes_row"
    `${connectionTypeName}Row`,   // e.g., "lineage_nodesRow"
  ];

  for (const typeName of possibleTypeNames) {
    const fields = await getTypeFields(accessToken, typeName);
    if (fields.length > 0) {
      // Filter out connection/pagination fields, keep only scalar fields
      return fields.filter(f => !['items', 'pageInfo', 'totalCount', 'edges', 'node', 'cursor'].includes(f));
    }
  }

  return [];
}

function buildDynamicQuery(
  nodesFields: string[],
  edgesFields: string[],
  limit: number = 20
): string {
  const nodesFieldsStr = nodesFields.length > 0 ? nodesFields.join('\n          ') : '_no_fields_found';
  const edgesFieldsStr = edgesFields.length > 0 ? edgesFields.join('\n          ') : '_no_fields_found';

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

// Fallback: Query with minimal/no field selection to see what's returned
async function queryWithMinimalFields(accessToken: string, limit: number): Promise<GraphQLResponse> {
  // Try querying with __typename first to see what types exist
  const exploratoryQuery = `
    query ExploreSchema {
      lineage_nodes(first: ${limit}) {
        items {
          __typename
        }
      }
      lineage_edges(first: ${limit}) {
        items {
          __typename
        }
      }
    }
  `;

  const data = await queryGraphQL(accessToken, exploratoryQuery);
  
  const typedData = data as {
    lineage_nodes?: { items?: Array<Record<string, unknown>> };
    lineage_edges?: { items?: Array<Record<string, unknown>> };
  };

  return {
    lineage_nodes: typedData.lineage_nodes?.items || [],
    lineage_edges: typedData.lineage_edges?.items || [],
  };
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

    // First, try to discover the schema using introspection
    console.log('Discovering schema via introspection...');
    
    const [nodesFields, edgesFields] = await Promise.all([
      getItemsTypeFields(accessToken, 'lineage_nodes'),
      getItemsTypeFields(accessToken, 'lineage_edges'),
    ]);

    console.log('Discovered fields:', { nodesFields, edgesFields });

    let response: GraphQLResponse;

    if (nodesFields.length > 0 || edgesFields.length > 0) {
      // We found fields via introspection, use them
      const query = buildDynamicQuery(nodesFields, edgesFields, limit);
      console.log('Executing dynamic query:', query);
      
      const data = await queryGraphQL(accessToken, query);
      
      const typedData = data as {
        lineage_nodes?: { items?: Array<Record<string, unknown>> };
        lineage_edges?: { items?: Array<Record<string, unknown>> };
      };

      response = {
        lineage_nodes: typedData.lineage_nodes?.items || [],
        lineage_edges: typedData.lineage_edges?.items || [],
      };
    } else {
      // Fallback: try minimal query to at least get __typename
      console.log('Introspection returned no fields, trying minimal query...');
      response = await queryWithMinimalFields(accessToken, limit);
    }

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
