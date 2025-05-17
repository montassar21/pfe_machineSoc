import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { GoogleAuthProvider } from 'firebase/auth';
import firebase from 'firebase/compat/app';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  user$ = this.afAuth.authState;

  constructor(private afAuth: AngularFireAuth, private router: Router) {}

  async signUp(email: string, password: string): Promise<firebase.auth.UserCredential> {
    return this.afAuth.createUserWithEmailAndPassword(email, password);
  }

  async signIn(email: string, password: string): Promise<firebase.auth.UserCredential> {
    const result = await this.afAuth.signInWithEmailAndPassword(email, password);
    if (result.user) {
      const userData = {
        uid: result.user.uid,
        email: result.user.email || null,
        displayName: result.user.displayName || null,
      };
      const token = await result.user.getIdToken();
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', token);
    }
    return result; // Return the result for further handling if needed
  }

  async signOut(): Promise<void> {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    await this.afAuth.signOut();
    this.router.navigate(['login']);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  async getCurrentUserToken(): Promise<string | null> {
    const user = await this.afAuth.currentUser;
    return user ? user.getIdToken() : null;
  }

  getUser() {
    return this.afAuth.authState;
  }

  async signInWithGoogle(): Promise<firebase.auth.UserCredential> {
    const provider = new GoogleAuthProvider();
    const result = await this.afAuth.signInWithPopup(provider);
    if (result.user) {
      const userData = {
        uid: result.user.uid,
        email: result.user.email || null,
        displayName: result.user.displayName || null,
      };
      const token = await result.user.getIdToken();
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', token);
    }
    return result;
  }
}