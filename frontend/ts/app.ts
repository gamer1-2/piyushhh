import { io, Socket } from 'socket.io-client';
import '@/src/index.css'; 

declare global {
  interface Window {
    L: any;
    leafletMap: any;
    currentRoutingControl: any;
    routeToIncident: (lat: number, lng: number) => void;
  }
}


// --- Types ---
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  coordinates: { lat: number; lng: number };
  timestamp: string;
  userId: string;
  userName: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'active' | 'closed';
  upvotes: number;
  verified: boolean;
}

interface State {
  user: User | null;
  token: string | null;
  view: string;
  incidents: Incident[];
  liveTracking: boolean;
  trackingData: Record<string, { coords: { lat: number, lng: number }, userName: string }>;
  location: { lat: number, lng: number };
}

// --- State ---
let storedUser: User | null = null;
try {
  const u = localStorage.getItem('user');
  if (u && u !== 'undefined') storedUser = JSON.parse(u);
} catch(e) {
  console.error('Failed to parse user from localStorage', e);
  localStorage.removeItem('user');
}

let state: State = {
  user: storedUser,
  token: localStorage.getItem('token') && localStorage.getItem('token') !== 'undefined' ? localStorage.getItem('token') : null,
  view: 'auth', // 'auth', 'dashboard', 'admin'
  incidents: [],
  liveTracking: true,
  trackingData: {}, // userId -> { lat, lng }
  location: { lat: 31.2560, lng: 75.7051 }, // Simulated grid coordinates (0-100)
};

const socket: Socket = io();

// --- API Helpers ---
const api = {
  async post(url, data) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

      const res = await fetch(`/api${url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return await res.json();
      } else {
        return { message: res.ok ? 'Success' : `Error: ${res.statusText}` };
      }
    } catch (err) {
      console.error('API Post Error:', err);
      return { message: 'Network Error: Cannot reach server' };
    }
  },
  async get(url) {
    try {
      const headers = {};
      if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

      const res = await fetch(`/api${url}`, { headers });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return await res.json();
      } else {
        return { message: res.ok ? 'Success' : `Error: ${res.statusText}` };
      }
    } catch (err) {
      console.error('API Get Error:', err);
      return { message: 'Network Error: Cannot reach server' };
    }
  }
};

// --- Socket Handlers ---
socket.on('incident:new', (incident) => {
  state.incidents.unshift(incident);
  renderIncidentList();
  renderMarkers();
  updateRiskScore();
  showToast(`NEW INCIDENT: ${incident.category} in ${incident.location}`, 'warning');
});

socket.on('alert:high-risk', (data) => {
  renderHighRiskBanner(data);
});

socket.on('location:broadcast', (data) => {
  if (data.userId !== state.user?.id) {
    state.trackingData[data.userId] = {
      coords: data.coordinates,
      userName: data.userName
    };
    renderMarkers(); 
  }
});

socket.on('alert:sos', (data) => {
  showToast(`🚨 EMERGENCY SOS: ${data.name} is in trouble!`, 'error');
  
  if (window.leafletMap && window.L) {
      window.leafletMap.setView([data.coordinates.lat, data.coordinates.lng], 18);
      
      if (sosMarker) sosMarker.remove();
      
      sosMarker = window.L.marker([data.coordinates.lat, data.coordinates.lng], {
          icon: window.L.divIcon({
             className: 'sos-leaflet-icon',
             html: `<div style="width:24px;height:24px;background-color:#ef4444;border-radius:50%;border:2px solid #fff;box-shadow:0 0 15px #ef4444;animation: pulse 1.5s infinite;"></div>`,
             iconSize: [24, 24],
             iconAnchor: [12, 12]
          })
      }).addTo(window.leafletMap);
  }
});

const renderHighRiskBanner = (data) => {
  const existing = document.getElementById('risk-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'risk-banner';
  banner.className = 'fixed top-24 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-danger/90 backdrop-blur-xl border border-red-500/50 p-4 rounded-2xl z-[1000] flex items-center justify-between shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all animate-pulse';
  banner.innerHTML = `
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
      </div>
      <div>
        <p class="text-[10px] uppercase font-bold tracking-[0.2em] text-white/70">Critical Awareness Signal</p>
        <p class="text-sm font-bold text-white">${data.message}</p>
      </div>
    </div>
    <button id="close-banner" class="text-white/50 hover:text-white transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  `;
  document.body.appendChild(banner);
  document.getElementById('close-banner').onclick = () => banner.remove();
  setTimeout(() => banner?.remove(), 8000);
};

// --- Live Tracking Logic ---
let trackingInterval = null;
const startTrackingHeartbeat = () => {
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(async () => {
    if (state.token && state.liveTracking) {
      await api.post('/tracking', { coordinates: state.location });
    }
  }, 5000);
};
startTrackingHeartbeat();

// --- UI Components ---
const App = () => {
  const container = document.getElementById('app');
  container.innerHTML = '';
  
  if (!state.token) {
    renderAuth(container);
  } else {
    renderMain(container);
  }
};

const renderAuth = (parent) => {
  parent.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="auth-card p-8 w-full max-w-md rounded-2xl backdrop-blur-xl">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 bg-brand/20 rounded-lg border border-brand/50 flex items-center justify-center">
            <svg class="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <h1 class="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">CampusShield <span class="text-brand">AI</span></h1>
        </div>
        
        <p class="text-gray-400 mb-8 text-sm">Access the smart safety network.</p>
        
        <div id="auth-error" class="hidden bg-red-500/20 text-red-500 p-3 rounded-lg mb-4 text-xs border border-red-500/30"></div>

        <form id="login-form" class="space-y-4">
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Campus Email</label>
            <input type="email" name="email" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-colors">
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Password</label>
            <input type="password" name="password" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-colors">
          </div>
          <button type="submit" class="w-full bg-brand py-3.5 rounded-xl font-bold text-slate-900 hover:opacity-90 transition-all uppercase text-xs tracking-widest mt-4">Initialize Session</button>
        </form>
        
        <div class="mt-8 text-center text-xs space-y-2">
          <div>
            <span class="text-slate-500">New to the network?</span>
            <button id="show-register" class="text-brand font-bold ml-1 hover:underline">Register Device</button>
          </div>
          <div>
            <button id="show-reset" class="text-slate-500 hover:text-brand transition-colors">Forgotten Credentials?</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form')!.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    const data = await api.post('/auth/login', { 
      email, 
      password 
    });

    if (data.token) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      App();
    } else {
      const err = document.getElementById('auth-error');
      err.textContent = data.message || 'Login failed: Invalid credentials';
      err.classList.remove('hidden');
      showToast(data.message || 'Authentication failed', 'error');
    }
  };
  
  document.getElementById('login-form').oninput = () => {
    document.getElementById('auth-error').classList.add('hidden');
  };
  
  document.getElementById('show-register').onclick = () => renderRegister(parent);
  document.getElementById('show-reset').onclick = () => renderResetPassword(parent);
};

const renderResetPassword = (parent) => {
  parent.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="auth-card p-8 w-full max-w-md rounded-2xl backdrop-blur-xl">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 bg-warning/20 rounded-lg border border-warning/50 flex items-center justify-center">
            <svg class="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-white">Reset <span class="text-warning">Access</span></h1>
        </div>
        <p class="text-gray-400 mb-8 text-sm">Update your secure credentials.</p>

        <form id="reset-form" class="space-y-4">
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Registered Email</label>
            <input type="email" name="email" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-warning/50 transition-colors">
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">New Password</label>
            <input type="password" name="password" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-warning/50 transition-colors">
          </div>
          <button type="submit" class="w-full bg-warning py-3.5 rounded-xl font-bold text-slate-900 uppercase text-xs tracking-widest mt-4 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:opacity-90">Rotate Key</button>
        </form>
        
        <button id="show-login" class="mt-8 w-full text-xs text-slate-500 hover:text-white transition-colors uppercase tracking-widest font-bold">Return to Station</button>
      </div>
    </div>
  `;

  document.getElementById('reset-form')!.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    if (!email || !password) {
      showToast('Please fill all fields', 'error');
      return;
    }

    const data = await api.post('/auth/reset-password', { 
      email, 
      newPassword: password 
    });
    
    if (data.message && data.message.includes('success')) {
      showToast('Credentials updated. Initializing login.');
      renderAuth(parent);
    } else {
      showToast(data.message || 'Reset failed', 'error');
    }
  };

  document.getElementById('show-login').onclick = () => renderAuth(parent);
};

const renderRegister = (parent) => {
  parent.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="auth-card p-8 w-full max-w-md rounded-2xl backdrop-blur-xl">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 bg-brand/20 rounded-lg border border-brand/50 flex items-center justify-center">
            <svg class="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
          </div>
          <h1 class="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">CampusShield <span class="text-brand">AI</span></h1>
        </div>
        
        <p class="text-gray-400 mb-8 text-sm">Create your safety credentials.</p>

        <form id="register-form" class="space-y-4">
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Full Name</label>
            <input type="text" name="name" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-colors">
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Campus Email</label>
            <input type="email" name="email" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-colors">
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Password</label>
            <input type="password" name="password" required class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-colors">
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block px-1">Account Role</label>
            <select name="role" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none appearance-none focus:border-brand/50 transition-colors">
              <option value="student" class="bg-slate-900">Student (Campus Civilian)</option>
              <option value="faculty" class="bg-slate-900">Faculty / Staff</option>
            </select>
          </div>
          <button type="submit" class="w-full bg-brand py-3.5 rounded-xl font-bold text-slate-900 hover:opacity-90 transition-all uppercase text-xs tracking-widest mt-4">Create Account</button>
        </form>
        
        <div class="mt-8 text-center text-xs">
          <span class="text-slate-500">Already a member?</span>
          <button id="show-login" class="text-brand font-bold ml-1 hover:underline">Return to Login</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('register-form')!.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get('name')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();
    const role = formData.get('role')?.toString();

    if (!name || !email || !password) {
      showToast('All fields are required', 'error');
      return;
    }

    const data = await api.post('/auth/register', { 
      name, 
      email, 
      password,
      role
    });

    if (data.message && data.message.includes('success')) {
      showToast('Registration successful! Please login.');
      renderAuth(parent);
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  };
  
  document.getElementById('show-login').onclick = () => renderAuth(parent);
};

const renderMain = async (parent) => {
  parent.innerHTML = `
    <div class="h-screen flex flex-col relative overflow-hidden">
      <!-- Navbar -->
      <nav class="h-20 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between px-8 z-50 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-brand/20 rounded-lg border border-brand/50 flex items-center justify-center">
            <svg class="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">CampusShield <span class="text-brand">AI</span></h1>
        </div>
        
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">System Live</span>
          </div>
          <button id="sos-btn" class="px-8 py-2.5 sos-btn text-white font-bold rounded-lg transition-all uppercase text-xs tracking-widest">
            Emergency SOS
          </button>
          <div class="flex items-center gap-3">
             <div class="text-right hidden sm:block">
                <p class="text-[10px] font-bold text-slate-300 uppercase tracking-wider">${state.user ? state.user.name : 'Unknown User'}</p>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest">${state.user ? state.user.role : 'User'}</p>
             </div>
             <button id="tracking-toggle" title="Toggle Tracking" class="w-10 h-10 rounded-full border ${state.liveTracking ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/20 bg-white/5'} flex items-center justify-center transition-all">
                <svg class="w-4 h-4 ${state.liveTracking ? 'text-emerald-400' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
             </button>
             <button id="theme-btn" title="Toggle Theme" class="w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
               <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
             </button>
             <button id="logout-btn" title="Logout" class="w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
               <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
             </button>
          </div>
        </div>
      </nav>

      <!-- Grid Layout -->
      <div class="flex-1 overflow-hidden grid grid-cols-12 gap-0">
        
        <!-- Sidebar: Left -->
        <aside class="col-span-12 lg:col-span-3 border-r border-white/5 bg-black/20 p-6 flex flex-col gap-6 overflow-y-auto">
          <div class="p-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
            <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-4">Current Risk Analysis</p>
            <div class="flex items-end justify-between">
              <div>
                <h2 id="risk-score" class="text-5xl font-light text-warning tracking-tighter">0.0</h2>
                <p id="risk-label" class="text-sm text-slate-400 font-medium uppercase tracking-wider mt-1">Standby</p>
              </div>
              <div class="flex flex-col items-end">
                <span class="text-[10px] text-warning/70 font-mono">f(n, t, s)</span>
                <div class="w-24 h-1.5 bg-white/10 rounded-full mt-2">
                  <div id="risk-progress" class="w-0 h-full bg-warning rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-700"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex-1 flex flex-col gap-4">
            <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Local Safety Zones</h3>
            <div id="safety-zones" class="space-y-3">
              <div class="p-4 rounded-xl bg-white/5 border-l-4 border-emerald-500 flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Main Library</p>
                  <p class="text-[11px] text-slate-500">Verified Zone</p>
                </div>
                <span class="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-bold">SECURE</span>
              </div>
              <div class="p-4 rounded-xl bg-white/5 border-l-4 border-warning flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">North Parking</p>
                  <p class="text-[11px] text-slate-500">Cautionary Area</p>
                </div>
                <span class="text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded font-bold">CAUTION</span>
              </div>
            </div>
          </div>

          <div class="p-5 bg-brand/5 border border-brand/20 rounded-2xl">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <p id="tracking-status" class="text-xs font-bold uppercase ${state.liveTracking ? 'text-brand' : 'text-slate-500'} tracking-wider">Live Tracking ${state.liveTracking ? 'Active' : 'Standby'}</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="gps-checkbox" class="sr-only peer" ${state.liveTracking ? 'checked' : ''}>
                <div class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>
            <p class="text-[11px] text-slate-400 leading-relaxed">Broadcast your position to the AI security mesh for enhanced responder connectivity.</p>
          </div>
        </aside>

        <!-- Center: Map -->
        <main class="col-span-12 lg:col-span-6 bg-[#03060c] relative flex flex-col p-8">
           <div class="mb-4 flex justify-between items-end">
              <div>
                 <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Grid Coordinate System v2.0</p>
                 <h2 class="text-xl font-bold tracking-tight">Active Surveillance Field</h2>
              </div>
              <div class="flex gap-2">
                 <button id="report-btn" class="px-5 py-2.5 bg-brand hover:brightness-110 text-slate-900 border border-brand rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                   <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                   Report Incident
                 </button>
              </div>
           </div>
           
           <div id="map" class="map-container flex-1"></div>
           
           <div class="mt-6 grid grid-cols-2 gap-4">
              <div class="p-4 glass rounded-2xl flex items-center gap-4">
                 <div class="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                    <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                 </div>
                 <div>
                    <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Zone Status</p>
                    <p class="text-xs font-bold">Secure Environment</p>
                 </div>
              </div>
              <div class="p-4 glass rounded-2xl flex items-center gap-4">
                 <div class="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                    <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                 </div>
                 <div>
                    <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Encrypted</p>
                    <p class="text-xs font-bold">AES-256 Link</p>
                 </div>
              </div>
           </div>
        </main>

        <!-- Right: Feed -->
        <aside class="col-span-12 lg:col-span-3 border-l border-white/5 bg-black/20 flex flex-col overflow-hidden">
          <div class="p-6 border-b border-white/5 relative">
            <h3 class="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-slate-300">
              <span class="w-2 h-2 bg-danger rounded-full animate-pulse"></span>
              Real-Time Feed
            </h3>
            <div class="absolute top-0 right-0 w-16 h-16 bg-brand/5 blur-2xl"></div>
          </div>
          
          <div id="incident-list" class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- Incidents injected here -->
          </div>

          <div class="p-6 bg-black/40 border-t border-white/5">
             <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
               <h4 class="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Smart Safety Recommendation</h4>
               <p id="safety-tip" class="text-[11px] text-slate-400 leading-relaxed italic">Analyzing patterns... Awaiting more local data.</p>
             </div>
          </div>
        </aside>
      </div>

      <!-- Footer Status Bar -->
      <footer class="h-12 bg-black/60 border-t border-white/5 backdrop-blur-md flex items-center justify-between px-8 text-[10px] text-slate-500 tracking-wider font-medium shrink-0">
        <div class="flex items-center gap-8 font-mono">
          <span class="flex items-center gap-2">
             <span class="w-1.5 h-1.5 bg-brand rounded-full"></span>
             GPS: <span id="gps-coords" class="text-slate-300">${state.location.lat.toFixed(4)}° N, ${state.location.lng.toFixed(4)}° W</span>
          </span>
          <span class="hidden sm:inline">NETWORK: TUNNELED</span>
        </div>
        <div class="flex items-center gap-6 uppercase">
          <span class="text-emerald-500 flex items-center gap-1.5 font-bold">
            <span class="w-1 h-1 bg-emerald-500 rounded-full"></span>
            Node #CS-144 Active
          </span>
          <span class="hidden md:inline">Ver 2.0.4-LTS</span>
        </div>
      </footer>
    </div>
  `;

  renderMap();
  loadIncidents();
  setupMainEvents();
};

let leafletLoaded = false;
let leafletLoadingPromise: Promise<void> | null = null;
let leafletMarkers: any[] = [];
let sosMarker: any = null;

const loadLeaflet = () => {
  if (window.L && window.L.Routing) {
    leafletLoaded = true;
    return Promise.resolve();
  }
  if (leafletLoadingPromise) return leafletLoadingPromise;

  leafletLoadingPromise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const routingLink = document.createElement('link');
    routingLink.rel = 'stylesheet';
    routingLink.href = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css';
    document.head.appendChild(routingLink);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const routingScript = document.createElement('script');
      routingScript.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js';
      routingScript.onload = () => {
         leafletLoaded = true;
         resolve();
      };
      routingScript.onerror = (e) => {
        leafletLoadingPromise = null;
        reject(e);
      };
      document.head.appendChild(routingScript);
    };
    script.onerror = (e) => {
      leafletLoadingPromise = null;
      reject(e);
    };
    document.head.appendChild(script);
  });
  return leafletLoadingPromise;
};

const renderMap = async () => {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  
  if (!leafletLoaded) {
    try {
      await loadLeaflet();
    } catch (err) {
      console.error("Failed to load Leaflet API", err);
      mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 p-4 text-center text-xs tracking-widest uppercase">Failed to load Map.</div>';
      return;
    }
  }

  const isLight = document.documentElement.classList.contains('light-mode');
  const defaultCoords = state.location && typeof state.location.lat === 'number' && typeof state.location.lng === 'number' && !isNaN(state.location.lat) ? state.location : { lat: 31.2560, lng: 75.7051 };

  // If map exists but on a different element (due to re-render), remove it
  if (window.leafletMap) {
    const mapDiv = window.leafletMap.getContainer();
    if (mapDiv !== mapContainer) {
       window.leafletMap.remove();
       window.leafletMap = null;
    }
  }

  if (!window.leafletMap) {
    if (!window.L) return;
    try {
      window.leafletMap = window.L.map(mapContainer, {
        zoomControl: false,
        attributionControl: false
      }).setView([defaultCoords.lat, defaultCoords.lng], 18);

      window.L.tileLayer(
        isLight ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', 
        { maxZoom: 20 }
      ).addTo(window.leafletMap);
    } catch (e) {
      console.error("Map initialization failed", e);
    }
  } else {
    if (state.liveTracking && state.location) {
      window.leafletMap.panTo([state.location.lat, state.location.lng]);
    }
  }

  renderMarkers();

  // Routing setup
  window.currentRoutingControl = window.currentRoutingControl || null;
  window.routeToIncident = (lat: number, lng: number) => {
    if (!window.leafletMap || !state.location) return;
    
    // Check distance
    const dist = Math.pow(state.location.lat - lat, 2) + Math.pow(state.location.lng - lng, 2);
    if (dist < 0.0000001) {
       showToast('You are already at the incident location. Drag your blue marker to simulate movement.', 'info');
       if (window.currentRoutingControl) {
           window.leafletMap.removeControl(window.currentRoutingControl);
           window.currentRoutingControl = null;
       }
       return;
    }
    
    if (window.currentRoutingControl) {
        window.leafletMap.removeControl(window.currentRoutingControl);
    }

    if (window.L && window.L.Routing) {
        window.currentRoutingControl = window.L.Routing.control({
            waypoints: [
                window.L.latLng(state.location.lat, state.location.lng),
                window.L.latLng(lat, lng)
            ],
            createMarker: function() { return null; }, // Hide default markers
            routeWhileDragging: false,
            addWaypoints: false,
            show: false, // Don't show the itinerary box
            lineOptions: {
                styles: [{color: '#3b82f6', opacity: 0.8, weight: 6, dashArray: '10, 10'}]
            }
        }).addTo(window.leafletMap);
        
        // Hide itinerary container if it still shows
        setTimeout(() => {
          const itinerary = document.querySelector('.leaflet-routing-container') as HTMLElement;
          if (itinerary) itinerary.style.display = 'none';
        }, 100);
    }
  };
};

const createIcon = (color: string, sizeStr: string, html = '') => {
  if (!window.L) return null;
  return window.L.divIcon({
    className: 'custom-leaflet-icon',
    html: `<div style="width:${sizeStr};height:${sizeStr};background-color:${color};border-radius:50%;border:2px solid #fff;${html}"></div>`,
    iconSize: [parseInt(sizeStr), parseInt(sizeStr)],
    iconAnchor: [parseInt(sizeStr)/2, parseInt(sizeStr)/2]
  });
};

const loadIncidents = async () => {
  const data = await api.get('/incidents');
  if (Array.isArray(data)) {
    state.incidents = data;
    renderIncidentList();
    renderMap();
    updateRiskScore();
  }
};

const renderIncidentList = () => {
  const list = document.getElementById('incident-list');
  if (!list) return;
  list.innerHTML = (state.incidents || []).map(inc => `
    <div class="p-4 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden group hover:bg-white/10 transition-all border-l-4 ${inc.riskLevel === 'HIGH' ? 'border-l-danger' : inc.riskLevel === 'MEDIUM' ? 'border-l-warning' : 'border-l-emerald-500'}">
      <div class="flex justify-between items-start mb-2">
        <span class="text-[10px] font-bold uppercase tracking-widest ${inc.riskLevel === 'HIGH' ? 'text-danger' : inc.riskLevel === 'MEDIUM' ? 'text-warning' : 'text-emerald-400'}">${inc.category}</span>
        <div class="text-right">
          <span class="text-[10px] text-slate-500 italic font-mono block">${new Date(inc.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <div class="flex items-center gap-1.5 justify-end mt-1">
             <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter ${inc.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}">
               ${inc.status || 'Active'}
             </span>
             ${(state.user && state.user.role === 'admin') ? `<span class="text-[8px] text-brand/70 font-bold uppercase tracking-tighter">@${inc.userName || 'Unknown'}</span>` : ''}
          </div>
        </div>
      </div>
      <h4 class="text-sm font-bold text-slate-200">${inc.title}</h4>
      ${inc.location ? `<p class="text-[10px] font-medium text-brand/80 mt-1 uppercase tracking-widest">📍 ${inc.location}</p>` : ''}
      <p class="text-[11px] leading-relaxed text-slate-400 mt-1 line-clamp-2">${inc.description}</p>
      
      <div class="mt-4 flex items-center gap-4">
        <button class="upvote-btn flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white transition-colors p-1.5 bg-white/5 rounded-lg active:scale-95" data-id="${inc.id}">
          <svg class="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z"></path></svg>
          Verify (${inc.upvotes})
        </button>
        ${inc.verified ? '<span class="text-[9px] font-black text-brand tracking-widest uppercase bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20">Verified</span>' : ''}
        
        <div class="ml-auto flex items-center gap-3">
          <button class="route-btn text-[9px] font-bold text-white bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 px-2 py-1 rounded transition-colors uppercase tracking-widest" onclick="window.routeToIncident(${inc.coordinates.lat}, ${inc.coordinates.lng})">
             Find Path
          </button>
          ${(state.user && state.user.role === 'admin') ? `
            <button class="status-btn text-[9px] font-bold text-slate-400 hover:text-brand transition-colors" data-id="${inc.id}">
              ${inc.status === 'active' ? 'Mark Resolved' : 'Re-open'}
            </button>
            <button class="delete-btn text-[9px] font-bold text-danger/70 hover:text-danger" data-id="${inc.id}">
              Purge
            </button>
          ` : ''}
        </div>
      </div>
      
      ${inc.riskLevel === 'HIGH' ? '<div class="absolute top-0 right-0 w-16 h-16 bg-danger/5 blur-xl"></div>' : ''}
    </div>
  `).join('') || '<p class="text-center text-slate-500 text-xs py-8 opacity-50 uppercase tracking-widest">No signals detected.</p>';
  
  // Attach event listeners for upvotes and delete
  list!.querySelectorAll('.upvote-btn').forEach(el => {
    const btn = el as HTMLButtonElement;
    btn.onclick = async () => {
       const res = await api.post(`/incidents/${btn.dataset.id}/upvote`, {});
       if (res && res.message && res.message.includes('already')) {
         showToast(res.message, 'warning');
       } else {
         loadIncidents();
       }
    };
  });

  list!.querySelectorAll('.status-btn').forEach(el => {
    const btn = el as HTMLButtonElement;
    btn.onclick = async () => {
       await api.post(`/incidents/${btn.dataset.id}/toggle-status`, {});
       loadIncidents();
    };
  });
  
  list!.querySelectorAll('.delete-btn').forEach(el => {
    const btn = el as HTMLButtonElement;
    btn.onclick = async () => {
       await fetch(`/api/incidents/${btn.dataset.id}`, { 
         method: 'DELETE',
         headers: { 'Authorization': `Bearer ${state.token}` } 
       });
       loadIncidents();
    };
  });
};

const setupMainEvents = () => {
  const container = document.getElementById('app');
  
  const trackingToggle = document.getElementById('tracking-toggle');
  if (trackingToggle) {
    trackingToggle.onclick = () => {
      state.liveTracking = !state.liveTracking;
      showToast(`Live Tracking ${state.liveTracking ? 'ENABLED' : 'DISABLED'}`, state.liveTracking ? 'info' : 'warning');
      renderMain(container);
    };
  }

  document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    stopTracking();
    
    // Reset state natively
    state.token = null;
    state.user = null;
    state.incidents = [];
    state.trackingData = {};
    if (window.leafletMap) {
        window.leafletMap.remove();
        window.leafletMap = null;
    }
    
    App(); // re-render
  };

  document.getElementById('theme-btn').onclick = () => {
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.documentElement.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  };

  // Set initial theme
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light-mode');
  }

  document.getElementById('sos-btn').onclick = async () => {
    if (!state.user) {
        showToast('You must be logged in to use SOS', 'error');
        return;
    }
    socket.emit('emergency:sos', {
      userId: state.user.id,
      name: state.user.name,
      coordinates: state.location
    });
    
    // Also file a High Priority Incident automatically
    try {
      await api.post('/incidents', {
        title: 'EMERGENCY: User Activated SOS',
        description: `Active SOS triggered by user ${state.user.name}. Immediate assistance required.`,
        category: 'Emergency / SOS',
        location: 'Current Location',
        coordinates: state.location
      });
      loadIncidents(); // Refresh the map and feed
    } catch(err) {
      console.error("Failed to sync SOS as incident", err);
    }
    
    showToast('🚨 EMERGENCY SOS SENT TO CAMPUS SECURITY & NEARBY USERS', 'error');
  };

  // Tracking is always active
  if (state.liveTracking) {
    startTracking();
  }

  document.getElementById('report-btn').onclick = () => renderReportModal();

  const gpsCheckbox = document.getElementById('gps-checkbox') as HTMLInputElement;
  if (gpsCheckbox) {
    gpsCheckbox.onchange = (e) => {
      state.liveTracking = (e.target as HTMLInputElement).checked;
      const statusEl = document.getElementById('tracking-status');
      if (statusEl) {
        statusEl.textContent = `Live Tracking ${state.liveTracking ? 'Active' : 'Standby'}`;
        statusEl.className = `text-xs font-bold uppercase ${state.liveTracking ? 'text-brand' : 'text-slate-500'} tracking-wider`;
      }
      if (state.liveTracking) {
        startTracking();
        showToast('GPS Signal Broadcast: Active');
      } else {
        stopTracking();
        showToast('GPS Signal Broadcast: Terminated', 'warning');
      }
    };
  }
};

// --- Map / Tracking ---
let trackInterval;
let watchId;

const renderMarkers = () => {
  if (!window.leafletMap) return;
  
  // Clear existing markers if they were stored
  leafletMarkers.forEach(m => m.remove());
  leafletMarkers = [];

  // Add Incident Markers
  state.incidents.forEach(inc => {
    const color = inc.riskLevel === 'HIGH' ? '#ef4444' : inc.riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981';
    const marker = window.L.marker([inc.coordinates.lat, inc.coordinates.lng], {
      icon: window.L.divIcon({
        className: 'custom-leaflet-icon',
        html: `<div style="width:16px;height:16px;background-color:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px ${color}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(window.leafletMap!);
    
    marker.bindPopup(`
      <div class="p-2 min-w-[150px]">
        <p class="text-[10px] uppercase font-bold text-slate-500 mb-1">${inc.category}</p>
        <p class="text-xs font-bold text-slate-900">${inc.title}</p>
        <p class="text-[10px] text-slate-600 mt-1">${inc.location}</p>
        <div class="mt-2 flex gap-2">
           <span class="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 font-bold">${inc.riskLevel} RISK</span>
           <button onclick="window.routeToIncident(${inc.coordinates.lat}, ${inc.coordinates.lng})" class="text-[8px] bg-brand text-slate-900 px-2 py-0.5 rounded font-bold uppercase">Navigate</button>
        </div>
      </div>
    `);
    leafletMarkers.push(marker);
  });

  // Add Other User Markers (Live Tracking)
  Object.entries(state.trackingData).forEach(([userId, data]) => {
     if (userId === state.user?.id) return;
     const marker = window.L.marker([data.coords.lat, data.coords.lng], {
       icon: window.L.divIcon({
         className: 'user-leaflet-icon',
         html: `<div style="width:12px;height:12px;background-color:#3b82f6;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px #3b82f6;opacity:0.7"></div>`,
         iconSize: [12, 12],
         iconAnchor: [6, 6]
       })
     }).addTo(window.leafletMap!);

     if (state.user?.role === 'admin') {
       marker.bindTooltip(data.userName, { 
         permanent: true, 
         direction: 'top', 
         className: 'admin-marker-label bg-slate-900 text-white text-[8px] px-1 rounded border border-white/20' 
       });
       marker.bindPopup(`
         <div class="p-2">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Tracker</p>
            <p class="text-xs font-bold text-slate-900">${data.userName}</p>
            <p class="text-[9px] text-slate-500 mt-1">ID: ${userId}</p>
         </div>
       `);
     }

     leafletMarkers.push(marker);
  });

  // Add Self Marker
  if (state.location && window.L) {
    const selfMarker = window.L.marker([state.location.lat, state.location.lng], {
      icon: window.L.divIcon({
        className: 'self-leaflet-icon',
        html: `<div style="width:18px;height:18px;background-color:#22d3ee;border-radius:50%;border:3px solid #fff;box-shadow:0 0 15px #22d3ee;z-index:1000"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
      draggable: true
    }).addTo(window.leafletMap!);

    selfMarker.on('dragend', function (e) {
      const newPos = e.target.getLatLng();
      state.location = { lat: newPos.lat, lng: newPos.lng };
      
      const gpsEl = document.getElementById('gps-coords');
      if (gpsEl) {
        gpsEl.textContent = `${state.location.lat.toFixed(4)}° N, ${state.location.lng.toFixed(4)}° W`;
      }
      sendLocationUpdate();
      
      // Update route if exists
      if (window.currentRoutingControl) {
          const waypoints = window.currentRoutingControl.getWaypoints();
          if (waypoints.length > 1) {
              window.routeToIncident(waypoints[1].latLng.lat, waypoints[1].latLng.lng);
          }
      }
    });

    leafletMarkers.push(selfMarker);
  }
};

const startTracking = () => {
  if (navigator.geolocation && state.liveTracking) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        state.location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        const gpsEl = document.getElementById('gps-coords');
        if (gpsEl) {
          gpsEl.textContent = `${state.location.lat.toFixed(4)}° N, ${state.location.lng.toFixed(4)}° W`;
        }
        sendLocationUpdate();
        renderMarkers();
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast('Location access restricted. Using fallback tracking.', 'warning');
        fallbackTracking();
      },
      { enableHighAccuracy: true }
    );
  } else if (!state.liveTracking) {
    stopTracking();
  } else {
    fallbackTracking();
  }
};

const fallbackTracking = () => {
  if (trackInterval) clearInterval(trackInterval);
  sendLocationUpdate();
  trackInterval = setInterval(sendLocationUpdate, 5000);
};

const stopTracking = () => {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (trackInterval) clearInterval(trackInterval);
  trackInterval = null;
};

const sendLocationUpdate = () => {
  if (!state.user || !state.user.id) return;
  socket.emit('location:update', {
    userId: state.user.id,
    coordinates: state.location
  });
};

const renderReportModal = () => {
  const modal = document.getElementById('modal-root');
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 z-[9999]">
      <div class="auth-card p-8 w-full max-w-lg rounded-2xl max-h-[95vh] overflow-y-auto border border-brand/20 shadow-[0_0_50px_rgba(34,211,238,0.1)]">
        <div class="flex justify-between items-center mb-6">
           <div class="flex flex-col">
              <h3 class="text-xl font-bold tracking-tight uppercase tracking-widest text-brand">Report New Incident</h3>
              <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Signal Transmission Protocol Active</p>
           </div>
           <button id="close-modal-x" class="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
              <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
           </button>
        </div>

        <div class="mb-5">
          <label class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 block px-1">Location Selection (Click on Map)</label>
          <div id="modal-map" class="w-full h-48 rounded-xl bg-black/40 border border-white/10 relative overflow-hidden group">
            <div class="absolute top-3 left-3 z-[1000] pointer-events-none">
              <span class="px-2 py-1 bg-brand/90 text-slate-950 text-[8px] font-bold rounded uppercase tracking-tighter shadow-lg">Target Selector</span>
            </div>
          </div>
          <p id="modal-coords-tip" class="text-[9px] text-slate-500 mt-2 px-1 uppercase tracking-wider font-mono">GPS: ${state.location.lat.toFixed(4)}° N, ${state.location.lng.toFixed(4)}° W</p>
        </div>

        <form id="incident-form" class="space-y-5">
           <div>
            <label class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5 block px-1">Incident Classification</label>
            <select name="category" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none appearance-none focus:border-brand/50 transition-all">
              <option value="Suspicious Activity" class="bg-slate-900">Suspicious Activity</option>
              <option value="Theft" class="bg-slate-900">Unlawful Take (Theft)</option>
              <option value="Harassment" class="bg-slate-900">Verbal / Physical Harassment</option>
              <option value="Physical Assault" class="bg-slate-900">Emergency: Violent Assault</option>
              <option value="Poor Lighting" class="bg-slate-900">Infrastructure: Poor Lighting</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5 block px-1">Alert Headline</label>
            <input name="title" placeholder="Brief summary of event" required maxlength="100" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-all">
          </div>
          <div>
            <label class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5 block px-1">Landmark / Zone Context</label>
            <input name="location" id="location-input" placeholder="e.g., Near Library North Entrance" maxlength="100" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl outline-none focus:border-brand/50 transition-all">
          </div>
          <div>
            <label class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5 block px-1">Detailed Intelligence</label>
            <textarea name="description" placeholder="Describe subjects, environment, or specific danger..." maxlength="1000" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl h-24 outline-none focus:border-brand/50 resize-none transition-all"></textarea>
          </div>
          
          <div class="flex gap-4 pt-4">
            <button type="button" id="close-modal" class="flex-1 py-3.5 border border-white/10 text-slate-500 font-bold uppercase text-[10px] tracking-widest rounded-xl hover:bg-white/5 transition-colors">Abort Signal</button>
            <button type="submit" class="flex-1 py-3.5 bg-brand text-slate-900 font-bold uppercase text-[10px] tracking-widest rounded-xl hover:brightness-110 shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all">Transmit Report</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // --- Modal Map Logic ---
  let selectedCoords = { ...state.location };
  const mapElement = document.getElementById('modal-map');
  const coordsTip = document.getElementById('modal-coords-tip');
  
  setTimeout(() => {
    if (!window.L) return;
    
    const isLight = document.documentElement.classList.contains('light-mode');
    const modalMap = window.L.map(mapElement, {
      zoomControl: false,
      attributionControl: false
    }).setView([selectedCoords.lat, selectedCoords.lng], 17);

    window.L.tileLayer(
      isLight ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', 
      { maxZoom: 19 }
    ).addTo(modalMap);

    const markerIcon = window.L.divIcon({
      className: 'custom-leaflet-icon',
      html: `<div style="width:20px;height:20px;background-color:#ef4444;border-radius:50%;border:3px solid #fff;box-shadow:0 0 15px #ef4444;animation: pulse 1.5s infinite;"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    let marker = window.L.marker([selectedCoords.lat, selectedCoords.lng], {
      icon: markerIcon
    }).addTo(modalMap);

    modalMap.on('click', (e) => {
      selectedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
      marker.setLatLng(e.latlng);
      coordsTip.textContent = `GPS: ${selectedCoords.lat.toFixed(4)}° N, ${selectedCoords.lng.toFixed(4)}° W`;
    });
    
    // Invalidate size in case of flex/modal rendering issues
    setTimeout(() => modalMap.invalidateSize(), 100);
  }, 100);

  const closeModal = () => modal.innerHTML = '';
  document.getElementById('close-modal').onclick = closeModal;
  document.getElementById('close-modal-x').onclick = closeModal;
  
  document.getElementById('incident-form')!.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Transmitting...';
    }

    const formData = new FormData(form);
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      category: formData.get('category'),
      location: formData.get('location') || 'Reported Location',
      coordinates: selectedCoords
    };
    
    try {
      const response = await api.post('/incidents', data);
      if (response && !response.message?.includes('Error') && !response.message?.includes('Fail')) {
        closeModal();
        showToast('Signal transmitted successfully.');
        loadIncidents();
      } else {
        showToast(response.message || 'Signal failure', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Transmit Report';
        }
      }
    } catch (err) {
      showToast('Connection timed out', 'error');
      if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Transmit Report';
      }
    }
  };
};

const updateRiskScore = () => {
  if (state.incidents.length === 0) {
    const scoreEl = document.getElementById('risk-score');
    if (scoreEl) scoreEl.textContent = '0.0';
    return;
  }
  const avg = state.incidents.reduce((p, c) => p + (c.riskScore || 0), 0) / state.incidents.length;
  
  const scoreEl = document.getElementById('risk-score');
  const labelEl = document.getElementById('risk-label');
  const progressEl = document.getElementById('risk-progress');
  const tipEl = document.getElementById('safety-tip');
  
  if (!scoreEl) return;
  
  scoreEl.textContent = avg.toFixed(1);
  progressEl.style.width = `${avg * 10}%`;

  if (avg >= 7.5) {
    labelEl.textContent = 'High Signal';
    labelEl.className = 'text-sm text-danger font-bold uppercase tracking-wider mt-1';
    scoreEl.className = 'text-5xl font-light text-danger tracking-tighter';
    progressEl.className = 'w-0 h-full bg-danger rounded-full shadow-[0_0_10px_#ef4444] transition-all duration-700';
    tipEl.textContent = 'URGENT: Pattern suggests high severity in nearby sectors. Recommend group travel or campus escort service.';
    showToast('⚠️ CRITICAL: Elevated local risk levels detected.', 'error');
  } else if (avg >= 4) {
    labelEl.textContent = 'Moderate Activity';
    labelEl.className = 'text-sm text-warning font-bold uppercase tracking-wider mt-1';
    scoreEl.className = 'text-5xl font-light text-warning tracking-tighter';
    progressEl.className = 'w-0 h-full bg-warning rounded-full shadow-[0_0_10px_#f59e0b] transition-all duration-700';
    tipEl.textContent = 'CAUTION: Area showing signs of increased reports. Stay in well-lit designated paths.';
  } else {
    labelEl.textContent = 'Secure Sector';
    labelEl.className = 'text-sm text-emerald-400 font-bold uppercase tracking-wider mt-1';
    scoreEl.className = 'text-5xl font-light text-emerald-400 tracking-tighter';
    progressEl.className = 'w-0 h-full bg-emerald-400 rounded-full shadow-[0_0_10px_#10b981] transition-all duration-700';
    tipEl.textContent = 'ADVISORY: Zone currently stable. Continue standard safety protocols.';
  }
};

const showToast = (msg, type = 'info') => {
  const toast = document.createElement('div');
  const baseClasses = 'fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-xl glass z-[100] transition-all duration-300 font-bold shadow-2xl';
  let colorClasses = 'border-emerald-500/50 text-emerald-500';
  if (type === 'error') colorClasses = 'border-red-500/50 bg-red-500/10 text-red-500';
  if (type === 'warning') colorClasses = 'border-warning/50 bg-warning/10 text-warning';
  
  toast.className = `${baseClasses} ${colorClasses}`;
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// --- Init ---
App();
window.onstorage = () => App();
