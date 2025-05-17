import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { PredictionRequest, PredictionResponse, AvailableModelsResponse } from '../models/prediction.model';

@Injectable({
  providedIn: 'root'
})
export class PredictionService {
  private apiBaseUrl = 'http://localhost:5000';

  constructor(private http: HttpClient) {}

  predictConsumption(currentConsumptions: PredictionRequest): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(`${this.apiBaseUrl}/api/predict-consumption`, currentConsumptions)
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  
  getAvailablePredictionModels(): Observable<AvailableModelsResponse> {
    return this.http.get<AvailableModelsResponse>(`${this.apiBaseUrl}/api/available-prediction-models`)
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }


  formatConsumptionData(machineData: any[]): PredictionRequest {
    if (!machineData || machineData.length === 0) {
      return {};
    }

    const latestData = machineData[machineData.length - 1];
    const result: PredictionRequest = {};

    Object.keys(latestData).forEach(key => {
      if (this.isValidConsumptionField(key, latestData[key])) {
        result[key] = Number(latestData[key]);
      }
    });

    return result;
  }


  private isValidConsumptionField(key: string, value: any): boolean {
    const excludedFields = ['date', 'timestamp', 'Date', 'Timestamp', 'id', 'ID'];
    return !excludedFields.includes(key) && !isNaN(Number(value));
  }


  private handleError(error: HttpErrorResponse) {
    let errorMessage = '';
    
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    console.error('PredictionService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}