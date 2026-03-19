'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { briefingCache } from '@/lib/briefingCache';
import styles from './welcome.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function WelcomePage() {
  const router  = useRouter();
  const [sending,       setSending]       = useState(false);
  const [sendResult,    setSendResult]    = useState(null); // 'sent' | 'error'
  const [sendChannel,   setSendChannel]   = useState(null); // 'email' | 'whatsapp'
  const [prefetchDone,  setPrefetchDone]  = useState(false);

  // ── Background briefing pre-fetch ─────────────────────────────────────────
  // Start fetching the briefing immediately so the dashboard loads instantly.
  useEffect(() => {
    const prefetch = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${BACKEND()}/api/briefing`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          briefingCache.set(data);
          setPrefetchDone(true);
        }
      } catch { /* non-fatal — dashboard has its own fetch on mount */ }
    };
    prefetch();
  }, []);

  // ── Send preview to user's configured channel ─────────────────────────────
  const handlePreview = async () => {
    setSending(true);
    setSendResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${BACKEND()}/api/send-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        // No briefing payload — backend fetches fresh for new users
        body: JSON.stringify({ briefing: briefingCache.data || null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send preview');

      setSendChannel(data.channel || 'email');
      setSendResult('sent');
    } catch (err) {
      console.error('Preview send failed:', err.message);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 3);
  const trialEndStr = trialEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="auth-page">
      <div className={styles.welcomeCard}>
        <div className={styles.checkmark}>
          <svg viewBox="0 0 52 52" width="64" height="64">
            <circle cx="26" cy="26" r="25" fill="none" stroke="var(--accent-green)" strokeWidth="2" />
            <path fill="none" stroke="var(--accent-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" style={{ strokeDasharray: 100, animation: 'checkmark 0.6s ease 0.3s forwards', strokeDashoffset: 100 }} />
          </svg>
        </div>

        <h1 className={styles.title}>You&apos;re all set! ✓</h1>

        <div className={styles.trialBanner}>
          <div className={styles.trialIcon}>🎁</div>
          <div>
            <strong>Your 3-day Pro trial is active</strong>
            <p>Full briefings · Command bar · Unlimited automations</p>
            <span className={styles.trialExpiry}>Trial ends: {trialEndStr}</span>
          </div>
        </div>

        <div className={styles.nextStep}>
          <div className={styles.nextStepIcon}>📬</div>
          <p>Your first briefing arrives <strong>tomorrow at 8:00 AM</strong> in your inbox.</p>
        </div>

        {/* Send preview result */}
        {sendResult === 'sent' && (
          <div style={{
            padding: '12px 16px', marginBottom: '16px',
            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
            borderRadius: '10px', fontSize: '0.85rem', color: 'var(--accent-green)',
            textAlign: 'center',
          }}>
            ✅ Preview sent via {sendChannel === 'telegram' ? 'Telegram' : 'email'}!
          </div>
        )}
        {sendResult === 'error' && (
          <div style={{
            padding: '12px 16px', marginBottom: '16px',
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px', fontSize: '0.85rem', color: '#ef4444',
            textAlign: 'center',
          }}>
            ⚠️ Could not send preview. Check your connection and try again.
          </div>
        )}

        <div className={styles.actions}>
          {sendResult !== 'sent' && (
            <button
              onClick={handlePreview}
              disabled={sending}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {sending ? 'Sending Preview…' : 'Send me a preview now'}
            </button>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="btn btn-ghost"
            style={{ width: '100%', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            {prefetchDone ? 'Dashboard is ready →' : 'Go to Dashboard →'}
          </button>
        </div>

        <div className={styles.features}>
          <h4>What you can do during your trial:</h4>
          <div className={styles.featuresList}>
            <div className={styles.featureItem}><span>📅</span><span>Full morning briefings with meeting context</span></div>
            <div className={styles.featureItem}><span>💬</span><span>Natural language commands across Gmail, Drive &amp; Calendar</span></div>
            <div className={styles.featureItem}><span>🔄</span><span>Create unlimited automation rules</span></div>
            <div className={styles.featureItem}><span>✈️</span><span>Telegram delivery — briefings straight to your phone (Pro/Team)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
