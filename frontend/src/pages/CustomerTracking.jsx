import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';
import Map3D from '../components/Map3D';
import useStore from '../store';

const STATUS_STEPS = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'];
const LABELS = { pending: 'Order received', assigned: 'Driver assigned', picked_up: 'Picked up', in_transit: 'On the way', delivered: 'Delivered' };

export default function CustomerTracking() {
  const { code } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const { setOrders, setVehicles } = useStore();

  useEffect(() => {
    let active = true;
    api.get(`/orders/${encodeURIComponent(code)}/public`)
      .then(data => { if (active) { setOrder(data); setOrders([data]); setVehicles(data.vehicle ? [data.vehicle] : []); } })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [code, setOrders, setVehicles]);
  useEffect(() => {
    if (!order?.trackingCode) return undefined;
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket.emit('join:shipment', { trackingCode: order.trackingCode }));
    socket.on('order:updated', update => setOrder(current => current ? { ...current, ...update } : update));
    socket.on('order:delivered', update => setOrder(current => current ? { ...current, ...update } : update));
    socket.on('vehicle:move', update => useStore.getState().updateVehicle(update));
    return () => socket.disconnect();
  }, [order?.trackingCode]);

  const completeIndex = STATUS_STEPS.indexOf(order?.status);
  return <main className="tracking-page"><header className="tracking-header"><Link to="/login" className="tracking-brand">⬡ LogistiX</Link><span>LIVE DELIVERY TRACKING</span></header>
    {!order ? <section className="tracking-message glass-card">{error ? <><h1>Tracking unavailable</h1><p>{error}</p></> : <><span className="spinner" /><p>Loading tracking details…</p></>}</section> :
      <div className="tracking-layout"><section className="tracking-info glass-card"><small>SHIPMENT {order.orderId}</small><h1>{order.status === 'delivered' ? 'Delivered' : order.eta ? `ETA ${new Date(order.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Delivery in progress'}</h1><p>{order.delivery?.address}</p>
        <ol className="tracking-steps">{STATUS_STEPS.map((status, index) => <li key={status} className={index <= completeIndex ? 'complete' : ''}><span>{index < completeIndex ? '✓' : index + 1}</span><div><strong>{LABELS[status]}</strong>{order.statusHistory?.find(entry => entry.status === status)?.timestamp && <small>{new Date(order.statusHistory.find(entry => entry.status === status).timestamp).toLocaleString()}</small>}</div></li>)}</ol>
        {order.assignedDriver?.name && <p className="tracking-driver">Driver · {order.assignedDriver.name}</p>}
      </section><div className="tracking-map"><Map3D /></div></div>}
  </main>;
}
