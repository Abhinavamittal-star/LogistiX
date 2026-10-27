import React, { useState } from 'react';
import useStore from '../store';
import api from '../api';
import './VehiclesPanel.css';

const STATUS_ICON = {
  offline: '⚫',
  idle: '🟡',
  en_route: '🟢',
  at_pickup: '🔵',
  at_delivery: '🟠',
};

const TYPE_ICON = {
  van: '🚐',
  truck: '🚛',
  motorcycle: '🏍️',
  car: '🚗',
};

function VehicleCard({ vehicle, onFlyTo, onAssign }) {
  const lastSeen = vehicle.lastHeartbeat
    ? Math.round((Date.now() - new Date(vehicle.lastHeartbeat)) / 1000)
    : null;

  const color = vehicle.color || '#f97316';
  const driverName = vehicle.driver?.name || vehicle.driverId || 'Unknown';
  const speed = vehicle.currentLocation?.speed || 0;

  return (
    <div className="vehicle-card glass-card-sm" id={`vehicle-${vehicle.vehicleId}`}>
      <div className="vehicle-card-header">
        <div className="flex items-center gap-2">
          <div className="vehicle-color-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <div>
            <div className="font-mono text-sm font-bold" style={{ color }}>{vehicle.vehicleId}</div>
            <div className="text-xs text-muted">{TYPE_ICON[vehicle.type] || '🚗'} {vehicle.type}</div>
          </div>
        </div>
        <span className="badge badge-gray">{STATUS_ICON[vehicle.status]} {vehicle.status?.replace('_', ' ')}</span>
      </div>

      <div className="vehicle-info">
        <div className="vehicle-info-row">
          <span className="text-xs text-muted">Driver</span>
          <span className="text-xs font-medium">{driverName}</span>
        </div>
        <div className="vehicle-info-row">
          <span className="text-xs text-muted">Speed</span>
          <span className="text-xs font-mono">{Math.round(speed)} km/h</span>
        </div>
        <div className="vehicle-info-row">
          <span className="text-xs text-muted">Deliveries</span>
          <span className="text-xs font-bold text-green">{vehicle.deliveriesCompleted || 0}</span>
        </div>
        {lastSeen !== null && (
          <div className="vehicle-info-row">
            <span className="text-xs text-muted">Last seen</span>
            <span className={`text-xs font-mono ${lastSeen > 30 ? 'text-yellow' : 'text-green'}`}>
              {lastSeen < 60 ? `${lastSeen}s ago` : `${Math.round(lastSeen / 60)}m ago`}
            </span>
          </div>
        )}
      </div>

      <div className="vehicle-card-actions">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onFlyTo(vehicle)}
          disabled={!vehicle.currentLocation?.coordinates?.length}
        >
          📍 Locate
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onAssign(vehicle)}>
          📋 Orders
        </button>
      </div>
    </div>
  );
}

export default function VehiclesPanel() {
  const registerVehicle = async (event) => {
    event.preventDefault();
    try {
      await api.post('/vehicles', vehicleForm);
      addToast({ type: 'success', message: `${vehicleForm.vehicleId} registered` });
      fetchVehicles();
      setShowRegister(false);
      setVehicleForm({ vehicleId: '', driverId: '', type: 'van' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
  };
  const openRegister = async () => {
    setShowRegister(true);
    try {
      const data = await api.get('/auth/drivers');
      setDrivers(data);
      setVehicleForm(form => ({ ...form, driverId: form.driverId || data[0]?._id || '' }));
    } catch (error) { addToast({ type: 'error', message: error.message }); }
  };

  const { vehicles, flyTo, orders, addToast, fetchOrders, fetchVehicles } = useStore();
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [vehicleForm, setVehicleForm] = useState({ vehicleId: '', driverId: '', type: 'van' });

  const handleFlyTo = (vehicle) => {
    const coords = vehicle.currentLocation?.coordinates;
    if (coords) {
      flyTo({ center: coords, zoom: 16, pitch: 60, bearing: vehicle.currentLocation.heading || 0 });
    }
  };

  const handleAssign = (vehicle) => {
    setSelectedVehicle(vehicle);
    setShowAssign(true);
  };

  const assignOrder = async (orderId) => {
    try {
      await api.post(`/orders/${orderId}/assign`, {
        driverId: selectedVehicle.driverId || selectedVehicle.driver?._id,
        vehicleId: selectedVehicle._id
      });
      addToast({ type: 'success', message: 'Order assigned!' });
      fetchOrders();
      setShowAssign(false);
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const onlineVehicles = vehicles.filter(v => v.status !== 'offline');
  const pendingOrders = orders.filter(o => o.status === 'pending');

  return (
    <div className="vehicles-panel">
      <div className="panel-summary">
        <div className="summary-stat">
          <span className="summary-val text-green">{onlineVehicles.length}</span>
          <span className="summary-label">Online</span>
        </div>
        <button className="btn btn-primary" onClick={openRegister}>+ Register vehicle</button>
        <div className="summary-stat">
          <span className="summary-val">{vehicles.length}</span>
          <span className="summary-label">Total</span>
        </div>
        <div className="summary-stat">
          <span className="summary-val text-accent">{vehicles.filter(v => v.status === 'en_route').length}</span>
          <span className="summary-label">En Route</span>
        </div>
      </div>

      <div className="vehicles-list">
        {vehicles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚗</div>
            <div className="text-secondary text-sm">No vehicles online</div>
            <div className="text-muted text-xs">Start the simulator to see vehicles</div>
          </div>
        ) : (
          vehicles.map(v => (
            <VehicleCard
              key={v._id || v.vehicleId}
              vehicle={v}
              onFlyTo={handleFlyTo}
              onAssign={handleAssign}
            />
          ))
        )}
      </div>

      {showRegister && (
        <div className="modal-overlay" onClick={() => setShowRegister(false)}>
          <form className="modal-card glass-card fade-in" onSubmit={registerVehicle} onClick={event => event.stopPropagation()}>
            <div className="modal-header"><h3>Register vehicle</h3><button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowRegister(false)}>✕</button></div>
            <div className="flex-col gap-3">
              <label className="input-group"><span className="input-label">Vehicle ID</span><input className="input" value={vehicleForm.vehicleId} onChange={event => setVehicleForm({ ...vehicleForm, vehicleId: event.target.value })} required /></label>
              <label className="input-group"><span className="input-label">Driver</span><select className="input" value={vehicleForm.driverId} onChange={event => setVehicleForm({ ...vehicleForm, driverId: event.target.value })} required>{drivers.map(driver => <option key={driver._id} value={driver._id}>{driver.name} · {driver.email}</option>)}</select></label>
              <label className="input-group"><span className="input-label">Vehicle type</span><select className="input" value={vehicleForm.type} onChange={event => setVehicleForm({ ...vehicleForm, type: event.target.value })}><option value="van">Van</option><option value="truck">Truck</option><option value="motorcycle">Motorcycle</option><option value="car">Car</option></select></label>
              <button className="btn btn-primary" disabled={!drivers.length}>Save vehicle</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign modal */}
      {showAssign && selectedVehicle && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-card glass-card fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3>Assign to {selectedVehicle.vehicleId}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAssign(false)}>✕</button>
            </div>
            <div className="flex-col gap-2">
              {pendingOrders.length === 0 ? (
                <p className="text-secondary text-sm">No pending orders to assign</p>
              ) : (
                pendingOrders.map(o => (
                  <div key={o._id} className="assign-order-row" onClick={() => assignOrder(o._id)}>
                    <div>
                      <div className="font-mono text-sm text-accent">{o.orderId}</div>
                      <div className="text-xs text-muted">{o.delivery?.address}</div>
                    </div>
                    <button className="btn btn-primary btn-sm">Assign</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
