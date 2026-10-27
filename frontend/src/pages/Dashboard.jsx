import React, { useEffect, useState } from 'react';
import useStore from '../store';
import Map3D from '../components/Map3D';
import OrdersPanel from '../components/OrdersPanel';
import VehiclesPanel from '../components/VehiclesPanel';
import AlertsPanel from '../components/AlertsPanel';
import OptimizerPanel from '../components/OptimizerPanel';
import GeofencesPanel from '../components/GeofencesPanel';
import PeoplePanel from '../components/PeoplePanel';
import PlaybackSlider from '../components/PlaybackSlider';
import api from '../api';
import './Dashboard.css';

const PANELS = [
  ['orders', 'Orders', '▤'],
  ['vehicles', 'Vehicles', '⌖'],
  ['people', 'People', '♙'],
  ['alerts', 'Alerts', '♧'],
  ['optimizer', 'Optimize', '↗'],
  ['geofences', 'Geofences', '⬡'],
];

export default function Dashboard() {
  const { user, logout, sidePanel, setSidePanel, fetchOrders, fetchOrderStats, fetchVehicles, fetchGeofences, initSocket, alerts, unreadAlerts, setMapMode } = useStore();
  const [storageMode, setStorageMode] = useState('unknown');

  useEffect(() => {
    api.get('/health').then(data => setStorageMode(data.storageMode)).catch(error => {
      useStore.getState().addToast({ type: 'error', message: `Could not verify storage mode: ${error.message}` });
    });
    fetchOrders();
    fetchOrderStats();
    fetchVehicles();
    fetchGeofences();
    initSocket();
    api.get('/geofences/alerts').then(alerts => useStore.getState().setAlerts(alerts)).catch(error => {
      useStore.getState().addToast({ type: 'error', message: `Could not load alerts: ${error.message}` });
    });
  }, [fetchOrders, fetchOrderStats, fetchVehicles, fetchGeofences, initSocket]);

  const panel = {
    orders: <OrdersPanel />,
    vehicles: <VehiclesPanel />,
    people: <PeoplePanel />,
    alerts: <AlertsPanel />,
    optimizer: <OptimizerPanel />,
    geofences: <GeofencesPanel />,
  }[sidePanel];

  return (
    <main className="page-full dashboard">
      <Map3D />
      <header className="dashboard-topbar glass-card">
        <div className="dashboard-brand"><span className="dashboard-logo">⬡</span><div><strong>LogistiX</strong><small>CONTROL TOWER</small></div></div>
        <div className={`dashboard-live ${storageMode === 'memory' ? 'dashboard-live-demo' : ''}`}>
          <span className="status-dot online" />
          {user?.demoMode || storageMode === 'memory' ? 'DEMO · MEMORY ONLY' : 'LIVE OPERATIONS'}
        </div>
        <div className="dashboard-user"><span>{user?.name}</span><button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button></div>
      </header>
      <nav className="dashboard-nav glass-card" aria-label="Dashboard panels">
        {PANELS.map(([id, label, icon]) => (
          <button key={id} className={`dashboard-nav-item ${sidePanel === id ? 'active' : ''}`} onClick={() => setSidePanel(id)}>
            <span>{icon}</span>{label}{id === 'alerts' && unreadAlerts > 0 && <b>{unreadAlerts}</b>}
          </button>
        ))}
        <button className="dashboard-nav-item" onClick={() => setMapMode('playback')}><span>◷</span>Playback</button>
        <button className="dashboard-nav-item" onClick={() => { setSidePanel('geofences'); setMapMode('geofence-draw'); }}><span>＋</span>Draw zone</button>
        <div className="dashboard-shortcut">⌘ K <span>Search</span></div>
      </nav>
      <aside className="dashboard-panel glass-card">
        <div className="dashboard-panel-heading"><div><small>OPERATIONS</small><h2>{PANELS.find(([id]) => id === sidePanel)?.[1] || 'Orders'}</h2></div><span className="text-xs text-muted">{alerts.length} alerts</span></div>
        {panel}
      </aside>
      <PlaybackSlider />
    </main>
  );
}
