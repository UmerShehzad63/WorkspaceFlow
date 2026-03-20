'use client';
import { useState } from 'react';
import styles from './EmailPreviewModal.module.css';

export default function CalendarCreatePreviewModal({ intent, onConfirm, onCancel }) {
  const params   = intent?.parameters || {};
  const startIso = params.start_time || params.start || params.datetime || '';
  const endIso   = params.end_time   || params.end   || '';

  const [title,        setTitle]        = useState(
    params.summary || params.title || params.event || params.meeting || 'New Meeting'
  );
  const [date,         setDate]         = useState(startIso ? startIso.split('T')[0] : '');
  const [startTime,    setStartTime]    = useState(
    startIso.includes('T') ? startIso.split('T')[1]?.substring(0, 5) : ''
  );
  const [endTime,      setEndTime]      = useState(
    endIso.includes('T') ? endIso.split('T')[1]?.substring(0, 5) : ''
  );
  const [attendeeText, setAttendeeText] = useState(
    (Array.isArray(params.attendees) ? params.attendees.filter(Boolean) : []).join(', ')
  );
  const [description,  setDescription]  = useState(params.description || params.notes || '');

  const handleConfirm = () => {
    const newStart    = date && startTime ? `${date}T${startTime}:00` : startIso.replace('Z', '');
    const newEnd      = date && endTime   ? `${date}T${endTime}:00`   : endIso.replace('Z', '') || newStart;
    const attendeeList = attendeeText
      .split(',')
      .map(a => a.trim())
      .filter(a => a && a.includes('@'));
    onConfirm({
      summary:     title,
      start_time:  newStart,
      end_time:    newEnd,
      attendees:   attendeeList,
      description,
    });
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>📅 Create Event?</h2>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.preview}>

            <div className={styles.previewSection}>
              <h4>Title</h4>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div className={styles.previewSection}>
              <h4>Date</h4>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="input"
              />
            </div>

            <div className={styles.previewSection}>
              <h4>Time</h4>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="input"
                  style={{ maxWidth: '140px' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>—</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="input"
                  style={{ maxWidth: '140px' }}
                />
              </div>
            </div>

            <div className={styles.previewSection}>
              <h4>Attendees</h4>
              <input
                type="text"
                value={attendeeText}
                onChange={e => setAttendeeText(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="email@example.com, another@example.com"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>
                If an attendee email wasn&apos;t found automatically, please enter it manually.
              </p>
            </div>

            <div className={styles.previewSection}>
              <h4>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(optional)</span></h4>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input"
                style={{ width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Add a description…"
              />
            </div>

          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={onCancel}>
            ❌ Cancel
          </button>
          <button className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={handleConfirm}>
            ✅ Create Event
          </button>
        </div>
      </div>
    </div>
  );
}
