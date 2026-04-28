'use client';
import Link from 'next/link';

export default function TeamPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Advanced Workflows</h1>
        <p>Specialized tools for teams running heavier automation workloads.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Automation Coverage</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Launch, edit, pause, and test automations from one place without switching tools.
          </p>
          <Link href="/dashboard/rules" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Open Automations →
          </Link>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✈️</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Telegram Operations</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Send briefings and run quick commands from Telegram when you are away from the dashboard.
          </p>
          <Link href="/dashboard/telegram" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Connect Telegram →
          </Link>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>💬</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>AI Command Layer</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Search emails, draft replies, schedule meetings, and find files through plain-English requests.
          </p>
          <Link href="/dashboard/commands" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Open Command Bar →
          </Link>
        </div>
      </div>
    </div>
  );
}
