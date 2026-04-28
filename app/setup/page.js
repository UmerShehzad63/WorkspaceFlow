'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './setup.module.css';

const rawTimezones = typeof Intl !== 'undefined' && Intl.supportedValuesOf
  ? Intl.supportedValuesOf('timeZone')
  : ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

const TIMEZONES = rawTimezones
  .map((tz) => {
    const parts = tz.split('/');
    const region = parts[0].replace(/_/g, ' ');
    const city = parts.slice(1).join(' - ').replace(/_/g, ' ');
    return {
      value: tz,
      label: city ? `${region} - ${city}` : region,
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export default function SetupPage() {
  const router = useRouter();
  const [time, setTime] = useState('08:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [searchValue, setSearchValue] = useState('');
  const [delivery, setDelivery] = useState('email');
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useState(() => {
    import('@/lib/supabase').then(({ supabase: sb }) => {
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) setUserEmail(session.user.email);
      });
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('profiles')
        .update({
          briefing_time: time,
          timezone,
          delivery_method: delivery,
          setup_completed: true,
        })
        .eq('id', session.user.id);
    }

    router.push('/welcome');
  };

  return (
    <div className="auth-page">
      <div className={styles.setupCard}>
        <div className={styles.progress}>
          <div className={styles.progressStep}>
            <div className={`${styles.progressDot} ${styles.completed}`}>✓</div>
            <span>Connect</span>
          </div>
          <div className={styles.progressLine} />
          <div className={styles.progressStep}>
            <div className={`${styles.progressDot} ${styles.active}`}>2</div>
            <span>Configure</span>
          </div>
          <div className={styles.progressLine} />
          <div className={styles.progressStep}>
            <div className={styles.progressDot}>3</div>
            <span>Done</span>
          </div>
        </div>

        <h1 className={styles.title}>Quick Setup</h1>
        <p className={styles.subtitle}>Choose when and where WorkspaceFlow should deliver your daily automation briefing.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className="input-label">When should we send your briefing?</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">Your timezone</label>
            <input
              list="timezone-options"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                const match = TIMEZONES.find((tz) => tz.label === e.target.value);
                if (match) setTimezone(match.value);
              }}
              className="input"
              placeholder="Search by region or city"
              autoComplete="off"
            />
            <datalist id="timezone-options">
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.label}>{tz.value}</option>
              ))}
            </datalist>
            <span className={styles.hint}>Selected timezone: {timezone}</span>
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">How should we deliver it?</label>
            <div className="radio-group">
              <label className={`radio-label ${delivery === 'email' ? 'selected' : ''}`} onClick={() => setDelivery('email')}>
                <div className="radio-dot" />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem' }}>Email</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {userEmail ? `Delivered to ${userEmail}` : 'Delivered to your email'}
                  </span>
                </div>
              </label>
              <label className={`radio-label ${delivery === 'telegram' ? 'selected' : ''}`} onClick={() => setDelivery('telegram')}>
                <div className="radio-dot" />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem' }}>Telegram</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Connect the bot from the dashboard sidebar after setup
                  </span>
                </div>
              </label>
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '8px', border: 'none', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : 'Finish setup →'}
          </button>
          <p className={styles.trialNote}>You can change briefing time, timezone, and delivery later in Settings.</p>
        </form>
      </div>
    </div>
  );
}
