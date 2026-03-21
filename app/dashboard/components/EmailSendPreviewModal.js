'use client';
import { useState } from 'react';
import styles from './EmailPreviewModal.module.css';

/**
 * Shown before sending an email from the Command Bar.
 * Displays To / Subject / Body parsed by the AI.
 * User can edit any field, then confirm or cancel.
 *
 * Props:
 *   intent   — AI-parsed intent ({ service, action, parameters: { to, subject, body } })
 *   onSend   — fn({ to, subject, body }) called when user confirms
 *   onCancel — fn() called when user cancels
 */
export default function EmailSendPreviewModal({ intent, onSend, onCancel }) {
  const params = intent?.parameters || {};

  const [to,      setTo]      = useState(params.to      || '');
  const [subject, setSubject] = useState(params.subject || '');
  const [body,    setBody]    = useState(params.body || params.message || params.content || '');
  const [editing, setEditing] = useState(false);

  const handleSend = () => {
    onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() });
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2>📧 Preview Email</h2>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>To</span>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className={styles.noteInput}
                  style={{ resize: 'none' }}
                  placeholder="recipient@example.com"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className={styles.noteInput}
                  style={{ resize: 'none' }}
                  placeholder="Subject line"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Body</span>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className={styles.noteInput}
                  rows={6}
                  placeholder="Email body"
                />
              </label>
            </div>
          ) : (
            <div className={styles.preview}>
              {/* To */}
              <div className={styles.previewSection}>
                <h4>To</h4>
                <p style={{ wordBreak: 'break-all' }}>{to || <em style={{ color: 'var(--text-muted)' }}>No recipient</em>}</p>
              </div>

              {/* Subject */}
              <div className={styles.previewSection}>
                <h4>Subject</h4>
                <p>{subject || <em style={{ color: 'var(--text-muted)' }}>No subject</em>}</p>
              </div>

              {/* Body */}
              <div className={styles.previewSection}>
                <h4>Body</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {body || <em style={{ color: 'var(--text-muted)' }}>No body</em>}
                </p>
              </div>

              {/* Attachment */}
              {params._drive_file_name && (
                <div className={styles.previewSection}>
                  <h4>Attachment</h4>
                  <p>📎 {params._drive_file_name}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter} style={{ justifyContent: 'space-between' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.82rem' }}
            onClick={() => setEditing(!editing)}
          >
            {editing ? '👁 Preview' : '✏️ Edit'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={onCancel}>
              ❌ Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.82rem' }}
              onClick={handleSend}
              disabled={!to.trim()}
            >
              ✅ Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
