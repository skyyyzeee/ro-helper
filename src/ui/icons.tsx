import { SYMBOLS, type SymbolName } from './symbols';

/**
 * Icons of the whole app: Material Symbols Rounded (see scripts/icons.mjs), drawn in the current text colour.
 * The brand marks (GitHub, Discord) are their own.
 */
function Symbol({ name, size }: { name: SymbolName; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d={SYMBOLS[name]} />
    </svg>
  );
}

type Size = { size?: number };
const icon = (name: SymbolName, fallback: number) => ({ size = fallback }: Size) => <Symbol name={name} size={size} />;

export const SearchIcon = icon('search', 20);
export const MenuIcon = icon('menu', 20);
export const SettingsIcon = icon('settings', 19);
export const BackIcon = icon('arrow_back', 18);
export const PlusIcon = icon('add', 18);
export const CheckIcon = icon('check', 18);
export const ChevronLeftIcon = icon('chevron_left', 16);
export const ChevronRightIcon = icon('chevron_right', 16);
export const ChevronDownIcon = icon('keyboard_arrow_down', 16);
export const WarnIcon = icon('warning', 17);
export const ExternalIcon = icon('open_in_new', 13);
/** Filled star for wanted levels. */
export const StarIcon = icon('star-fill', 12);
export const ArrowRightIcon = icon('arrow_forward', 22);
export const PinIcon = icon('keep', 18);
export const CloseIcon = icon('close', 18);
export const DownloadIcon = icon('download', 18);
export const GripIcon = icon('drag_indicator', 14);
export const KeyboardIcon = icon('keyboard', 18);
export const ResizeIcon = icon('resize', 12);
export const PagesIcon = icon('view_carousel', 14);
/** Short form of a card: the lines drawn together. */
export const CompactIcon = icon('unfold_less', 14);
export const DocumentsIcon = icon('description', 20);
export const CalculatorIcon = icon('calculate', 20);
export const MemoIcon = icon('sticky_note_2', 20);
export const ProfileIcon = icon('account_circle', 20);
export const PaletteIcon = icon('palette', 18);
/** The AI analysis. */
export const SparkIcon = icon('wand_stars', 20);
export const MicIcon = icon('mic', 20);
/** The history of AI analyses. */
export const HistoryIcon = icon('history', 20);
export const TuneIcon = icon('tune', 18);
export const BookIcon = icon('menu_book', 18);
export const InfoIcon = icon('info', 18);

/** Star for favourites: outlined, and filled when its button is on (`.fav--on`). */
export const FavoriteIcon = ({ size = 20 }: Size) => (
  <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path className="icon-off" d={SYMBOLS.star} />
    <path className="icon-on" d={SYMBOLS['star-fill']} />
  </svg>
);

/** The badge of an organisation, by its id in the server's organizations.json. */
const ORGANIZATION_SYMBOLS: Record<string, SymbolName> = {
  mvd: 'local_police',
  gibdd: 'traffic',
  fsb: 'security',
  fso: 'verified_user',
  army: 'military_tech',
  sk: 'policy',
  prosecutor: 'gavel',
  court: 'balance',
  government: 'account_balance',
  duma: 'how_to_vote',
  hospital: 'local_hospital',
  news: 'newspaper',
  media: 'newspaper',
  advocate: 'cases',
  opg: 'skull',
  none: 'person',
};

/** The icon of an organisation; one without a badge of its own gets a person. */
export const organizationSymbol = (id: string): SymbolName => ORGANIZATION_SYMBOLS[id] ?? 'person';

export const OrganizationIcon = ({ id, size = 18 }: { id: string } & Size) => <Symbol name={organizationSymbol(id)} size={size} />;

/**
 * The marks of the servers, and their colours, from the Russia Online wiki (wiki.russia.online/ru/servers).
 * Drawn in the viewBox «0 0 18 18».
 */
const SERVER_MARKS: Record<string, { color: string; d: string }> = {
  tverskoi: { color: 'rgb(72 184 94)', d: "M8.77512 2.3172C8.34442 1.20526 9.83589 0.47051 10.4112 1.47566C10.6108 1.82443 10.5215 2.79568 10.1043 2.97458C9.95317 2.97841 9.9011 2.95124 9.76165 2.89757C9.75498 3.0059 9.7581 3.00158 9.84982 3.10739C9.99647 3.27817 10.1771 3.41588 10.3788 3.51142C10.4044 3.52134 10.4256 3.52894 10.4435 3.53486L11.0618 3.68107C11.4768 3.12895 12.1359 2.71961 13.3351 2.59176C13.5368 2.3668 13.7877 2.04618 14.1163 2.12299C14.2538 2.20033 14.2757 2.27898 14.3428 2.421C14.8949 2.50485 15.2981 2.77924 15.8237 2.81832C15.9642 2.82872 15.9901 2.82292 16.0347 2.95672C15.9787 3.24008 15.69 3.55643 15.5057 3.78487C16.1418 4.61206 15.6784 4.54124 15.5324 5.36079C15.5114 5.70397 15.5666 6.05094 15.5481 6.3943C15.5304 6.71497 15.269 7.16589 14.9097 7.12645C14.7829 7.02529 14.7166 6.81551 14.6486 6.65435C14.5196 6.83819 14.3755 7.08188 14.1341 7.02154C14.0056 6.87727 13.9916 6.38351 14.008 6.1867C14.0423 5.77767 13.5646 5.46444 13.2302 5.14204C13.2869 5.57932 13.3008 6.05599 13.4221 6.53158C13.6197 7.30348 14.3704 8.4749 13.9131 9.26712C13.7946 9.47239 13.332 9.47345 13.1029 9.49146C14.0825 9.68686 15.71 9.7018 16.4944 10.2102C16.6503 10.5737 16.8886 12.0514 17 12.5429C16.7289 12.9453 16.1563 13.6397 15.7512 13.8878C15.4609 14.0656 15.2185 13.3937 15.1854 13.1679C15.018 12.0363 16.0547 12.8435 15.8081 11.6332C15.5623 10.4268 14.3336 11.0103 13.5583 11.2359C12.6923 11.5002 12.727 10.8835 12.1264 10.5517L12.084 10.5283C12.0634 10.84 11.996 11.6381 12.0205 11.9033C12.1087 12.8544 12.5851 14.2644 12.9389 15.1378C13.4825 15.5073 13.5241 15.5627 13.7379 16.197C13.2325 16.1182 12.5312 15.995 12.0416 15.8755C11.7093 15.2418 11.4806 14.3967 11.1466 13.7237L10.9189 12.121L6.82659 12.7515C6.81988 12.7531 6.81364 12.7557 6.80762 12.7571C7.02096 12.1306 7.0588 11.9734 6.97726 11.3051C6.95402 11.0729 6.93264 10.8697 6.89356 10.6399C6.87121 10.9003 6.84886 11.3114 6.79088 11.554C6.58044 12.9714 5.84913 13.7824 4.67608 14.457C4.3823 15.117 4.16856 15.7674 4.6147 16.3354C4.72874 16.4805 4.9523 16.7578 4.87249 16.9268C4.62214 17.0632 4.07808 16.9721 3.77547 16.9459L3.64936 16.4682L3.2956 16.2438C3.33711 15.9945 3.36525 15.8483 3.39046 15.5787C3.4266 15.1911 3.25847 14.4273 3.43397 14.1155C3.51325 13.9748 3.91594 13.7122 4.03215 13.5641C4.40268 13.0913 4.08674 12.1758 4.04777 11.5875C3.99302 10.7598 4.04832 9.86846 4.59126 9.20686C5.14694 8.52986 6.01655 8.49056 6.80762 8.41554C6.93748 8.1042 7.00295 7.28261 7.30983 6.97801L6.87012 5.48021C6.71942 5.45543 6.5639 5.41877 6.43376 5.39874C6.14059 5.75874 5.89846 6.10339 5.40259 6.14764C5.30504 6.15554 5.20689 6.16077 5.10908 6.16326C4.81313 6.6248 4.59293 6.84827 4.05112 6.50591C3.6119 6.70349 3.17886 6.90423 2.7443 7.11195C2.52158 7.21841 2.12015 7.51952 1.90172 7.4903C1.84761 7.35521 1.86928 7.37963 1.89279 7.21127C2.15912 6.79657 3.58177 6.07542 4.03773 5.73356C4.06242 5.71505 4.08527 5.69416 4.10915 5.67442L4.96066 4.6543L4.9629 4.65318C5.20265 4.34543 5.96734 3.8093 6.36569 3.7458L7.53748 3.14757C7.78081 3.0359 8.24742 3.11117 8.48831 3.12079L8.53741 3.09512C8.9269 2.89459 8.93643 2.73417 8.77512 2.3172ZM8.01847 13.3386C8.23273 13.5191 8.24166 14.6222 8.35551 14.8499C8.53116 15.2004 8.99605 15.7021 9.14228 16.0842C9.04543 16.196 8.23367 16.2803 8.03076 16.3085C7.58326 14.8871 5.46656 14.1841 7.98835 13.3342L8.01847 13.3386ZM3.10811 9.64772C4.30461 9.56549 3.83591 10.0885 3.51209 10.9234C3.28175 11.5175 3.58934 12.9806 3.21413 13.3665L3.13378 13.3476C3.01814 13.2056 2.99257 12.939 2.95857 12.7482C2.77168 13.4328 2.71133 13.6698 2.17291 14.1321C1.77312 14.4091 1.40731 14.272 1 14.1143C1.34741 13.7702 1.77945 13.3844 1.72428 12.8454C1.58373 11.4714 1.36513 9.98847 3.10811 9.64772Z" },
  arbatskiy: { color: 'rgb(0 121 210)', d: "M14.9208 1.00112L15.9923 1.39174L16.0001 1.39509V15.74C16.4947 15.9097 16.8786 16.2973 16.9956 16.789C17.0213 16.8973 16.9309 16.9997 16.8092 17H1.19187C1.06988 17 0.978617 16.8974 1.00437 16.789C1.12134 16.2973 1.50529 15.9097 1.99992 15.74V1.39509L2.00773 1.39174L3.07918 1.00112L3.08252 1L3.08698 1.00112L3.09368 1.00223C3.09788 1.00295 3.10382 1.00423 3.11154 1.00558C3.1282 1.00859 3.15366 1.01311 3.1852 1.01897C3.24826 1.03083 3.33936 1.04843 3.45195 1.07143C3.67799 1.11759 3.99131 1.18593 4.33811 1.27344C5.03108 1.44833 5.74913 1.70114 6.29461 2.01339C6.66886 2.22773 6.84575 2.44928 6.92854 2.61831C6.96988 2.70274 6.98693 2.77462 6.9944 2.82478C6.99811 2.84963 6.99973 2.8692 6.99997 2.88281V15.6462H7.99886V4.04576C7.99917 3.94065 8.15603 3.85608 8.34931 3.85602H9.64844C9.84179 3.85609 9.99859 3.94065 9.99889 4.04576V15.6462H11.0011L11 2.9029V2.88281C11.0003 2.8692 11.0019 2.84963 11.0056 2.82478C11.0131 2.77462 11.0301 2.70274 11.0714 2.61831C11.1542 2.44928 11.3312 2.22773 11.7054 2.01339C12.2509 1.70115 12.9689 1.44833 13.6619 1.27344C14.0087 1.18593 14.322 1.11759 14.548 1.07143C14.6606 1.04843 14.7517 1.03085 14.8148 1.01897C14.8463 1.01311 14.8718 1.00859 14.8885 1.00558C14.8962 1.00423 14.9021 1.00295 14.9063 1.00223L14.913 1.00112L14.9175 1L14.9208 1.00112Z" },
  kutuzovskiy: { color: 'rgb(3 193 243)', d: "M17 1V1.9423L16.0661 3H15.6671V5.57452H17V6.51682L16.0661 7.57452H15.6671V17H11.7115V10.9315C11.7115 9.87553 10.7542 8.77854 9.29808 8.49399L9 8.44832C7.37778 8.63222 6.28847 9.80506 6.28847 10.9315V17H2.33294V7.57452H1.9339L1 6.51682V5.57452H2.33294V3H1.9339L1 1.9423V1H17Z" },
};

/** A server's mark in its own colour; a server without one gets nothing. */
export const ServerIcon = ({ id, size = 18 }: { id: string } & Size) => {
  const mark = SERVER_MARKS[id];
  return mark ? (
    <svg width={size} height={size} viewBox="0 0 18 18" fill={mark.color} aria-hidden="true">
      <path d={mark.d} />
    </svg>
  ) : null;
};

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

export const TelegramIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21.5 4.3 18.3 19.6c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.3 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.9 13.3 1 11.8c-1-.3-1-1 .2-1.5L20.2 3c.9-.3 1.6.2 1.3 1.3Z"
    />
  </svg>
);
