import {
  BackendConfig,
  BackendOptionsResponse,
  BackendSimulationResponse,
  BackendTopologyResponse,
} from '../types';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchBackendOptions(): Promise<BackendOptionsResponse> {
  const response = await fetch('/api/options');
  return parseJsonResponse<BackendOptionsResponse>(response);
}

export async function fetchTopology(fileName: string): Promise<BackendTopologyResponse> {
  const query = new URLSearchParams({ file: fileName });
  const response = await fetch(`/api/topology?${query.toString()}`);
  return parseJsonResponse<BackendTopologyResponse>(response);
}

export async function runBackendSimulation(config: BackendConfig, topoFile?: string): Promise<BackendSimulationResponse> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config,
      topo_file: topoFile ?? config.topo_file,
    }),
  });

  return parseJsonResponse<BackendSimulationResponse>(response);
}
