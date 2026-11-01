// Token-based auth against the Go backend (replaces Supabase Auth).

import { API_BASE } from './api';

const API_URL = `${API_BASE}/api/v1`;

export const auth = {
  getToken: () => localStorage.getItem('pantara_token'),
  setToken: (token: string) => localStorage.setItem('pantara_token', token),
  clearToken: () => {
    localStorage.removeItem('pantara_token');
    localStorage.removeItem('pantara_role');
  },
  /** Role remembered at login so public pages can link to the right dashboard. */
  setRole: (role: string) => localStorage.setItem('pantara_role', role),
  getRole: () => localStorage.getItem('pantara_role') ?? undefined,
  
  isAuthenticated: () => !!localStorage.getItem('pantara_token'),

  /** Landing route after login for each account role. */
  homeFor: (role?: string) => (role === 'government' ? '/pemerintah' : '/dashboard'),

  // Fetch with auto-injected Auth header
  fetchAuth: async (endpoint: string, options: RequestInit = {}) => {
    const token = auth.getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Default to JSON
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    // A 401 on sign-in means wrong credentials, not an expired session:
    // report it in the form instead of reloading the page (which wiped the message).
    const signingIn = endpoint === '/auth/login' || endpoint === '/auth/register';
    if (res.status === 401 && signingIn) {
      throw new Error('Email atau password salah.');
    }
    if (res.status === 409 && signingIn) {
      throw new Error('Email ini sudah terdaftar. Silahkan masuk dengan email tersebut.');
    }
    if (res.status === 401) {
      auth.clearToken();
      window.location.href = '/login';
      throw new Error("Sesi berakhir, silakan login kembali.");
    }

    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || data || "Request failed");
    }

    return data;
  }
};
