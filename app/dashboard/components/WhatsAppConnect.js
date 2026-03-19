'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './WhatsAppConnect.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function WhatsAppConnect() {
  // null = still loading; object = loaded
  const [status,  setStatus]  = useState(null);
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState(null); // { ok, text }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  // Load connection status once on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res  = await fetch(`${BACKEND()}/api/whatsapp/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setStatus(await res.json());
      } catch { /* silent — don't block the sidebar */ }
    })();
  }, []);

  const handleConnect = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${BACKEND()}/api/whatsapp/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Connection failed');
      setStatus({ connected: true, phone: data.phone });
      setPhone('');
      setMsg({ ok: true, text: 'Connected! Check WhatsApp.' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      await fetch(`${BACKEND()}/api/whatsapp/disconnect`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus({ connected: false, phone: null });
    } catch {
      setMsg({ ok: false, text: 'Disconnect failed. Try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Still loading — render nothing to avoid sidebar flicker
  if (status === null) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.waIcon}>📱</span>
        <span className={styles.label}>WhatsApp</span>
        <span className={`${styles.badge} ${status.connected ? styles.badgeOn : styles.badgeOff}`}>
          {status.connected ? 'On' : 'Off'}
        </span>
      </div>

      {status.connected ? (
        <>
          <p className={styles.phone}>{status.phone}</p>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className={styles.disconnectBtn}
          >
            {loading ? '…' : 'Disconnect'}
          </button>
        </>
      ) : (
        <>
          <input
            type="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            className={styles.input}
          />
          <button
            onClick={handleConnect}
            disabled={loading || !phone.trim()}
            className={styles.connectBtn}
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </>
      )}

      {msg && (
        <p className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</p>
      )}
    </div>
  );
}
