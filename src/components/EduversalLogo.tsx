import React from 'react';

interface EduversalLogoProps {
  variant?: 'full' | 'icon' | 'compact' | 'horizontal';
  className?: string;
  size?: number | string;
  textColor?: string;
}

// Official Eduversal brand artwork (served from /public)
const ICON_SRC = '/eduversal-icon.png';        // globe mark only
const STACKED_SRC = '/eduversal-logo.png';     // globe + EDUVERSAL wordmark (square lockup)
const HORIZONTAL_SRC = '/eduversal-horizontal.png'; // globe + wordmark + tagline (wide lockup)

export const EduversalLogo: React.FC<EduversalLogoProps> = ({
  variant = 'compact',
  className = '',
  size = 36,
  textColor,
}) => {
  const numericSize = typeof size === 'number' ? size : parseInt(size, 10) || 36;

  // Standalone globe mark
  const renderGlobe = (globeSize: number) => (
    <img
      src={ICON_SRC}
      alt="Eduversal"
      width={globeSize}
      height={globeSize}
      draggable={false}
      className="shrink-0 object-contain select-none transition-transform duration-300 group-hover:scale-105"
      style={{ width: globeSize, height: globeSize }}
    />
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{renderGlobe(numericSize)}</div>;
  }

  if (variant === 'full') {
    // Square stacked lockup: globe above the EDUVERSAL wordmark
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <img
          src={STACKED_SRC}
          alt="Eduversal"
          draggable={false}
          className="object-contain select-none"
          style={{ width: numericSize, height: numericSize }}
        />
      </div>
    );
  }

  if (variant === 'horizontal') {
    // Wide lockup keeps its native 600 x 176 aspect ratio
    return (
      <div className={`inline-flex items-center ${className}`}>
        <img
          src={HORIZONTAL_SRC}
          alt="Eduversal"
          draggable={false}
          className="object-contain select-none"
          style={{ height: numericSize, width: numericSize * (600 / 176) }}
        />
      </div>
    );
  }

  // Compact variant (used in headers/modals): globe mark + product wordmark
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {renderGlobe(numericSize)}
      <div className="flex flex-col leading-none">
        <span
          className="font-extrabold tracking-[0.16em] uppercase select-none font-sans"
          style={{ fontSize: `${Math.max(12, Math.round(numericSize * 0.38))}px`, color: textColor || '#145a64' }}
        >
          EDUVERSAL
        </span>
        <span className="text-[10px] tracking-wider text-slate-500 font-medium mt-0.5">
          TEACHER APPRAISAL
        </span>
      </div>
    </div>
  );
};
