import type { ReactNode } from 'react';

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </Icon>
);

export const MenuIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);

export const SettingsIcon = ({ size = 19 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);

export const BackIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ExternalIcon = ({ size = 13 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Icon>
);

/** Filled star for wanted levels. */
export const StarIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
    />
  </svg>
);

export const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
