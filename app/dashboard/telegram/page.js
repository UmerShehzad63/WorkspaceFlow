'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const BOT_USERNAME = 'workspace_flow_bot';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 120000;

export default function TelegramPage() {
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [polling, setPolling] = useState(false);

  const pollRef = useRef(null);
  const tokenRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  };

  const startPolling = () => {
    if (pollRef.current) return;
    setPolling(true);
    const stopAt = Date.now() + POLL_TIMEOUT;

    pollRef.current = setInterval(async () => {
      if (Date.now() > stopAt) {
        stopPolling();
        return;
      }
      try {
        const res = await fetch(`${BACKEND()}/api/telegram/status`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            setStatus(data);
            setMsg({ ok: true, text: "Connected. You'll receive briefings here." });
            stopPolling();
          }
        }
      } catch {}
    }, POLL_INTERVAL);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      tokenRef.current = session.access_token;

      try {
        const res = await fetch(`${BACKEND()}/api/telegram/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        setStatus(res.ok ? await res.json() : { connected: false });
      } catch {
        setStatus({ connected: false });
      }
    };

    init();
    return stopPolling;
  }, []);

  const telegramUrl = userId ? `https://t.me/${BOT_USERNAME}?start=${userId}` : `https://t.me/${BOT_USERNAME}`;

  const handleOpenBot = () => {
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    if (!status?.connected) startPolling();
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${BACKEND()}/api/telegram/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setStatus({ connected: false });
      setMsg({ ok: true, text: 'Disconnected successfully.' });
    } catch {
      setMsg({ ok: false, text: 'Disconnect failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND()}/api/telegram/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test failed');
      setMsg({ ok: true, text: 'Test message sent to your Telegram.' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status?.connected;

  return (
    <div>
      <div className="page-header">
        <h1>Telegram</h1>
        <p>Send daily briefings and quick actions to Telegram.</p>
      </div>

      <div style={{ maxWidth: '520px' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: '16px' }}>✈️</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            {isConnected ? 'Telegram Connected' : 'Connect Telegram'}
          </h2>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '28px' }}>
            {isConnected
              ? `Briefings are being sent to ${status.username ? `@${status.username}` : 'your Telegram'}.`
              : 'Open the CouchMail bot on Telegram and it will link your account automatically.'}}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 14px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
              background: isConnected ? 'rgba(52,211,153,0.1)' : polling ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.05)',
              border: isConnected ? '1px solid rgba(52,211,153,0.25)' : polling ? '1px solid rgba(96,165,250,0.25)' : '1px solid var(--border-color)',
              color: isConnected ? 'var(--accent-green)' : polling ? 'var(--accent-blue)' : 'var(--text-muted)',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? 'var(--accent-green)' : polling ? 'var(--accent-blue)' : 'var(--text-muted)', display: 'inline-block' }} />
              {status === null ? 'Checking...' : isConnected ? 'Connected' : polling ? 'Waiting for link...' : 'Not connected'}
            </span>
          </div>

          {!isConnected && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '0.95rem', padding: '14px 20px', marginBottom: '12px' }}
              onClick={handleOpenBot}
            >
              {polling ? 'Waiting for Telegram... (click to retry)' : 'Open Telegram Bot →'}
            </button>
          )}

          {isConnected && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '12px' }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleTest} disabled={loading}>
                {loading ? '...' : 'Send Test Message'}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDisconnect} disabled={loading}>
                {loading ? '...' : 'Disconnect'}
              </button>
            </div>
          )}

          {isConnected && (
            <button
              onClick={handleOpenBot}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.82rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Re-open bot
            </button>
          )}

          {msg && (
            <div style={{
              marginTop: '16px', padding: '10px 14px', borderRadius: '8px', fontSize: '0.84rem',
              background: msg.ok ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)',
              border: msg.ok ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(239,68,68,0.2)',
              color: msg.ok ? 'var(--accent-green)' : '#ef4444',
            }}>
              {msg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
