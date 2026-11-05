import React, { useState } from 'react';
import { Droplet } from 'lucide-react';
import { useBrandConfig } from '../config/brandConfig';

export interface BrandLogoProps {
  /**
   * - 'mark': Compact squircle icon badge using the official BloodSearch emblem
   * - 'lockup': Squircle icon badge + Brand Name (+ optional tagline/subtitle)
   * - 'card': Full official BloodSearch logo artwork (/assets/aistudio/image_771fa3d8.png)
   */
  variant?: 'mark' | 'lockup' | 'card';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  subtitle?: string;
  hideSubtitle?: boolean;
  showTaglineDot?: boolean;
  className?: string;
}

const MARK_SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-2xl',
  xl: 'w-16 h-16 rounded-2xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'mark',
  size = 'md',
  subtitle,
  hideSubtitle = false,
  className = '',
}) => {
  const brand = useBrandConfig();
  const [cardImgError, setCardImgError] = useState(false);
  const [markImgError, setMarkImgError] = useState(false);

  if (variant === 'card') {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-2xl sm:rounded-3xl bg-white p-1.5 shadow-md ring-1 ring-slate-200/90 dark:ring-white/20 select-none overflow-hidden ${className}`}
      >
        {!cardImgError ? (
          <img
            src="/assets/aistudio/image_771fa3d8.png"
            alt={`${brand.brandName} - ${brand.tagline}`}
            referrerPolicy="no-referrer"
            onError={() => setCardImgError(true)}
            className="w-full h-full object-contain rounded-xl sm:rounded-2xl bg-white"
          />
        ) : (
          <div className="w-full h-full rounded-xl bg-gradient-to-br from-[#dc2626] to-[#0b2239] flex flex-col items-center justify-center text-white p-2 text-center">
            <Droplet className="w-7 h-7 fill-white mb-1" />
            <span className="text-[11px] font-black tracking-tight leading-none">
              {brand.brandName}
            </span>
          </div>
        )}
      </div>
    );
  }

  const markBadge = (
    <div
      className={`${MARK_SIZE_CLASSES[size]} bg-white shadow-xs ring-1 ring-slate-200/95 dark:ring-white/25 flex items-center justify-center shrink-0 overflow-hidden select-none p-0.5`}
    >
      {!markImgError ? (
        <img
          src="/assets/bloodsearch-emblem-mark.png"
          alt={brand.brandName}
          referrerPolicy="no-referrer"
          onError={() => setMarkImgError(true)}
          className="w-full h-full object-contain bg-white"
        />
      ) : (
        <div className="w-full h-full rounded-lg bg-gradient-to-br from-[#dc2626] to-[#0b2239] flex items-center justify-center text-white">
          <Droplet className="w-4 h-4 fill-white" />
        </div>
      )}
    </div>
  );

  if (variant === 'mark') {
    return className ? <div className={`inline-flex ${className}`}>{markBadge}</div> : markBadge;
  }

  const isJoinedWordmark =
    !brand.brandName.includes(' ') &&
    Boolean(brand.brandPrimaryWord && brand.brandSecondaryWord);

  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 select-none ${className}`}>
      {markBadge}
      <div className="min-w-0 leading-none">
        <div className="font-extrabold text-[15px] sm:text-[17px] tracking-tight whitespace-nowrap truncate">
          <span className="text-[#dc2626] dark:text-[#fb7185]">{brand.brandPrimaryWord}</span>
          {brand.brandSecondaryWord ? (
            <>
              {isJoinedWordmark ? '' : ' '}
              <span className="text-[#0b2239] dark:text-white">{brand.brandSecondaryWord}</span>
            </>
          ) : null}
        </div>
        {!hideSubtitle &&
          (subtitle ? (
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mt-0.5 truncate">
              {subtitle}
            </span>
          ) : (
            <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.08em] text-[#0b2239]/80 dark:text-slate-300 block mt-1 truncate">
              {brand.tagline}
            </span>
          ))}
      </div>
    </div>
  );
};
