'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './settings.module.css';

export default function SettingsPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account, connections, and automation workspace.</p>
      </div>

      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>Connected Account</h3>
        <div className={styles.accountCard}>
          <div className={styles.accountInfo}>
            <div className={styles.accountAvatar}>{user?.email?.charAt(0).toUpperCase() || '?'}</div>
            <div>
              <strong>{user?.email || 'Loading...'}</strong>
              <span>Connected via Google OAuth</span>
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.planCard}>
          <div className={styles.planInfo}>
            <span className={styles.planIcon}>⚡</span>
            <div>
              <strong>Automation Workspace</strong>
              <p>All core automation features are enabled. Use Commands, Automations, and Telegram from the dashboard.</p>
            </div>
          </div>
          <a href="/dashboard/rules" className="btn btn-primary">Open Automations</a>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3 className={styles.settingsLabel}>Support</h3>
        <div className={styles.planCard}>
          <div className={styles.planInfo}>
            <span className={styles.planIcon}>✉️</span>
            <div>
              <strong>Contact Us</strong>
              <p>Need help tuning a workflow or fixing an integration? Reach out directly.</p>
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
