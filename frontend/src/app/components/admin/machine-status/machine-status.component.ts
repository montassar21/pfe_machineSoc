import { Component, OnInit } from '@angular/core';
import { MachineService } from '../../../services/machine.service';
import { forkJoin } from 'rxjs';
import { 
  MachineStatus, 
  MachineStop,
  MonitoringStatus
} from '../../../models/machine.model';

@Component({
  selector: 'app-machine-status',
  templateUrl: './machine-status.component.html',
  styleUrls: ['./machine-status.component.scss']
})
export class MachineStatusComponent implements OnInit {
  machineStatuses: (MachineStatus & { status_display?: string })[] = [];
  machineStops: MachineStop[] = [];
  loading = true;
  error = '';
  monitoringStatus: MonitoringStatus | null = null;
  monitoringFrequency = 60; // Default monitoring frequency in minutes
  monitoringLoading = false;

  constructor(private machineService: MachineService) { }

  ngOnInit(): void {
    this.loadMachineData();
    this.getMonitoringStatus();
  }

  loadMachineData(): void {
    this.loading = true;
    this.error = '';

    // Using forkJoin to make both API calls in parallel
    forkJoin({
      statuses: this.machineService.getMachineStatus(),
      stops: this.machineService.getMachineStops()
    }).subscribe({
      next: (result) => {
        // Add status_display property to each machine status
        this.machineStatuses = result.statuses.map(status => ({
          ...status,
          status_display: status.status,
          status: this.mapStatusToEnglish(status.status)
        }));
        
        this.machineStops = result.stops;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading machine data:', err);
        this.error = 'Failed to load machine data. Please try again later.';
        this.loading = false;
      }
    });
  }

  getMonitoringStatus(): void {
    this.monitoringLoading = true;
    this.machineService.getMonitoringStatus().subscribe({
      next: (response) => {
        if (response) {
          this.monitoringStatus = response;
        }
        this.monitoringLoading = false;
      },
      error: (err) => {
        console.error('Error getting monitoring status:', err);
        this.monitoringLoading = false;
      }
    });
  }

  startMonitoring(): void {
    this.monitoringLoading = true;
    this.machineService.startMonitoring(this.monitoringFrequency).subscribe({
      next: () => {
        console.log('Monitoring started successfully');
        this.getMonitoringStatus();
        this.monitoringLoading = false;
      },
      error: (err) => {
        console.error('Error starting monitoring:', err);
        this.monitoringLoading = false;
      }
    });
  }

  stopMonitoring(): void {
    this.monitoringLoading = true;
    this.machineService.stopMonitoring().subscribe({
      next: () => {
        this.getMonitoringStatus();
        this.monitoringLoading = false;
      },
      error: (err) => {
        console.error('Error stopping monitoring:', err);
        this.monitoringLoading = false;
      }
    });
  }

  mapStatusToEnglish(frenchStatus: string): string {
    switch (frenchStatus.toLowerCase()) {
      case 'en fonctionnement':
        return 'running';
      case 'arrêté':
      case 'arrete':
        return 'stopped';
      case 'avertissement':
        return 'warning';
      default:
        return 'unknown';
    }
  }

  getLatestStopForMachine(machineName: string): MachineStop | undefined {
    // Filter stops for this machine and sort by start time (most recent first)
    const machineStops = this.machineStops
      .filter(stop => stop.machine_name === machineName)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    
    return machineStops.length > 0 ? machineStops[0] : undefined;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'running': 
        return 'status-running';
      case 'stopped': 
        return 'status-stopped';
      case 'warning': 
        return 'status-warning';
      default: 
        return '';
    }
  }

  formatDuration(stop: MachineStop): string {
    if (stop.duration_hours !== undefined) {
      const hours = Math.floor(stop.duration_hours);
      const minutes = Math.round((stop.duration_hours - hours) * 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    } else if (stop.end_time === null) {
      // Calculate duration for ongoing stops
      const startTime = new Date(stop.start_time);
      const now = new Date();
      const durationHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      const hours = Math.floor(durationHours);
      const minutes = Math.round((durationHours - hours) * 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m (ongoing)`;
      } else {
        return `${minutes}m (ongoing)`;
      }
    }
    
    return 'Unknown';
  }

  refresh(): void {
    this.loadMachineData();
    this.getMonitoringStatus();
  }
  
  getStopHistoryForMachine(machineName: string): MachineStop[] {
    return this.machineStops
      .filter(stop => stop.machine_name === machineName)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }
}