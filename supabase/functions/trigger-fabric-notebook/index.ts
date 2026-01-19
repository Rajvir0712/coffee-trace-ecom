import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TriggerRequest {
  sales_contract: string;
}

interface TriggerResponse {
  status: string;
  message: string;
  job_id?: string;
  sales_contract: string;
  triggered_at: string;
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

async function triggerNotebook(salesContract: string): Promise<{ success: boolean; jobId?: string; message: string }> {
  const workspaceId = Deno.env.get('FABRIC_WORKSPACE_ID');
  const notebookId = Deno.env.get('FABRIC_NOTEBOOK_ITEM_ID');

  if (!workspaceId || !notebookId) {
    throw new Error('Missing Fabric configuration');
  }

  const accessToken = await getAccessToken();

  const url = `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/items/${notebookId}/jobs/instances?jobType=RunNotebook`;

  const payload = {
    executionData: {
      parameters: {
        sales_contract: salesContract,
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 202) {
    const location = response.headers.get('Location') || '';
    const jobId = location.split('/').pop() || 'unknown';
    return { success: true, jobId, message: 'Notebook job started successfully' };
  } else if (response.status === 200) {
    const data = await response.json();
    return { success: true, jobId: data.id || 'unknown', message: 'Notebook job started successfully' };
  } else {
    const errorText = await response.text();
    throw new Error(`Failed to trigger notebook: ${errorText}`);
  }
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

    const { sales_contract }: TriggerRequest = await req.json();

    if (!sales_contract || !sales_contract.trim()) {
      return new Response(
        JSON.stringify({ error: 'Sales contract cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await triggerNotebook(sales_contract.trim());

    const response: TriggerResponse = {
      status: result.success ? 'success' : 'failed',
      message: result.message,
      job_id: result.jobId,
      sales_contract: sales_contract.trim(),
      triggered_at: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error triggering notebook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
