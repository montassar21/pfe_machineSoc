import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { SignupComponent } from './components/auth/signup/signup.component';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password.component';
import { DashboardComponent } from './components/admin/dashboard/dashboard.component';
import { MachineStatusComponent } from './components/admin/machine-status/machine-status.component';
import { MachineAnalysisComponent } from './components/admin/machine-analysis/machine-analysis.component';
import { LayoutComponent } from './components/shared/layout/layout.component';
import { AuthGuard } from './guards/auth.guard';
import { PredictionComponent } from './components/admin/prediction/prediction.component';

const routes: Routes = [
  { path: 'auth/login', component: LoginComponent },
  { path: 'auth/signup', component: SignupComponent },
  { path: 'auth/forgot-password', component: ForgotPasswordComponent },
  { 
    path: 'admin', 
    component: LayoutComponent,
    canActivate: [AuthGuard], 
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'machines', component: MachineStatusComponent },
      { path: 'analyses', component: MachineAnalysisComponent },
      { path: 'predictions', component: PredictionComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
   { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: '**', redirectTo: 'auth/login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
