'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GlobalHeader from './components/GlobalHeader';
import ResultDisplay from './components/ResultDisplay';
import SupportModal from './components/SupportModal';
import TelegramConnect from './components/TelegramConnect';
import { CommandProvider, useCommand } from './command-context';

const SERVICE_ICONS = { Gmail: '📧', Calendar: '📅', Drive: '📁' };

const sidebarItems = [
  { section: 'Workspace' },
  { label: 'Dashboard',    href: '/dashboard/overview',  icon: '📅' },
  { section: 'Tools' },
  { label: 'Command Bar',  href: '/dashboard/commands',  icon: '💬', badge: 'PRO' },
  { label: 'Automations',  href: '/dashboard/rules',     icon: '🔄', badge: 'PRO' },
  { label: 'Telegram',     href: '/dashboard/telegram',  icon: '✈️', badge: 'PRO' },
  { section: 'Account' },
  { label: 'Settings',     href: '/dashboard/settings',  icon: '⚙️' },
  { label: 'Team',         href: '/dashboard/team',      icon: '👥', badge: 'TEAM' },
];

// ── Command result overlay ──────────────────────────────────────────────────
function CommandResultOverlay() {
  const { cmdResult, clearResult, handleGlobalDisambiguationPick } = useCommand();
  if (!cmdResult) return null;

  const { intent, result, error } = cmdResult;
  const service    = intent?.service;
  const action     = intent?.action;
  const isDisambig = result?.type === 'needs_disambiguation';

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={clearResult}
          className="btn btn-ghost"
          style={{ fontSize: '0.85rem', padding: '6px 14px' }}
        >
          ← Back to Dashboard
        </button>
      </div>

      {error ? (
        <div className="card" style={{ padding: '20px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <strong style={{ color: '#ef4444' }}>⚠️ {error}</strong>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-glow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
              {isDisambig
                ? (result.kind === 'recipient' ? '👤 Confirm Recipient' : '📁 Select File')
                : `${SERVICE_ICONS[service] || '⚡'} ${service}: ${action}`}
            </h3>
            <span style={{ fontSize: '0.72rem', padding: '3px 10px', background: isDisambig ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)', color: isDisambig ? '#f59e0b' : 'var(--accent-green)', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
              {isDisambig ? 'Choose' : 'Done'}
            </span>
          </div>

          {intent?.human_description && !isDisambig && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              {intent.human_description}
            </p>
          )}

          <ResultDisplay
            intent={intent}
            result={result}
            onDisambiguationPick={handleGlobalDisambiguationPick}
          />
        </div>
      )}
    </div>
  );
}

function DashboardShell({ children }) {
  const { cmdResult } = useCommand();
  return cmdResult ? <CommandResultOverlay /> : children;
}

// ── Root layout ─────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showSupport, setShowSupport] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/login');
      else setUser(session.user);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login');
      else setUser(session.user);
    });

    return () => { subscription.unsubscribe(); };
  }, [router]);

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <p>Initializing Session...</p>
      </div>
    );
  }

  return (
    <CommandProvider>
      <div className="dashboard-layout" style={{ paddingTop: 0 }}>
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="sidebar" style={{ top: 0 }}>
          <div className="sidebar-header">
            <Link href="/" className="nav-logo" style={{ marginBottom: '24px' }}>
              <div className="nav-logo-icon">⚡</div>
              WorkspaceFlow
            </Link>
          </div>

          {/* User info */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.78rem', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>
                  {user?.email?.[0].toUpperCase() || 'U'}
                </div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{user?.email?.split('@')[0]}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{user?.email}</span>
                </div>
              </div>
            </div>

            {/* Pro trial badge */}
            <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '10px', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span>🎁</span>
                <strong style={{ color: 'var(--accent-green)', fontSize: '0.75rem' }}>Pro Trial Active</strong>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>2 days remaining</span>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ marginBottom: '16px' }}>
            <ul className="sidebar-nav">
              {sidebarItems.map((item, idx) => {
                if (item.section) {
                  return <li key={idx} className="sidebar-section-label">{item.section}</li>;
                }
                const isActive = pathname === item.href;
                return (
                  <li key={idx}>
                    <Link href={item.href} className={`sidebar-item ${isActive ? 'active' : ''}`}>
                      <span className="icon">{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <span className={`badge ${item.badge === 'TEAM' ? 'badge-team' : 'badge-pro'}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Telegram connect widget */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', paddingLeft: '2px' }}>
              Delivery
            </div>
            <TelegramConnect />
          </div>

          {/* Bottom actions */}
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/pricing" className="btn btn-primary" style={{ width: '100%', fontSize: '0.82rem' }}>
              Upgrade to Pro — $9/mo
            </Link>
            <button
              onClick={() => setShowSupport(true)}
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              💬 Contact Support
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/login');
              }}
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.82rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="dashboard-content" style={{ padding: 0 }}>
          <GlobalHeader />
          <div style={{ padding: '32px' }}>
            <DashboardShell>{children}</DashboardShell>
          </div>
        </main>

        {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
        <div className="mobile-bottom-nav">
          <Link href="/dashboard/overview" className={pathname === '/dashboard/overview' ? 'active' : ''}>
            <span className="nav-icon">📅</span>Dashboard
          </Link>
          <Link href="/dashboard/commands" className={pathname === '/dashboard/commands' ? 'active' : ''}>
            <span className="nav-icon">💬</span>Commands
          </Link>
          <Link href="/dashboard/rules" className={pathname === '/dashboard/rules' ? 'active' : ''}>
            <span className="nav-icon">🔄</span>Automations
          </Link>
          <Link href="/dashboard/settings" className={pathname === '/dashboard/settings' ? 'active' : ''}>
            <span className="nav-icon">⚙️</span>Settings
          </Link>
        </div>
      </div>

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </CommandProvider>
  );
}
