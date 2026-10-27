import React, { useState } from 'react';
import useStore from '../store';
import api from '../api';
import './OptimizerPanel.css';

export default function OptimizerPanel() {
  const { orders, vehicles, addToast, fetchOrders } = useStore();
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const pendingOrders = orders.filter(o => ['pending', 'assigned'].includes(o.status));
  const availableVehicles = vehicles.filter(v => v.status !== 'offline');

  const toggleOrder = (id) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDriver = (id) => {
    setSelectedDrivers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => setSelectedOrders(pendingOrders.map(o => o._id));
  const clearAll = () => { setSelectedOrders([]); setSelectedDrivers([]); setResult(null); };

  const optimize = async () => {
    if (selectedOrders.length === 0) {
      addToast({ type: 'warning', message: 'Select at least one order' });
      return;
    }
    if (selectedDrivers.length === 0) {
      addToast({ type: 'warning', message: 'Select at least one driver' });
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/optimize', {
        orderIds: selectedOrders,
        driverIds: selectedDrivers
      });
      setResult(data);
      fetchOrders();
      addToast({ type: 'success', message: `Routes optimized! Saved ${data.stats.savings}km (${data.stats.savingsPct}%)` });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="optimizer-panel">
      <div className="optimizer-intro">
        <div className="text-sm text-secondary">
          Select orders and drivers, then let the algorithm find the optimal routes using nearest-neighbor + 2-opt optimization.
        </div>
      </div>

      {/* Orders selection */}
      <div className="optimizer-section">
        <div className="optimizer-section-header">
          <span className="text-sm font-semibold">Orders ({selectedOrders.length}/{pendingOrders.length})</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={selectAll}>All</button>
            <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear</button>
          </div>
        </div>
        <div className="optimizer-list">
          {pendingOrders.slice(0, 20).map(o => (
            <label key={o._id} className={`optimizer-item ${selectedOrders.includes(o._id) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                className="checkbox"
                checked={selectedOrders.includes(o._id)}
                onChange={() => toggleOrder(o._id)}
              />
              <div>
                <div className="font-mono text-xs text-accent">{o.orderId}</div>
                <div className="text-xs text-muted">{o.delivery?.address?.split(',')[0]}</div>
              </div>
              <span className={`badge badge-${o.priority === 'urgent' ? 'red' : o.priority === 'high' ? 'orange' : 'gray'} ml-auto`}>
                {o.priority}
              </span>
            </label>
          ))}
          {pendingOrders.length === 0 && (
            <div className="text-muted text-sm" style={{ padding: '12px' }}>No pending orders</div>
          )}
        </div>
      </div>

      {/* Drivers selection */}
      <div className="optimizer-section">
        <div className="optimizer-section-header">
          <span className="text-sm font-semibold">Drivers ({selectedDrivers.length}/{availableVehicles.length})</span>
        </div>
        <div className="optimizer-list">
          {availableVehicles.map(v => {
            const dId = v.driverId || v.driver?._id;
            return (
              <label key={dId} className={`optimizer-item ${selectedDrivers.includes(dId) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={selectedDrivers.includes(dId)}
                  onChange={() => toggleDriver(dId)}
                />
                <div className="vehicle-color-mini" style={{ background: v.color || '#f97316' }} />
                <div>
                  <div className="font-mono text-xs" style={{ color: v.color }}>{v.vehicleId}</div>
                  <div className="text-xs text-muted">{v.driver?.name || 'Driver'}</div>
                </div>
              </label>
            );
          })}
          {availableVehicles.length === 0 && (
            <div className="text-muted text-sm" style={{ padding: '12px' }}>No vehicles online</div>
          )}
        </div>
      </div>

      <button id="optimize-btn" className="btn btn-primary" onClick={optimize} disabled={loading} style={{ width: '100%' }}>
        {loading ? <><span className="spinner spinner-sm" /> Optimizing...</> : '🧮 Optimize Routes'}
      </button>

      {/* Results */}
      {result && (
        <div className="optimizer-results fade-in">
          <div className="results-header">Route Optimization Results</div>
          <div className="results-stats">
            <div className="result-stat">
              <div className="result-val text-secondary">{result.stats.beforeDistance} km</div>
              <div className="result-label">Before</div>
            </div>
            <div className="result-arrow">→</div>
            <div className="result-stat">
              <div className="result-val text-green">{result.stats.afterDistance} km</div>
              <div className="result-label">After</div>
            </div>
            <div className="result-stat">
              <div className="result-val text-accent">-{result.stats.savings} km</div>
              <div className="result-label">Saved ({result.stats.savingsPct}%)</div>
            </div>
          </div>

          <div className="result-assignments">
            {result.assignments.map((a, i) => (
              <div key={i} className="assignment-card">
                <div className="assignment-header">
                  <span className="font-mono text-xs text-accent">
                    Driver {i + 1} — {a.distance} km • ~{a.estimatedDuration} min
                  </span>
                </div>
                <div className="assignment-orders">
                  {a.orders.map((o, j) => (
                    <div key={j} className="assignment-order">
                      <span className="assignment-seq">{j + 1}</span>
                      <span className="font-mono text-xs text-accent">{o.orderId}</span>
                      <span className="text-xs text-muted">{o.delivery?.address?.split(',')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
