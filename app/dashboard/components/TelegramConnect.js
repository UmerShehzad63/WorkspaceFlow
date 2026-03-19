'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './TelegramConnect.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function TelegramConnect() {
  const [status,  setStatus]  = useState(null);  // null = loading
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${BACKEND()}/api/telegram/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setStatus(await res.json());
        else        setStatus({ connected: false });
      } catch {
        setStatus({ connected: false });
      }
    };
    load();
  }, []);

  const handleDisconnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      await fetch(`${BACKEND()}/api/telegram/disconnect`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      setStatus({ connected: false });
    } catch {
      setMsg({ ok: false, text: 'Disconnect failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${BACKEND()}/api/telegram/test`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test failed');
      setMsg({ ok: true, text: 'Test sent!' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Don't render while loading initial status
  if (status === null) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.tgIcon}>✈️</span>
        <span className={styles.label}>Telegram</span>
        <span className={`${styles.badge} ${status.connected ? styles.badgeOn : styles.badgeOff}`}>
          {status.connected ? 'On' : 'Off'}
        </span>
      </div>

      {status.connected ? (
        <>
          {status.username && (
            <p className={styles.username}>@{status.username}</p>
          )}
          <div className={styles.btnRow}>
            <button onClick={handleTest} disabled={loading} className={styles.testBtn}>
              {loading ? '…' : 'Test'}
            </button>
            <button onClick={handleDisconnect} disabled={loading} className={styles.disconnectBtn}>
              {loading ? '…' : 'Disconnect'}
            </button>
          </div>
        </>
      ) : (
        <Link href="/dashboard/telegram" className={styles.connectBtn}>
          Connect Telegram
        </Link>
      )}

      {msg && (
        <p className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</p>
      )}
    </div>
  );
}
