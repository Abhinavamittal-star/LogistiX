import React from 'react';
import useStore from '../store';
import './AlertsPanel.css';

const ALERT_CONFIG = {
  geofence: { icon: '🚧', color: 'var(--yellow)', label: 'Geofence' },
  delay: { icon: '⏰', color: 'var(--red)', label: 'Delay' },
  delivered: { icon: '✅', color: 'var(--green)', label: 'Delivered' },
  warning: { icon: '⚠️', color: 'var(--yellow)', label: 'Warning' },
  danger: { icon: '🔴', color: 'var(--red)', label: 'Critical' },
  info: { icon: 'ℹ️', color: 'var(--blue-light)', label: 'Info' },
};

function AlertItem({ alert }) {
  const cfg = ALERT_CONFIG[alert.type] || ALERT_CONFIG[alert.severity] || ALERT_CONFIG.info;
  const time = alert.timestamp ? new Date(alert.timestamp) : new Date();
  const timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`alert-item fade-in ${alert.read ? 'alert-item--read' : ''}`}
      style={{ borderLeftColor: cfg.color }}>
      <div className="alert-icon">{cfg.icon}</div>
      <div className="alert-content">
        <div className="alert-message text-sm">{alert.message}</div>
        {alert.vehicleId && (
          <div className="text-xs text-muted font-mono">{alert.vehicleId}</div>
        )}
      </div>
      <div className="alert-time text-xs text-muted font-mono">{timeStr}</div>
    </div>
  );
}

export default function AlertsPanel() {
  const { alerts, unreadAlerts, markAlertsRead } = useStore();

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        {unreadAlerts > 0 && (
          <span className="unread-badge">{unreadAlerts} new</span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={markAlertsRead}>Mark all read</button>
      </div>

      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <div className="text-secondary text-sm">No alerts yet</div>
            <div className="text-muted text-xs">Alerts appear here in real-time</div>
          </div>
        ) : (
          alerts.map((alert, i) => (
            <AlertItem key={alert.id || alert._id || i} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
}
