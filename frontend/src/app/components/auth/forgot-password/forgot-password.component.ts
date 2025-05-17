import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  successMessage = '';
  errorMessage = '';
  isSubmitting = false;
  resetSent = false;

  constructor(
    private fb: FormBuilder,
    private afAuth: AngularFireAuth,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    const { email } = this.forgotPasswordForm.value;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.afAuth.sendPasswordResetEmail(email);
      this.resetSent = true;
      this.successMessage = `Password reset email sent to ${email}. Please check your inbox.`;
      this.forgotPasswordForm.reset();
    } catch (error: any) {
      console.error('Password reset error:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          this.errorMessage = 'No account found with this email address.';
          break;
        case 'auth/invalid-email':
          this.errorMessage = 'Invalid email address format.';
          break;
        case 'auth/too-many-requests':
          this.errorMessage = 'Too many password reset attempts. Please try again later.';
          break;
        default:
          this.errorMessage = 'Failed to send reset email. Please try again later.';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  backToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
