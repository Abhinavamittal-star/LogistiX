import React, { useEffect, useState } from 'react';
import useStore from '../store';
import api from '../api';
import './OrdersPanel.css';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'badge-gray', icon: '⏳' },
  assigned: { label: 'Assigned', color: 'badge-blue', icon: '👤' },
  picked_up: { label: 'Picked Up', color: 'badge-orange', icon: '📦' },
  in_transit: { label: 'In Transit', color: 'badge-orange', icon: '🚗' },
  delivered: { label: 'Delivered', color: 'badge-green', icon: '✅' },
  failed: { label: 'Failed', color: 'badge-red', icon: '❌' },
  cancelled: { label: 'Cancelled', color: 'badge-gray', icon: '🚫' },
};

const PRIORITY_CONFIG = {
  low: { color: 'badge-gray' },
  normal: { color: 'badge-blue' },
  high: { color: 'badge-orange' },
  urgent: { color: 'badge-red' },
};

function OrderCard({ order, onClick, onCancel }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const priCfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal;
  const eta = order.eta ? new Date(order.eta) : null;
  const now = new Date();
  const isLate = eta && eta < now && !['delivered', 'cancelled', 'failed'].includes(order.status);

  return (
    <div
      className={`order-card glass-card-sm fade-in ${isLate || order.isDelayed ? 'order-card--delayed' : ''}`}
      onClick={() => onClick(order)}
      id={`order-${order.orderId}`}
      role="button"
      tabIndex={0}
    >
      <div className="order-card-header">
        <div className="flex items-center gap-2">
          <span className={`badge ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
          {(isLate || order.isDelayed) && (
            <span className="badge badge-red">⚠️ Late</span>
          )}
        </div>
        <span className={`badge ${priCfg.color}`}>{order.priority}</span>
      </div>

      <div className="order-card-id font-mono text-xs text-accent">{order.orderId}</div>

      <div className="order-card-route">
        <div className="route-point">
          <span className="route-dot route-dot--pickup" />
          <span className="text-sm text-secondary">{order.pickup?.address}</span>
        </div>
        <div className="route-line" />
        <div className="route-point">
          <span className="route-dot route-dot--delivery" />
          <span className="text-sm text-secondary">{order.delivery?.address}</span>
        </div>
      </div>

      <div className="order-card-footer">
        <span className="text-xs text-muted">{order.customerName}</span>
        {eta && (
          <span className={`text-xs font-mono ${isLate ? 'text-red' : 'text-secondary'}`}>
            ETA {eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {!['delivered', 'cancelled', 'failed'].includes(order.status) && (
          <button className="btn btn-ghost btn-sm" aria-label={`Cancel ${order.orderId}`} onClick={event => { event.stopPropagation(); onCancel(order); }}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function CreateOrderModal({ onClose }) {
  const [form, setForm] = useState({
    customerName: '',
    pickupAddress: '',
    pickupLng: '77.6067', pickupLat: '12.9755',
    deliveryAddress: '',
    deliveryLng: '77.6245', deliveryLat: '12.9352',
    priority: 'normal',
    weight: ''
  });
  const [loading, setLoading] = useState(false);
  const { addToast, fetchOrders, fetchOrderStats } = useStore();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/orders', {
        customerName: form.customerName,
        pickup: {
          address: form.pickupAddress,
          location: { type: 'Point', coordinates: [parseFloat(form.pickupLng), parseFloat(form.pickupLat)] }
        },
        delivery: {
          address: form.deliveryAddress,
          location: { type: 'Point', coordinates: [parseFloat(form.deliveryLng), parseFloat(form.deliveryLat)] }
        },
        priority: form.priority,
        weight: parseFloat(form.weight) || 0,
        eta: new Date(Date.now() + 90 * 60000)
      });
      addToast({ type: 'success', message: 'Order created successfully!' });
      fetchOrders();
      fetchOrderStats();
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass-card fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Order</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="input-group">
            <label className="input-label">Customer Name</label>
            <input className="input" placeholder="Jane Smith" value={form.customerName} onChange={e => set('customerName', e.target.value)} required />
          </div>
          <div className="modal-section-label">Pickup</div>
          <div className="input-group">
            <label className="input-label">Address</label>
            <input className="input" placeholder="123 Pickup St, Bengaluru" value={form.pickupAddress} onChange={e => set('pickupAddress', e.target.value)} required />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Longitude</label>
              <input className="input" type="number" step="0.0001" value={form.pickupLng} onChange={e => set('pickupLng', e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Latitude</label>
              <input className="input" type="number" step="0.0001" value={form.pickupLat} onChange={e => set('pickupLat', e.target.value)} />
            </div>
          </div>
          <div className="modal-section-label">Delivery</div>
          <div className="input-group">
            <label className="input-label">Address</label>
            <input className="input" placeholder="456 Delivery Ave, Bengaluru" value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} required />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Longitude</label>
              <input className="input" type="number" step="0.0001" value={form.deliveryLng} onChange={e => set('deliveryLng', e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Latitude</label>
              <input className="input" type="number" step="0.0001" value={form.deliveryLat} onChange={e => set('deliveryLat', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Priority</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Weight (kg)</label>
              <input className="input" type="number" placeholder="5" value={form.weight} onChange={e => set('weight', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrdersPanel() {
  const { orders, orderStats, fetchOrders, fetchOrderStats, flyTo, addToast } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    fetchOrders();
    fetchOrderStats();
    const interval = setInterval(() => { fetchOrders(); fetchOrderStats(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchOrderStats]);

  const handleOrderClick = (order) => {
    setSelectedOrderId(order._id);
    if (order.delivery?.location?.coordinates) {
      flyTo({ center: order.delivery.location.coordinates, zoom: 16, pitch: 60 });
    }
  };

  const handleCancelOrder = async (order) => {
    if (!window.confirm(`Cancel ${order.orderId}?`)) return;
    try {
      await api.patch(`/orders/${order._id}`, { status: 'cancelled', note: 'Cancelled by dispatcher' });
      addToast({ type: 'success', message: `${order.orderId} cancelled` });
      fetchOrders();
      fetchOrderStats();
    } catch (error) { addToast({ type: 'error', message: error.message }); }
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      o.delivery?.address?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="orders-panel">
      {/* Stats Row */}
      <div className="orders-stats">
        <div className="stat-mini" onClick={() => setStatusFilter('all')}>
          <div className="stat-mini-val">{orderStats.total}</div>
          <div className="stat-mini-label">Total</div>
        </div>
        <div className="stat-mini" onClick={() => setStatusFilter('pending')}>
          <div className="stat-mini-val text-secondary">{orderStats.pending}</div>
          <div className="stat-mini-label">Pending</div>
        </div>
        <div className="stat-mini" onClick={() => setStatusFilter('in_transit')}>
          <div className="stat-mini-val text-accent">{orderStats.inTransit}</div>
          <div className="stat-mini-label">Active</div>
        </div>
        <div className="stat-mini" onClick={() => setStatusFilter('delivered')}>
          <div className="stat-mini-val text-green">{orderStats.delivered}</div>
          <div className="stat-mini-label">Done</div>
        </div>
        {orderStats.delayed > 0 && (
          <div className="stat-mini" onClick={() => setStatusFilter('all')}>
            <div className="stat-mini-val text-red">{orderStats.delayed}</div>
            <div className="stat-mini-label">Delayed</div>
          </div>
        )}
      </div>

      {/* Search + Filter */}
      <div className="orders-search-row">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            id="order-search"
            className="input search-input"
            placeholder="Search orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input" style={{ width: 'auto', flex: '0 0 auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Create Button */}
      <button id="create-order-btn" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowCreate(true)}>
        + New Order
      </button>

      {/* Order List */}
      <div className="orders-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="text-secondary text-sm">No orders found</div>
          </div>
        ) : (
          filtered.map(order => (
            <OrderCard
              key={order._id || order.orderId}
              order={order}
              onClick={handleOrderClick}
              onCancel={handleCancelOrder}
            />
          ))
        )}
      </div>

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
