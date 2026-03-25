import Link from 'next/link';

function CouchMailLogoLight() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" fill="none" />
        <circle cx="20" cy="20" r="19" stroke="url(#footerLogoGrad)" strokeWidth="1.5" fill="none" />
        <path
          d="M22 13 C17 13 13 16.5 13 20.5 C13 24.5 17 28 22 28"
          stroke="url(#footerLogoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M20 27 L20 16 L24.5 21 L29 16 L29 27"
          stroke="url(#footerLogoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="24.5" cy="21" r="1.5" fill="#7264e8" />
        <defs>
          <linearGradient id="footerLogoGrad" x1="8" y1="10" x2="32" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a89df0" />
            <stop offset="100%" stopColor="#e8ecff" />
          </linearGradient>
        </defs>
      </svg>
      <span style={{
        fontFamily: "'Manrope', 'Inter', sans-serif",
        fontWeight: 800,
        fontSize: '1.15rem',
        color: '#fff',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        CouchMail
      </span>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '4px' }}>
              <CouchMailLogoLight />
            </Link>
            <p>Intelligence for the modern workspace. AI-powered briefings that synthesize your emails, docs, and calendar into one actionable daily dossier.</p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <Link href="/#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/#how-it-works">How It Works</Link>
            <Link href="/#briefing-preview">Briefing Preview</Link>
          </div>

          <div className="footer-col">
            <h4>Company</h4>
            <Link href="#">About</Link>
            <Link href="#">Blog</Link>
            <Link href="#">Careers</Link>
            <Link href="#">Contact</Link>
          </div>

          <div className="footer-col">
            <h4>Legal</h4>
            <Link href="#">Privacy Policy</Link>
            <Link href="#">Terms of Service</Link>
            <Link href="#">Cookie Policy</Link>
            <Link href="#">Security</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 CouchMail. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="#" style={{ color: 'rgba(255,255,255,0.35)' }}>Twitter</Link>
            <Link href="#" style={{ color: 'rgba(255,255,255,0.35)' }}>LinkedIn</Link>
            <Link href="#" style={{ color: 'rgba(255,255,255,0.35)' }}>GitHub</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
