import { supabase } from "@/integrations/supabase/client";

export interface TriggerResponse {
  status: string;
  message: string;
  job_id?: string;
  sales_contract: string;
  triggered_at: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: string;
  start_time?: string;
  end_time?: string;
  failure_reason?: string;
}

export async function triggerLineageTrace(salesContract: string): Promise<TriggerResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('trigger-fabric-notebook', {
      body: { sales_contract: salesContract },
    });

    if (error) {
      // Supabase FunctionsHttpError - extract the actual error message
      let errorMsg = 'Failed to trigger notebook';
      if (typeof error === 'object' && error !== null) {
        if ('message' in error && typeof error.message === 'string') {
          // Try to parse if it's a JSON string
          try {
            const parsed = JSON.parse(error.message);
            errorMsg = parsed.error || parsed.message || error.message;
          } catch {
            errorMsg = error.message;
          }
        } else if ('message' in error && typeof error.message === 'object' && error.message !== null) {
          // The message itself is an object
          const msgObj = error.message as Record<string, unknown>;
          errorMsg = String(msgObj.message || msgObj.error || JSON.stringify(error.message));
        }
      }
      throw new Error(errorMsg);
    }

    if (data?.error) {
      const errorMsg = typeof data.error === 'string' 
        ? data.error 
        : (typeof data.error === 'object' && data.error !== null && 'message' in data.error
          ? String(data.error.message) 
          : JSON.stringify(data.error));
      throw new Error(errorMsg);
    }

    return data as TriggerResponse;
  } catch (err) {
    // Final safety net - ensure we always throw a string message
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(typeof err === 'string' ? err : 'Failed to trigger notebook');
  }
}

export async function checkJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-fabric-job?job_id=${encodeURIComponent(jobId)}`,
    {
      method: 'GET',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    const errorMsg = typeof errorData.error === 'string' ? errorData.error : 'Failed to check job status';
    throw new Error(errorMsg);
  }

  return response.json();
}

export type JobStatus = 'Queued' | 'InProgress' | 'Succeeded' | 'Failed' | 'Cancelled' | 'Unknown';

// GraphQL Lineage Data types
export interface GraphQLLineageData {
  lineage_nodes: Array<Record<string, unknown>>;
  lineage_edges: Array<Record<string, unknown>>;
  lineage_summary: Array<Record<string, unknown>>;
}

export async function queryFabricGraphQL(salesContract?: string, limit: number = 20): Promise<GraphQLLineageData> {
  try {
    const { data, error } = await supabase.functions.invoke('query-fabric-graphql', {
      body: { sales_contract: salesContract, limit },
    });

    if (error) {
      let errorMsg = 'Failed to query GraphQL';
      if (typeof error === 'object' && error !== null && 'message' in error) {
        try {
          const parsed = JSON.parse(String(error.message));
          errorMsg = parsed.error || parsed.message || String(error.message);
        } catch {
          errorMsg = String(error.message);
        }
      }
      throw new Error(errorMsg);
    }

    if (data?.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    return data as GraphQLLineageData;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(typeof err === 'string' ? err : 'Failed to query GraphQL');
  }
}

export function mapJobStatus(status: string): JobStatus {
  const normalizedStatus = status.toLowerCase();

  // Fabric reports "NotStarted" while the job is queued/waiting for a pool
  if (
    normalizedStatus.includes('notstarted') ||
    normalizedStatus.includes('not started') ||
    normalizedStatus.includes('queue') ||
    normalizedStatus.includes('deduplicating')
  ) {
    return 'Queued';
  }

  if (normalizedStatus.includes('progress') || normalizedStatus.includes('running')) {
    return 'InProgress';
  }
  if (normalizedStatus.includes('success') || normalizedStatus.includes('completed')) {
    return 'Succeeded';
  }
  if (normalizedStatus.includes('fail')) {
    return 'Failed';
  }
  if (normalizedStatus.includes('cancel')) {
    return 'Cancelled';
  }

  return 'Unknown';
}

export function isTerminalStatus(status: JobStatus): boolean {
  return status === 'Succeeded' || status === 'Failed' || status === 'Cancelled';
}

export async function runLineageTraceWithPolling(
  salesContract: string,
  onStatusChange: (status: JobStatus, message: string) => void,
  pollIntervalMs: number = 5000,
  maxPollAttempts: number = 120 // 10 minutes max
): Promise<JobStatusResponse> {
  // Trigger the notebook
  onStatusChange('Queued', 'Triggering notebook...');
  const triggerResult = await triggerLineageTrace(salesContract);

  if (!triggerResult.job_id) {
    throw new Error('No job ID returned from trigger');
  }

  const jobId = triggerResult.job_id;
  onStatusChange('Queued', `Job queued: ${jobId}`);

  // Poll for completion
  let attempts = 0;
  while (attempts < maxPollAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    attempts++;

    const statusResult = await checkJobStatus(jobId);
    const mappedStatus = mapJobStatus(statusResult.status);

    onStatusChange(mappedStatus, `Status: ${statusResult.status}`);

    if (mappedStatus === 'Succeeded') {
      return statusResult;
    }

    if (mappedStatus === 'Failed') {
      throw new Error(statusResult.failure_reason || 'Notebook job failed');
    }

    if (mappedStatus === 'Cancelled') {
      throw new Error('Notebook job was cancelled');
    }
  }

  throw new Error('Polling timeout: Job did not complete in time');
}
