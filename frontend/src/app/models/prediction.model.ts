export interface PredictionRequest {
  [machineName: string]: number;
}

export interface MachinePrediction {
  current_value: number;
  predicted_value: number | null;
  status: 'success' | 'error';
  message?: string;
  percentChange?: number;
}

export interface PredictionResponse {
  status: string;
  message?: string;
  predictions: {
    [machineName: string]: MachinePrediction;
  };
}

export interface AvailableModelsResponse {
  status: string;
  message?: string;
  models: string[];
}

export enum PredictionStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}