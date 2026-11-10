/* ============ أيقونات ============ */
const I = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  deals:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3 0 4 1.3 4.6 4"/></svg>',
  bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 12 4l9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4 3 11l6 2.5L11.5 20z" transform="scale(-1 1) translate(-23 0)"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><circle cx="12" cy="11" r="2.5"/><path d="M8 17c.8-1.6 2.2-2.5 4-2.5s3.2.9 4 2.5"/></svg>',
};
const VF = '<svg class="vf" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#12A26B"/><path d="m7 12.5 3.2 3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GHOST = 'M12 3.6c-2.6 0-4.5 2-4.5 4.6v2.1c-.5.1-1 .1-1.3.3-.3.2 0 .6.4.8l.9.4c-.5 1.4-1.6 2.7-3 3.2-.3.1-.3.5 0 .6.6.3 1.3.4 1.9.6.2.4.1 1 .5 1.1.6.1 1.3-.2 2 0 .9.3 1.7 1.3 3.1 1.3s2.2-1 3.1-1.3c.7-.2 1.4.1 2 0 .4-.1.3-.7.5-1.1.6-.2 1.3-.3 1.9-.6.3-.1.3-.5 0-.6-1.4-.5-2.5-1.8-3-3.2l.9-.4c.4-.2.7-.6.4-.8-.3-.2-.8-.2-1.3-.3V8.2c0-2.6-1.9-4.6-4.5-4.6z';
const NOTE = 'M13 5h2.4c.3 1.7 1.5 2.9 3.2 3.1v2.4c-1.2 0-2.3-.4-3.2-1v5.3a4.2 4.2 0 1 1-4.2-4.2v2.4a1.8 1.8 0 1 0 1.8 1.8z';
let igN = 0;
const PL = {
  snapchat:() => `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FFFC00"/><path d="${GHOST}" fill="#fff" stroke="#111" stroke-width="1"/></svg>`,
  instagram:() => { const id = 'ig' + (++igN); return `<svg viewBox="0 0 24 24"><defs><radialGradient id="${id}" cx="28%" cy="105%" r="140%"><stop offset="0" stop-color="#FDF497"/><stop offset=".08" stop-color="#FDF497"/><stop offset=".45" stop-color="#FD5949"/><stop offset=".62" stop-color="#D6249F"/><stop offset=".92" stop-color="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#${id})"/><rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/></svg>`; },
  tiktok:() => `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="${NOTE}" fill="#25F4EE" transform="translate(-.8 -.6)"/><path d="${NOTE}" fill="#FE2C55" transform="translate(.8 .6)"/><path d="${NOTE}" fill="#fff"/></svg>`,
};
const pl = (k, title = true) => PL[k] ? `<span class="pl"${title ? ` title="${PLATFORMS[k]}"` : ''}>${PL[k]()}</span>` : '';
const LOGO = (s = 96) => `<svg width="${s}" height="${s}" viewBox="0 0 140 140" role="img" aria-label="شعار رواج"><circle cx="70" cy="70" r="66" fill="#26282C"/><circle cx="70" cy="70" r="59" fill="none" stroke="#C6FF00" stroke-width="2.5"/><rect x="36" y="80" width="16" height="27" rx="5" fill="#E4E6E8"/><rect x="62" y="63" width="16" height="44" rx="5" fill="#E4E6E8"/><rect x="88" y="46" width="16" height="61" rx="5" fill="#C6FF00"/><path d="M96 20 L99.2 28.8 L108 32 L99.2 35.2 L96 44 L92.8 35.2 L84 32 L92.8 28.8 Z" fill="#C6FF00"/></svg>`;

