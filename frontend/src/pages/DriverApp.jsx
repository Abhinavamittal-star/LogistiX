import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import useStore from '../store';

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    return { x: ((touch?.clientX ?? event.clientX) - rect.left) * canvas.width / rect.width, y: ((touch?.clientY ?? event.clientY) - rect.top) * canvas.height / rect.height };
  };
  const start = (event) => { event.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const p = point(event); drawing.current = true; ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const draw = (event) => { if (!drawing.current) return; event.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const p = point(event); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#f97316'; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const stop = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current.toDataURL('image/png')); };
  const clear = () => { const canvas = canvasRef.current; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); onChange(''); };
  return <div><canvas ref={canvasRef} width="640" height="180" className="signature-pad" onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerLeave={stop} /><button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear signature</button></div>;
}

function DeliveryCard({ order, onRefresh }) {
  const { addToast } = useStore();
  const [signature, setSignature] = useState('');
  const [photo, setPhoto] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateStatus = async (status) => {
    setBusy(true); setError('');
    try {
      await api.patch(`/orders/${order._id}`, { status, note: status === 'picked_up' ? 'Picked up by driver' : 'In transit' });
      addToast({ type: 'success', message: `${order.orderId} marked ${status.replace('_', ' ')}` });
      onRefresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const deliver = async () => {
    if (!signature) { setError('Capture the recipient signature before completing delivery.'); return; }
    setBusy(true); setError('');
    try {
      await api.post(`/orders/${order._id}/deliver`, { signature, photo, notes });
      addToast({ type: 'success', message: `${order.orderId} delivered` });
      onRefresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const onPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file for proof of delivery.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be 5 MB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.onerror = () => setError('Could not read the selected photo.');
    reader.readAsDataURL(file);
  };
  return (
    <article className="driver-order glass-card-sm">
      <div className="flex items-center justify-between"><strong>{order.orderId}</strong><span className="badge badge-orange">{order.status.replace('_', ' ')}</span></div>
      <p className="text-sm">Pickup · {order.pickup?.address}</p><p className="text-sm">Drop-off · {order.delivery?.address}</p>
      {['assigned'].includes(order.status) && <button className="btn btn-primary" disabled={busy} onClick={() => updateStatus('picked_up')}>Picked up</button>}
      {['picked_up'].includes(order.status) && <button className="btn btn-primary" disabled={busy} onClick={() => updateStatus('in_transit')}>Start delivery</button>}
      {['picked_up', 'in_transit'].includes(order.status) && <div className="delivery-proof">
        <label className="input-label">Recipient signature</label><SignaturePad onChange={setSignature} />
        <label className="input-label">Photo proof (optional, max 5 MB)<input type="file" accept="image/*" capture="environment" onChange={onPhoto} /></label>
        <textarea className="input" placeholder="Delivery notes" value={notes} onChange={event => setNotes(event.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={deliver}>Complete delivery</button>
      </div>}
      {error && <p className="driver-error" role="alert">{error}</p>}
    </article>
  );
}

export default function DriverApp() {
  const { user, logout, orders, fetchOrders, addToast } = useStore();
  const [locating, setLocating] = useState(false);
  useEffect(() => { fetchOrders(); const timer = setInterval(fetchOrders, 15000); return () => clearInterval(timer); }, [fetchOrders]);
  useEffect(() => {
    if (!navigator.geolocation) { addToast({ type: 'warning', message: 'This browser does not support location tracking.' }); return undefined; }
    setLocating(false);
    let active = true;
    const send = async (position) => {
      if (active) setLocating(true);
      const { longitude, latitude, heading, speed } = position.coords;
      try { await api.post('/vehicles/heartbeat', { coordinates: [longitude, latitude], heading: heading || 0, speed: speed ? speed * 3.6 : 0 }); }
      catch (error) { if (active) addToast({ type: 'error', message: `Location update failed: ${error.message}` }); }
    };
    const watchId = navigator.geolocation.watchPosition(send, (error) => { if (active) { setLocating(false); addToast({ type: 'warning', message: `Location unavailable: ${error.message}` }); } }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    const interval = setInterval(() => navigator.geolocation.getCurrentPosition(send, () => {}, { enableHighAccuracy: true, maximumAge: 3000 }), 5000);
    return () => { active = false; navigator.geolocation.clearWatch(watchId); clearInterval(interval); setLocating(false); };
  }, [addToast]);

  const activeOrders = orders.filter(order => !['delivered', 'failed', 'cancelled'].includes(order.status));
  return <main className="driver-page"><header className="driver-header"><div><strong>LogistiX Driver</strong><small>{user?.name} · {locating ? 'Location active' : 'Location unavailable'}</small></div><button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button></header>
    <section className="driver-content"><div className="driver-welcome"><small>MY ROUTE</small><h1>Today’s stops</h1><p>{activeOrders.length} active deliveries · Location shares while this page is open</p></div>
      {activeOrders.map(order => <DeliveryCard key={order._id} order={order} onRefresh={fetchOrders} />)}
      {!activeOrders.length && <div className="driver-empty glass-card">No assigned deliveries right now.</div>}
    </section>
  </main>;
}
