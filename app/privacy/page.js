import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'Privacy Policy | WorkspaceFlow',
  description: 'Privacy Policy for WorkspaceFlow.',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-height)', background: 'var(--color-surface)', minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: '780px', margin: '0 auto', padding: '64px var(--sp-6) 80px' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--color-primary)', marginBottom: '8px' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '48px' }}>
            Last updated: April 28, 2026
          </p>

          <Section title="1. Overview">
            <p>WorkspaceFlow collects and processes account, workspace, and usage data only as needed to operate the automation features you enable.</p>
          </Section>

          <Section title="2. Data We Use">
            <p>This may include Google account profile data, Gmail messages, calendar events, Drive metadata, configuration choices, automation settings, and operational logs.</p>
          </Section>

          <Section title="3. Google API Data">
            <p>WorkspaceFlow uses Google API data only to provide visible user-facing features such as briefings, commands, and automations, consistent with the Google API Services User Data Policy and its Limited Use requirements.</p>
          </Section>

          <Section title="4. Storage">
            <p>Account profiles, tokens, automation settings, and system metadata are stored using infrastructure such as Supabase and hosting providers required to operate the app.</p>
          </Section>

          <Section title="5. How We Use Data">
            <p>We use your data to authenticate you, run commands, generate briefings, execute automations, deliver notifications, respond to support requests, and improve reliability.</p>
          </Section>

          <Section title="6. Sharing">
            <p>We do not sell your personal data. Data is shared only with infrastructure and AI providers necessary to operate the service, such as Supabase, hosting providers, Telegram, and model providers used for summaries and command interpretation.</p>
          </Section>

          <Section title="7. Retention and Deletion">
            <p>We retain data only as long as needed to operate your account and workflows. You may request deletion of your account data by contacting support.</p>
          </Section>

          <Section title="8. Contact">
            <p>Privacy questions can be sent to <a href="mailto:umershehzad.at1863@gmail.com" style={{ color: 'var(--color-secondary)' }}>umershehzad.at1863@gmail.com</a>.</p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '40px' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-primary)', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
        {title}
      </h2>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children}
      </div>
    </section>
  );
}
