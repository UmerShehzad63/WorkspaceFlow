import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Link from 'next/link';
import styles from './page.module.css';

const automationExamples = [
  'Auto-label invoices and route them into finance review.',
  'Send a morning agenda with meeting context to Telegram every day.',
  'Create follow-up drafts after client meetings with linked files attached.',
  'Archive newsletters and surface only messages that need action.',
];

export default function LandingPage() {
  return (
    <>
      <Navbar />

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className={styles.heroContent}>
            <div className={`${styles.heroBadge} animate-in`}>
              <span>AI-Powered</span> Gmail & Calendar Automation
            </div>
            <h1 className={`${styles.heroTitle} animate-in animate-in-delay-1`}>
              Automate your Gmail,
              <br />
              Calendar, Drive, and briefings.
            </h1>
            <p className={`${styles.heroSubtitle} animate-in animate-in-delay-2`}>
              CouchMail brings daily briefings, AI-powered email automation, and always-on workflows to Gmail, Calendar, Drive, and Telegram—no coding required.
            </p>
            <div className={`${styles.heroCtas} animate-in animate-in-delay-3`}>
              <Link href="/login" className="btn btn-primary btn-lg">
                Sign In
              </Link>
              <Link href="/login" className="btn btn-ghost btn-lg" style={{ color: '#001857' }}>
                Sign Up
              </Link>
            </div>
            <p className={`${styles.heroNote} animate-in animate-in-delay-4`}>
              Built for operators, assistants, founders, and busy teams who live in Gmail
            </p>
          </div>

          <div className={`${styles.heroPreview} animate-in animate-in-delay-5`}>
            <div className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <div className={styles.previewDots}>
                  <span /><span /><span />
                </div>
                <span className={styles.previewTitle}>Automation Control Center</span>
              </div>
              <div className={styles.previewBody}>
                <div className={styles.previewSection}>
                  <span className={styles.previewLabel}>LIVE WORKFLOWS</span>
                  <div className={styles.previewEvent}>
                    <div className={styles.eventTime}>07:30</div>
                    <div>
                      <div className={styles.eventTitle}>Morning briefing delivered</div>
                      <div className={styles.eventMeta}>Email + Telegram summary with meeting context</div>
                      <div className={styles.eventRelated}>Includes related docs, urgent email flags, and next actions</div>
                    </div>
                  </div>
                  <div className={styles.previewEvent}>
                    <div className={styles.eventTime}>Always on</div>
                    <div>
                      <div className={styles.eventTitle}>Inbox triage running</div>
                      <div className={styles.eventMeta}>Invoices labeled, newsletters archived, VIP replies surfaced</div>
                      <div className={styles.eventRelated}>Command bar can jump in anytime for one-off actions</div>
                    </div>
                  </div>
                </div>
                <div className={styles.previewSection}>
                  <span className={styles.previewLabel}>WHAT THIS SYSTEM DOES</span>
                  <p className={styles.previewText}>
                    Reads workspace context, executes plain-English commands, and runs repeatable automations across Gmail, Calendar, Drive, and Telegram.
                    <span className={styles.urgentTag}>Always on</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.socialProof}>
        <div className="container">
          <p className={styles.socialText}>Designed for operational work that repeats every day</p>
          <div className={styles.socialLogos}>
            <span>Daily briefings</span>
            <span>AI command bar</span>
            <span>Template automations</span>
            <span>Telegram delivery</span>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Capabilities</span>
            <h2 className={styles.sectionTitle}>
              One system for <span className="text-gradient">workspace automation</span>
            </h2>
            <p className={styles.sectionSubtitle}>
              Everything in WorkspaceFlow is built around the same job: reducing repetitive Google Workspace work while keeping context visible.
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(79, 125, 249, 0.1)' }}>01</div>
              <h3>Daily Briefings</h3>
              <p>Generate clear morning briefings with meetings, related files, inbox summaries, and action flags.</p>
              <ul className={styles.featureList}>
                <li>Meeting context from Gmail, Calendar, and Drive</li>
                <li>Urgent email detection and summaries</li>
                <li>Email or Telegram delivery</li>
                <li>Personal notes before sending</li>
              </ul>
            </div>

            <div className={`card ${styles.featureCard} ${styles.featureCardFeatured}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(139, 92, 246, 0.1)' }}>02</div>
              <h3>AI Command Bar</h3>
              <p>Ask for work in plain English and let the system search, draft, schedule, and prepare the next step.</p>
              <ul className={styles.featureList}>
                <li>Search Gmail, Calendar, and Drive</li>
                <li>Preview before sending or scheduling</li>
                <li>Resolve recipients and attachments</li>
                <li>Use the same command layer across the dashboard and Telegram</li>
              </ul>
            </div>

            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: 'rgba(52, 211, 153, 0.1)' }}>03</div>
              <h3>Template Automations</h3>
              <p>Launch recurring workflows from templates and manage them from a single execution log.</p>
              <ul className={styles.featureList}>
                <li>Email, calendar, drive, and sheet triggers</li>
                <li>Scheduled or event-driven runs</li>
                <li>Editable templates with test runs</li>
                <li>Execution history and status visibility</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={`section ${styles.howItWorks}`} id="how-it-works">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>How It Works</span>
            <h2 className={styles.sectionTitle}>Connect once, automate every day</h2>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Connect Google Workspace</h3>
              <p>Sign in with Google and authorize the services you want WorkspaceFlow to work with.</p>
            </div>
            <div className={styles.stepConnector}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Choose commands or templates</h3>
              <p>Use the command bar for one-off work or start from templates for recurring automations.</p>
            </div>
            <div className={styles.stepConnector}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Monitor and refine</h3>
              <p>Track execution history, pause automations, send test runs, and keep the system aligned with your workflow.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="briefing-preview">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Workflow Preview</span>
            <h2 className={styles.sectionTitle}>A briefing built for execution, not just reading</h2>
            <p className={styles.sectionSubtitle}>The system turns raw workspace activity into a useful operational starting point for the day.</p>
          </div>

          <div className={styles.briefingDemo}>
            <div className={styles.briefingEmail}>
              <div className={styles.briefingEmailHeader}>
                <strong>Subject:</strong> WorkspaceFlow briefing for Tuesday: 4 meetings, 9 follow-ups, 3 automations completed
              </div>
              <div className={styles.briefingSection}>
                <h4>TODAY&apos;S PRIORITIES</h4>
                <div className={styles.briefingEvent}>
                  <div className={styles.briefingEventHeader}>
                    <span className={styles.briefingTime}>09:00</span>
                    <span className={styles.briefingEventTitle}>Client kickoff with Northstar</span>
                  </div>
                  <div className={styles.briefingEventDetails}>
                    <span>Google Meet</span>
                    <span>Deck, proposal, and last email thread attached below</span>
                  </div>
                </div>
                <div className={styles.briefingEvent}>
                  <div className={styles.briefingEventHeader}>
                    <span className={styles.briefingTime}>Inbox</span>
                    <span className={styles.briefingEventTitle}>3 messages need action</span>
                  </div>
                  <div className={styles.briefingEventDetails}>
                    <span>Contract revision from legal</span>
                    <span>Vendor invoice waiting for approval</span>
                  </div>
                </div>
              </div>

              <div className={styles.briefingSection}>
                <h4>AUTOMATION STATUS</h4>
                <p className={styles.briefingSummaryText}>
                  Newsletter cleanup ran successfully. Receipt labeling processed 6 new messages. The customer follow-up workflow drafted 2 replies and queued them for review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="automation-library">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Automation Library</span>
            <h2 className={styles.sectionTitle}>Examples of what you can run</h2>
            <p className={styles.sectionSubtitle}>The templates inside the app are meant to get real operational work off your plate quickly.</p>
          </div>

          <div className={styles.testimonialsGrid}>
            {automationExamples.map((example) => (
              <div key={example} className={`card ${styles.testimonialCard}`}>
                <p className={styles.testimonialText}>{example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className="container text-center">
          <h2 className={styles.ctaTitle}>Run Google Workspace like an automation system</h2>
          <p className={styles.ctaSubtitle}>
            Open the dashboard, connect your tools, and start turning repeated work into reusable workflows.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/login" className="btn btn-primary btn-lg">
              Launch WorkspaceFlow
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
