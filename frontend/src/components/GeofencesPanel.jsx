import React, { useState } from 'react';
import api from '../api';
import useStore from '../store';

const INITIAL_POLYGON = JSON.stringify({
  type: 'Polygon',
  coordinates: [[[77.580, 12.955], [77.625, 12.955], [77.625, 12.990], [77.580, 12.990], [77.580, 12.955]]]
});

export default function GeofencesPanel() {
  const { geofences, fetchGeofences, addToast, mapMode, setMapMode, drawPoints, clearDrawPoints } = useStore();
  const [name, setName] = useState('');
  const [geometry, setGeometry] = useState(INITIAL_POLYGON);
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const parsed = JSON.parse(geometry);
      if (parsed.type !== 'Polygon' || !Array.isArray(parsed.coordinates?.[0]) || parsed.coordinates[0].length < 4) {
        throw new Error('Provide a GeoJSON Polygon with at least four ring coordinates.');
      }
      await api.post('/geofences', { name, geometry: parsed });
      setName('');
      await fetchGeofences();
      addToast({ type: 'success', message: 'Geofence created' });
    } catch (error) {
      addToast({ type: 'error', message: error.message || 'Invalid polygon' });
    } finally { setBusy(false); }
  };

  const saveDrawnZone = () => {
    if (drawPoints.length < 3) {
      addToast({ type: 'warning', message: 'Click at least three points on the map first' });
      return;
    }
    setGeometry(JSON.stringify({ type: 'Polygon', coordinates: [[...drawPoints, drawPoints[0]]] }));
    setMapMode('normal');
    clearDrawPoints();
    addToast({ type: 'success', message: 'Drawn polygon added to the form; name it and save' });
  };

  const remove = async (id) => {
    try {
      await api.delete(`/geofences/${id}`);
      await fetchGeofences();
      addToast({ type: 'success', message: 'Geofence deleted' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
  };

  return (
    <div className="geofences-panel">
      <div className="geofence-draw-tools">
        <p className="text-sm">Zones alert when a vehicle enters or exits their boundary.</p>
        <button className={`btn ${mapMode === 'geofence-draw' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { clearDrawPoints(); setMapMode(mapMode === 'geofence-draw' ? 'normal' : 'geofence-draw'); }}>
          {mapMode === 'geofence-draw' ? `Drawing · ${drawPoints.length} points` : 'Draw on map'}
        </button>
        {mapMode === 'geofence-draw' && <button className="btn btn-ghost btn-sm" onClick={saveDrawnZone}>Use drawn boundary</button>}
      </div>
      <form className="geofence-create" onSubmit={save}>
        <label className="input-group"><span className="input-label">Zone name</span><input className="input" value={name} onChange={event => setName(event.target.value)} required placeholder="Restricted area" /></label>
        <label className="input-group"><span className="input-label">GeoJSON Polygon</span><textarea className="input geofence-json" value={geometry} onChange={event => setGeometry(event.target.value)} required rows={5} /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create geofence'}</button>
      </form>
      <div className="geofence-list">
        {geofences.map(zone => <div key={zone._id} className="geofence-row"><span className="geofence-color" style={{ background: zone.color || 'var(--accent)' }} /><span className="geofence-name">{zone.name}<small>{zone.breachCount || 0} breaches</small></span><button className="btn btn-ghost btn-sm" onClick={() => remove(zone._id)}>Delete</button></div>)}
        {!geofences.length && <p className="text-muted text-sm">No zones configured.</p>}
      </div>
    </div>
  );
}
