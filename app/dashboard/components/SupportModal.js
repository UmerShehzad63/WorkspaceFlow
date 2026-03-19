'use client';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './SupportModal.module.css';

const SUBJECT_OPTIONS = ['Technical Error', 'Feedback', 'Feature Request'];
const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function SupportModal({ onClose }) {
  const [subjectType,  setSubjectType]  = useState('Technical Error');
  const [description,  setDescription]  = useState('');
  const [files,        setFiles]        = useState([]);
  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [error,        setError]        = useState(null);
  const fileInputRef = useRef(null);

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files || []).slice(0, 5);
    setFiles(selected);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const form = new FormData();
      form.append('subject_type', subjectType);
      form.append('description', description.trim());
      files.forEach(f => form.append('files', f));

      const res = await fetch(`${BACKEND()}/api/support`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send support request');

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Contact Support</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {success ? (
          <div className={styles.successState}>
            <span className={styles.successIcon}>✅</span>
            <h3>Message sent!</h3>
            <p>We&apos;ll get back to you at your registered email address.</p>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Subject */}
            <div className={styles.field}>
              <label className={styles.label}>Subject</label>
              <select
                className="select"
                value={subjectType}
                onChange={e => setSubjectType(e.target.value)}
              >
                {SUBJECT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className={styles.field}>
              <label className={styles.label}>Description <span className={styles.required}>*</span></label>
              <textarea
                className={styles.textarea}
                placeholder="Describe the issue or feedback in detail…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                required
              />
            </div>

            {/* File upload */}
            <div className={styles.field}>
              <label className={styles.label}>Attachments <span className={styles.hint}>optional — screenshots or error logs, max 5 files</span></label>
              <div
                className={styles.dropZone}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.log,.txt,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleFiles}
                />
                <span className={styles.dropIcon}>📎</span>
                <span>Click to attach files</span>
              </div>

              {files.length > 0 && (
                <ul className={styles.fileList}>
                  {files.map((f, i) => (
                    <li key={i} className={styles.fileItem}>
                      <span className={styles.fileName}>{f.name}</span>
                      <span className={styles.fileSize}>({(f.size / 1024).toFixed(0)} KB)</span>
                      <button
                        type="button"
                        className={styles.removeFile}
                        onClick={() => removeFile(i)}
                      >✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className={styles.errorBanner}>⚠️ {error}</div>
            )}

            <div className={styles.actions}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !description.trim()}
              >
                {submitting ? 'Sending…' : 'Send Message'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
