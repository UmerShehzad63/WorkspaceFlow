'use client';
import { useState } from 'react';
import styles from './team.module.css';

export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Team Management</h1>
          <p>Manage team members and shared automations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
          + Invite Member
        </button>
      </div>

      {/* Team Members */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Team Members</h3>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>👥</span>
          <p>No team members yet. Invite colleagues to collaborate.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
            + Invite Member
          </button>
        </div>
      </div>

      {/* Shared Rules */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Shared Rules</h3>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🔄</span>
          <p>No shared rules yet. Shared automations will appear here once team members are added.</p>
        </div>
      </div>

      {/* Admin Controls */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Admin Controls</h3>
        <div className={styles.controlsList}>
          <div className={styles.controlItem}>
            <div>
              <strong>Allow members to create rules</strong>
              <span>Members can create their own automated rules</span>
            </div>
            <div className="toggle active" />
          </div>
          <div className={styles.controlItem}>
            <div>
              <strong>Allow members to use command bar</strong>
              <span>Members can execute natural language commands</span>
            </div>
            <div className="toggle active" />
          </div>
          <div className={styles.controlItem}>
            <div>
              <strong>Audit logging</strong>
              <span>Log all rule executions and commands</span>
            </div>
            <div className="toggle active" />
          </div>
        </div>
      </div>

      {/* Team Billing */}
      <div className={styles.section}>
        <div className={styles.billingCard}>
          <div>
            <strong>Team Plan</strong>
            <p>Upgrade to enable team collaboration features</p>
          </div>
          <a href="/pricing" className="btn btn-primary btn-sm">View Plans</a>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className={styles.modal} onClick={() => setShowInvite(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Invite Team Member</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>
              They&apos;ll receive an email to connect their Google account.
            </p>
            <div className="input-group" style={{ marginBottom: '20px' }}>
              <label className="input-label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label className="input-label">Role</label>
              <select className="select">
                <option>Member</option>
                <option>Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowInvite(false)}>Send Invite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
