import React from 'react';

interface LogoProps {
  className?: string;
}

/**
 * Custom optical aperture + studio frame SVG brand mark for Natural Photo Lab.
 */
export const NaturalPhotoLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8' }) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="2"
      y="2"
      width="36"
      height="36"
      rx="9"
      fill="#FFFFFF"
      stroke="url(#npl-light-border)"
      strokeWidth="1.5"
    />
    {/* Viewfinder precision ticks */}
    <path
      d="M9 14V10.5C9 9.67 9.67 9 10.5 9H14M26 9H29.5C30.33 9 31 9.67 31 10.5V14M31 26V29.5C31 30.33 30.33 31 29.5 31H26M14 31H10.5C9.67 31 9 30.33 9 29.5V26"
      stroke="#94A3B8"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    {/* Optical lens ring */}
    <circle cx="20" cy="20" r="8.5" stroke="#D97706" strokeWidth="1.6" />
    {/* 6-blade iris geometry */}
    <path
      d="M20 12.2L24.2 16.4M27.3 17.6L23.2 22.8M24.2 26.5L18.4 25.1M15.8 26.5L15.8 20.4M12.7 17.6L18.2 15.8M17.1 13.1L22.5 15.8"
      stroke="#F59E0B"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
    {/* Center precision element */}
    <circle cx="20" cy="20" r="2.75" fill="#D97706" />
    <circle cx="20" cy="20" r="1.1" fill="#FFFFFF" />
    <defs>
      <linearGradient id="npl-light-border" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D97706" stopOpacity="0.55" />
        <stop offset="0.5" stopColor="#CBD5E1" />
        <stop offset="1" stopColor="#D97706" stopOpacity="0.3" />
      </linearGradient>
    </defs>
  </svg>
);

interface OpticalLoaderProps {
  progress?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
}

/**
 * Custom animated optical aperture & progress ring loader.
 */
export const OpticalLoader: React.FC<OpticalLoaderProps> = ({
  progress = 0,
  label,
  size = 'md',
  tone = 'light',
}) => {
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const boxSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const trackStroke = tone === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)';
  const pctColor = tone === 'dark' ? 'text-amber-300' : 'text-amber-700';
  const labelColor = tone === 'dark' ? 'text-zinc-200' : 'text-slate-700';

  return (
    <div className="inline-flex items-center gap-3">
      <div className={`relative ${boxSize} shrink-0 flex items-center justify-center`}>
        <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={trackStroke}
            strokeWidth="3"
          />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke="#D97706"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-150 ease-out"
          />
        </svg>

        {/* Rotating inner optical blades */}
        <svg
          viewBox="0 0 32 32"
          className="absolute inset-0 w-full h-full p-2.5 optical-ring-spin"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="1.6"
            strokeDasharray="10 6 4 6"
          />
        </svg>

        {size === 'lg' && (
          <span className={`absolute text-[11px] font-mono-tabular font-bold ${pctColor}`}>
            {clamped}%
          </span>
        )}
      </div>

      {label && (
        <span className={`text-xs font-medium tracking-tight ${labelColor}`}>{label}</span>
      )}
    </div>
  );
};
