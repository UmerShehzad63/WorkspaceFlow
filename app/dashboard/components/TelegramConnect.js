'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './TelegramConnect.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function TelegramConnect() {
  // null = still loading
  const [status,  setStatus]  = useState(null);
  const [code,    setCode]    = useState(null);   // verification code shown to user
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState(null);   // { ok, text }
  const pollRef = useRef(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const fetchStatus = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${BACKEND()}/api/telegram/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        // free plan — don't block the sidebar, just hide widget
        setStatus({ locked: true });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.connected) stopPolling();
      }
    } catch { /* silent */ }
  };

  // Poll every 3 s while we're waiting for the user to send /verify
  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatus, 3000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    fetchStatus();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume polling if we have a pending code on mount
  useEffect(() => {
    if (status?.pending && !status?.connected) startPolling();
    if (status?.connected) stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.pending, status?.connected]);

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${BACKEND()}/api/telegram/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate code');
      setCode(data.code);
      setStatus((s) => ({ ...s, pending: true, connected: false }));
      startPolling();
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
      await fetch(`${BACKEND()}/api/telegram/disconnect`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus({ connected: false, pending: false, username: null });
      setCode(null);
      stopPolling();
    } catch {
      setMsg({ ok: false, text: 'Disconnect failed. Try again.' });
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
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test failed');
      setMsg({ ok: true, text: 'Test message sent!' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Still loading or free plan (hide widget)
  if (status === null || status?.locked) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.tgIcon}>✈️</span>
        <span className={styles.label}>Telegram</span>
        <span className={`${styles.badge} ${status.connected ? styles.badgeOn : styles.badgeOff}`}>
          {status.connected ? 'On' : status.pending ? 'Pending' : 'Off'}
        </span>
      </div>

      {/* ── Connected ── */}
      {status.connected && (
        <>
          {status.username && (
            <p className={styles.username}>@{status.username}</p>
          )}
          <div className={styles.btnRow}>
            <button
              onClick={handleTest}
              disabled={loading}
              className={styles.testBtn}
            >
              {loading ? '…' : 'Test'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className={styles.disconnectBtn}
            >
              {loading ? '…' : 'Disconnect'}
            </button>
          </div>
        </>
      )}

      {/* ── Pending verification ── */}
      {!status.connected && status.pending && code && (
        <div className={styles.pendingBox}>
          <p className={styles.pendingLabel}>Send this to your bot:</p>
          <div className={styles.codeBox}>
            <code className={styles.verifyCmd}>/verify {code}</code>
          </div>
          <p className={styles.pendingHint}>Waiting for verification…</p>
        </div>
      )}

      {/* ── Disconnected ── */}
      {!status.connected && !status.pending && (
        <button
          onClick={handleConnect}
          disabled={loading}
          className={styles.connectBtn}
        >
          {loading ? 'Generating…' : 'Connect Telegram'}
        </button>
      )}

      {/* ── Cancel pending ── */}
      {!status.connected && status.pending && (
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className={styles.cancelBtn}
        >
          Cancel
        </button>
      )}

      {msg && (
        <p className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</p>
      )}
    </div>
  );
}
