import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <>
      <Navbar />

      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className={styles.heroContent}>
            <div className={`${styles.heroBadge} animate-in`}>
              <span>⚡</span> Powered by Google Workspace MCP
            </div>
            <h1 className={`${styles.heroTitle} animate-in animate-in-delay-1`}>
              Your Google Workspace,<br />
              <span className="text-gradient">on autopilot.</span>
            </h1>
            <p className={`${styles.heroSubtitle} animate-in animate-in-delay-2`}>
              AI-powered daily briefings, natural language commands, and automated rules.
              Save 30+ minutes every day — no flowcharts, no setup, no learning curve.
            </p>
            <div className={`${styles.heroCtas} animate-in animate-in-delay-3`}>
              <Link href="/login" className="btn btn-primary btn-lg">
                Start Free 3-Day Trial →
              </Link>
              <Link href="#briefing-preview" className="btn btn-secondary btn-lg">
                See a Demo Briefing
              </Link>
            </div>
            <p className={`${styles.heroNote} animate-in animate-in-delay-4`}>
              No credit card required · Works with any Google Workspace account
            </p>
          </div>

          {/* Floating briefing preview card */}
          <div className={`${styles.heroPreview} animate-in animate-in-delay-5`}>
            <div className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <div className={styles.previewDots}>
                  <span /><span /><span />
                </div>
                <span className={styles.previewTitle}>Morning Briefing — Monday, Jun 16</span>
              </div>
              <div className={styles.previewBody}>
                <div className={styles.previewSection}>
                  <span className={styles.previewLabel}>📅 TODAY&apos;S SCHEDULE</span>
                  <div className={styles.previewEvent}>
                    <div className={styles.eventTime}>9:00 AM</div>
                    <div>
                      <div className={styles.eventTitle}>Client Kickoff: Acme Corp</div>
                      <div className={styles.eventMeta}>📍 Google Meet · 👥 Sarah, Mike, you</div>
                      <div className={styles.eventRelated}>📎 &quot;Re: Acme proposal questions&quot; · &quot;Project Proposal v2&quot;</div>
                    </div>
                  </div>
                  <div className={styles.previewEvent}>
                    <div className={styles.eventTime}>2:00 PM</div>
                    <div>
                      <div className={styles.eventTitle}>1:1 with Jordan</div>
                      <div className={styles.eventMeta}>👥 Jordan Lee</div>
                      <div className={styles.eventRelated}>📎 &quot;Q2 Goals - Jordan&quot;</div>
                    </div>
                  </div>
                </div>
                <div className={styles.previewSection}>
                  <span className={styles.previewLabel}>📬 INBOX SUMMARY</span>
                  <p className={styles.previewText}>
                    12 unread emails. Acme is ready to sign pending one revision. Dev candidate responded positively to offer.
                    <span className={styles.urgentTag}>⚡ 2 likely urgent</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className={styles.socialProof}>
        <div className="container">
          <p className={styles.socialText}>Trusted by operators who live in Google Workspace</p>
          <div className={styles.socialLogos}>
            <span>🏢 Indie Hackers</span>
            <span>🚀 ProductHunt #3</span>
            <span>⭐ 4.9/5 Rating</span>
            <span>👥 1,000+ Users</span>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="section" id="features">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Features</span>
            <h2 className={styles.sectionTitle}>
              Three ways to <span className="text-gradient">reclaim your time</span>
            </h2>
            <p className={styles.sectionSubtitle}>
              From morning briefings to natural language commands, CouchMail handles the repetitive work so you can focus on what matters.
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(79, 125, 249, 0.1)' }}>📅</div>
              <div className={styles.featureLabel}>
                <span className="badge badge-free">MVP</span>
              </div>
              <h3>Morning Briefing</h3>
              <p>Every morning, get a personalized digest: today&apos;s meetings with related docs &amp; emails, AI inbox summary, and priority flags.</p>
              <ul className={styles.featureList}>
                <li>✓ Today&apos;s meetings with context</li>
                <li>✓ AI-powered inbox summary</li>
                <li>✓ Priority email detection</li>
                <li>✓ Email or Telegram delivery</li>
              </ul>
            </div>

            <div className={`card ${styles.featureCard} ${styles.featureCardFeatured}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(139, 92, 246, 0.1)' }}>💬</div>
              <div className={styles.featureLabel}>
                <span className="badge badge-pro">v1.1</span>
              </div>
              <h3>Command Bar</h3>
              <p>Type what you want in natural language. Send emails, schedule meetings, find docs, organize files — all from one input.</p>
              <ul className={styles.featureList}>
                <li>✓ Natural language interface</li>
                <li>✓ Cross-service actions</li>
                <li>✓ Preview before execute</li>
                <li>✓ Gmail, Drive, Calendar</li>
              </ul>
            </div>

            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(52, 211, 153, 0.1)' }}>🔄</div>
              <div className={styles.featureLabel}>
                <span className="badge badge-new">v1.2</span>
              </div>
              <h3>Automated Rules</h3>
              <p>Set-and-forget rules described in plain English. Archive newsletters, organize invoices, track contracts — automatically.</p>
              <ul className={styles.featureList}>
                <li>✓ Natural language rules</li>
                <li>✓ Schedule-based triggers</li>
                <li>✓ Pre-built templates</li>
                <li>✓ Execution logging</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className={`section ${styles.howItWorks}`} id="how-it-works">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>How It Works</span>
            <h2 className={styles.sectionTitle}>Up and running in <span className="text-gradient">under 60 seconds</span></h2>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Connect Google</h3>
              <p>One-click OAuth. Read-only access to Gmail, Calendar, and Drive. No passwords stored.</p>
            </div>
            <div className={styles.stepConnector}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Pick Your Time</h3>
              <p>Choose when your morning briefing arrives. We auto-detect your timezone.</p>
            </div>
            <div className={styles.stepConnector}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Relax</h3>
              <p>Your first briefing arrives tomorrow. No setup, no config, no learning curve.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BRIEFING PREVIEW ===== */}
      <section className="section" id="briefing-preview">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Preview</span>
            <h2 className={styles.sectionTitle}>See what your <span className="text-gradient">morning briefing</span> looks like</h2>
            <p className={styles.sectionSubtitle}>Every morning, you get a full picture of your day — meetings, context, inbox summary, and urgent items.</p>
          </div>

          <div className={styles.briefingDemo}>
            <div className={styles.briefingEmail}>
              <div className={styles.briefingEmailHeader}>
                <strong>Subject:</strong> Your Monday, June 16 — 4 meetings, 12 unread emails
              </div>
              <div className={styles.briefingSection}>
                <h4>📅 TODAY&apos;S SCHEDULE</h4>
                <div className={styles.briefingEvent}>
                  <div className={styles.briefingEventHeader}>
                    <span className={styles.briefingTime}>9:00 AM</span>
                    <span className={styles.briefingEventTitle}>Client Kickoff: Acme Corp</span>
                  </div>
                  <div className={styles.briefingEventDetails}>
                    <span>📍 Google Meet</span>
                    <span>👥 Sarah Chen, Mike Torres, you</span>
                  </div>
                  <div className={styles.briefingRelated}>
                    <span className={styles.relatedLabel}>📎 Related:</span>
                    <div className={styles.relatedItems}>
                      <div className={styles.relatedItem}>
                        <span className={styles.relatedIcon}>✉️</span>
                        &quot;Re: Acme proposal questions&quot; <span className={styles.relatedDate}>(Jun 14)</span>
                      </div>
                      <div className={styles.relatedItem}>
                        <span className={styles.relatedIcon}>📄</span>
                        &quot;Acme Corp - Project Proposal v2&quot; <span className={styles.relatedDate}>(edited Jun 13)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.briefingEvent}>
                  <div className={styles.briefingEventHeader}>
                    <span className={styles.briefingTime}>11:30 AM</span>
                    <span className={styles.briefingEventTitle}>Team Standup</span>
                  </div>
                  <div className={styles.briefingEventDetails}>
                    <span>📍 Conference Room B</span>
                    <span>👥 Full team (8 people)</span>
                  </div>
                  <div className={styles.briefingNoRelated}>📎 No related items found</div>
                </div>

                <div className={styles.briefingEvent}>
                  <div className={styles.briefingEventHeader}>
                    <span className={styles.briefingTime}>2:00 PM</span>
                    <span className={styles.briefingEventTitle}>1:1 with Jordan</span>
                  </div>
                  <div className={styles.briefingEventDetails}>
                    <span>👥 Jordan Lee</span>
                  </div>
                  <div className={styles.briefingRelated}>
                    <span className={styles.relatedLabel}>📎 Related:</span>
                    <div className={styles.relatedItems}>
                      <div className={styles.relatedItem}>
                        <span className={styles.relatedIcon}>📄</span>
                        &quot;Q2 Goals - Jordan&quot; <span className={styles.relatedDate}>(shared Jun 1)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.briefingSection}>
                <h4>📬 INBOX SUMMARY</h4>
                <p className={styles.briefingSummaryText}>
                  12 unread emails overnight. Key themes: Acme is ready to sign pending one contract revision (Sarah&apos;s email), your developer candidate responded to the offer (positive), and 3 newsletters you can probably skip. One email from your accountant about Q2 taxes may need attention today.
                </p>
                <div className={styles.briefingUrgent}>
                  <h5>⚡ Likely urgent:</h5>
                  <ul>
                    <li>Sarah Chen: &quot;Contract revision needed before signing&quot;</li>
                    <li>David Park (Accountant): &quot;Q2 estimated taxes — deadline Wed&quot;</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section className={`section ${styles.comparisonSection}`}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Comparison</span>
            <h2 className={styles.sectionTitle}>Why teams <span className="text-gradient">switch to CouchMail</span></h2>
          </div>

          <div className={styles.comparisonTable}>
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className={styles.highlighted}>CouchMail</th>
                  <th>Zapier</th>
                  <th>Make.com</th>
                  <th>Google Native</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Price</td>
                  <td className={styles.highlighted}><strong>$9/mo</strong></td>
                  <td>$29.99/mo+</td>
                  <td>€9/mo</td>
                  <td>Free</td>
                </tr>
                <tr>
                  <td>Free trial</td>
                  <td className={styles.highlighted}>3 days, no card</td>
                  <td>14 days, card required</td>
                  <td>14 days</td>
                  <td>N/A</td>
                </tr>
                <tr>
                  <td>Natural language</td>
                  <td className={styles.highlighted}>✅ Primary UI</td>
                  <td>Beta add-on</td>
                  <td>❌</td>
                  <td>❌</td>
                </tr>
                <tr>
                  <td>Setup time</td>
                  <td className={styles.highlighted}>&lt;1 min</td>
                  <td>10-30 min</td>
                  <td>10-30 min</td>
                  <td>5-10 min</td>
                </tr>
                <tr>
                  <td>AI summaries</td>
                  <td className={styles.highlighted}>✅ Built-in</td>
                  <td>Via add-ons</td>
                  <td>Via add-ons</td>
                  <td>❌</td>
                </tr>
                <tr>
                  <td>Morning briefing</td>
                  <td className={styles.highlighted}>✅</td>
                  <td>Build yourself</td>
                  <td>Build yourself</td>
                  <td>❌</td>
                </tr>
                <tr>
                  <td>Google-deep</td>
                  <td className={styles.highlighted}>✅✅✅</td>
                  <td>✅</td>
                  <td>✅</td>
                  <td>✅✅</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="section">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Testimonials</span>
            <h2 className={styles.sectionTitle}>What our <span className="text-gradient">users say</span></h2>
          </div>

          <div className={styles.testimonialsGrid}>
            <div className={`card ${styles.testimonialCard}`}>
              <p className={styles.testimonialText}>
                &quot;I tried setting up Zapier to organize my inbox and gave up after an hour. I just wanted to automatically label invoices. CouchMail did it in one sentence.&quot;
              </p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar}>🎨</div>
                <div>
                  <strong>Jamie R.</strong>
                  <span>Freelance Designer</span>
                </div>
              </div>
            </div>

            <div className={`card ${styles.testimonialCard}`}>
              <p className={styles.testimonialText}>
                &quot;Every morning I spent 20 minutes figuring out what I need to prep for each meeting. Now CouchMail does it for me before I even open my laptop.&quot;
              </p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar}>💼</div>
                <div>
                  <strong>Alex K.</strong>
                  <span>Startup Ops Lead</span>
                </div>
              </div>
            </div>

            <div className={`card ${styles.testimonialCard}`}>
              <p className={styles.testimonialText}>
                &quot;I was paying $50/month for Zapier and only used it for 3 things, all in Google. CouchMail is $9 and does it better.&quot;
              </p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar}>🏢</div>
                <div>
                  <strong>Maria S.</strong>
                  <span>Agency Owner</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING PREVIEW ===== */}
      <section className={`section ${styles.pricingPreview}`} id="pricing">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Pricing</span>
            <h2 className={styles.sectionTitle}>Simple, <span className="text-gradient">transparent pricing</span></h2>
            <p className={styles.sectionSubtitle}>Start with a free 3-day Pro trial. No credit card required.</p>
          </div>

          <div className={styles.pricingGrid}>
            <div className="pricing-card">
              <div className="pricing-tier">Free</div>
              <div className="pricing-amount">$0<span>/mo</span></div>
              <p className="pricing-desc">Basic daily briefing after trial ends</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Up to 3 meetings shown</li>
                <li><span className="check">✓</span> Basic inbox summary (1 sentence)</li>
                <li><span className="cross">✕</span> No related docs/emails</li>
                <li><span className="cross">✕</span> No priority detection</li>
                <li><span className="cross">✕</span> No command bar</li>
                <li><span className="cross">✕</span> No automated rules</li>
              </ul>
              <Link href="/login" className="btn btn-secondary" style={{ width: '100%' }}>Get Started</Link>
            </div>

            <div className="pricing-card featured">
              <div className="pricing-tier">Pro</div>
              <div className="pricing-amount">$9<span>/mo</span></div>
              <p className="pricing-desc">Full power for individuals</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Unlimited meetings shown</li>
                <li><span className="check">✓</span> Full AI inbox summary</li>
                <li><span className="check">✓</span> Related docs &amp; emails</li>
                <li><span className="check">✓</span> Priority email detection</li>
                <li><span className="check">✓</span> Natural language command bar</li>
                <li><span className="check">✓</span> Unlimited automated rules</li>
                <li><span className="check">✓</span> Telegram delivery</li>
                <li><span className="check">✓</span> Custom briefing time</li>
              </ul>
              <Link href="/login" className="btn btn-primary" style={{ width: '100%' }}>Start Free Trial →</Link>
            </div>

            <div className="pricing-card">
              <div className="pricing-tier">Pro Plus</div>
              <div className="pricing-amount">$19<span>/mo</span></div>
              <p className="pricing-desc">For power users who want everything</p>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Everything in Pro</li>
                <li><span className="check">✓</span> Unlimited automations</li>
                <li><span className="check">✓</span> Priority support</li>
                <li><span className="check">✓</span> Early access to new features</li>
                <li><span className="check">✓</span> Advanced AI commands</li>
              </ul>
              <Link href="/login" className="btn btn-secondary" style={{ width: '100%' }}>Start Free Trial →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className={styles.finalCta}>
        <div className="container text-center">
          <h2 className={styles.ctaTitle}>Ready to reclaim your mornings?</h2>
          <p className={styles.ctaSubtitle}>
            Join 1,000+ operators who save 30+ minutes every day with CouchMail.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/login" className="btn btn-primary btn-lg">
              Start Free 3-Day Trial →
            </Link>
          </div>
          <p className={styles.heroNote}>No credit card required · Cancel anytime</p>
        </div>
      </section>

      <Footer />
    </>
  );
}
