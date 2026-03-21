'use client';
import { useState } from 'react';
import styles from './ResultDisplay.module.css';

// ─── Sub-renderers ──────────────────────────────────────────────────────────

function EmailCard({ msg, index }) {
  const [expanded, setExpanded] = useState(false);
  const body = msg.body || msg.snippet || '';
  const preview = body.slice(0, 300);
  const hasMore = body.length > 300;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '14px 16px',
      marginBottom: index > 0 ? '10px' : 0,
    }}>
      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
        {msg.subject}
      </strong>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
        <span>From: {msg.from}</span>
        <span style={{ flexShrink: 0, marginLeft: '12px' }}>{msg.date?.slice(0, 16)}</span>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0 0 10px' }} />
      <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {expanded ? body : preview}
        {!expanded && hasMore && '…'}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ marginTop: '8px', background: 'none', border: 'none', padding: 0, fontSize: '0.78rem', color: 'var(--accent-blue)', cursor: 'pointer' }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function GmailSearchResult({ result }) {
  const { messages = [], count, query } = result;
  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '12px' }}>
        {count} result{count !== 1 ? 's' : ''} for <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{query}</code>
      </p>
      {messages.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No emails found.</p>}
      {messages.map((msg, i) => <EmailCard key={i} msg={msg} index={i} />)}
    </div>
  );
}

function GmailSendResult({ result }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>✅</span>
        <strong>Email sent successfully</strong>
      </div>
      <div className={styles.actionDetails}>
        <div className={styles.detailRow}><span className={styles.detailLabel}>To:</span><span>{result.to}</span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Subject:</span><span>{result.subject}</span></div>
        {result.drive_file_used && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>📎 Attached:</span>
            <span>
              {result.drive_file_link
                ? <a href={result.drive_file_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>{result.drive_file_used}</a>
                : result.drive_file_used}
              {result.attachment_filename ? ` (${result.attachment_filename})` : ''}
            </span>
          </div>
        )}
        <div className={styles.detailRow}><span className={styles.detailLabel}>ID:</span><span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{result.message_id}</span></div>
      </div>
    </div>
  );
}

function GmailArchiveResult({ result }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>✅</span>
        <strong>Archived {result.archived} email{result.archived !== 1 ? 's' : ''}</strong>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Matching: <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{result.query}</code>
      </p>
    </div>
  );
}

function CalendarSearchResult({ result }) {
  const { events = [], count, query, summary } = result;
  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '12px', fontWeight: 500 }}>
        {summary || (count > 0
          ? `${count} event${count !== 1 ? 's' : ''}${query ? ` for "${query}"` : ''}`
          : `No events found${query ? ` for "${query}"` : ''}`)}
      </p>
      {events.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Your calendar is clear for this period.
        </p>
      )}
      {events.map((ev, i) => (
        <div key={i} style={{
          borderTop: i > 0 ? '1px solid var(--border-color)' : 'none',
          paddingTop: i > 0 ? '12px' : 0,
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: '20px', marginTop: '2px' }}>
              {i + 1}.
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{ev.title}</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                📅 {ev.start ? new Date(ev.start).toLocaleString() : 'Time TBD'}
                {ev.end && ev.end !== ev.start ? ` – ${new Date(ev.end).toLocaleTimeString()}` : ''}
              </div>
              {ev.location && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>📍 {ev.location}</div>}
              {ev.attendees?.length > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>👥 {ev.attendees.slice(0, 3).join(', ')}</div>}
              {ev.link && <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>Open →</a>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarCreateResult({ result }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>✅</span>
        <strong>Event created in Google Calendar</strong>
      </div>
      <div className={styles.actionDetails}>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Title:</span><span>{result.title}</span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Start:</span><span>{result.start ? new Date(result.start).toLocaleString() : '—'}</span></div>
      </div>
      {result.link && (
        <a href={result.link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: '12px', fontSize: '0.82rem', color: 'var(--accent-blue)' }}>
          Open event in Google Calendar →
        </a>
      )}
    </div>
  );
}

function DriveSearchResult({ result }) {
  const { files = [], count, query } = result;
  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '12px' }}>
        {count} file{count !== 1 ? 's' : ''} found{query ? ` for "${query}"` : ''}
      </p>
      {files.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No files found.</p>}
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}>
          <div>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{f.name}</strong>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.type} · {f.modified ? new Date(f.modified).toLocaleDateString() : ''}</div>
          </div>
          {f.link && (
            <a href={f.link} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', flexShrink: 0, marginLeft: '12px' }}>
              Open →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function RecipientDisambiguation({ result, onPick }) {
  const [manualEmail, setManualEmail] = useState('');
  const count = result.candidates.length;

  const handleManual = () => {
    const trimmed = manualEmail.trim();
    if (!trimmed || !trimmed.includes('@')) return;
    onPick({ recipient_email: trimmed });
  };

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '14px' }}>
        {count === 0
          ? <>I couldn&apos;t find <strong>&quot;{result.query}&quot;</strong> in your Gmail history or contacts. Enter their email address below.</>
          : count === 1
          ? <>Found one contact matching <strong>&quot;{result.query}&quot;</strong> — is this the right person?</>
          : <>Found {count} contacts matching <strong>&quot;{result.query}&quot;</strong>. Who did you mean?</>}
      </p>
      {count > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px',
          maxHeight: count > 4 ? '240px' : 'none',
          overflowY: count > 4 ? 'auto' : 'visible',
          paddingRight: count > 4 ? '4px' : 0,
        }}>
          {result.candidates.map((c, i) => (
            <button key={i} onClick={() => onPick({ recipient_email: c.email })}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)', borderRadius: '8px',
                cursor: 'pointer', textAlign: 'left', width: '100%', flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{c.email}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {c.display_name !== c.email ? c.display_name : ''}{c.display_name !== c.email && c.count > 0 ? ' · ' : ''}
                  {c.count > 0 ? `emailed ${c.count} time${c.count !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', flexShrink: 0, marginLeft: '12px' }}>
                {count === 1 ? 'Confirm →' : 'Select →'}
              </span>
            </button>
          ))}
        </div>
      )}
      <div style={{ borderTop: count > 0 ? '1px solid var(--border-color)' : 'none', paddingTop: count > 0 ? '14px' : 0 }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {count === 0 ? 'Enter their email address:' : 'Or enter email address manually:'}
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManual()}
            placeholder="someone@example.com"
            style={{
              flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)',
              fontSize: '0.85rem', outline: 'none',
            }}
          />
          <button onClick={handleManual} disabled={!manualEmail.trim().includes('@')}
            className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '8px 16px', flexShrink: 0 }}>
            Use this →
          </button>
        </div>
      </div>
    </div>
  );
}

function FileDisambiguation({ result, onPick }) {
  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '14px' }}>
        Found multiple files matching <strong>&quot;{result.query}&quot;</strong>. Which one?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {result.candidates.map((f, i) => (
          <button key={i} onClick={() => onPick({ file_id: f.id })}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)', borderRadius: '8px',
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{f.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{f.type} · {f.modified ? new Date(f.modified).toLocaleDateString() : ''}</div>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--accent-blue)' }}>Select →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UnsupportedResult({ result }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
        {result.message || "I'm not sure how to help with that using Google Workspace."}
      </p>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────

export default function ResultDisplay({ intent, result, onDisambiguationPick }) {
  const t = result?.type;
  if (t === 'gmail_search')    return <GmailSearchResult result={result} />;
  if (t === 'gmail_send')      return <GmailSendResult result={result} />;
  if (t === 'gmail_archive')   return <GmailArchiveResult result={result} />;
  if (t === 'calendar_search') return <CalendarSearchResult result={result} />;
  if (t === 'calendar_create') return <CalendarCreateResult result={result} />;
  if (t === 'drive_search')    return <DriveSearchResult result={result} />;
  if (t === 'unsupported')     return <UnsupportedResult result={result} />;
  if (t === 'needs_disambiguation' && result.kind === 'recipient')
    return <RecipientDisambiguation result={result} onPick={onDisambiguationPick} />;
  if (t === 'needs_disambiguation' && result.kind === 'file')
    return <FileDisambiguation result={result} onPick={onDisambiguationPick} />;

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>{intent?.human_description}</p>
      <div className={styles.actionDetails}>
        <pre style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', margin: 0 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    </div>
  );
}
