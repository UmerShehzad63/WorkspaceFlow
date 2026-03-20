'use client';
import Link from 'next/link';
import styles from './team.module.css';

export default function ProPlusPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Pro Plus Features</h1>
        <p>Everything included in your Pro Plus plan.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Unlimited Automations</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Create as many automation rules as you need. No limits on triggers, actions, or conditions.
          </p>
          <Link href="/dashboard/rules" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Manage Rules →
          </Link>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✈️</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Telegram Delivery</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Get your morning briefing and send emails directly from Telegram. Briefings arrive straight to your phone.
          </p>
          <Link href="/dashboard/telegram" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Set Up Telegram →
          </Link>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>💬</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Advanced AI Commands</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Use natural language to search emails, schedule meetings, manage Drive files, and draft replies.
          </p>
          <Link href="/dashboard/commands" className="btn btn-primary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Open Command Bar →
          </Link>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚡</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Priority Support</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Get faster responses from our team. Pro Plus users are moved to the front of the support queue.
          </p>
          <a href="mailto:support@workspaceflow.app" className="btn btn-secondary btn-sm" style={{ marginTop: '16px', display: 'inline-block' }}>
            Contact Support →
          </a>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🚀</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Early Access</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Be the first to try new features before they roll out to all users. Shape the product with your feedback.
          </p>
        </div>
      </div>
    </div>
  );
}
