import { Component, OnInit, ViewChild, ElementRef, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { MachineService } from '../../../services/machine.service';
import { MachineData } from '../../../models/machine.model';
import { Chart, registerables, ChartOptions } from 'chart.js';
import { catchError, finalize } from 'rxjs/operators';
import { of, Subscription } from 'rxjs';
import zoomPlugin from 'chartjs-plugin-zoom';
Chart.register(...registerables, zoomPlugin);

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  machineData: MachineData[] = [];
  charts: Chart[] = [];
  isLoading = false;
  error = '';
  selectedDateRange: string = '30d';
  selectedMetrics: string[] = [];
  availableMetrics: string[] = [
     'G19', 'G26', 'MISFAT_3_Compresseur_3', 'MISFAT_3_G39f', 
    'MISFAT_3_D18f', 'MISFAT_3_G10f', 'MISFAT_3_TGBT_N3f'
  ];
  isFullscreen: boolean = false;
  fullscreenElement: string | null = null;
  dataSubscription: Subscription | null = null;
  chartColors: {[key: string]: string} = {};
  
  selectedMetricForHeatmap: string = '';
  selectedMetricForDistribution: string = '';
  
  selectedMetricForWeekday: string = '';
  selectedWeekday: number = 1; 
  weekdayNames: string[] = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  weekdayData: any[] = [];
  
  // Nouvelles méthodes pour le résumé des données
  calculateMin(metric: string): number {
    if (!this.machineData.length) return 0;
    return Math.min(...this.machineData.map(item => item[metric as keyof MachineData] as number));
  }
  
  calculateMax(metric: string): number {
    if (!this.machineData.length) return 0;
    return Math.max(...this.machineData.map(item => item[metric as keyof MachineData] as number));
  }
  
  calculateAvg(metric: string): number {
    if (!this.machineData.length) return 0;
    const values = this.machineData.map(item => item[metric as keyof MachineData] as number);
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }
  
  @ViewChild('timeseriesCanvas') timeseriesCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('comparisonCanvas') comparisonCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('monthlyMedianCanvas') monthlyMedianCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('distributionCanvas') distributionCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('heatmapCanvas') heatmapCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('weekdayComparisonCanvas') weekdayComparisonCanvas!: ElementRef<HTMLCanvasElement>;
  
  constructor(private machineService: MachineService) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/auth/login';
      return;
    }
    this.availableMetrics.forEach(metric => {
      this.chartColors[metric] = this.getUniqueColor(metric);
    });
    
    // Sélectionner quelques métriques par défaut pour commencer
    if (this.availableMetrics.length > 0) {
      this.selectedMetrics = [this.availableMetrics[0]]; // Sélectionner au moins une métrique par défaut
      this.selectedMetricForHeatmap = this.availableMetrics[0];
      this.selectedMetricForDistribution = this.availableMetrics[0];
      this.selectedMetricForWeekday = this.availableMetrics[0];
    }
    
    this.loadData();
    
    this.setupAutoRefresh();
  }
  
  ngAfterViewInit(): void {
    // Assurer que les graphiques sont rendus après que la vue soit initialisée
    setTimeout(() => {
      if (this.machineData.length > 0) {
        this.renderCharts();
      }
    }, 300);
  }
  
  ngOnDestroy(): void {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
  }

  setupAutoRefresh(): void {
    const refreshInterval = 5 * 60 * 1000;
    setInterval(() => {
      if (!this.isLoading) {
        this.loadData();
      }
    }, refreshInterval);
  }

  loadData(): void {
    this.isLoading = true;
    this.error = '';
    
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
    
    // Utiliser le service pour charger les données
    this.dataSubscription = this.machineService.getMachineData()
      .pipe(
        catchError(err => {
          this.error = 'Erreur lors du chargement des données: ' + err.message;
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
          // Assurer que les graphiques sont rendus après le chargement des données
          setTimeout(() => this.renderCharts(), 100);
        })
      )
      .subscribe(data => {
        this.machineData = this.filterDataByDateRange(data);
        // Préparer les données pour le graphique par jour de la semaine
        this.prepareWeekdayData();
      });
  }

  filterDataByDateRange(data: MachineData[]): MachineData[] {
    if (!data.length) return [];
    
    const now = new Date();
    let cutoffDate = new Date();
    
    switch (this.selectedDateRange) {
      case '24h':
        cutoffDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        cutoffDate.setHours(now.getHours() - 24);
    }
    
    return data.filter(item => new Date(item.Timestamp) >= cutoffDate);
  }

  renderCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
    
    if (!this.machineData.length) return;
    
    this.renderTimeseriesChart();
    this.renderComparisonChart();
    this.renderMonthlyMedianChart();
    this.renderDistributionChart();
    this.renderHeatmapChart();
    this.renderWeekdayComparisonChart();
  }

  renderTimeseriesChart(): void {
    if (!this.timeseriesCanvas) return;
    
    const ctx = this.timeseriesCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Process data for the chart
    const labels = this.machineData.map(item => new Date(item.Timestamp).toLocaleString());
    
    // Optimiser pour les grands volumes de données
    const decimationFactor = this.machineData.length > 1000 ? Math.ceil(this.machineData.length / 1000) : 1;
    const decimatedLabels = this.decimateData(labels, decimationFactor);
    
    const datasets = this.selectedMetrics.map(metric => {
      const color = this.chartColors[metric] || this.getUniqueColor(metric);
      const data = this.machineData.map(item => item[metric as keyof MachineData] as number);
      const decimatedData = this.decimateData(data, decimationFactor);
      
      return {
        label: metric,
        data: decimatedData,
        borderColor: color,
        backgroundColor: this.hexToRgba(color, 0.1),
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: decimatedData.length > 100 ? 0 : 2, // Masquer les points pour améliorer les performances
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
            text: 'Temps'
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
            text: 'Valeur'
          },
          beginAtZero: false
        }
      },
      plugins: {
        title: {
          display: true,
          text: `Évolution temporelle des métriques (${this.machineData.length} points de données)`
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (tooltipItems) => {
              return tooltipItems[0].label;
            }
          }
        },
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            usePointStyle: true,
            pointStyle: 'circle'
          },
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            if (index !== undefined) {
              const ci = legend.chart;
              if (ci.isDatasetVisible(index)) {
                ci.hide(index);
                legendItem.hidden = true;
              } else {
                ci.show(index);
                legendItem.hidden = false;
              }
              ci.update();
            }
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
        duration: this.machineData.length > 1000 ? 0 : 1000 // Désactiver l'animation pour les grands ensembles de données
      }
    };
    
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: decimatedLabels,
        datasets
      },
      options: options as any // Cast nécessaire car zoom n'est pas dans les types par défaut
    });
    
    this.charts.push(chart);
  }

  renderComparisonChart(): void {
    if (!this.comparisonCanvas) return;
    
    const ctx = this.comparisonCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Get the latest data point
    const latestData = this.machineData[this.machineData.length - 1];
    
    const data = this.availableMetrics.map(metric => latestData[metric as keyof MachineData] as number);
    const backgroundColors = this.availableMetrics.map(metric => this.chartColors[metric] || this.getUniqueColor(metric));
    
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.availableMetrics,
        datasets: [{
          label: 'Valeurs actuelles',
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
            text: 'Comparaison des métriques (dernière mesure)'
          },
          tooltip: {
            callbacks: {
              title: (tooltipItems) => {
                return tooltipItems[0].label;
              },
              label: (context) => {
                const value = context.parsed.y;
                return `Valeur: ${value.toFixed(2)}`;
              }
            }
          }
        }
      }
    });
    
    this.charts.push(chart);
  }
  
  // NOUVEAU GRAPHIQUE: Graphique des médianes mensuelles
  renderMonthlyMedianChart(): void {
    if (!this.monthlyMedianCanvas) return;
    
    const ctx = this.monthlyMedianCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Calculer les médianes mensuelles
    const monthlyData = this.calculateMonthlyMedians();
    
    const months = Object.keys(monthlyData);
    
    const datasets = this.selectedMetrics.map(metric => {
      const color = this.chartColors[metric] || this.getUniqueColor(metric);
      const data = months.map(month => monthlyData[month][metric] || 0);
      
      return {
        label: metric,
        data: data,
        backgroundColor: this.hexToRgba(color, 0.7),
        borderColor: color,
        borderWidth: 1
      };
    });
    
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Mois'
            },
            stacked: false
          },
          y: {
            title: {
              display: true,
              text: 'Médiane'
            },
            beginAtZero: false,
            stacked: false
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Médianes mensuelles des métriques'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          },
          legend: {
            position: 'top'
          }
        }
      }
    });
    
    this.charts.push(chart);
  }
  
  // NOUVEAU GRAPHIQUE: Distribution des valeurs pour une métrique
  renderDistributionChart(): void {
    if (!this.distributionCanvas || !this.selectedMetricForDistribution) return;
    
    const ctx = this.distributionCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Récupérer les données pour la métrique sélectionnée
    const metricData = this.machineData.map(item => 
      item[this.selectedMetricForDistribution as keyof MachineData] as number
    );
    
    // Calculer les plages pour l'histogramme
    const min = Math.min(...metricData);
    const max = Math.max(...metricData);
    const range = max - min;
    const binCount = 10; // Nombre de plages
    const binSize = range / binCount;
    
    const bins = Array(binCount).fill(0);
    const binLabels = Array(binCount).fill('');
    
    // Remplir les plages
    metricData.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1);
      bins[binIndex]++;
    });
    
    // Créer les étiquettes des plages
    for (let i = 0; i < binCount; i++) {
      const lowerBound = min + (i * binSize);
      const upperBound = min + ((i + 1) * binSize);
      binLabels[i] = `${lowerBound.toFixed(1)} - ${upperBound.toFixed(1)}`;
    }
    
    const color = this.chartColors[this.selectedMetricForDistribution];
    
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{
          label: `Distribution de ${this.selectedMetricForDistribution}`,
          data: bins,
          backgroundColor: this.hexToRgba(color, 0.7),
          borderColor: color,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Plages de valeurs'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Fréquence'
            },
            beginAtZero: true
          }
        },
        plugins: {
          title: {
            display: true,
            text: `Distribution des valeurs pour ${this.selectedMetricForDistribution}`
          },
          legend: {
            display: false
          }
        }
      }
    });
    
    this.charts.push(chart);
  }
  
  // NOUVEAU GRAPHIQUE: Carte de chaleur (heatmap) des valeurs par heure et jour
  renderHeatmapChart(): void {
    if (!this.heatmapCanvas || !this.selectedMetricForHeatmap) return;
    
    const ctx = this.heatmapCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Structurer les données pour la carte de chaleur
    const heatmapData = this.prepareHeatmapData(this.selectedMetricForHeatmap);
    
    // Jours de la semaine
    const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    
    // Heures de la journée
    const hoursOfDay = Array.from({length: 24}, (_, i) => `${i}h`);
    
    // Trouver la valeur maximale pour normaliser les couleurs
    const maxValue = Math.max(...heatmapData.flat().filter(val => val !== undefined && val !== null), 1);
    
    // Fonction pour générer une couleur basée sur la valeur
    const getColorForValue = (value: number) => {
        const ratio = value / maxValue;
        // Gradient de bleu clair à bleu foncé
        const r = Math.round(200 * (1 - ratio));
        const g = Math.round(200 * (1 - ratio));
        const b = Math.round(255);
        return `rgba(${r}, ${g}, ${b}, ${0.7 + ratio * 0.3})`; // Opacité variable
    };
    
    // Créer un dataset pour chaque jour avec des couleurs dynamiques
    const datasets = daysOfWeek.map((day, index) => {
        const data = heatmapData[index] || Array(24).fill(0);
        return {
            label: day,
            data: data,
            backgroundColor: data.map(value => getColorForValue(value)), // Couleur par valeur
            borderColor: 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            fill: false
        };
    });
    
    // Créer un graphique personnalisé pour simuler une carte de chaleur
    const chart = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: hoursOfDay,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Heure de la journée'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Jour de la semaine'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Carte de chaleur de ${this.selectedMetricForHeatmap} par jour et heure`
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed.x;
                            const dayIndex = context.datasetIndex;
                            const hourIndex = context.dataIndex;
                            const actualValue = heatmapData[dayIndex]?.[hourIndex] || 0;
                            return `${daysOfWeek[dayIndex]} à ${hoursOfDay[hourIndex]}: ${actualValue.toFixed(2)}`;
                        }
                    }
                },
                legend: {
                    display: false
                }
            }
        }
    });
    
    chart.update();
    
    this.charts.push(chart);
  }
  onWeekdayChange(value: string | number): void {
  this.selectedWeekday = Number(value); 
  this.prepareWeekdayData();
}
  
 prepareWeekdayData(): void {
  if (!this.machineData.length || !this.selectedMetricForWeekday) {
    this.weekdayData = [];
    return;
  }
  
  const weeklyData: { [weekKey: string]: number } = {};
  
  const sortedData = [...this.machineData].sort((a, b) => 
    new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
  );
  
  sortedData.forEach(item => {
    const date = new Date(item.Timestamp);
    
    if (date.getDay() === this.selectedWeekday) {
      const weekNumber = this.getWeekNumber(date);
      const weekYear = date.getFullYear();
      const weekKey = `${weekYear}-W${weekNumber.toString().padStart(2, '0')}`;
      
      const value = Number(item[this.selectedMetricForWeekday as keyof MachineData]);
      
      if (isNaN(value)) return;
      
      if (weeklyData[weekKey] === undefined) {
        weeklyData[weekKey] = value;
      }
    }
  });
  
  // Convert to chart-ready format and sort chronologically
  this.weekdayData = Object.keys(weeklyData)
    .sort() // Sort weeks chronologically
    .map(weekKey => {
      const [year, week] = weekKey.split('-W');
      
      return {
        weekKey: weekKey,
        weekLabel: `${year} S${week}`, 
        value: weeklyData[weekKey]
      };
    });
    
  // After preparing data, render the charts
  setTimeout(() => this.renderCharts(), 0);
}

// Fonction pour le rendu du graphique comparatif par jour de semaine
renderWeekdayComparisonChart(): void {
  if (!this.weekdayComparisonCanvas || !this.selectedMetricForWeekday) return;
  
  const ctx = this.weekdayComparisonCanvas.nativeElement.getContext('2d');
  if (!ctx) return;
  
  // Utiliser les données préparées
  const weekLabels = this.weekdayData.map(item => item.weekLabel);
  const values = this.weekdayData.map(item => item.value);
  
  const color = this.chartColors[this.selectedMetricForWeekday] || this.getUniqueColor(this.selectedMetricForWeekday);
  
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weekLabels,
      datasets: [{
        label: `${this.selectedMetricForWeekday} (${this.weekdayNames[this.selectedWeekday]})`,
        data: values,
        backgroundColor: this.hexToRgba(color, 0.7),
        borderColor: color,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Semaine'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          title: {
            display: true,
            text: 'Valeur'
          },
          beginAtZero: false
        }
      },
      plugins: {
        title: {
          display: true,
          text: `Valeurs de ${this.selectedMetricForWeekday} chaque ${this.weekdayNames[this.selectedWeekday]}`
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              return `Valeur: ${value.toFixed(2)}`;
            }
          }
        },
        legend: {
          display: false
        }
      }
    }
  });
  
  this.charts.push(chart);
}

getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.floor(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) + 1;
}
  
  calculateMonthlyMedians(): { [month: string]: { [metric: string]: number } } {
    const monthlyGroups: { [month: string]: { [metric: string]: number[] } } = {};
    
    // Regrouper les données par mois
    this.machineData.forEach(item => {
      const date = new Date(item.Timestamp);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = {};
      }
      
      this.selectedMetrics.forEach(metric => {
        if (!monthlyGroups[monthKey][metric]) {
          monthlyGroups[monthKey][metric] = [];
        }
        
        const value = item[metric as keyof MachineData] as number;
        monthlyGroups[monthKey][metric].push(value);
      });
    });
    
    // Calculer la médiane pour chaque mois et métrique
    const monthlyMedians: { [month: string]: { [metric: string]: number } } = {};
    
    Object.keys(monthlyGroups).forEach(month => {
      monthlyMedians[month] = {};
      
      this.selectedMetrics.forEach(metric => {
        const values = monthlyGroups[month][metric];
        monthlyMedians[month][metric] = this.calculateMedian(values);
      });
    });
    
    return monthlyMedians;
  }
  
  // Fonction pour calculer la médiane d'un tableau de nombres
  calculateMedian(values: number[]): number {
    if (!values.length) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    
    return sorted[middle];
  }
  
  // Préparer les données pour la carte de chaleur
  prepareHeatmapData(metric: string): number[][] {
    // Initialiser un tableau 7x24 (7 jours, 24 heures) avec des zéros
    const heatmapData: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
    const countsData: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
    
    // Remplir avec les données
    this.machineData.forEach(item => {
      const date = new Date(item.Timestamp);
      const dayIndex = date.getDay(); // 0-6, 0 étant dimanche
      const hourIndex = date.getHours(); // 0-23
      
      const value = item[metric as keyof MachineData] as number;
      
      heatmapData[dayIndex][hourIndex] += value;
      countsData[dayIndex][hourIndex]++;
    });
    
    // Calculer les moyennes
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        if (countsData[day][hour] > 0) {
          heatmapData[day][hour] /= countsData[day][hour];
        }
      }
    }
    
    return heatmapData;
  }

  onDateRangeChange(range: string): void {
    this.selectedDateRange = range;
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
  
  onMetricSelect(metricType: string, metric: string): void {
  if (metricType === 'heatmap') {
    this.selectedMetricForHeatmap = metric;
  } else if (metricType === 'distribution') {
    this.selectedMetricForDistribution = metric;
  } else if (metricType === 'weekday') {
    this.selectedMetricForWeekday = metric;
    this.prepareWeekdayData(); 
  }
  this.renderCharts();
}

  // Fonction pour générer des couleurs cohérentes basées sur le nom de la métrique
  getUniqueColor(text: string): string {
    // Générer une couleur déterministe basée sur le texte
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convertir en couleur HSL pour de meilleurs contrastes
    const h = Math.abs(hash % 360);
    const s = 65 + Math.abs((hash >> 8) % 20); // 65-85%
    const l = 45 + Math.abs((hash >> 16) % 10); // 45-55%
    
    // Convertir HSL en hex
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

  // Fonction pour décimer les données (réduire le nombre de points)
  decimateData<T>(data: T[], factor: number): T[] {
    if (factor <= 1) return data;
    
    const result: T[] = [];
    for (let i = 0; i < data.length; i += factor) {
      result.push(data[i]);
    }
    
    // Toujours inclure le dernier point pour maintenir la continuité visuelle
    if (data.length > 0 && result[result.length - 1] !== data[data.length - 1]) {
      result.push(data[data.length - 1]);
    }
    
    return result;
  }

  refreshData(): void {
    this.loadData();
  }

  exportAllCharts(): void {
    // Exporter tous les graphiques sous forme d'images PNG
    this.charts.forEach((chart, index) => {
      const chartName = ['timeseries', 'comparison', 'monthly-median', 'distribution', 'heatmap'][index] || `chart-${index}`;
      const url = chart.toBase64Image();
      
      const link = document.createElement('a');
      link.download = `${chartName}-${new Date().toISOString()}.png`;
      link.href = url;
      link.click();
    });
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
    
    document.querySelector(`.${element}`)?.classList.add('fullscreen');
    
    setTimeout(() => {
      this.renderCharts();
    }, 100);
  }

  exitFullscreen(): void {
    this.isFullscreen = false;
    
    // Supprimer la classe fullscreen de l'élément précédemment en plein écran
    if (this.fullscreenElement) {
      document.querySelector(`.${this.fullscreenElement}`)?.classList.remove('fullscreen');
    }
    
    this.fullscreenElement = null;
    
    // Redessiner le graphique après un court délai pour s'adapter à la nouvelle taille
    setTimeout(() => {
      this.renderCharts();
    }, 100);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.renderCharts();
  }
}