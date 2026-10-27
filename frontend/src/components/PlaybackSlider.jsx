import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import useStore from '../store';

export default function PlaybackSlider() {
  const { mapMode, setMapMode, vehicles, setPlaybackPosition, playbackPosition } = useStore();
  const [vehicleId, setVehicleId] = useState('');
  const [positions, setPositions] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const vehicle = useMemo(() => vehicles.find(item => (item.vehicleId || item._id) === vehicleId) || vehicles[0], [vehicles, vehicleId]);

  useEffect(() => { if (!vehicleId && vehicle) setVehicleId(vehicle.vehicleId || vehicle._id); }, [vehicle, vehicleId]);
  useEffect(() => {
    if (mapMode !== 'playback' || !vehicle) return undefined;
    let active = true;
    api.get(`/vehicles/${encodeURIComponent(vehicle.vehicleId || vehicle._id)}/playback`)
      .then(data => { if (active) { setPositions(data || []); setCursor(0); } })
      .catch(error => useStore.getState().addToast({ type: 'error', message: `Playback unavailable: ${error.message}` }));
    return () => { active = false; };
  }, [mapMode, vehicle]);
  useEffect(() => {
    if (!playing || positions.length < 2) return undefined;
    const timer = setInterval(() => setCursor(value => (value + 1) % positions.length), 700);
    return () => clearInterval(timer);
  }, [playing, positions.length]);
  useEffect(() => {
    const point = positions[cursor];
    if (point?.coordinates) setPlaybackPosition({ vehicleId: vehicle?.vehicleId, coordinates: point.coordinates });
    else setPlaybackPosition(null);
  }, [positions, cursor, vehicle, setPlaybackPosition]);

  if (mapMode !== 'playback') return null;
  return (
    <section className="playback-panel glass-card" aria-label="Vehicle playback">
      <div className="playback-top"><strong>Route playback</strong><button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setMapMode('normal'); setPlaybackPosition(null); }}>Close</button></div>
      <div className="playback-controls">
        <select className="input" value={vehicleId} onChange={event => setVehicleId(event.target.value)} aria-label="Vehicle">
          {vehicles.map(item => <option key={item.vehicleId || item._id} value={item.vehicleId || item._id}>{item.vehicleId || item._id}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" disabled={positions.length < 2} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button>
      </div>
      <input type="range" min="0" max={Math.max(positions.length - 1, 0)} value={cursor} onChange={event => { setPlaying(false); setCursor(Number(event.target.value)); }} aria-label="Playback position" />
      <div className="playback-meta"><span>{positions[cursor]?.timestamp ? new Date(positions[cursor].timestamp).toLocaleTimeString() : 'No recorded positions yet'}</span><span>{positions.length} positions</span></div>
    </section>
  );
}
