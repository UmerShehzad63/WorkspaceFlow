'use client';
import styles from './EmailPreviewModal.module.css';

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

export default function CalendarCreatePreviewModal({ intent, onConfirm, onCancel }) {
  const params    = intent?.parameters || {};
  const title     = params.summary || params.title || params.event || params.meeting || 'New Meeting';
  const startIso  = params.start_time || params.start || params.datetime || '';
  const endIso    = params.end_time   || params.end   || '';
  const attendees = Array.isArray(params.attendees) ? params.attendees : [];
  const desc      = params.description || params.notes || '';

  const dateStr   = fmtDate(startIso);
  const startStr  = fmtTime(startIso);
  const endStr    = fmtTime(endIso);
  const timeRange = startStr ? (endStr ? `${startStr} – ${endStr}` : startStr) : '—';

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
              <p>{title}</p>
            </div>
            <div className={styles.previewSection}>
              <h4>Date</h4>
              <p>{dateStr}</p>
            </div>
            <div className={styles.previewSection}>
              <h4>Time</h4>
              <p>{timeRange}</p>
            </div>
            {attendees.length > 0 && (
              <div className={styles.previewSection}>
                <h4>Attendees</h4>
                <ul>
                  {attendees.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {desc && (
              <div className={styles.previewSection}>
                <h4>Description</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>{desc}</p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={onCancel}>
            ❌ Cancel
          </button>
          <button className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={onConfirm}>
            ✅ Create Event
          </button>
        </div>
      </div>
    </div>
  );
}
