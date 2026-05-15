export class InstanceNotFoundError extends Error {
  readonly instanceName: string;
  constructor(instanceName: string) {
    super(`Instância não encontrada: ${instanceName}`);
    this.name = 'InstanceNotFoundError';
    this.instanceName = instanceName;
  }
}

export class EvolutionApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.body = body;
  }
}

export interface NormalizedStatus {
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_code' | 'not_found';
  qrCode: string | null;
  connectedNumber: string | null;
  instanceName: string | null;
}
