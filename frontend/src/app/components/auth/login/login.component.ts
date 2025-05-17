import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.value;
    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.signIn(email, password); // Updated AuthService handles localStorage
      this.router.navigate(['/admin/dashboard']);
    } catch (error: any) {
      console.error('Login error:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          this.errorMessage = 'No account found with this email address.';
          break;
        case 'auth/wrong-password':
          this.errorMessage = 'Invalid password. Please try again.';
          break;
        case 'auth/too-many-requests':
          this.errorMessage = 'Too many unsuccessful login attempts. Please try again later.';
          break;
        default:
          this.errorMessage = 'Login failed. Please check your credentials and try again.';
      }
    } finally {
      this.isSubmitting = false;
    }
  }
}