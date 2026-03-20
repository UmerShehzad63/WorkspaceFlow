'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './settings.module.css';

// Generate beautifully formatted timezones (e.g. "America/New_York" -> "America - New York")
const rawTimezones = typeof Intl !== 'undefined' && Intl.supportedValuesOf 
  ? Intl.supportedValuesOf('timeZone') 
  : ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

const TIMEZONES = rawTimezones.map(tz => {
  const parts = tz.split('/');
  const region = parts[0].replace(/_/g, ' ');
  const city = parts.slice(1).join(' - ').replace(/_/g, ' ');
  return {
    value: tz,
    label: city ? `${region} - ${city}` : region
  };
}).sort((a, b) => a.label.localeCompare(b.label));

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
];

export default function SettingsPage() {
  const [time, setTime] = useState('08:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [delivery, setDelivery] = useState('email');
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [managingPlan, setManagingPlan] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        
        // Fetch saved profile settings
        const { data: profile } = await supabase
          .from('profiles')
          .select('briefing_time, timezone, delivery_method')
          .eq('id', session.user.id)
          .single();
          
        if (profile) {
          if (profile.briefing_time) setTime(profile.briefing_time);
          if (profile.timezone) setTimezone(profile.timezone);
          if (profile.delivery_method) setDelivery(profile.delivery_method);
        }
      }
    };
    fetchUserAndProfile();
  }, []);

  const handleManagePlan = async () => {
    setManagingPlan(true);
    const res = await fetch('/api/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Could not open billing portal. Please contact support.');
      setManagingPlan(false);
    }
  };

  const toggleDay = (day) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    
    await supabase.from('profiles').update({
      briefing_time: time,
      timezone: timezone,
      delivery_method: delivery
    }).eq('id', user.id);
    
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your briefing preferences and account.</p>
      </div>

      {/* Connected Account */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>📧 Connected Account</h3>
        <div className={styles.accountCard}>
          <div className={styles.accountInfo}>
            <div className={styles.accountAvatar}>{user?.email?.charAt(0).toUpperCase() || '?'}</div>
            <div>
              <strong>{user?.email || 'Loading...'}</strong>
              <span>Connected via Google OAuth · Read-only access</span>
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}>Disconnect</button>
        </div>
      </div>

      {/* Briefing Time */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabelRow}>
          <h3 className={styles.settingsLabel}>⏰ Briefing Time</h3>
          <span className="badge badge-pro" style={{ fontSize: '0.6rem' }}>PRO</span>
        </div>
        <div className={styles.timeRow}>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="input"
            style={{ maxWidth: '160px' }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>in</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="select"
            style={{ maxWidth: '240px' }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>

        </div>
      </div>

      {/* Delivery Method */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>📬 Delivery Method</h3>
        <div className="radio-group">
          <label
            className={`radio-label ${delivery === 'email' ? 'selected' : ''}`}
            onClick={() => setDelivery('email')}
          >
            <div className="radio-dot" />
            <div>
              <strong style={{ display: 'block', fontSize: '0.88rem' }}>Email</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>to {user?.email || 'your email'}</span>
            </div>
          </label>
          <label
            className={`radio-label ${delivery === 'telegram' ? 'selected' : ''}`}
            onClick={() => setDelivery('telegram')}
          >
            <div className="radio-dot" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.88rem' }}>Telegram</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Connect Telegram →</span>
              </div>
              <span className="badge badge-pro" style={{ marginLeft: 'auto', fontSize: '0.6rem' }}>PRO</span>
            </div>
          </label>
        </div>
      </div>

      {/* Schedule */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabelRow}>
          <h3 className={styles.settingsLabel}>📅 Schedule</h3>
          <span className="badge badge-pro" style={{ fontSize: '0.6rem' }}>PRO</span>
        </div>
        <div className="checkbox-group">
          {DAYS.map(day => (
            <label
              key={day.value}
              className={`checkbox-label ${selectedDays.includes(day.value) ? 'checked' : ''}`}
              onClick={() => toggleDay(day.value)}
            >
              <div className="checkbox-indicator">
                <svg viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              {day.label}
            </label>
          ))}
        </div>
      </div>

      {/* Pause */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>⏸ Pause Briefings</h3>
        <div className={styles.pauseRow}>
          <div className="toggle-wrapper" onClick={() => setPaused(!paused)}>
            <div className={`toggle ${paused ? 'active' : ''}`} />
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              {paused ? 'Briefings paused' : 'Briefings active'}
            </span>
          </div>
          {paused && (
            <div style={{ marginTop: '12px' }}>
              <label className="input-label">Resume on:</label>
              <input type="date" className="input" style={{ maxWidth: '200px' }} />
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className={styles.saveBar}>
        <button className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`} onClick={handleSave}>
          {saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.planCard}>
          <div className={styles.planInfo}>
            <span className={styles.planIcon}>💎</span>
            <div>
              <strong>Manage Your Subscription</strong>
              <p>View invoices, change plan, or cancel via Stripe Billing Portal</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href="/pricing" className="btn btn-primary">
              View Plans
            </a>
            <button
              onClick={handleManagePlan}
              disabled={managingPlan}
              className="btn btn-secondary"
            >
              {managingPlan ? 'Opening Portal...' : 'Manage Billing'}
            </button>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>💬 Support</h3>
        <div className={styles.planCard}>
          <div className={styles.planInfo}>
            <span className={styles.planIcon}>✉️</span>
            <div>
              <strong>Contact Us</strong>
              <p>Have a question or need help? We&apos;re here for you.</p>
            </div>
          </div>
          <a
            href="mailto:support@workspaceflow.app"
            className="btn btn-secondary"
            style={{ whiteSpace: 'nowrap' }}
          >
            Email Support
          </a>
        </div>
      </div>
    </div>
  );
}
