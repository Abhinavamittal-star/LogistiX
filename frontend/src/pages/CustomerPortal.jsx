import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useStore from '../store';

export default function CustomerPortal() {
  const { user, logout, addToast, orders, setOrders } = useStore();
  const [trackingCode, setTrackingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({ pickupAddress: '', deliveryAddress: '', pickup: '77.6067,12.9755', delivery: '77.6245,12.9352' });
  const navigate = useNavigate();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try { setOrders(await api.get('/orders')); }
    catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  }, [setOrders, addToast]);
  useEffect(() => {
    loadOrders();
    const timer = setInterval(loadOrders, 30000);
    return () => clearInterval(timer);
  }, [loadOrders]);
  const lookup = (event) => { event.preventDefault(); if (trackingCode.trim()) navigate(`/track/${encodeURIComponent(trackingCode.trim())}`); };
  const createOrder = async (event) => {
    event.preventDefault();
    const coords = value => value.split(',').map(Number);
    try {
      const order = await api.post('/orders', {
        pickup: { address: newOrder.pickupAddress, location: { type: 'Point', coordinates: coords(newOrder.pickup) } },
        delivery: { address: newOrder.deliveryAddress, location: { type: 'Point', coordinates: coords(newOrder.delivery) } }
      });
      addToast({ type: 'success', message: `Order created · tracking code ${order.trackingCode}` });
      setCreating(false);
      setTrackingCode(order.trackingCode);
      await loadOrders();
    } catch (error) { addToast({ type: 'error', message: error.message }); }
  };
  return <main className="customer-portal"><header className="driver-header"><div><strong>LogistiX Customer</strong><small>Signed in as {user?.name}</small></div><button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button></header>
    <section className="customer-content"><h1>Track a delivery</h1><form className="tracking-lookup" onSubmit={lookup}><input className="input" value={trackingCode} onChange={event => setTrackingCode(event.target.value)} placeholder="Enter your tracking code" required /><button className="btn btn-primary">Track</button></form>
      <div className="flex items-center justify-between customer-orders-heading"><h2>Your orders</h2><div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={() => setCreating(value => !value)}>New order</button><button className="btn btn-secondary btn-sm" onClick={loadOrders} disabled={loading}>{loading ? 'Loading…' : 'Load orders'}</button></div></div>
      {creating && <form className="customer-create glass-card-sm" onSubmit={createOrder}>
        <label className="input-group"><span className="input-label">Pickup address</span><input className="input" value={newOrder.pickupAddress} onChange={event => setNewOrder({ ...newOrder, pickupAddress: event.target.value })} required /></label>
        <label className="input-group"><span className="input-label">Pickup coordinates · lng, lat</span><input className="input" value={newOrder.pickup} onChange={event => setNewOrder({ ...newOrder, pickup: event.target.value })} required /></label>
        <label className="input-group"><span className="input-label">Delivery address</span><input className="input" value={newOrder.deliveryAddress} onChange={event => setNewOrder({ ...newOrder, deliveryAddress: event.target.value })} required /></label>
        <label className="input-group"><span className="input-label">Delivery coordinates · lng, lat</span><input className="input" value={newOrder.delivery} onChange={event => setNewOrder({ ...newOrder, delivery: event.target.value })} required /></label>
        <button className="btn btn-primary">Create order</button>
      </form>}
      {orders.map(order => <article className="customer-order glass-card-sm" key={order._id}><div><strong>{order.orderId}</strong><p>{order.delivery?.address}</p></div><div><span className="badge badge-blue">{order.status}</span><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/track/${encodeURIComponent(order.trackingCode || order.orderId)}`)}>Track</button></div></article>)}
    </section>
  </main>;
}
