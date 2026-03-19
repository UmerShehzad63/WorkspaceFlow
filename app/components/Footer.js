import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="nav-logo" style={{ marginBottom: '4px' }}>
              <div className="nav-logo-icon">⚡</div>
              WorkspaceFlow
            </Link>
            <p>AI-powered automation for Google Workspace. Save 30+ minutes every day with intelligent briefings, natural language commands, and automated rules.</p>
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
          <span>© 2026 WorkspaceFlow. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="#">Twitter</Link>
            <Link href="#">LinkedIn</Link>
            <Link href="#">GitHub</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
