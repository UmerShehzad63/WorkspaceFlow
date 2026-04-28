'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GlobalHeader from './components/GlobalHeader';
import ResultDisplay from './components/ResultDisplay';
import { briefingCache } from '@/lib/briefingCache';
import TelegramConnect from './components/TelegramConnect';
import { CommandProvider, useCommand } from './command-context';
import { PlanContext } from './plan-context';

const SERVICE_ICONS = { Gmail: '📧', Calendar: '📅', Drive: '📁' };

const sidebarItems = [
  { section: 'Workspace' },
  { label: 'Dashboard', href: '/dashboard/overview', icon: '📅' },
  { section: 'Tools' },
  { label: 'Command Bar', href: '/dashboard/commands', icon: '💬' },
  { label: 'Automations', href: '/dashboard/rules', icon: '🔄' },
  { label: 'Telegram', href: '/dashboard/telegram', icon: '✈️' },
  { section: 'Account' },
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
];

function CommandResultOverlay() {
  const { cmdResult, clearResult, handleGlobalDisambiguationPick } = useCommand();
  if (!cmdResult) return null;

  const { intent, result, error } = cmdResult;
  const service = intent?.service;
  const action = intent?.action;
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
        <div className="card" style={{ padding: '20px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
          <strong style={{ color: '#ef4444' }}>⚠️ {error}</strong>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-glow-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
              {isDisambig
                ? (result.kind === 'recipient' ? 'Confirm Recipient' : 'Select File')
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

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setUser(session.user);
      setLoading(false);

      if (briefingCache.isEmpty() || briefingCache.isStale()) {
        const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        fetch(`${BACKEND}/api/briefing`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => { if (data) briefingCache.set(data); })
          .catch(() => {});
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login');
      else setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', gap: '10px', opacity: 0.5 }}>
        <img src="/icon.png" alt="WorkspaceFlow" style={{ height: '40px', width: '40px', objectFit: 'contain' }} />
        <span style={{ fontFamily: "'Manrope','Inter',sans-serif", fontWeight: 800, fontSize: '1.2rem', color: '#001857' }}>WorkspaceFlow</span>
      </div>
    );
  }

  return (
    <PlanContext.Provider value={{ plan: 'pro_plus', openUpgrade: () => {} }}>
      <CommandProvider>
        <div className="dashboard-layout">
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 49,
                backdropFilter: 'blur(2px)',
              }}
            />
          )}

          <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`} style={{ top: 0 }}>
            <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
                <img src="/icon.png" alt="WorkspaceFlow" width={36} height={36} style={{ objectFit: 'contain' }} />
                <span style={{ fontFamily: "'Manrope','Inter',sans-serif", fontWeight: 800, fontSize: '1.05rem', color: '#001857', lineHeight: 1 }}>
                  WorkspaceFlow
                </span>
              </Link>
              <button
                className="sidebar-close-btn"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
              >✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ padding: '12px 16px', background: 'var(--color-surface-container-low)', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.78rem', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff' }}>
                    {user?.email?.[0].toUpperCase() || 'U'}
                  </div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{user?.email?.split('@')[0]}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{user?.email}</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: '10px 14px', background: 'rgba(86,68,208,0.06)', border: '1px solid rgba(86,68,208,0.15)', borderRadius: '10px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚡</span>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '0.75rem' }}>Automation System Active</strong>
                </div>
              </div>
            </div>

            <nav style={{ marginBottom: '16px' }}>
              <ul className="sidebar-nav">
                {sidebarItems.map((item, idx) => {
                  if (item.section) {
                    return <li key={idx} className="sidebar-section-label">{item.section}</li>;
                  }
                  const isActive = pathname === item.href;
                  return (
                    <li key={idx}>
                      <Link href={item.href} className={`sidebar-item ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                        <span className="icon">{item.icon}</span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', paddingLeft: '2px' }}>
                Delivery
              </div>
              <TelegramConnect />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <Link href="/dashboard/settings" className="btn btn-secondary" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                Workspace Settings
              </Link>

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: '0.82rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Sign Out
              </button>
            </div>
          </aside>

          <main className="dashboard-content">
            <div className="mobile-topbar">
              <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                <span /><span /><span />
              </button>
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="/icon.png" alt="WorkspaceFlow" width={30} height={30} style={{ objectFit: 'contain' }} />
                <span style={{ fontFamily: "'Manrope','Inter',sans-serif", fontWeight: 800, fontSize: '1rem', color: '#001857' }}>WorkspaceFlow</span>
              </Link>
              <div style={{ width: 40 }} />
            </div>

            <GlobalHeader />
            <div className="dashboard-inner">
              <DashboardShell>{children}</DashboardShell>
            </div>
          </main>

          <nav className="mobile-bottom-nav">
            <Link href="/dashboard/overview" className={pathname === '/dashboard/overview' ? 'active' : ''}>
              <span className="nav-icon">📅</span>
              <span>Dashboard</span>
            </Link>
            <Link href="/dashboard/commands" className={pathname === '/dashboard/commands' ? 'active' : ''}>
              <span className="nav-icon">💬</span>
              <span>Commands</span>
            </Link>
            <Link href="/dashboard/rules" className={pathname === '/dashboard/rules' ? 'active' : ''}>
              <span className="nav-icon">🔄</span>
              <span>Rules</span>
            </Link>
            <Link href="/dashboard/telegram" className={pathname === '/dashboard/telegram' ? 'active' : ''}>
              <span className="nav-icon">✈️</span>
              <span>Telegram</span>
            </Link>
            <Link href="/dashboard/settings" className={pathname === '/dashboard/settings' ? 'active' : ''}>
              <span className="nav-icon">⚙️</span>
              <span>Settings</span>
            </Link>
          </nav>
        </div>
      </CommandProvider>
    </PlanContext.Provider>
  );
}
