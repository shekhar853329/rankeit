export interface HealthStatusDto {
  status: 'Healthy' | 'Degraded' | string;
  database: 'Connected' | 'Disconnected' | string;
  timestamp: string;
  uptime: string;
  version?: string;
}

export type ApiSystemStatus = 'operational' | 'degraded' | 'offline' | 'checking';
