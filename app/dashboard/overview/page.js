'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { briefingCache } from '@/lib/briefingCache';
import EmailPreviewModal from '../components/EmailPreviewModal';
import styles from '../dashboard.module.css';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ── Skeleton lines ──────────────────────────────────────────────────────────
function Skeleton({ lines = 3 }) {
  const widths = [92, 78, 85, 60, 70];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="shimmer-card"
          style={{
            height: '13px',
            width: `${widths[i % widths.length]}%`,
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.05)',
          }}
        />
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatSender(from) {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  return match ? match[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
}

// ── Briefing section — individual email rows ──────────────────────────────
const EMAIL_LIMIT = 5;

function BriefingSection({ label, data, emails, loading, emptyText }) {
  const [expanded,    setExpanded]    = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);

  const allEmails   = emails || [];
  const hasMore     = allEmails.length > EMAIL_LIMIT;
  const visible     = expanded ? allEmails : allEmails.slice(0, EMAIL_LIMIT);
  const hiddenCount = allEmails.length - EMAIL_LIMIT;

  return (
    <div style={{ marginBottom: '32px' }}>
      <div
        style={{
          fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px',
        }}
      >
        {label}
      </div>

      <div className="card" style={{ padding: '22px 24px' }}>
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <>
            {/* Email rows */}
            {allEmails.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '4px' }}>
                  {visible.map((email, i) => (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'baseline', gap: '8px',
                          background: expandedIdx === i ? 'rgba(255,255,255,0.04)' : 'transparent',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                          padding: '7px 10px', borderRadius: '8px', fontSize: '0.86rem',
                          color: 'var(--text-primary)', lineHeight: 1.5, transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (expandedIdx !== i) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={e => { if (expandedIdx !== i) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ flexShrink: 0 }}>📧</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {formatSender(email.from)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>—</span>
                        <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          &ldquo;{email.subject}&rdquo;
                        </span>
                      </button>
                      {expandedIdx === i && email.snippet && (
                        <div style={{ padding: '4px 10px 10px 34px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                          {email.snippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--accent-blue)', fontSize: '0.8rem',
                      padding: '6px 0 12px', textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                    }}
                  >
                    {expanded ? 'Show less' : `Show ${hiddenCount} more…`}
                  </button>
                )}
                {!hasMore && <div style={{ marginBottom: '18px' }} />}
              </>
            ) : (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '0 0 18px' }}>
                {emptyText}
              </p>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: '16px' }} />

            {/* 📫 Inbox Summary */}
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              📫 Inbox Summary
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              {data?.summary || 'No summary available.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MorningBriefingPage() {
  const [scheduleData,  setScheduleData]  = useState(briefingCache.data?.schedule ?? null);
  const [aiData,        setAiData]        = useState(
    briefingCache.data
      ? {
          last_24h:        briefingCache.data.last_24h,
          older:           briefingCache.data.older,
          last_24h_emails: briefingCache.data.last_24h_emails || [],
          older_emails:    briefingCache.data.older_emails    || [],
        }
      : null
  );
  const [error,         setError]         = useState(null);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);

  const scheduleLoading = scheduleData === null;
  const aiLoading       = aiData === null;
  const fetchingRef     = useRef(false);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return session.access_token;
  };

  const fetchSchedule = async (token) => {
    const res  = await fetch(`${BACKEND()}/api/briefing/schedule`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Schedule fetch failed');
    setScheduleData(data.schedule || []);
  };

  const fetchFullBriefing = async (token) => {
    const res  = await fetch(`${BACKEND()}/api/briefing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Briefing fetch failed');
    briefingCache.set(data);
    setScheduleData(data.schedule || []);
    setAiData({
      last_24h:        data.last_24h,
      older:           data.older,
      last_24h_emails: data.last_24h_emails || [],
      older_emails:    data.older_emails    || [],
    });
  };

  const load = async (force = false) => {
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;
    setError(null);

    try {
      const token = await getToken();

      if (!force && !briefingCache.isEmpty()) {
        if (!briefingCache.isStale()) {
          fetchingRef.current = false;
          return;
        }
        setRefreshing(true);
        await fetchFullBriefing(token);
      } else {
        await Promise.all([
          fetchSchedule(token).catch(() => {}),
          fetchFullBriefing(token),
        ]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    briefingCache.clear();
    setScheduleData(null);
    setAiData(null);
    load(true);
  };

  const schedule = scheduleData || [];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="page-header"
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}
      >
        <div>
          <h1>Dashboard</h1>
          <p>
            {today}
            {!scheduleLoading && schedule.length > 0 &&
              ` · ${schedule.length} meeting${schedule.length !== 1 ? 's' : ''} today`}
            {refreshing && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '12px' }}>
                Refreshing…
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexShrink: 0 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPreview(true)}
            disabled={aiLoading}
            title="Preview and send your briefing"
          >
            📬 Preview &amp; Send
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={scheduleLoading || refreshing}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div
          className="card"
          style={{
            padding: '13px 18px', marginBottom: '24px',
            background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.84rem', color: '#ef4444',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Today's Schedule ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '32px' }}>
        <div
          style={{
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px',
          }}
        >
          Today&apos;s Schedule
        </div>

        <div className="card" style={{ padding: '22px 24px' }}>
          {scheduleLoading ? (
            <Skeleton lines={3} />
          ) : schedule.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              No meetings scheduled today.
            </p>
          ) : (
            <div className={styles.meetingsList} style={{ gap: '8px' }}>
              {schedule.map((ev, i) => (
                <div key={i} className={styles.meetingCard} style={{ padding: '10px 14px' }}>
                  <div className={styles.meetingTime} style={{ fontSize: '0.8rem', minWidth: '68px' }}>
                    {ev.time || 'All Day'}
                  </div>
                  <div className={styles.meetingContent}>
                    <h3 className={styles.meetingTitle} style={{ fontSize: '0.88rem', marginBottom: 0 }}>
                      {ev.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Last 24 Hours ─────────────────────────────────────────────────── */}
      <BriefingSection
        label="Last 24 Hours"
        data={aiData?.last_24h}
        emails={aiData?.last_24h_emails}
        loading={aiLoading}
        emptyText="No emails from the last 24 hours."
      />

      {/* ── Older ──────────────────────────────────────────────────────────── */}
      <BriefingSection
        label="Older"
        data={aiData?.older}
        emails={aiData?.older_emails}
        loading={aiLoading}
        emptyText="No older emails."
      />

      {/* ── Email Preview Modal ───────────────────────────────────────────── */}
      {showPreview && (
        <EmailPreviewModal
          briefing={briefingCache.data}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
