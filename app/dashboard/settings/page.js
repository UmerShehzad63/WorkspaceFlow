'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './settings.module.css';

export default function SettingsPage() {
  const [managingPlan, setManagingPlan] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
  }, []);

  const handleManagePlan = async () => {
    setManagingPlan(true);
    const res = await fetch('/api/portal', { method: 'POST' });
    if (res.status === 404) {
      // No subscription yet — send to pricing page
      window.location.href = '/pricing';
      return;
    }
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Could not open billing portal. Please try again or contact support.');
      setManagingPlan(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account and subscription.</p>
      </div>

      {/* Connected Account */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>📧 Connected Account</h3>
        <div className={styles.accountCard}>
          <div className={styles.accountInfo}>
            <div className={styles.accountAvatar}>{user?.email?.charAt(0).toUpperCase() || '?'}</div>
            <div>
              <strong>{user?.email || 'Loading...'}</strong>
              <span>Connected via Google OAuth</span>
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}>Disconnect</button>
        </div>
      </div>

      {/* Subscription */}
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
            <a href="/pricing" className="btn btn-primary">View Plans</a>
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
            href="mailto:umershehzad.at1863@gmail.com"
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
