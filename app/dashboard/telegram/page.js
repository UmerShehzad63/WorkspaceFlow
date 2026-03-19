'use client';
import TelegramConnect from '../components/TelegramConnect';

export default function TelegramPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Telegram</h1>
        <p>Receive your morning briefing and AI-generated summaries via Telegram.</p>
      </div>

      {/* How it works */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
          How It Works
        </div>
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { step: '1', text: 'Click "Connect Telegram" below to generate your personal verification code.' },
            { step: '2', text: 'Open Telegram and search for @WorkspaceFlowBot.' },
            { step: '3', text: 'Send the command /verify YOUR_CODE to the bot.' },
            { step: '4', text: "You're connected! Your daily briefing will arrive each morning." },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, color: '#fff' }}>
                {step}
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Connection widget */}
      <div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
          Connection Status
        </div>
        <TelegramConnect />
      </div>
    </div>
  );
}
