'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './EmailPreviewModal.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ── Briefing preview renderer ──────────────────────────────────────────────
function BriefingPreview({ briefing }) {
  if (!briefing) {
    return (
      <p className={styles.empty}>
        No briefing data yet — refresh your dashboard first.
      </p>
    );
  }

  const schedule  = briefing.schedule  || [];
  const last24h   = briefing.last_24h  || {};
  const older     = briefing.older     || {};

  return (
    <div className={styles.preview}>
      {/* Schedule */}
      {schedule.length > 0 && (
        <section className={styles.previewSection}>
          <h4>📅 Today&apos;s Schedule</h4>
          {schedule.slice(0, 5).map((ev, i) => (
            <div key={i} className={styles.scheduleRow}>
              <span className={styles.time}>{ev.time || 'All Day'}</span>
              <span>{ev.title}</span>
            </div>
          ))}
        </section>
      )}

      {/* Priority items */}
      {last24h.urgent_items?.length > 0 && (
        <section className={styles.previewSection}>
          <h4>⚡ Priority Items</h4>
          <ul>
            {last24h.urgent_items.slice(0, 5).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Inbox summary */}
      {last24h.summary && (
        <section className={styles.previewSection}>
          <h4>📫 Inbox Summary</h4>
          <p>{last24h.summary}</p>
        </section>
      )}

      {/* Older priorities */}
      {older.urgent_items?.length > 0 && (
        <section className={styles.previewSection}>
          <h4>📌 Older Priorities</h4>
          <ul>
            {older.urgent_items.slice(0, 3).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────
export default function EmailPreviewModal({ briefing, onClose }) {
  const [editing, setEditing] = useState(false);
  const [note,    setNote]    = useState('');
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState(null); // { ok, text, channel }

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${BACKEND()}/api/send-preview`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          briefing: briefing || null,
          note:     note.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Send failed');

      const ch = data.channel === 'telegram' ? 'Telegram' : 'email';
      setResult({ ok: true, text: `Sent via ${ch}!`, channel: data.channel });
    } catch (e) {
      setResult({ ok: false, text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2>📬 Preview &amp; Send Briefing</h2>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          <BriefingPreview briefing={briefing} />

          {/* Optional personal note */}
          <div className={styles.noteSection}>
            <button
              onClick={() => setEditing(!editing)}
              className={styles.editToggle}
            >
              {editing ? '↑ Hide note' : '✏️ Add a personal note (optional)'}
            </button>
            {editing && (
              <textarea
                className={styles.noteInput}
                placeholder="This note will be included at the top of your briefing…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            )}
          </div>

          {/* Result banner */}
          {result && (
            <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
              {result.ok ? '✅' : '⚠️'} {result.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button
              onClick={handleSend}
              disabled={sending || !briefing}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', border: 'none', fontFamily: 'inherit' }}
            >
              {sending ? 'Sending…' : '📬 Send Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
