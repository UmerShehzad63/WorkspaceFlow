import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'Privacy Policy | CouchMail',
  description: 'Privacy Policy for CouchMail — how we collect, store, and use your data.',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-height)', background: 'var(--color-surface)', minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: '780px', margin: '0 auto', padding: '64px var(--sp-6) 80px' }}>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--color-primary)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '48px' }}>
            Last updated: March 26, 2026
          </p>

          <Section title="1. Introduction">
            <p>CouchMail ("we", "our", or "us") operates the CouchMail web application (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this policy carefully. By using CouchMail you agree to the terms described here.</p>
          </Section>

          <Section title="2. Collection of Data">
            <p>We collect the following categories of data to provide the Service:</p>
            <ul>
              <li><strong>Google Account Profile:</strong> When you sign in with Google OAuth we receive your name, email address, and profile picture. This is used solely to identify your account.</li>
              <li><strong>Google Email Data (Gmail):</strong> With your explicit permission we access your Gmail messages to generate daily briefings, execute commands (search, send, archive), and run automations you configure. We read the minimum data necessary to fulfil each action.</li>
              <li><strong>Google Calendar Data:</strong> We access your calendar events to include schedule information in briefings and to create or modify events on your behalf when you issue a command.</li>
              <li><strong>Google Drive Data:</strong> We access Google Drive file metadata and content in read-only mode to surface relevant documents in briefings and command results.</li>
              <li><strong>Usage Data:</strong> We automatically collect information such as your IP address, browser type, pages visited, and timestamps to diagnose issues and improve the Service.</li>
            </ul>
          </Section>

          <Section title="3. Google Limited Use Disclosure">
            <p style={{ background: 'rgba(86,68,208,0.05)', border: '1px solid rgba(86,68,208,0.2)', borderRadius: '10px', padding: '16px 20px', lineHeight: 1.7 }}>
              CouchMail's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul>
              <li>We only request access to Google user data that is necessary to provide the features of CouchMail.</li>
              <li>We do not use Google user data to serve advertisements.</li>
              <li>We do not allow humans to read Google user data unless you have given explicit permission, it is necessary for security purposes, or we are required to do so by law.</li>
              <li>We do not sell, transfer, or share Google user data with third parties except as necessary to provide and improve the Service, or as required by law.</li>
              <li>We do not use Google user data for any purpose other than providing or improving user-facing features.</li>
            </ul>
          </Section>

          <Section title="4. Storage">
            <p>Your data is stored using the following infrastructure:</p>
            <ul>
              <li><strong>Supabase (PostgreSQL):</strong> Your account profile, plan information, automation configurations, briefing preferences, and automation logs are stored in a Supabase-managed PostgreSQL database. Supabase is SOC 2 Type II certified and encrypts data at rest and in transit.</li>
              <li><strong>Google OAuth Tokens:</strong> Access and refresh tokens provided by Google are stored securely in Supabase with row-level security policies ensuring only your own records are accessible.</li>
              <li><strong>No Raw Email Storage:</strong> We do not persistently store the full content of your emails or calendar events. Data is fetched in real time when you request a briefing or execute a command and is not written to our databases.</li>
            </ul>
          </Section>

          <Section title="5. How We Use Your Data">
            <ul>
              <li>To authenticate you and maintain your account session.</li>
              <li>To generate your daily AI-powered briefings from Gmail, Calendar, and Drive.</li>
              <li>To execute commands you issue through the Command Bar.</li>
              <li>To run automations you have configured.</li>
              <li>To deliver briefings via Telegram if you have connected a Telegram account.</li>
              <li>To process subscription payments through Stripe.</li>
              <li>To respond to support requests.</li>
              <li>To improve the reliability and features of the Service.</li>
            </ul>
          </Section>

          <Section title="6. Data Sharing">
            <p>We do not sell your personal data. We share data only with the following service providers as necessary to operate the Service:</p>
            <ul>
              <li><strong>Supabase</strong> — database and authentication infrastructure.</li>
              <li><strong>OpenAI / Anthropic</strong> — AI language model providers used to generate briefing summaries. Prompts may include email/calendar content; these providers do not use this data to train their models under our enterprise agreements.</li>
              <li><strong>Stripe</strong> — payment processing. Stripe is PCI DSS compliant.</li>
              <li><strong>Render</strong> — backend hosting provider.</li>
              <li><strong>Vercel</strong> — frontend hosting provider.</li>
            </ul>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your account data for as long as your account is active. Automation logs are retained for 90 days. You may request deletion of your account and all associated data at any time by contacting us at the address below. Upon deletion, your OAuth tokens are revoked and all personal data is removed from our systems within 30 days.</p>
          </Section>

          <Section title="8. Security">
            <p>We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, row-level security on all database tables, and regular security reviews. However, no system is 100% secure and we cannot guarantee absolute security.</p>
          </Section>

          <Section title="9. Your Rights">
            <p>Depending on your jurisdiction you may have rights to access, correct, delete, or restrict processing of your personal data. To exercise any of these rights, contact us at <a href="mailto:umershehzad.at1863@gmail.com" style={{ color: 'var(--color-secondary)' }}>umershehzad.at1863@gmail.com</a>. You may also revoke CouchMail's access to your Google data at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-secondary)' }}>Google Account Permissions</a> page.</p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>The Service is not directed to children under the age of 13. We do not knowingly collect personal data from children. If you believe a child has provided us with personal information please contact us and we will delete it.</p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="12. Contact">
            <p>For any questions about this Privacy Policy please contact us at <a href="mailto:umershehzad.at1863@gmail.com" style={{ color: 'var(--color-secondary)' }}>umershehzad.at1863@gmail.com</a>.</p>
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
