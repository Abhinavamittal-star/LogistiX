import React from 'react';
import useStore from '../store';

const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

export default function ToastContainer() {
  const { toasts, removeToast } = useStore();
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type || 'info'} fade-in`}>
          <span>{ICONS[t.type] || 'ℹ️'}</span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
