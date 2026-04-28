'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { briefingCache } from '@/lib/briefingCache';
import styles from './welcome.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function WelcomePage() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendChannel, setSendChannel] = useState(null);
  const [prefetchDone, setPrefetchDone] = useState(false);

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
      } catch {}
    };
    prefetch();
  }, []);

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
        body: JSON.stringify({ briefing: briefingCache.data || null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send preview');

      setSendChannel(data.channel || 'email');
      setSendResult('sent');
    } catch {
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className={styles.welcomeCard}>
        <div className={styles.checkmark}>
          <svg viewBox="0 0 52 52" width="64" height="64">
            <circle cx="26" cy="26" r="25" fill="none" stroke="var(--accent-green)" strokeWidth="2" />
            <path fill="none" stroke="var(--accent-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" style={{ strokeDasharray: 100, animation: 'checkmark 0.6s ease 0.3s forwards', strokeDashoffset: 100 }} />
          </svg>
        </div>

        <h1 className={styles.title}>WorkspaceFlow is ready</h1>

        <div className={styles.trialBanner}>
          <div className={styles.trialIcon}>⚡</div>
          <div>
            <strong>Your automation workspace is active</strong>
            <p>Briefings, command bar, automations, and Telegram delivery are ready to use.</p>
            <span className={styles.trialExpiry}>Next step: send a preview or jump into the dashboard</span>
          </div>
        </div>

        <div className={styles.nextStep}>
          <div className={styles.nextStepIcon}>📬</div>
          <p>Your first scheduled briefing will arrive at the delivery time you chose during setup.</p>
        </div>

        {sendResult === 'sent' && (
          <div style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--accent-green)', textAlign: 'center' }}>
            Preview sent via {sendChannel === 'telegram' ? 'Telegram' : 'email'}.
          </div>
        )}
        {sendResult === 'error' && (
          <div style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', fontSize: '0.85rem', color: '#ef4444', textAlign: 'center' }}>
            Could not send the preview right now. Please try again.
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
              {sending ? 'Sending preview...' : 'Send me a preview now'}
            </button>
          )}
          <button
            onClick={() => router.push('/dashboard/commands')}
            className="btn btn-ghost"
            style={{ width: '100%', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            {prefetchDone ? 'Start using WorkspaceFlow →' : 'Go to Command Bar →'}
          </button>
        </div>

        <div className={styles.features}>
          <h4>What you can do now:</h4>
          <div className={styles.featuresList}>
            <div className={styles.featureItem}><span>📅</span><span>Generate daily briefings with meeting and inbox context</span></div>
            <div className={styles.featureItem}><span>💬</span><span>Run natural-language commands across Gmail, Drive, and Calendar</span></div>
            <div className={styles.featureItem}><span>🔄</span><span>Create and manage always-on automations</span></div>
            <div className={styles.featureItem}><span>✈️</span><span>Deliver briefings and quick actions through Telegram</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
