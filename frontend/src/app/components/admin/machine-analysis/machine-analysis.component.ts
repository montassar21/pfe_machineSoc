import { Component, OnInit, ViewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { Chart, registerables, ChartOptions } from 'chart.js';
import { Subscription } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';
import zoomPlugin from 'chartjs-plugin-zoom';
import { 
  MachineData, 
  MachineAnalysisRequest, 
  AnomalyDetectionResult,
  HistoricalAnomalyRequest,
  HistoricalAnomalyResult,
  MachineAnomalyResult,
  AnomalySummary
} from '../../../models/machine.model';
import { MachineService } from '../../../services/machine.service';
import { saveAs } from 'file-saver';

Chart.register(...registerables, zoomPlugin);

@Component({
  selector: 'app-machine-analysis',
  templateUrl: './machine-analysis.component.html',
  styleUrls: ['./machine-analysis.component.scss']
})
export class MachineAnalysisComponent implements OnInit, OnDestroy {
  machineData: MachineData[] = [];
  anomalies: HistoricalAnomalyResult = { summary: { anomalies_found: false, machines_count: 0, machines_processed: 0, timestamp: '' } };
  
  selectedMachine: string = '';
  availableMachines: string[] = [
     'G19', 'G26', 'MISFAT_3_Compresseur_3', 'MISFAT_3_G39f', 
    'MISFAT_3_D18f', 'MISFAT_3_G10f', 'MISFAT_3_TGBT_N3f'
  ];
  selectedDateRange: string = '30d';
  selectedMetrics: string[] = [];
  
  isLoading: boolean = false;
  error: string = '';
  
  charts: Chart[] = [];
  chartColors: {[key: string]: string} = {};
  
  isFullscreen: boolean = false;
  fullscreenElement: string | null = null;
  dataSubscription: Subscription | null = null;
  anomaliesSubscription: Subscription | null = null;
  
  @ViewChild('timeseriesCanvas') timeseriesCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('metricsComparisonCanvas') metricsComparisonCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('anomalyCanvas') anomalyCanvas!: ElementRef<HTMLCanvasElement>;
  
  // Date filters
  startDate: string = '';
  endDate: string = '';
  
  // Analysis metrics
  availableMetrics: string[] = [
     'G19', 'G26', 'MISFAT_3_Compresseur_3', 'MISFAT_3_G39f', 
    'MISFAT_3_D18f', 'MISFAT_3_G10f', 'MISFAT_3_TGBT_N3f'
  ];
  
  // Performance metrics
  totalUptime: number = 0;
  totalDowntime: number = 0;
  efficiencyRate: number = 0;
  anomalyCount: number = 0;
  anomalySeverityLevels: { [key: string]: number } = {};
  anomalyTrends: { date: string, count: number }[] = [];
  selectedAnomalyMetric: string = '';
  anomalyThreshold: number = 0.75;
  
  constructor(private machineService: MachineService) {}

  ngOnInit(): void {
    this.initializeChartColors();
    this.setDefaultDateRange();
    
    // Set default selection
    if (this.availableMachines.length > 0) {
      this.selectedMachine = this.availableMachines[0];
      this.loadData();
    }
    
    // Select default metrics
    if (this.selectedMetrics.length === 0 && this.availableMetrics.length > 0) {
      this.selectedMetrics = this.availableMetrics.slice(0, 3); // Select first 3 metrics by default
    }
    
    // Set default anomaly metric
    if (this.availableMetrics.length > 0) {
      this.selectedAnomalyMetric = this.availableMetrics[0];
    }
  }
  
  ngOnDestroy(): void {
    this.unsubscribeAll();
  }

  initializeChartColors(): void {
    // Pre-generate consistent colors for each metric
    this.availableMetrics.forEach(metric => {
      this.chartColors[metric] = this.getUniqueColor(metric);
    });
  }
  
  setDefaultDateRange(): void {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = thirtyDaysAgo.toISOString().split('T')[0];
  }
  
  loadData(): void {
    if (!this.selectedMachine) {
      this.error = 'Please select a machine';
      return;
    }
    
    this.isLoading = true;
    this.error = '';
    this.unsubscribeAll();
    
    // Load machine data
    this.dataSubscription = this.machineService.getMachineData()
      .pipe(
        catchError(err => {
          this.error = `Error loading machine data: ${err.message}`;
          return of([]);
        }),
        finalize(() => {
          if (!this.anomaliesSubscription) {
            this.isLoading = false;
          }
        })
      )
      .subscribe(data => {
        const startDate = new Date(this.startDate);
        const endDate = new Date(this.endDate);
        endDate.setHours(23, 59, 59); // End of day
        
        this.machineData = data.filter(item => {
          const timestamp = new Date(item.Timestamp);
          return timestamp >= startDate && timestamp <= endDate;
        });
        
        this.loadAnomalies();
      });
  }
  
  loadAnomalies(): void {
    const anomalyRequest: HistoricalAnomalyRequest = {
      start_date: this.startDate,
      end_date: this.endDate,
      machines: [this.selectedMachine]
    };
    
    this.anomaliesSubscription = this.machineService.getHistoricalAnomalies(anomalyRequest)
      .pipe(
        catchError(err => {
          this.error = `Error loading anomalies: ${err.message}`;
          return of({ summary: { anomalies_found: false, machines_count: 0, machines_processed: 0, timestamp: '' } });
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(anomalies => {
        this.anomalies = anomalies;
        this.calculateAnomalyMetrics();
        this.processAnomalyTrends();
        this.renderCharts();
      });
  }
  
  calculateAnomalyMetrics(): void {
    this.anomalyCount = 0;
    this.anomalySeverityLevels = { low: 0, medium: 0, high: 0, critical: 0 };
    
    if (this.anomalies && this.selectedMachine in this.anomalies) {
      const machineAnomalies = this.anomalies[this.selectedMachine] as MachineAnomalyResult;
      
      if (machineAnomalies && 'anomalies' in machineAnomalies && machineAnomalies.anomalies) {
        this.anomalyCount = machineAnomalies.anomalies.length;
        
        machineAnomalies.anomalies.forEach(anomaly => {
          const score = anomaly.score || 0;
          
          
          if (Math.abs(score) > this.anomalyThreshold * 2) {
            this.anomalySeverityLevels['critical']++;
          } else if (Math.abs(score) > this.anomalyThreshold * 1.5) {
            this.anomalySeverityLevels['high']++;
          } else if (Math.abs(score) > this.anomalyThreshold * 1.25) {
            this.anomalySeverityLevels['medium']++;
          } else {
            this.anomalySeverityLevels['low']++;
          }
        });
      }
    }
  }
  
  processAnomalyTrends(): void {
    // Process anomaly trends over time
    const anomalyTrendMap = new Map<string, number>();
    
    if (this.anomalies && this.selectedMachine in this.anomalies) {
      const machineAnomalies = this.anomalies[this.selectedMachine] as MachineAnomalyResult;
      
      if (machineAnomalies && 'anomalies' in machineAnomalies && machineAnomalies.anomalies) {
        machineAnomalies.anomalies.forEach(anomaly => {
          if (anomaly.Timestamp) {
            const date = new Date(anomaly.Timestamp).toISOString().split('T')[0];
            anomalyTrendMap.set(date, (anomalyTrendMap.get(date) || 0) + 1);
          }
        });
      }
    }
    
    const startDate = new Date(this.startDate);
    const endDate = new Date(this.endDate);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split('T')[0];
      if (!anomalyTrendMap.has(dateString)) {
        anomalyTrendMap.set(dateString, 0);
      }
    }
    
    // Convert map to array and sort by date
    this.anomalyTrends = Array.from(anomalyTrendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  
  onMachineChange(): void {
    this.loadData();
  }
  
  onDateRangeChange(range: string): void {
    this.selectedDateRange = range;
    
    const today = new Date();
    let startDate = new Date();
    
    switch (range) {
      case '24h':
        startDate.setHours(today.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(today.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(today.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(today.getDate() - 90);
        break;
      default:
        startDate.setDate(today.getDate() - 30);
    }
    
    this.startDate = startDate.toISOString().split('T')[0];
    this.endDate = today.toISOString().split('T')[0];
    
    this.loadData();
  }
  
  onDateFilterChange(): void {
    this.loadData();
  }
  
  onMetricToggle(metric: string): void {
    const index = this.selectedMetrics.indexOf(metric);
    if (index > -1) {
      this.selectedMetrics.splice(index, 1);
    } else {
      this.selectedMetrics.push(metric);
    }
    this.renderCharts();
  }
  
  onAnomalyThresholdChange(value: number): void {
    this.anomalyThreshold = value;
    this.calculateAnomalyMetrics();
    this.renderCharts();
  }
  
  onAnomalyMetricChange(metric: string): void {
    this.selectedAnomalyMetric = metric;
    this.renderCharts();
  }
  
  renderCharts(): void {
    // Destroy previous charts
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
    
    if (!this.machineData.length) return;
    
    this.renderTimeseriesChart();
    this.renderMetricsComparisonChart();
    this.renderEnhancedAnomalyChart();
  }
  
  renderTimeseriesChart(): void {
    if (!this.timeseriesCanvas) return;
    
    const ctx = this.timeseriesCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Process data for the chart
    const labels = this.machineData.map(item => {
      const timestamp = item.Timestamp || '';
      return timestamp ? new Date(timestamp).toLocaleString() : '';
    });
    
    // Optimize for large datasets
    const decimationFactor = this.machineData.length > 1000 ? Math.ceil(this.machineData.length / 1000) : 1;
    const decimatedLabels = this.decimateData(labels, decimationFactor);
    
    const datasets = this.selectedMetrics.map(metric => {
      const color = this.chartColors[metric] || this.getUniqueColor(metric);
      
      // Extract data points for this metric
      const data = this.machineData.map(item => {
        const value = item[metric];
        return typeof value === 'number' ? value : null;
      });
      
      const decimatedData = this.decimateData(data, decimationFactor);
      
      return {
        label: metric,
        data: decimatedData,
        borderColor: color,
        backgroundColor: this.hexToRgba(color, 0.1),
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: decimatedData.length > 100 ? 0 : 2,
        pointHoverRadius: 4
      };
    });
    
    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x'
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Time'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 20
          }
        },
        y: {
          title: {
            display: true,
            text: 'Value'
          },
          beginAtZero: false
        }
      },
      plugins: {
        title: {
          display: true,
          text: `Time Series Analysis - ${this.selectedMachine} (${this.machineData.length} data points)`
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false
        },
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'x'
          }
        }
      },
      animation: {
        duration: this.machineData.length > 1000 ? 0 : 1000
      }
    };
    
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: decimatedLabels,
        datasets
      },
      options: options as any
    });
    
    this.charts.push(chart);
  }
  
  renderMetricsComparisonChart(): void {
    if (!this.metricsComparisonCanvas) return;
    
    const ctx = this.metricsComparisonCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Get the latest data point
    const latestData = this.machineData[this.machineData.length - 1];
    
    const data = this.availableMetrics.map(metric => {
      const value = latestData[metric];
      return typeof value === 'number' ? value : null;
    });
    
    const backgroundColors = this.availableMetrics.map(metric => this.chartColors[metric] || this.getUniqueColor(metric));
    
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.availableMetrics,
        datasets: [{
          label: 'Current Values',
          data: data,
          backgroundColor: backgroundColors.map(color => this.hexToRgba(color, 0.7)),
          borderColor: backgroundColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: `Metric Comparison - ${this.selectedMachine} (Latest Measurement)`
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const value = context.parsed.y;
                return value !== null ? `Value: ${value.toFixed(2)}` : 'No data';
              }
            }
          }
        }
      }
    });
    
    this.charts.push(chart);
  }
  
  renderEnhancedAnomalyChart(): void {
    if (!this.anomalyCanvas?.nativeElement) return;

    const ctx = this.anomalyCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const trendData = this.anomalyTrends.map(item => item.count);
    const dates = this.anomalyTrends.map(item => item.date);

    const movingAverages = this.calculateMovingAverage(trendData, 7); // Changed to 7-day moving average for clarity

    const severityData = [
      this.anomalySeverityLevels['low'] || 0,
      this.anomalySeverityLevels['medium'] || 0,
      this.anomalySeverityLevels['high'] || 0,
      this.anomalySeverityLevels['critical'] || 0
    ];

    // Create anomaly distribution data
    const existingChart = this.charts.find(c => c.canvas === ctx.canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            type: 'bar',
            label: 'Daily Anomalies',
            data: trendData,
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: '7-Day Moving Average',
            data: movingAverages,
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { 
              display: true, 
              text: 'Number of Anomalies',
              color: 'rgba(255, 99, 132, 1)'
            },
            beginAtZero: true
          },
          x: {
            title: { display: true, text: 'Date' },
            ticks: { 
              maxRotation: 45, 
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: dates.length > 30 ? 15 : 30
            }
          }
        },
        plugins: {
          title: { 
            display: true, 
            text: `Enhanced Anomaly Analysis - ${this.selectedMachine}`,
            padding: {
              top: 10,
              bottom: 30
            },
            font: {
              size: 16
            }
          },
          subtitle: {
            display: true,
            text: `Total Anomalies: ${this.anomalyCount} | Critical: ${this.anomalySeverityLevels['critical']} | High: ${this.anomalySeverityLevels['high']}`,
            padding: {
              bottom: 10
            }
          },
          tooltip: {
            callbacks: {
              title: (tooltipItems: any) => {
                const date = new Date(tooltipItems[0].label);
                return date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                });
              },
              label: (context: any) => {
                if (context.datasetIndex === 0) {
                  return `Anomalies: ${context.parsed.y}`;
                } else {
                  return `7-Day Avg: ${context.parsed.y.toFixed(2)}`;
                }
              }
            }
          },
          legend: {
            position: 'top'
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x'
            },
            zoom: {
              wheel: {
                enabled: true
              },
              pinch: {
                enabled: true
              },
              mode: 'x'
            }
          }
        }
      } as any
    });

    this.charts.push(chart);

    // Create a second chart below for anomaly severity distribution
    const severityCanvas = document.createElement('canvas');
    severityCanvas.id = 'severityDistributionCanvas';
    severityCanvas.height = 200;
    
    // Append the new canvas below the anomaly canvas
    const parentElement = this.anomalyCanvas.nativeElement.parentElement;
    if (parentElement) {
      parentElement.appendChild(severityCanvas);
      
      const severityChart = new Chart(severityCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Low', 'Medium', 'High', 'Critical'],
          datasets: [{
            data: severityData,
            backgroundColor: [
              'rgba(54, 162, 235, 0.7)',
              'rgba(255, 206, 86, 0.7)',
              'rgba(255, 159, 64, 0.7)',
              'rgba(255, 99, 132, 0.7)'
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(255, 159, 64, 1)',
              'rgba(255, 99, 132, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Anomaly Severity Distribution',
              font: {
                size: 14
              }
            },
            legend: {
              position: 'right'
            },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  const value = context.parsed;
                  const total = severityData.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return `${context.label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
      
      this.charts.push(severityChart);
    }
  }

  exportAnomalyToCSV(): void {
    const headers = ['Date', 'Anomaly Count', 'Severity (Critical)', 'Severity (High)', 'Severity (Medium)', 'Severity (Low)'];
    
    const exportData = this.anomalyTrends.map(item => {
      
      const date = item.date;
      const count = item.count;
      
      // Simple distribution for demonstration
      const critical = Math.floor(count * 0.1);
      const high = Math.floor(count * 0.2);
      const medium = Math.floor(count * 0.3);
      const low = count - critical - high - medium;
      
      return [date, count.toString(), critical.toString(), high.toString(), medium.toString(), low.toString()];
    });
    
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `anomalies_${this.selectedMachine}_detailed.csv`);
  }

  exportAnomalyToPNG(): void {
    if (!this.anomalyCanvas?.nativeElement) return;
    
    const canvas = this.anomalyCanvas.nativeElement;
    canvas.toBlob(blob => {
      if (blob) {
        saveAs(blob, `anomalies_${this.selectedMachine}.png`);
      }
    });
    
    // Also export the severity distribution chart if it exists
    const severityCanvas = document.getElementById('severityDistributionCanvas') as HTMLCanvasElement;
    if (severityCanvas) {
      severityCanvas.toBlob(blob => {
        if (blob) {
          saveAs(blob, `anomaly_severity_${this.selectedMachine}.png`);
        }
      });
    }
  }
  
  refreshData(): void {
    this.loadData();
  }
  
  toggleFullscreen(element: string): void {
    if (this.fullscreenElement === element) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen(element);
    }
  }
  
  enterFullscreen(element: string): void {
    this.fullscreenElement = element;
    this.isFullscreen = true;
    
    // Add fullscreen class to the appropriate element
    document.querySelector(`.${element}`)?.classList.add('fullscreen');
    
    // Redraw charts after a short delay to adapt to the new size
    setTimeout(() => {
      this.renderCharts();
    }, 100);
  }
  
  exitFullscreen(): void {
    this.isFullscreen = false;
    
    // Remove fullscreen class from the previously fullscreen element
    if (this.fullscreenElement) {
      document.querySelector(`.${this.fullscreenElement}`)?.classList.remove('fullscreen');
    }
    
    this.fullscreenElement = null;
    
    // Redraw charts after a short delay to adapt to the new size
    setTimeout(() => {
      this.renderCharts();
    }, 100);
  }
  
  unsubscribeAll(): void {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
      this.dataSubscription = null;
    }
    
    if (this.anomaliesSubscription) {
      this.anomaliesSubscription.unsubscribe();
      this.anomaliesSubscription = null;
    }
  }
  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    // Redraw charts when window is resized
    this.renderCharts();
  }
  
  // Helper methods
  calculateMovingAverage(data: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    // For each data point
    for (let i = 0; i < data.length; i++) {
      // Calculate how many points to include (handling edges)
      const windowStart = Math.max(0, i - windowSize + 1);
      const windowEnd = i + 1; // exclusive
      const windowLength = windowEnd - windowStart;
      
      // Sum the points in the window
      let sum = 0;
      for (let j = windowStart; j < windowEnd; j++) {
        sum += data[j];
      }
      
      // Calculate average and add to result
      result.push(windowLength > 0 ? sum / windowLength : 0);
    }
    
    return result;
  }
  
  // Helper methods for colors and data processing
  getUniqueColor(text: string): string {
    // Generate a deterministic color based on text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to HSL for better contrasts
    const h = Math.abs(hash % 360);
    const s = 65 + Math.abs((hash >> 8) % 20); // 65-85%
    const l = 45 + Math.abs((hash >> 16) % 10); // 45-55%
    
    // Convert HSL to hex
    return this.hslToHex(h, s, l);
  }
  
  hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
  
  hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  decimateData<T>(data: T[], factor: number): T[] {
    if (factor <= 1) return data;
    
    const result: T[] = [];
    for (let i = 0; i < data.length; i += factor) {
      result.push(data[i]);
    }
    
    if (data.length > 0 && result[result.length - 1] !== data[data.length - 1]) {
      result.push(data[data.length - 1]);
    }
    
    return result;
  }

}