import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { catchError, finalize, Subject, takeUntil } from 'rxjs';
import { MachinePrediction, PredictionStatus } from 'src/app/models/prediction.model';
import { PredictionService } from 'src/app/services/prediction.service';

@Component({
  selector: 'app-prediction',
  templateUrl: './prediction.component.html',
  styleUrls: ['./prediction.component.scss']
})
export class PredictionComponent implements OnInit, OnDestroy {
  predictionForm: FormGroup;
  
  availableModels: string[] = [];
  predictionResults: { [machineName: string]: MachinePrediction } = {};
  
  modelsStatus: PredictionStatus = PredictionStatus.IDLE;
  predictionStatus: PredictionStatus = PredictionStatus.IDLE;
  errorMessage = '';
  
  PredictionStatus = PredictionStatus; 
  Object = Object; 
  
  private destroy$ = new Subject<void>();

  constructor(
    private predictionService: PredictionService,
    private fb: FormBuilder
  ) {
    this.predictionForm = this.fb.group({});
  }

  ngOnInit(): void {
    this.loadAvailableModels();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

 
  loadAvailableModels(): void {
    this.modelsStatus = PredictionStatus.LOADING;
    this.errorMessage = '';
    
    this.predictionService.getAvailablePredictionModels()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.errorMessage = `Failed to load prediction models: ${error.message}`;
          this.modelsStatus = PredictionStatus.ERROR;
          return [];
        }),
        finalize(() => {
          if (this.modelsStatus !== PredictionStatus.ERROR) {
            this.modelsStatus = PredictionStatus.SUCCESS;
          }
        })
      )
      .subscribe(response => {
        if (response && response.status === 'success') {
          this.availableModels = response.models;
          this.initializeForm();
        } else if (response) {
          this.errorMessage = response.message || 'Failed to load models';
          this.modelsStatus = PredictionStatus.ERROR;
        }
      });
  }

  
  private initializeForm(): void {
    const formControls: { [key: string]: any } = {};
    
    this.availableModels.forEach(model => {
      formControls[model] = [0, [Validators.required, Validators.min(0)]];
    });
    
    this.predictionForm = this.fb.group(formControls);
  }

  predictConsumption(): void {
    if (!this.predictionForm.valid) {
      this.markFormGroupTouched(this.predictionForm);
      return;
    }
    
    this.predictionStatus = PredictionStatus.LOADING;
    this.errorMessage = '';
    
    this.predictionService.predictConsumption(this.predictionForm.value)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.errorMessage = `Error making predictions: ${error.message}`;
          this.predictionStatus = PredictionStatus.ERROR;
          return [];
        }),
        finalize(() => {
          if (this.predictionStatus !== PredictionStatus.ERROR) {
            this.predictionStatus = PredictionStatus.SUCCESS;
          }
        })
      )
      .subscribe(response => {
        if (response && response.status === 'success') {
          this.predictionResults = response.predictions;
          
          // Calculate percent change for each successful prediction
          Object.keys(this.predictionResults).forEach(machine => {
            const prediction = this.predictionResults[machine];
            if (prediction.status === 'success' && 
                prediction.predicted_value !== null && 
                prediction.predicted_value !== undefined && 
                prediction.current_value > 0) {
              this.predictionResults[machine].percentChange = 
                ((prediction.predicted_value - prediction.current_value) / prediction.current_value) * 100;
                console.log(this.predictionResults[machine].percentChange);
            }
          });
        } else if (response) {
          this.errorMessage = response.message || 'Failed to make predictions';
          this.predictionStatus = PredictionStatus.ERROR;
        }
      });
  }


  resetForm(): void {
    this.predictionForm.reset();
    this.availableModels.forEach(model => {
      this.predictionForm.get(model)?.setValue(0);
    });
    this.predictionResults = {};
    this.predictionStatus = PredictionStatus.IDLE;
    this.errorMessage = '';
  }

  isPredictionSuccessful(machineName: string): boolean {
    
    return this.predictionResults[machineName]?.status === 'success';
  }

  
  getPredictionClass(machineName: string): string {
    if (!this.predictionResults[machineName]) {
      return '';
    }
    
    
    return this.predictionResults[machineName].status === 'success' 
      ? 'prediction-success' 
      : 'prediction-error';
  }

  
  getTrendClass(percentChange: number | undefined): string {
    if (percentChange === undefined) return '';
    return percentChange > 0 ? 'trend-increase' : percentChange < 0 ? 'trend-decrease' : 'trend-neutral';
  }


  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  hasError(controlName: string): boolean {
    const control = this.predictionForm.get(controlName);
    return control ? control.invalid && (control.dirty || control.touched) : false;
  }
}