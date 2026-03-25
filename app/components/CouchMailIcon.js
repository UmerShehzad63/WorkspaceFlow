export default function CouchMailIcon({ size = 44, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="circleStroke" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a8b8e8" />
          <stop offset="100%" stopColor="#4a5fa8" />
        </linearGradient>
        <linearGradient id="cGrad" x1="15" y1="20" x2="55" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b0c0e8" />
          <stop offset="100%" stopColor="#5a70b8" />
        </linearGradient>
        <linearGradient id="mGrad" x1="40" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a0b0d8" />
          <stop offset="100%" stopColor="#4a60a8" />
        </linearGradient>
        <radialGradient id="sphereGrad" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#e8ecf8" />
          <stop offset="50%" stopColor="#8898cc" />
          <stop offset="100%" stopColor="#3a5090" />
        </radialGradient>
      </defs>

      {/* Outer circle border */}
      <circle cx="50" cy="50" r="46" stroke="url(#circleStroke)" strokeWidth="3.5" fill="white" />

      {/* C shape — speech bubble style: thick rounded C with notch at bottom-left */}
      <path
        d="M52 22 C34 22 20 34 20 50 C20 66 34 78 52 78 L52 78 C52 78 46 74 44 70 L44 68 C35 65 29 58 29 50 C29 42 35 35 44 32 L44 30 C46 26 52 22 52 22 Z"
        fill="url(#cGrad)"
        opacity="0.9"
      />
      {/* C outer arc top */}
      <path
        d="M52 22 C64 22 75 30 79 42 L70 42 C67 34 60 29 52 29 L52 22 Z"
        fill="url(#cGrad)"
        opacity="0.9"
      />
      {/* C outer arc bottom */}
      <path
        d="M52 78 C64 78 75 70 79 58 L70 58 C67 66 60 71 52 71 L52 78 Z"
        fill="url(#cGrad)"
        opacity="0.9"
      />

      {/* M shape */}
      <path
        d="M46 30 L46 70 L53 70 L53 48 L61 62 L69 48 L69 70 L76 70 L76 30 L69 30 L61 46 L53 30 Z"
        fill="url(#mGrad)"
        opacity="0.9"
      />

      {/* Sphere/orb at intersection */}
      <circle cx="52" cy="50" r="7" fill="url(#sphereGrad)" />
      <ellipse cx="50" cy="47" rx="3" ry="2" fill="white" opacity="0.5" />
    </svg>
  );
}
