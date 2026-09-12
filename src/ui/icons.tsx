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

export const PlusIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const ChevronLeftIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRightIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const WarnIcon = ({ size = 17 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3.5l9 16H3z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.6v.4" />
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

export const ArrowRightIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const PinIcon =({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 3h6l-1 6.5 3.5 3.5h-11L10 9.5z" />
    <path d="M12 13v8" />
  </Icon>
);

/** Outlined star for favourites; CSS fills it when on. */
export const FavoriteIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
  </Icon>
);

export const CloseIcon =({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const DownloadIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
  </Icon>
);

/** The GitHub mark. */
export const GitHubIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
    />
  </svg>
);

/** The Discord mark. */
export const DiscordIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.12l.37-.3a.07.07 0 0 1 .08 0c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.1c.36.7.78 1.36 1.23 2a.08.08 0 0 0 .08.02 19.8 19.8 0 0 0 6.01-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"
    />
  </svg>
);

export const GripIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
);

export const KeyboardIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
  </Icon>
);

export const ResizeIcon = ({ size = 12 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M21 9 9 21M21 15l-6 6" />
  </Icon>
);

export const PagesIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="6" width="13" height="14" rx="2" />
    <path d="M8 3h11a2 2 0 0 1 2 2v11" />
  </Icon>
);
