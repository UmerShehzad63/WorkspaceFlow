'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const BOT_USERNAME = 'workspace_flow_bot';

export default function TelegramPage() {
  const [userId,    setUserId]    = useState(null);
  const [status,    setStatus]    = useState(null);  // null = loading
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState(null);  // { ok, text }

  // Load user ID and connection status on mount
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      try {
        const res = await fetch(`${BACKEND()}/api/telegram/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          setStatus(await res.json());
        } else {
          // 403 (free plan) or any error — still show the button, just no status
          setStatus({ connected: false });
        }
      } catch {
        setStatus({ connected: false });
      }
    };
    init();
  }, []);

  const telegramUrl = userId
    ? `https://t.me/${BOT_USERNAME}?start=${userId}`
    : `https://t.me/${BOT_USERNAME}`;

  const handleOpenBot = () => {
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
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
      const res  = await fetch(`${BACKEND()}/api/telegram/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test failed');
      setMsg({ ok: true, text: 'Test message sent to your Telegram!' });
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
        <p>Get your daily briefing delivered to Telegram.</p>
      </div>

      {/* Main card */}
      <div style={{ maxWidth: '520px' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>

          {/* Icon */}
          <div style={{ fontSize: '2.8rem', marginBottom: '16px' }}>✈️</div>

          {/* Headline */}
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            {isConnected ? 'Telegram Connected' : 'Connect Telegram'}
          </h2>

          {/* Description */}
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '28px' }}>
            {isConnected
              ? `Briefings are being sent to ${status.username ? `@${status.username}` : 'your Telegram'}.`
              : 'Click the button below to open the WorkspaceFlow bot on Telegram. It will automatically link your account.'}
          </p>

          {/* Status badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 14px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
              background: isConnected ? 'rgba(52,211,153,0.1)'  : 'rgba(255,255,255,0.05)',
              border:     isConnected ? '1px solid rgba(52,211,153,0.25)' : '1px solid var(--border-color)',
              color:      isConnected ? 'var(--accent-green)' : 'var(--text-muted)',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? 'var(--accent-green)' : 'var(--text-muted)', display: 'inline-block' }} />
              {status === null ? 'Checking…' : isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {/* Primary action */}
          {!isConnected && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '0.95rem', padding: '14px 20px', marginBottom: '12px' }}
              onClick={handleOpenBot}
            >
              Open Telegram Bot →
            </button>
          )}

          {/* Connected actions */}
          {isConnected && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '12px' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={handleTest}
                disabled={loading}
              >
                {loading ? '…' : '📩 Send Test Message'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                onClick={handleDisconnect}
                disabled={loading}
              >
                {loading ? '…' : 'Disconnect'}
              </button>
            </div>
          )}

          {/* Re-open bot link even when connected (for re-linking) */}
          {isConnected && (
            <button
              onClick={handleOpenBot}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.82rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Re-open bot
            </button>
          )}

          {/* Feedback message */}
          {msg && (
            <div style={{
              marginTop: '16px', padding: '10px 14px', borderRadius: '8px', fontSize: '0.84rem',
              background: msg.ok ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)',
              border:     msg.ok ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(239,68,68,0.2)',
              color:      msg.ok ? 'var(--accent-green)' : '#ef4444',
            }}>
              {msg.text}
            </div>
          )}
        </div>

        {/* How it works */}
        {!isConnected && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
              How it works
            </div>
            <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                'Click "Open Telegram Bot →" above.',
                'Telegram opens with @workspace_flow_bot — tap Start.',
                'Your account links automatically. No codes needed.',
                'Your morning briefing arrives each day at 8 AM.',
              ].map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
