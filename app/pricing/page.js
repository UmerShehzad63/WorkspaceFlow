'use client';
import { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Link from 'next/link';
import styles from './pricing.module.css';

async function handleCheckout(priceId, setLoading) {
  setLoading(priceId);
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else if (data.error === 'Not authenticated') {
      window.location.href = '/login';
    } else {
      alert('Something went wrong. Please try again.');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  } finally {
    setLoading(null);
  }
}

export default function PricingPage() {
  const [loading, setLoading] = useState(null);

  const PRO_PRICE_ID      = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;
  const PRO_PLUS_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRO_PLUS_PRICE_ID;

  return (
    <>
      <Navbar />

      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Simple, <span className="text-gradient">transparent pricing</span></h1>
            <p className={styles.heroSubtitle}>Start with a free 3-day Pro trial. No credit card required. Cancel anytime.</p>
          </div>

          {/* Pricing Cards */}
          <div className={styles.pricingGrid}>
            {/* Free */}
            <div className="pricing-card">
              <div className="pricing-tier">Free</div>
              <div className="pricing-amount">$0<span>/mo</span></div>
              <p className="pricing-desc">Basic daily briefing after your trial ends</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Daily morning briefing</li>
                <li><span className="check">✓</span> Up to 3 meetings shown</li>
                <li><span className="check">✓</span> 1-sentence inbox summary</li>
                <li><span className="cross">✕</span> Related docs &amp; emails</li>
                <li><span className="cross">✕</span> Priority email detection</li>
                <li><span className="cross">✕</span> Command bar</li>
                <li><span className="cross">✕</span> Automated rules</li>
                <li><span className="cross">✕</span> Custom delivery time</li>
                <li><span className="cross">✕</span> Telegram delivery</li>
              </ul>
              <Link href="/login" className="btn btn-secondary" style={{ width: '100%' }}>Get Started</Link>
            </div>

            {/* Pro */}
            <div className="pricing-card featured">
              <div className="pricing-tier">Pro</div>
              <div className="pricing-amount">$9<span>/mo</span></div>
              <p className="pricing-desc">Full power for individuals and freelancers</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Full morning briefing</li>
                <li><span className="check">✓</span> Unlimited meetings shown</li>
                <li><span className="check">✓</span> Full AI inbox summary</li>
                <li><span className="check">✓</span> Related docs &amp; emails per meeting</li>
                <li><span className="check">✓</span> Priority email detection</li>
                <li><span className="check">✓</span> Natural language command bar</li>
                <li><span className="check">✓</span> Up to 5 automated rules</li>
                <li><span className="check">✓</span> Custom delivery time</li>
                <li><span className="check">✓</span> Telegram delivery</li>
                <li><span className="check">✓</span> Skip weekends option</li>
              </ul>
              <button
                onClick={() => handleCheckout(PRO_PRICE_ID, setLoading)}
                disabled={loading === PRO_PRICE_ID}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                {loading === PRO_PRICE_ID ? 'Redirecting...' : 'Start Free 3-Day Trial →'}
              </button>
            </div>

            {/* Pro Plus */}
            <div className="pricing-card">
              <div className="pricing-tier">Pro Plus</div>
              <div className="pricing-amount">$19<span>/mo</span></div>
              <p className="pricing-desc">Unlimited power for power users and teams</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Everything in Pro</li>
                <li><span className="check">✓</span> <strong>Unlimited</strong> automated rules</li>
                <li><span className="check">✓</span> Multiple team members</li>
                <li><span className="check">✓</span> Shared automations</li>
                <li><span className="check">✓</span> Shared command history</li>
                <li><span className="check">✓</span> Admin controls &amp; permissions</li>
                <li><span className="check">✓</span> Audit log</li>
                <li><span className="check">✓</span> Priority support</li>
              </ul>
              <button
                onClick={() => handleCheckout(PRO_PLUS_PRICE_ID, setLoading)}
                disabled={loading === PRO_PLUS_PRICE_ID}
                className="btn btn-secondary"
                style={{ width: '100%' }}
              >
                {loading === PRO_PLUS_PRICE_ID ? 'Redirecting...' : 'Get Pro Plus →'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Comparison */}
      <section className={styles.comparison}>
        <div className="container">
          <h2 className={styles.comparisonTitle}>Detailed Feature Comparison</h2>
          <div className={styles.comparisonTable}>
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th className={styles.highlighted}>Pro</th>
                  <th>Pro Plus</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Morning briefing</td><td>Limited</td><td className={styles.highlighted}>Full</td><td>Full</td></tr>
                <tr><td>Meetings shown</td><td>Up to 3</td><td className={styles.highlighted}>Unlimited</td><td>Unlimited</td></tr>
                <tr><td>Related docs/emails</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>AI inbox summary</td><td>1 sentence</td><td className={styles.highlighted}>Full</td><td>Full</td></tr>
                <tr><td>Priority detection</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>Command bar</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>Automated rules</td><td>❌</td><td className={styles.highlighted}>Up to 5</td><td>Unlimited</td></tr>
                <tr><td>Custom delivery time</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>Telegram delivery</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>Skip weekends</td><td>❌</td><td className={styles.highlighted}>✅</td><td>✅</td></tr>
                <tr><td>Team members</td><td>1</td><td className={styles.highlighted}>1</td><td>Up to 10</td></tr>
                <tr><td>Shared rules</td><td>❌</td><td className={styles.highlighted}>❌</td><td>✅</td></tr>
                <tr><td>Admin controls</td><td>❌</td><td className={styles.highlighted}>❌</td><td>✅</td></tr>
                <tr><td>Audit log</td><td>❌</td><td className={styles.highlighted}>❌</td><td>✅</td></tr>
                <tr><td>Priority support</td><td>❌</td><td className={styles.highlighted}>❌</td><td>✅</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faq}>
        <div className="container">
          <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
          <div className={styles.faqGrid}>
            <div className={styles.faqItem}>
              <h3>How does the 3-day trial work?</h3>
              <p>Sign up with your Google account and immediately get full Pro access for 3 days. No credit card required. After 3 days, you can upgrade to Pro or continue with the free plan.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>What happens when my trial ends?</h3>
              <p>You automatically switch to the Free plan. You&apos;ll still get a daily briefing with up to 3 meetings and a basic summary. Upgrade anytime to get full features back.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Can I cancel anytime?</h3>
              <p>Yes! Cancel your Pro or Pro Plus subscription at any time. You&apos;ll keep access until the end of your current billing period, then switch to Free.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Is my data secure?</h3>
              <p>Absolutely. We use AES-256-GCM encryption for all OAuth tokens, read-only access by default, and never store your passwords.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>What Google Workspace apps are supported?</h3>
              <p>Gmail, Google Calendar, and Google Drive. Google Sheets integration is coming in the next update.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Do you offer annual billing?</h3>
              <p>Not yet, but it&apos;s coming soon! Annual billing will include a discount (2 months free).</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.cta}>
        <div className="container text-center">
          <h2>Ready to try WorkspaceFlow?</h2>
          <p>Start your free 3-day Pro trial today. No credit card required.</p>
          <button
            onClick={() => handleCheckout(PRO_PRICE_ID, setLoading)}
            disabled={loading === PRO_PRICE_ID}
            className="btn btn-primary btn-lg"
          >
            {loading === PRO_PRICE_ID ? 'Redirecting...' : 'Start Free Trial →'}
          </button>
        </div>
      </section>

      <Footer />
    </>
  );
}
