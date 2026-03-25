'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GlobalHeader from './components/GlobalHeader';
import ResultDisplay from './components/ResultDisplay';
import TelegramConnect from './components/TelegramConnect';
import { CommandProvider, useCommand } from './command-context';
import { PlanContext, isPro } from './plan-context';

const SERVICE_ICONS = { Gmail: '📧', Calendar: '📅', Drive: '📁' };

// ── Upgrade modal ────────────────────────────────────────────────────────────
function UpgradeModal({ plan, onClose }) {
  const hasPro    = isPro(plan);
  const isProPlus = plan === 'pro_plus';

  const greyBtn = {
    display: 'block', width: '100%', textAlign: 'center', fontSize: '0.82rem',
    padding: '8px 16px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
    border: '1px solid var(--border-color)', cursor: 'default',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '16px',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '780px',
        padding: '28px', boxShadow: 'var(--shadow-xl)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Choose Your Plan</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '4px 6px' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>

          {/* FREE */}
          <div style={{ background: 'var(--color-surface-container-low)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', opacity: hasPro ? 0.5 : 1 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Free</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>$0<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[
                { text: 'Daily email briefing', inc: true },
                { text: 'View calendar events', inc: true },
                { text: 'Basic Gmail read', inc: true },
                { text: 'Command Bar', inc: false },
                { text: 'Automations', inc: false },
                { text: 'Telegram delivery', inc: false },
              ].map(f => (
                <li key={f.text} style={{ fontSize: '0.8rem', color: f.inc ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                  <span style={{ color: f.inc ? 'var(--accent-green)' : 'rgba(239,68,68,0.7)' }}>{f.inc ? '✓' : '✗'}</span>{f.text}
                </li>
              ))}
            </ul>
            <button disabled style={greyBtn}>{!hasPro ? 'Current Plan' : 'Free Tier'}</button>
          </div>

          {/* PRO */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', opacity: isProPlus ? 0.5 : 1 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Pro</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>$9<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {['Everything in Free', 'Command Bar', '5 Automation rules', 'Telegram briefings', 'AI email/calendar commands'].map(f => (
                <li key={f} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px' }}>
                  <span style={{ color: 'var(--accent-green)' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {hasPro && !isProPlus
              ? <button disabled style={greyBtn}>Current Plan</button>
              : <Link href="/pricing" onClick={onClose} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', fontSize: '0.82rem' }}>Upgrade to Pro →</Link>
            }
          </div>

          {/* PRO PLUS */}
          <div style={{ position: 'relative', background: 'rgba(86,68,208,0.04)', border: '2px solid var(--color-secondary)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-glow-purple)' }}>
            <div style={{ position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-secondary)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              ⭐ Most Popular
            </div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Pro Plus</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>$19<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {['Everything in Pro', 'Unlimited automations', 'Advanced AI commands', 'Priority support'].map(f => (
                <li key={f} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px' }}>
                  <span style={{ color: 'var(--accent-green)' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {isProPlus
              ? <button disabled style={greyBtn}>Current Plan</button>
              : <Link href="/pricing" onClick={onClose} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', fontSize: '0.82rem' }}>Upgrade to Pro Plus →</Link>
            }
          </div>

        </div>
      </div>
    </div>
  );
}

const sidebarItems = [
  { section: 'Workspace' },
  { label: 'Dashboard',    href: '/dashboard/overview',  icon: '📅' },
  { section: 'Tools' },
  { label: 'Command Bar',  href: '/dashboard/commands',  icon: '💬', badge: 'PRO' },
  { label: 'Automations',  href: '/dashboard/rules',     icon: '🔄', badge: 'PRO' },
  { label: 'Telegram',     href: '/dashboard/telegram',  icon: '✈️', badge: 'PRO' },
  { section: 'Account' },
  { label: 'Settings',     href: '/dashboard/settings',  icon: '⚙️' },
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
        <div className="card" style={{ padding: '20px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
          <strong style={{ color: '#ef4444' }}>⚠️ {error}</strong>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-glow-purple)' }}>
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
  const [user,          setUser]          = useState(null);
  const [plan,          setPlan]          = useState('free');
  const [loading,       setLoading]       = useState(true);
  const [showUpgrade,   setShowUpgrade]   = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setUser(session.user);
      // Fetch plan from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', session.user.id)
        .single();
      setPlan((profile?.plan || 'free').toLowerCase());
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
      <div className="loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', gap: '10px' }}>
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.5 }}>
          <circle cx="20" cy="20" r="19" stroke="#5644d0" strokeWidth="1.5" fill="none" />
          <path d="M22 13 C17 13 13 16.5 13 20.5 C13 24.5 17 28 22 28" stroke="#5644d0" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M20 27 L20 16 L24.5 21 L29 16 L29 27" stroke="#5644d0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="24.5" cy="21" r="1.5" fill="#5644d0" />
        </svg>
        <span style={{ fontFamily: "'Manrope','Inter',sans-serif", fontWeight: 800, fontSize: '1.1rem', color: '#001857', opacity: 0.5 }}>CouchMail</span>
      </div>
    );
  }

  return (
    <PlanContext.Provider value={{ plan, openUpgrade: () => setShowUpgrade(true) }}>
    <CommandProvider>
      <div className="dashboard-layout" style={{ paddingTop: 0 }}>
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="sidebar" style={{ top: 0 }}>
          <div className="sidebar-header">
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="19" stroke="#5644d0" strokeWidth="1.5" fill="none" opacity="0.5" />
                <circle cx="20" cy="20" r="19" stroke="url(#sbLogoGrad)" strokeWidth="1.5" fill="none" />
                <path d="M22 13 C17 13 13 16.5 13 20.5 C13 24.5 17 28 22 28" stroke="url(#sbLogoGrad)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                <path d="M20 27 L20 16 L24.5 21 L29 16 L29 27" stroke="url(#sbLogoGrad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="24.5" cy="21" r="1.5" fill="#5644d0" />
                <defs>
                  <linearGradient id="sbLogoGrad" x1="8" y1="10" x2="32" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#7264e8" />
                    <stop offset="100%" stopColor="#001857" />
                  </linearGradient>
                </defs>
              </svg>
              <span style={{ fontFamily: "'Manrope','Inter',sans-serif", fontWeight: 800, fontSize: '1.05rem', color: '#001857', letterSpacing: '-0.02em', lineHeight: 1 }}>
                CouchMail
              </span>
            </Link>
          </div>

          {/* User info */}
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

            {/* Plan badge */}
            {(plan === 'trialing' || plan === 'pro_trial') && (
              <div style={{ padding: '10px 14px', background: 'rgba(86,68,208,0.06)', border: '1px solid rgba(86,68,208,0.15)', borderRadius: '10px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span>🎁</span>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '0.75rem' }}>Pro Trial Active</strong>
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>Upgrade before trial ends</span>
              </div>
            )}
            {plan === 'pro' && (
              <div style={{ padding: '10px 14px', background: 'rgba(86,68,208,0.06)', border: '1px solid rgba(86,68,208,0.15)', borderRadius: '10px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚡</span>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '0.75rem' }}>Pro Plan</strong>
                </div>
              </div>
            )}
            {plan === 'pro_plus' && (
              <div style={{ padding: '10px 14px', background: 'rgba(86,68,208,0.06)', border: '1px solid rgba(86,68,208,0.15)', borderRadius: '10px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🚀</span>
                  <strong style={{ color: 'var(--color-secondary)', fontSize: '0.75rem' }}>Pro Plus Plan</strong>
                </div>
              </div>
            )}
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
                        <span className="badge badge-pro" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                          {item.badge === 'PRO_PLUS' ? 'PRO+' : item.badge}
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
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {/* Upgrade CTA — plan-aware */}
            {(plan === 'free' || plan === 'trialing' || plan === 'pro_trial') && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.82rem', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                View Plans
              </button>
            )}
            {plan === 'pro' && (
              <Link href="/pricing" className="btn btn-primary" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                Upgrade to Pro Plus →
              </Link>
            )}
            {plan === 'pro_plus' && (
              <Link href="/dashboard/settings" className="btn btn-secondary" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                Manage Subscription
              </Link>
            )}

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

      {showUpgrade && <UpgradeModal plan={plan} onClose={() => setShowUpgrade(false)} />}
    </CommandProvider>
    </PlanContext.Provider>
  );
}
