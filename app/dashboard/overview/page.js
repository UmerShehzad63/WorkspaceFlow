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

// ── Briefing section — with "See more" when >4 urgent items ────────────────
const ITEM_LIMIT = 4;

function BriefingSection({ label, data, loading, emptyText }) {
  const [expanded, setExpanded] = useState(false);

  const allItems   = data?.urgent_items || [];
  const hasMore    = allItems.length > ITEM_LIMIT;
  const visible    = expanded ? allItems : allItems.slice(0, ITEM_LIMIT);
  const hiddenCount = allItems.length - ITEM_LIMIT;

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
            {/* ⚡ Priority Items */}
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              ⚡ Priority Items
            </h3>

            {allItems.length > 0 ? (
              <>
                <ul style={{ listStyle: 'none', margin: '0 0 4px', padding: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {visible.map((item, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-orange)', flexShrink: 0, marginTop: '7px' }} />
                      {item}
                    </li>
                  ))}
                </ul>

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
                    {expanded ? 'See less' : `See ${hiddenCount} more…`}
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
      ? { last_24h: briefingCache.data.last_24h, older: briefingCache.data.older }
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
    setAiData({ last_24h: data.last_24h, older: data.older });
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
        loading={aiLoading}
        emptyText="No urgent tasks from the last 24 hours."
      />

      {/* ── Older ──────────────────────────────────────────────────────────── */}
      <BriefingSection
        label="Older"
        data={aiData?.older}
        loading={aiLoading}
        emptyText="No urgent items from older emails."
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
