import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <Image src="/icon.png" alt="WorkspaceFlow" width={40} height={40} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
              <span
                style={{
                  fontFamily: "'Manrope', 'Inter', sans-serif",
                  fontWeight: 800,
                  fontSize: '1.15rem',
                  color: '#fff',
                  lineHeight: 1,
                }}
              >
                WorkspaceFlow
              </span>
            </Link>
            <p>A Google Workspace automation system for teams that want briefings, AI commands, and repeatable workflows in one place.</p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <Link href="/#features">Features</Link>
            <Link href="/#automation-library">Automation Library</Link>
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
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Cookie Policy</Link>
            <Link href="/privacy">Security</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 WorkspaceFlow. All rights reserved.</span>
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
