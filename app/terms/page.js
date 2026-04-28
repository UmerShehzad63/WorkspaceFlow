import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'Terms of Service | WorkspaceFlow',
  description: 'Terms of Service for WorkspaceFlow.',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-height)', background: 'var(--color-surface)', minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: '780px', margin: '0 auto', padding: '64px var(--sp-6) 80px' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--color-primary)', marginBottom: '8px' }}>
            Terms of Service
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '48px' }}>
            Last updated: April 28, 2026
          </p>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using WorkspaceFlow, you agree to these Terms of Service and our Privacy Policy.</p>
          </Section>

          <Section title="2. Service Description">
            <p>WorkspaceFlow is a Google Workspace automation system that can generate briefings, execute natural-language commands, and run user-configured automations across connected services.</p>
          </Section>

          <Section title="3. Accounts">
            <p>You must use a valid Google account, keep your access credentials secure, and remain responsible for activity performed through your account.</p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You may not use the service to violate laws, send spam, access data without authorization, interfere with platform security, or abuse third-party integrations.</p>
          </Section>

          <Section title="5. Third-Party Services">
            <p>WorkspaceFlow integrates with providers such as Google Workspace, Telegram, Supabase, and AI model providers. Your use of those services remains subject to their own terms.</p>
          </Section>

          <Section title="6. Intellectual Property">
            <p>The service software, branding, and platform materials remain the property of WorkspaceFlow or its licensors. You retain ownership of your own workspace data.</p>
          </Section>

          <Section title="7. Disclaimer">
            <p>The service is provided on an as-is basis. AI outputs and automation actions may contain errors, so you remain responsible for reviewing important outputs and decisions.</p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the maximum extent permitted by law, WorkspaceFlow will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service.</p>
          </Section>

          <Section title="9. Termination">
            <p>You may stop using the service at any time. We may suspend access for misuse, abuse, or legal compliance needs.</p>
          </Section>

          <Section title="10. Contact">
            <p>Questions about these terms can be sent to <a href="mailto:umershehzad.at1863@gmail.com" style={{ color: 'var(--color-secondary)' }}>umershehzad.at1863@gmail.com</a>.</p>
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
