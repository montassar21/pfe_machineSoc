import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss']
})
export class SignupComponent implements OnInit {
  signupForm!: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.signupForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);

    const passwordValid = hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar;

    return !passwordValid ? { weakPassword: true } : null;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (!password || !confirmPassword) {
      return null;
    }

    return password.value !== confirmPassword.value ? { passwordMismatch: true } : null;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  getPasswordStrength(): { strength: string, percentage: number } {
    const password = this.signupForm.get('password')?.value || '';
    
    if (!password) {
      return { strength: 'None', percentage: 0 };
    }
    
    let strength = 0;
    
    if (password.length >= 6) strength += 1;
    if (password.length >= 10) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    
    const percentage = (strength / 6) * 100;
    
    if (percentage <= 33) {
      return { strength: 'Weak', percentage };
    } else if (percentage <= 66) {
      return { strength: 'Medium', percentage };
    } else {
      return { strength: 'Strong', percentage };
    }
  }

  async onSubmit(): Promise<void> {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    const { email, password, fullName } = this.signupForm.value;
    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const result = await this.authService.signUp(email, password);
      
      // Update user profile with full name
      if (result.user) {
        await result.user.updateProfile({
          displayName: fullName
        });
        
        // Store user token in localStorage
        const token = await result.user.getIdToken();
        localStorage.setItem('token', token);
        localStorage.setItem('displayName', fullName);
        
        this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      switch (error.code) {
        case 'auth/email-already-in-use':
          this.errorMessage = 'This email is already registered. Please use a different email or try to login.';
          break;
        case 'auth/invalid-email':
          this.errorMessage = 'Invalid email address format.';
          break;
        case 'auth/weak-password':
          this.errorMessage = 'Password is too weak. Please choose a stronger password.';
          break;
        default:
          this.errorMessage = 'Registration failed. Please try again later.';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  async signUpWithGoogle(): Promise<void> {
    try {
     
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Google sign-up error:', error);
      this.errorMessage = 'Google sign-up failed. Please try again.';
    }
  }
}