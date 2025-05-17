import { AuthService } from 'src/app/services/auth.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit{
  userName: string = '';
  
  constructor(private router: Router, private AuthService:AuthService) {}
  ngOnInit(): void {
    const user = localStorage.getItem('user');
    if(user) {
      this.userName = JSON.parse(user).email;
    }
    
  }

  logout(): void {
    this.AuthService.signOut();
  }
}