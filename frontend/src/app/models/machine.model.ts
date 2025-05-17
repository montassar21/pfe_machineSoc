export interface MachineData {
  id: number;
  Timestamp: string;
  [key: string]: number | string;
}

export interface MachineStatusResponse {
  machines: {
    [key: string]: string; 
  };
  timestamp: string;
}

export interface MachineStatus {
  machine_name: string;
  status: string;
  last_updated: string;
}

export interface MachineStopResponse {
  [index: number]: {
    duration_hours: number;
    end_time: string | null;
    machine: string;
    start_time: string;
  }
}

export interface MachineStop {
  machine_name: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number;
}

export interface AlertRequest {
  anomalies: Array<{
    [machine_name: string]: number | string;
    Timestamp: string;
    score: number;
  }>;
  model_name: string;
}

export interface MonitoringRequest {
  frequence_minutes: number;
}

export interface ApiResponse<T> {
  status?: string;
  message?: string;
  data?: T;
  error?: string;
}

export interface AnomalyData {
  [machine_name: string]: string | number;
  Timestamp: string;
  score: number;
}

export interface MachineAnomalyResult {
  anomalies: AnomalyData[];
  anomalies_count: number;
  mean_score: number;
  status: string;
  total_points: number;
}

export interface AnomalySummary {
  anomalies_found: boolean;
  machines_count: number;
  machines_processed: number;
  timestamp: string;
}

export interface AnomalyDetectionResult {
  [machine_name: string]: MachineAnomalyResult | AnomalySummary;
  summary: AnomalySummary;
}

export interface HistoricalAnomalyRequest {
  start_date?: string;
  end_date?: string;
  machines?: string[];
}

export type HistoricalAnomalyResult = AnomalyDetectionResult;

export interface MachineAnalysisRequest {
  machine: string;
  data: Array<{
    [key: string]: number | string | undefined;
    timestamp?: string;
    Timestamp?: string;
  }>;
}

export interface MachineAnalysisResult {
  machine: string;
  results: MachineAnomalyResult;
  summary: AnomalySummary;
}

export interface MonitoringStatus {
  status: 'active' | 'inactive';
  message: string;
}
