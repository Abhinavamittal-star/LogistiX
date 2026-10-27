import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import useStore from '../store';
import './Map3D.css';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export default function Map3D({ onMapReady }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapLoadedRef = useRef(false);
  const fleetFittedRef = useRef(false);
  const [mapRetry, setMapRetry] = React.useState(0);
  const [mapStatus, setMapStatus] = React.useState('loading');
  const [mapError, setMapError] = React.useState('');

  const { geofences, orders, flyToTarget, flyTo, mapMode, addDrawPoint, playbackPosition } = useStore();
  const playbackMarkerRef = useRef(null);

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    mapLoadedRef.current = false;
    setMapStatus('loading');
    let styleTimeout;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [77.5946, 12.9716],
      zoom: 11.8,
      pitch: 35,
      bearing: 0,
      antialias: true
    });

    // Controls
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.current.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.current.on('error', event => {
      if (!mapLoadedRef.current) {
        setMapStatus('error');
        setMapError(event.error?.message || 'Map tiles could not be loaded.');
      }
    });

    styleTimeout = setTimeout(() => {
      if (!mapLoadedRef.current) {
        setMapStatus('error');
        setMapError('Map renderer did not initialize. Check WebGL and worker support.');
      }
    }, 15000);

    map.current.on('style.load', () => {
      clearTimeout(styleTimeout);
      mapLoadedRef.current = true;
      setMapStatus('ready');
      setMapError('');
      if (onMapReady) onMapReady(map.current);
      map.current.addSource('delivery-pins', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.current.on('click', event => {
        if (useStore.getState().mapMode === 'geofence-draw') {
          useStore.getState().addDrawPoint([event.lngLat.lng, event.lngLat.lat]);
        }
      });

      // Delivery pins layer
      map.current.addLayer({
        id: 'delivery-pins-halo',
        type: 'circle',
        source: 'delivery-pins',
        paint: {
          'circle-radius': 12,
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': ['get', 'color'],
          'circle-opacity': 0.6,
          'circle-stroke-opacity': 0.45
        }
      });

      map.current.addLayer({
        id: 'delivery-pins-dot',
        type: 'circle',
        source: 'delivery-pins',
        paint: {
          'circle-radius': ['match', ['get', 'endpoint'], 'pickup', 6, 8],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.8)'
        }
      });

      // Click on pins
      map.current.on('click', 'delivery-pins-dot', (e) => {
        const props = e.features[0].properties;
        new maplibregl.Popup({ offset: 20, className: 'lx-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="min-width:160px">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${escapeHtml(props.orderId)}</div>
              <div style="font-size:11px;color:#f1f5f9;margin-bottom:4px">${escapeHtml(props.endpoint)}</div>
              <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${escapeHtml(props.address)}</div>
              <span style="font-size:11px;padding:2px 8px;border-radius:100px;background:rgba(249,115,22,0.2);color:#f97316;border:1px solid rgba(249,115,22,0.3)">${escapeHtml(props.status)}</span>
            </div>
          `)
          .addTo(map.current);
      });

      map.current.on('mouseenter', 'delivery-pins-dot', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'delivery-pins-dot', () => {
        map.current.getCanvas().style.cursor = '';
      });

      // Geofence source
      map.current.addSource('geofences', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'geofences-fill',
        type: 'fill',
        source: 'geofences',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['get', 'opacity']
        }
      });

      map.current.addLayer({
        id: 'geofences-outline',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-dasharray': [3, 2]
        }
      });

      const state = useStore.getState();
      setDeliveryPinData(map.current, state.orders);
      const fenceSource = map.current.getSource('geofences');
      if (fenceSource) fenceSource.setData({ type: 'FeatureCollection', features: state.geofences.map(zone => ({
        type: 'Feature', geometry: zone.geometry, properties: { name: zone.name, color: zone.color || '#f97316', opacity: zone.opacity || 0.15 }
      })) });
    });

    // Cleanup
    return () => {
      clearTimeout(styleTimeout);
      if (map.current) {
        playbackMarkerRef.current?.remove();
        playbackMarkerRef.current = null;
        fleetFittedRef.current = false;
        mapLoadedRef.current = false;
        map.current.remove();
        map.current = null;
      }
    };
  }, [onMapReady, mapRetry]);

  const updateDeliveryPins = useCallback((currentOrders = useStore.getState().orders) => {
    if (!map.current?.isStyleLoaded()) return;
    setDeliveryPinData(map.current, currentOrders);
  }, []);

  const fitRoutes = useCallback(() => {
    if (!map.current) return;
    const coordinates = useStore.getState().orders
      .filter(order => !['delivered', 'failed', 'cancelled'].includes(order.status))
      .flatMap(order => [order.pickup?.location?.coordinates, order.delivery?.location?.coordinates])
      .filter(isCoordinate);
    if (!coordinates.length) return;
    if (coordinates.length === 1) {
      map.current.flyTo({ center: coordinates[0], zoom: 13, pitch: 0, bearing: 0, duration: 900 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach(point => bounds.extend(point));
    map.current.fitBounds(bounds, {
      padding: { top: 110, right: 48, bottom: 90, left: window.innerWidth > 700 ? 510 : 48 },
      maxZoom: 11.2,
      pitch: 0,
      bearing: 0,
      duration: 900
    });
  }, []);

  useEffect(() => {
    if (mapStatus !== 'ready' || fleetFittedRef.current || !orders.length) return;
    fitRoutes();
    fleetFittedRef.current = true;
  }, [mapStatus, orders.length, fitRoutes]);

  useEffect(() => {
    updateDeliveryPins(orders);
  }, [orders, updateDeliveryPins]);

  // Update geofences
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;
    const source = map.current.getSource('geofences');
    if (!source) return;

    const features = geofences.map(gf => ({
      type: 'Feature',
      geometry: gf.geometry,
      properties: {
        name: gf.name,
        color: gf.color || '#f97316',
        opacity: gf.opacity || 0.15
      }
    }));

    source.setData({ type: 'FeatureCollection', features });
  }, [geofences]);

  // FlyTo trigger
  useEffect(() => {
    if (!flyToTarget || !map.current) return;
    map.current.flyTo({
      center: flyToTarget.center || flyToTarget,
      zoom: flyToTarget.zoom || 16,
      pitch: flyToTarget.pitch || 60,
      bearing: flyToTarget.bearing || -20,
      duration: 1500,
      essential: true
    });
    flyTo(null);
  }, [flyToTarget, flyTo]);

  useEffect(() => {
    const coordinates = playbackPosition?.coordinates;
    if (!map.current || !Array.isArray(coordinates) || coordinates.length !== 2 ||
      coordinates.some(value => !Number.isFinite(Number(value)))) {
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      return;
    }
    if (!playbackMarkerRef.current) {
      const element = createVehicleMarker({ vehicleId: `REPLAY · ${playbackPosition.vehicleId || 'VEHICLE'}` }, '#f97316', 0);
      playbackMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(coordinates)
        .addTo(map.current);
    }
    playbackMarkerRef.current.setLngLat(coordinates);
  }, [playbackPosition]);

  useEffect(() => {
    if (!map.current) return;
    map.current.getCanvas().style.cursor = mapMode === 'geofence-draw' ? 'crosshair' : '';
  }, [mapMode]);

  return (
    <div className="map-container">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <button className="map-fit-button" onClick={fitRoutes} aria-label="Fit delivery locations in map">
        Fit deliveries
      </button>
      {mapStatus === 'loading' && <div className="map-status glass-card-sm"><span className="spinner spinner-sm" /> Loading Bengaluru map…</div>}
      {mapStatus === 'error' && <div className="map-status map-status-error glass-card-sm" role="status">
        <span>Map tiles could not be loaded. Check your connection.</span>
        {mapError && <small>{mapError}</small>}
        <button className="btn btn-secondary btn-sm" onClick={() => {
          setMapStatus('loading');
          setMapError('');
          setMapRetry(retry => retry + 1);
        }}>Retry map</button>
      </div>}
    </div>
  );
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length === 2 &&
    value.every(coordinate => Number.isFinite(Number(coordinate))) &&
    Math.abs(Number(value[0])) <= 180 && Math.abs(Number(value[1])) <= 90;
}

function setDeliveryPinData(mapInstance, currentOrders) {
  const activeOrders = currentOrders.filter(order =>
    !['delivered', 'failed', 'cancelled'].includes(order.status)
  );
  const endpointFeatures = [];
  activeOrders.forEach(order => {
    const start = order.pickup?.location?.coordinates;
    const end = order.delivery?.location?.coordinates;
    if (!isCoordinate(start) || !isCoordinate(end)) return;
    const color = order.isDelayed ? '#ef4444' : order.status === 'in_transit' ? '#f97316' : '#3b82f6';
    endpointFeatures.push(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: start },
        properties: { orderId: order.orderId, address: order.pickup.address, endpoint: 'Pickup', status: order.status, color: '#22c55e' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: end },
        properties: { orderId: order.orderId, address: order.delivery.address, endpoint: 'Delivery', status: order.status, color }
      }
    );
  });
  mapInstance.getSource('delivery-pins')?.setData({ type: 'FeatureCollection', features: endpointFeatures });
}

// Create glowing vehicle marker element
function createVehicleMarker(vehicle, color, heading) {
  const safeColor = /^#[\da-f]{6}$/i.test(color) ? color : '#f97316';
  const safeVehicleId = escapeHtml(vehicle.vehicleId || 'V');
  const el = document.createElement('div');
  el.className = 'vehicle-marker';
  el.innerHTML = `
    <div class="vehicle-pulse" style="background:${safeColor}"></div>
    <div class="vehicle-icon" style="transform:rotate(${heading}deg)">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="12" fill="${safeColor}" fill-opacity="0.15"/>
        <circle cx="14" cy="14" r="8" fill="${safeColor}"/>
        <circle cx="14" cy="14" r="4" fill="white"/>
        <path d="M14 4 L18 14 L14 11 L10 14 Z" fill="white" fill-opacity="0.9"/>
      </svg>
    </div>
    <div class="vehicle-label" style="border-color:${safeColor}">
      ${safeVehicleId}
    </div>
  `;
  el.style.setProperty('--vehicle-color', safeColor);
  return el;
}
