import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { 
  MachineData, 
  MachineStatus, 
  MachineStatusResponse,
  MachineStop, 
  MachineStopResponse,
  AlertRequest, 
  ApiResponse, 
  MonitoringRequest,
  AnomalyDetectionResult,
  HistoricalAnomalyRequest,
  HistoricalAnomalyResult,
  MachineAnalysisRequest,
  MachineAnalysisResult,
  MonitoringStatus
} from '../models/machine.model';

@Injectable({
  providedIn: 'root'
})
export class MachineService {
  private apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) { }

  getMachineData(hours?: number): Observable<MachineData[]> {
    const params: any = {};
    if (hours !== undefined) {
      params.hours = hours.toString();
    }
    
    return this.http.get<MachineData[]>(`${this.apiUrl}/machine-data`, { params });
  }

  getMachineStatus(): Observable<MachineStatus[]> {
    return this.http.get<MachineStatusResponse>(`${this.apiUrl}/machine-status`)
      .pipe(
        map(response => {
          const statuses: MachineStatus[] = [];
          for (const [machine_name, status] of Object.entries(response.machines)) {
            statuses.push({
              machine_name,
              status,
              last_updated: response.timestamp
            });
          }
          return statuses;
        })
      );
  }

  getMachineStops(): Observable<MachineStop[]> {
    return this.http.get<MachineStopResponse>(`${this.apiUrl}/machine-stops`)
      .pipe(
        map(response => {
          return Object.values(response).map(stopData => ({
            machine_name: stopData.machine,
            start_time: stopData.start_time,
            end_time: stopData.end_time,
            duration_hours: stopData.duration_hours
          }));
        })
      );
  }

  sendAlert(alertData: AlertRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/send-alert`, alertData);
  }

  startMonitoring(frequenceMinutes: number = 60): Observable<ApiResponse<null>> {
    const data: MonitoringRequest = { frequence_minutes: frequenceMinutes };
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/start-monitoring`, data);
  }

  detectAnomalies(hours: number = 24): Observable<AnomalyDetectionResult> {
    return this.http.get<AnomalyDetectionResult>(`${this.apiUrl}/detect-anomalies`, {
      params: { hours: hours.toString() }
    });
  }

  getHistoricalAnomalies(params: HistoricalAnomalyRequest): Observable<HistoricalAnomalyResult> {
    const queryParams: any = {};
    
    if (params.start_date) queryParams.start_date = params.start_date;
    if (params.end_date) queryParams.end_date = params.end_date;
    if (params.machines) queryParams.machines = params.machines.join(',');
    
    return this.http.get<HistoricalAnomalyResult>(`${this.apiUrl}/historical-anomalies`, {
      params: queryParams
    });
  }

  analyzeMachine(request: MachineAnalysisRequest): Observable<MachineAnalysisResult> {
    return this.http.post<MachineAnalysisResult>(`${this.apiUrl}/analyze-machine`, request);
  }


  stopMonitoring(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/stop-monitoring`, {});
  }


  getMonitoringStatus(): Observable<MonitoringStatus> {
    return this.http.get<MonitoringStatus>(`${this.apiUrl}/monitoring-status`);
  }
}