import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'Terms of Service | CouchMail',
  description: 'Terms of Service for CouchMail — the rules governing your use of the platform.',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-height)', background: 'var(--color-surface)', minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: '780px', margin: '0 auto', padding: '64px var(--sp-6) 80px' }}>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--color-primary)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Terms of Service
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '48px' }}>
            Last updated: March 26, 2026
          </p>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using CouchMail ("the Service") you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you do not agree to these Terms you must not use the Service.</p>
            <p>We may update these Terms at any time. Continued use of the Service after changes constitutes your acceptance. We will provide reasonable notice of material changes via email or an in-app notification.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>CouchMail is an AI-powered productivity platform that connects to your Google Workspace (Gmail, Google Calendar, Google Drive) to generate intelligent daily briefings, execute natural-language commands, and run automated workflows. The Service is provided on a subscription basis with a limited free tier.</p>
          </Section>

          <Section title="3. User Accounts">
            <p>To use CouchMail you must:</p>
            <ul>
              <li>Have a valid Google account and grant the required OAuth permissions.</li>
              <li>Be at least 13 years of age (or the minimum age of digital consent in your country).</li>
              <li>Provide accurate information and keep it up to date.</li>
              <li>Be responsible for maintaining the confidentiality of your account and for all activity that occurs under it.</li>
            </ul>
            <p>You must notify us immediately at <a href="mailto:support@couchmail.app" style={{ color: 'var(--color-secondary)' }}>support@couchmail.app</a> if you suspect any unauthorised use of your account. We are not liable for any loss resulting from unauthorised use that you fail to report promptly.</p>
            <p>We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or misuse the Service.</p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Violate any applicable laws or regulations.</li>
              <li>Send spam, unsolicited messages, or bulk commercial emails through automated rules.</li>
              <li>Attempt to reverse-engineer, decompile, or extract the source code of the Service.</li>
              <li>Circumvent any access controls or security measures.</li>
              <li>Interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Access another user's data without authorisation.</li>
              <li>Resell or sublicense access to the Service without our prior written consent.</li>
            </ul>
          </Section>

          <Section title="5. Subscription and Billing">
            <p>CouchMail offers a free tier and paid plans (Pro and Pro Plus). Paid plans are billed monthly in advance via Stripe. All fees are non-refundable except where required by law. We reserve the right to change pricing with 30 days' notice. If you cancel your subscription, you retain access until the end of your current billing period.</p>
          </Section>

          <Section title="6. Intellectual Property">
            <p>All content, software, and technology comprising the Service are owned by CouchMail or its licensors and are protected by intellectual property laws. These Terms do not grant you any right, title, or interest in the Service beyond the limited licence to use it in accordance with these Terms.</p>
            <p>You retain all ownership of your data (emails, calendar events, documents). By using the Service you grant us a limited licence to process your data solely to provide the Service to you.</p>
          </Section>

          <Section title="7. Third-Party Services">
            <p>The Service integrates with third-party platforms including Google Workspace, Stripe, Telegram, and AI providers. Your use of those platforms is governed by their own terms and privacy policies. We are not responsible for the practices of any third-party service.</p>
          </Section>

          <Section title="8. Disclaimer of Warranties">
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.</p>
            <p>AI-generated summaries, commands, and automation outputs may contain errors or inaccuracies. You are responsible for reviewing any AI-generated actions before relying on them for important decisions.</p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, COUCHMAIL AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
            <p>OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNT YOU PAID TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) USD $50.</p>
            <p>Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability, so the above limitations may not apply to you in full.</p>
          </Section>

          <Section title="10. Indemnification">
            <p>You agree to indemnify and hold harmless CouchMail and its affiliates from any claims, damages, losses, or expenses (including reasonable legal fees) arising out of your use of the Service, your violation of these Terms, or your violation of any third-party rights.</p>
          </Section>

          <Section title="11. Termination">
            <p>You may stop using the Service and delete your account at any time via the Settings page. We may suspend or terminate your access at any time for violation of these Terms. Upon termination, your right to use the Service ceases immediately. Provisions of these Terms that by their nature should survive termination (including Sections 6, 8, 9, and 10) will survive.</p>
          </Section>

          <Section title="12. Governing Law">
            <p>These Terms are governed by and construed in accordance with applicable law. Any disputes arising out of or relating to these Terms or the Service shall be resolved through binding arbitration or in the competent courts of the jurisdiction in which CouchMail operates, as determined by us.</p>
          </Section>

          <Section title="13. Contact">
            <p>For questions about these Terms please contact us at <a href="mailto:legal@couchmail.app" style={{ color: 'var(--color-secondary)' }}>legal@couchmail.app</a>.</p>
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
