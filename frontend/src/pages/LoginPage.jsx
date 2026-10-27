import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store';
import api from '../api';
import './LoginPage.css';

const DEMO_CREDENTIALS = [
  { role: 'dispatcher', email: 'dispatcher@demo.com', icon: '🎯', label: 'Dispatcher', desc: 'Full dashboard access' },
  { role: 'driver', email: 'driver@demo.com', icon: '🚗', label: 'Driver', desc: 'Mobile delivery app' },
  { role: 'customer', email: 'customer@demo.com', icon: '📦', label: 'Customer', desc: 'Track your order' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth, addToast } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [role, setRole] = useState('customer');
  const [dispatcherRegistrationCode, setDispatcherRegistrationCode] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const [storageMode, setStorageMode] = useState('checking');
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [dispatcherRegistrationEnabled, setDispatcherRegistrationEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/health'), api.get('/auth/registration-options')])
      .then(data => {
        if (!active) return;
        setStorageMode(data[0].storageMode);
        setDemoAvailable(Boolean(data[0].demoAvailable));
        setDispatcherRegistrationEnabled(Boolean(data[1].dispatcherRegistrationEnabled));
      })
      .catch(() => {
        if (active) setStorageMode('unavailable');
      });
    return () => { active = false; };
  }, []);

  const handleDemoLogin = async (cred) => {
    setEmail(cred.email);
    setPassword('demo123');
    await doLogin(cred.email, 'demo123');
  };

  const doLogin = async (emailVal, passVal) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/auth/login', { email: emailVal || email, password: passVal || password });
      setAuth(data.user, data.accessToken, data.refreshToken);
      addToast({ type: 'success', message: `Welcome back, ${data.user.name}! 🎉` });
      if (data.user.role === 'dispatcher') navigate('/dashboard');
      else if (data.user.role === 'driver') navigate('/driver');
      else navigate('/customer');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'register') {
      setLoading(true);
      setError('');
      try {
        const data = await api.post('/auth/register', {
          name, email, password, role,
          ...(role === 'dispatcher' ? { dispatcherRegistrationCode } : {})
        });
        setAuth(data.user, data.accessToken, data.refreshToken);
        addToast({ type: 'success', message: `Account created! Welcome ${data.user.name}` });
        if (data.user.role === 'dispatcher') navigate('/dashboard');
        else if (data.user.role === 'driver') navigate('/driver');
        else navigate('/customer');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      await doLogin();
    }
  };

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-grid" />
        <div className="login-bg-glow" />
        <div className="login-bg-glow2" />
      </div>

      {/* Floating map preview dots */}
      <div className="login-map-preview" aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={`map-dot map-dot-${i % 4}`} style={{
            left: `${10 + (i * 7.5)}%`,
            top: `${20 + Math.sin(i) * 30}%`,
            animationDelay: `${i * 0.3}s`
          }} />
        ))}
        {/* Route lines */}
        <svg className="route-lines" viewBox="0 0 800 400" preserveAspectRatio="none">
          <path d="M80,200 Q200,100 320,180 Q440,260 560,150 Q680,40 760,100" stroke="rgba(249,115,22,0.15)" strokeWidth="2" fill="none" strokeDasharray="8,6" />
          <path d="M80,280 Q200,350 320,300 Q440,250 560,320 Q680,380 760,340" stroke="rgba(59,130,246,0.12)" strokeWidth="2" fill="none" strokeDasharray="8,6" />
        </svg>
      </div>

      <div className="login-container">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <span className="login-logo-icon">⬡</span>
            <span className="login-logo-dot" />
          </div>
          <h1 className="login-title">LogistiX</h1>
          <p className="login-subtitle">Control Tower</p>
        </div>

        {/* Card */}
        <div className="login-card glass-card fade-in">
          {/* Tab switcher */}
          <div className="login-tabs">
            <button
              id="tab-login"
              className={`login-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); }}
            >
              Sign In
            </button>
            <button
              id="tab-register"
              className={`login-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); }}
            >
              Register
            </button>
          </div>

          {mode === 'login' && (
            <div className="demo-logins">
              <button
                type="button"
                className="demo-toggle"
                aria-expanded={demoOpen}
                onClick={() => setDemoOpen(open => !open)}
              >
                {demoOpen ? 'Hide demo' : 'Explore demo'}
              </button>
              {demoOpen && (
                demoAvailable ? (
                  <>
                    <p className="demo-note">Sandbox data is in memory and resets when the server restarts.</p>
                    <div className="demo-grid">
                      {DEMO_CREDENTIALS.map(cred => (
                        <button
                          key={cred.role}
                          id={`demo-${cred.role}`}
                          className="demo-card"
                          onClick={() => handleDemoLogin(cred)}
                          disabled={loading}
                        >
                          <span className="demo-icon">{cred.icon}</span>
                          <div>
                            <div className="demo-role">{cred.label}</div>
                            <div className="demo-desc">{cred.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="demo-note" role="status">
                    {storageMode === 'mongodb'
                      ? 'Demo sandbox is disabled on this production database. Sign in with your organization account.'
                      : 'Demo status is unavailable. Check that the backend is running, then try again.'}
                  </p>
                )
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label" htmlFor="name">Full Name</label>
                <input
                  id="name"
                  className="input"
                  type="text"
                  placeholder="John Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label className="input-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder={mode === 'register' && role === 'dispatcher' ? 'At least 12 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === 'register' && role === 'dispatcher' ? 12 : 6}
              />
              {mode === 'register' && role === 'dispatcher' && (
                <small className="demo-note">Dispatcher passwords must contain at least 12 characters.</small>
              )}
            </div>

            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label" htmlFor="role">Role</label>
                <select id="role" className="input" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="customer">Customer</option>
                  <option value="driver">Driver</option>
                  <option value="dispatcher">Dispatcher</option>
                </select>
              </div>
            )}

            {mode === 'register' && role === 'dispatcher' && (
              <>
                <div className="input-group">
                  <label className="input-label" htmlFor="dispatcher-registration-code">Dispatcher registration code</label>
                  <input
                    id="dispatcher-registration-code"
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={dispatcherRegistrationCode}
                    onChange={event => setDispatcherRegistrationCode(event.target.value)}
                    required
                  />
                </div>
                <p className="demo-note" role="status">
                  {dispatcherRegistrationEnabled
                    ? 'A dispatcher registration code from your administrator is required. Dispatcher accounts use MongoDB.'
                    : 'Dispatcher registration is not enabled. Ask your administrator to configure DISPATCHER_REGISTRATION_CODE on the backend.'}
                </p>
              </>
            )}

            {error && (
              <div className="login-error" role="alert">
                <span>⚠️</span> {error}
              </div>
            )}

            <button id="submit-btn" type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%' }}>
              {loading ? (
                <><span className="spinner spinner-sm" /> Processing...</>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

        </div>

        <p className="login-footer">
          Real-time logistics • Route optimization • Geofencing
        </p>
      </div>
    </div>
  );
}
