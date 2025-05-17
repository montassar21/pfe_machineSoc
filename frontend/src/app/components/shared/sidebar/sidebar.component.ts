import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, Event } from '@angular/router';
import { filter } from 'rxjs/operators';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  active: boolean;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/admin/dashboard', active: false },
    { label: 'Machines', icon: 'settings', route: '/admin/machines', active: false },
    { label: 'Analyses', icon: 'analytics', route: '/admin/analyses', active: false },
    { label: 'Predictions', icon: 'online_prediction', route: '/admin/predictions', active: false }
  ];

  collapsed: boolean = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.setActiveMenuItem(this.router.url);
    
    // Subscribe to router events to update active state on navigation
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.setActiveMenuItem(event.urlAfterRedirects);
    });
  }

  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
  }

  navigateTo(route: string): void {
    this.menuItems.forEach(item => {
      item.active = item.route === route;
    });
    
    // Then navigate
    this.router.navigate([route]);
  }

  private setActiveMenuItem(currentRoute: string): void {
    this.menuItems.forEach(item => {
      item.active = currentRoute === item.route;
    });
  }
}