import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store';

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, orders, vehicles, geofences, flyTo, setSelectedOrder, setSidePanel } = useStore();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      }
      if (event.key === 'Escape') setCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCommandPaletteOpen]);

  const entries = useMemo(() => [
    ...orders.map(order => ({ type: 'Shipment', label: `${order.orderId} · ${order.customerName || 'Customer'}`, search: `${order.orderId} ${order.customerName} ${order.delivery?.address}`, action: () => { setSelectedOrder(order); setSidePanel('orders'); const center = order.delivery?.location?.coordinates; if (center) flyTo({ center, zoom: 15 }); } })),
    ...vehicles.map(vehicle => ({ type: 'Driver', label: `${vehicle.vehicleId} · ${vehicle.driver?.name || vehicle.driverId || 'Driver'}`, search: `${vehicle.vehicleId} ${vehicle.driver?.name} ${vehicle.driverId}`, action: () => { setSidePanel('vehicles'); const center = vehicle.currentLocation?.coordinates; if (center) flyTo({ center, zoom: 15 }); } })),
    ...geofences.map(zone => ({ type: 'Geofence', label: zone.name, search: zone.name, action: () => setSidePanel('geofences') })),
    { type: 'Page', label: 'Open dispatcher dashboard', search: 'dashboard orders dispatch', action: () => navigate('/dashboard') },
  ], [orders, vehicles, geofences, flyTo, navigate, setSelectedOrder, setSidePanel]);

  if (!commandPaletteOpen) return null;
  const normalized = query.trim().toLowerCase();
  const results = entries.filter(entry => !normalized || fuzzyMatch(normalized, entry.search || entry.label)).slice(0, 10);
  const run = (entry) => { entry.action(); setCommandPaletteOpen(false); setQuery(''); };

  return (
    <div className="command-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandPaletteOpen(false); }}>
      <section className="command-card glass-card" role="dialog" aria-modal="true" aria-label="Search operations">
        <input autoFocus className="input command-input" placeholder="Search shipments, drivers, geofences…" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="command-results">
          {results.map((entry, index) => <button key={`${entry.type}-${index}`} className="command-result" onClick={() => run(entry)}><span>{entry.type}</span>{entry.label}<kbd>↵</kbd></button>)}
          {results.length === 0 && <div className="command-empty">No matching operations</div>}
        </div>
        <footer>Navigate with search · Esc to close</footer>
      </section>
    </div>
  );
}

function fuzzyMatch(query, value) {
  const text = value.toLowerCase();
  return query.split(/\s+/).every(term => {
    if (text.includes(term)) return true;
    let index = 0;
    for (const character of text) {
      if (character === term[index]) index += 1;
      if (index === term.length) return true;
    }
    return false;
  });
}
