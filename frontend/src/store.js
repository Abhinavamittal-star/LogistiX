import { create } from 'zustand';
import { io } from 'socket.io-client';
import api from './api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

let socket = null;
let authGeneration = 0;

const clearOperationalData = () => ({
  vehicles: [],
  drivers: [],
  customers: [],
  orders: [],
  orderStats: { total: 0, pending: 0, inTransit: 0, delivered: 0, failed: 0, delayed: 0 },
  selectedOrder: null,
  geofences: [],
  alerts: [],
  unreadAlerts: 0,
  playbackData: [],
  playbackTime: 0,
  isPlaying: false,
  playbackPosition: null,
});

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

const useStore = create((set, get) => ({
  // Auth
  user: JSON.parse(localStorage.getItem('lx_user') || 'null'),
  accessToken: localStorage.getItem('lx_token') || null,
  refreshToken: localStorage.getItem('lx_refresh') || null,
  
  setAuth: (user, token, refreshToken) => {
    authGeneration += 1;
    disconnectSocket();
    localStorage.setItem('lx_user', JSON.stringify(user));
    localStorage.setItem('lx_token', token);
    if (refreshToken) localStorage.setItem('lx_refresh', refreshToken);
    set({
      ...clearOperationalData(),
      user, accessToken: token, refreshToken: refreshToken || null, socket: null
    });
  },

  syncAuthFromStorage: () => {
    const token = localStorage.getItem('lx_token');
    const refreshToken = localStorage.getItem('lx_refresh');
    const rawUser = localStorage.getItem('lx_user');
    let user = null;
    try { user = rawUser ? JSON.parse(rawUser) : null; }
    catch (error) {
      console.error('Stored account data is invalid:', error);
      user = null;
    }

    const current = get();
    if (token === current.accessToken && refreshToken === current.refreshToken &&
      String(user?._id || user?.id || '') === String(current.user?._id || current.user?.id || '')) return;

    disconnectSocket();
    authGeneration += 1;
    set({
      ...clearOperationalData(),
      user, accessToken: token, refreshToken, socket: null
    });
  },
  
  logout: () => {
    authGeneration += 1;
    disconnectSocket();
    localStorage.removeItem('lx_user');
    localStorage.removeItem('lx_token');
    localStorage.removeItem('lx_refresh');
    set({
      ...clearOperationalData(),
      user: null, accessToken: null, refreshToken: null,
      socket: null
    });
  },
  
  // Orders
  orders: [],
  orderStats: { total: 0, pending: 0, inTransit: 0, delivered: 0, failed: 0, delayed: 0 },
  selectedOrder: null,
  
  setOrders: (orders) => set({ orders }),
  setOrderStats: (stats) => set({ orderStats: stats }),
  setSelectedOrder: (order) => set({ selectedOrder: order }),
  
  fetchOrders: async () => {
    const generation = authGeneration;
    try {
      const data = await api.get('/orders');
      if (generation === authGeneration) set({ orders: data });
    } catch (e) { console.error('fetchOrders error:', e); }
  },
  
  fetchOrderStats: async () => {
    const generation = authGeneration;
    try {
      const data = await api.get('/orders/stats');
      if (generation === authGeneration) set({ orderStats: data });
    } catch (e) { console.error('fetchOrderStats error:', e); }
  },
  
  // Vehicles
  vehicles: [],
  setVehicles: (vehicles) => set({ vehicles }),
  drivers: [],
  customers: [],
  fetchDrivers: async () => {
    const generation = authGeneration;
    try {
      const drivers = await api.get('/auth/drivers');
      if (generation === authGeneration) set({ drivers });
    }
    catch (error) {
      if (generation !== authGeneration) return;
      console.error('fetchDrivers error:', error);
      get().addToast({ type: 'error', message: `Could not load drivers: ${error.message}` });
    }
  },
  fetchCustomers: async () => {
    const generation = authGeneration;
    try {
      const customers = await api.get('/auth/customers');
      if (generation === authGeneration) set({ customers });
    }
    catch (error) {
      if (generation !== authGeneration) return;
      console.error('fetchCustomers error:', error);
      get().addToast({ type: 'error', message: `Could not load customers: ${error.message}` });
    }
  },
  
  updateVehicle: (update) => set(state => {
    const existing = state.vehicles.findIndex(v => v.vehicleId === update.vehicleId);
    if (existing === -1) {
      return { vehicles: [...state.vehicles, {
        vehicleId: update.vehicleId,
        ...update,
        currentLocation: { type: 'Point', coordinates: update.coordinates, heading: update.heading, speed: update.speed },
        trail: update.trail || []
      }] };
    }
    const updated = [...state.vehicles];
    updated[existing] = {
      ...updated[existing],
      currentLocation: { type: 'Point', coordinates: update.coordinates, heading: update.heading, speed: update.speed },
      trail: update.trail || updated[existing].trail || [],
      lastHeartbeat: update.timestamp
    };
    return { vehicles: updated };
  }),
  
  fetchVehicles: async () => {
    const generation = authGeneration;
    try {
      const data = await api.get('/vehicles');
      if (generation === authGeneration) set({ vehicles: data });
    } catch (e) { console.error('fetchVehicles error:', e); }
  },
  
  // Geofences
  geofences: [],
  setGeofences: (geofences) => set({ geofences }),
  addGeofence: (gf) => set(state => ({ geofences: [...state.geofences, gf] })),
  removeGeofence: (id) => set(state => ({ geofences: state.geofences.filter(g => g._id !== id) })),
  
  fetchGeofences: async () => {
    const generation = authGeneration;
    try {
      const data = await api.get('/geofences');
      if (generation === authGeneration) set({ geofences: data });
    } catch (e) { console.error('fetchGeofences error:', e); }
  },
  
  // Alerts
  alerts: [],
  unreadAlerts: 0,
  setAlerts: (alerts) => set({ alerts, unreadAlerts: alerts.filter(alert => !alert.read).length }),
  addAlert: (alert) => set(state => ({
    alerts: [{ ...alert, id: Date.now(), read: false }, ...state.alerts].slice(0, 100),
    unreadAlerts: state.unreadAlerts + 1
  })),
  markAlertsRead: () => set(state => ({
    alerts: state.alerts.map(a => ({ ...a, read: true })),
    unreadAlerts: 0
  })),
  
  // UI State
  sidePanel: 'orders', // 'orders' | 'alerts' | 'vehicles' | 'optimizer' | 'geofences'
  setSidePanel: (panel) => set({ sidePanel: panel }),
  mapMode: 'normal', // 'normal' | 'playback' | 'geofence-draw'
  setMapMode: (mode) => set({ mapMode: mode }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  
  // Toast notifications
  toasts: [],
  addToast: (toast) => {
    const id = Date.now();
    set(state => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, toast.duration || 4000);
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  
  // Playback
  playbackData: [],
  playbackTime: 0,
  isPlaying: false,
  setPlaybackData: (data) => set({ playbackData: data }),
  setPlaybackTime: (t) => set({ playbackTime: t }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  
  // Map fly-to trigger
  flyToTarget: null,
  flyTo: (target) => set({ flyToTarget: target }),
  
  // Socket
  socket: null,
  
  initSocket: () => {
    if (socket) return socket;
    
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      auth: { token: localStorage.getItem('lx_token') }
    });
    const activeSocket = socket;
    const onCurrentSocket = handler => (...args) => {
      if (socket === activeSocket) handler(...args);
    };
    
    socket.on('connect', onCurrentSocket(() => {
      console.log('🔌 Socket connected');
      const { user } = get();
      if (user?.role === 'dispatcher') {
        socket.emit('join:dispatcher');
      } else if (user?.role === 'driver') {
        socket.emit('join:driver', { driverId: user._id });
      }
    }));
    
    socket.on('vehicles:init', onCurrentSocket((vehicles) => {
      set({ vehicles });
    }));

    socket.on('account:created', onCurrentSocket((account) => {
      if (account.role === 'driver') {
        set(state => ({ drivers: upsertById(state.drivers, account) }));
      } else if (account.role === 'customer') {
        set(state => ({ customers: upsertById(state.customers, account) }));
      }
    }));
    
    socket.on('vehicle:move', onCurrentSocket((update) => {
      get().updateVehicle(update);
    }));
    
    socket.on('order:created', onCurrentSocket((order) => {
      set(state => ({ orders: upsertById(state.orders, order) }));
      get().fetchOrderStats();
    }));
    
    socket.on('order:updated', onCurrentSocket((order) => {
      set(state => ({
        orders: upsertById(state.orders, order)
      }));
    }));
    
    socket.on('order:delivered', onCurrentSocket((order) => {
      set(state => ({
        orders: state.orders.map(o => o._id === order._id ? { ...o, ...order } : o)
      }));
      get().fetchOrderStats();
      get().addToast({ type: 'success', message: `Order ${order.orderId} delivered! ✅` });
    }));
    
    socket.on('alert:geofence', onCurrentSocket((alert) => {
      get().addAlert({ ...alert, type: 'geofence' });
    }));
    
    socket.on('alert:new', onCurrentSocket((alert) => {
      get().addAlert(alert);
    }));
    
    socket.on('alerts:init', onCurrentSocket((alerts) => {
      get().setAlerts(alerts);
    }));

    socket.on('order:deleted', onCurrentSocket((order) => {
      set(state => ({ orders: state.orders.filter(item => item._id !== order._id) }));
      get().fetchOrderStats();
    }));
    
    set({ socket });
    return socket;
  },
  
  getSocket: () => socket,
  drawPoints: [],
  addDrawPoint: (point) => set(state => ({ drawPoints: [...state.drawPoints, point] })),
  clearDrawPoints: () => set({ drawPoints: [] }),
  playbackPosition: null,
  setPlaybackPosition: (position) => set({ playbackPosition: position }),
}));

function upsertById(items, value) {
  const index = items.findIndex(item =>
    (value._id && String(item._id) === String(value._id)) ||
    (value.orderId && item.orderId === value.orderId) ||
    (value.email && item.email === value.email)
  );
  if (index < 0) return [value, ...items];
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item);
}

export default useStore;
