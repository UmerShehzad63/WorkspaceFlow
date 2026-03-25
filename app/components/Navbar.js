'use client';
import { useState } from 'react';
import Link from 'next/link';

function CouchMailLogo({ size = 36 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
      {/* Circular CM icon */}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="19" stroke="#5644d0" strokeWidth="1.5" fill="none" opacity="0.7" />
        <circle cx="20" cy="20" r="19" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" />
        {/* C shape */}
        <path
          d="M22 13 C17 13 13 16.5 13 20.5 C13 24.5 17 28 22 28"
          stroke="url(#logoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* M shape */}
        <path
          d="M20 27 L20 16 L24.5 21 L29 16 L29 27"
          stroke="url(#logoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Center dot */}
        <circle cx="24.5" cy="21" r="1.5" fill="#5644d0" />
        <defs>
          <linearGradient id="logoGrad" x1="8" y1="10" x2="32" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7264e8" />
            <stop offset="100%" stopColor="#001857" />
          </linearGradient>
        </defs>
      </svg>

      {/* Wordmark */}
      <span style={{
        fontFamily: "'Manrope', 'Inter', sans-serif",
        fontWeight: 800,
        fontSize: '1.2rem',
        color: '#001857',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        CouchMail
      </span>
    </div>
  );
}

export default function Navbar({ transparent = false }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="navbar" style={transparent ? { background: 'transparent', borderBottom: 'none' } : {}}>
        <div className="container">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <CouchMailLogo size={36} />
          </Link>

          <ul className="nav-links">
            <li><Link href="/#features">Features</Link></li>
            <li><Link href="/#how-it-works">How It Works</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
          </ul>

          <div className="nav-actions">
            <Link href="/login" className="btn btn-ghost" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Sign In</Link>
            <Link href="/login" className="btn btn-primary">Get Started</Link>
          </div>

          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span style={menuOpen ? { transform: 'rotate(45deg) translate(5px, 5px)' } : {}} />
            <span style={menuOpen ? { opacity: 0 } : {}} />
            <span style={menuOpen ? { transform: 'rotate(-45deg) translate(5px, -5px)' } : {}} />
          </button>
        </div>
      </nav>

      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
        <Link href="/#features" onClick={() => setMenuOpen(false)}>Features</Link>
        <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>How It Works</Link>
        <Link href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
        <hr className="divider" />
        <Link href="/login" onClick={() => setMenuOpen(false)}>Sign In</Link>
        <Link href="/login" className="btn btn-primary" style={{ textAlign: 'center', marginTop: '8px' }} onClick={() => setMenuOpen(false)}>
          Get Started
        </Link>
      </div>
    </>
  );
}
