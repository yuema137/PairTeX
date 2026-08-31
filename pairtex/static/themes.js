/* PairTeX appearance palette schema.
 *
 * A project may provide `.pairtex/theme.js` with the same shape through the
 * optional `window.PairTeXCustomPalettes` object. This file stays UI-only and
 * never changes manuscript or feedback data.
 */
window.PairTeXPalettes = {
  ocean: {
    label: "Ocean",
    light: {
      bg: "#f6f8fa", card: "#ffffff", fg: "#1f2328", muted: "#656d76",
      border: "rgba(31,35,40,.16)", borderHi: "rgba(31,35,40,.32)",
      accent: "#1a4e7a", accentSoft: "rgba(58,126,187,.12)", link: "#1a5f9e", linkHover: "#124c80", linkVisited: "#68459a",
      surface: "#ffffff", surfaceRaised: "#ffffff",
      ambient: "rgba(9,105,218,.13)", ambientSoft: "rgba(84,174,255,.10)",
    },
    dark: {
      bg: "#0d1117", card: "#161b22", fg: "#e6edf3", muted: "#8b949e",
      border: "rgba(139,148,158,.24)", borderHi: "rgba(139,148,158,.42)",
      accent: "#8ec8f0", accentSoft: "rgba(90,169,224,.14)", link: "#a8b3c2", linkHover: "#d0d7de", linkVisited: "#b8a9c9",
      surface: "#10161e", surfaceRaised: "#21262d",
      ambient: "rgba(47,129,247,.16)", ambientSoft: "rgba(56,139,253,.10)",
    },
  },
  sage: {
    label: "Sage",
    light: {
      bg: "#f9f3df", card: "#fff9e8", fg: "#5c6a72", muted: "#829181",
      border: "rgba(92,106,114,.20)", borderHi: "rgba(92,106,114,.36)",
      accent: "#2e765f", accentSoft: "rgba(46,118,95,.13)", link: "#26785e", linkHover: "#1c5e49", linkVisited: "#73509b",
      surface: "#f3ead0", surfaceRaised: "#fff9e8",
      ambient: "rgba(127,187,179,.18)", ambientSoft: "rgba(167,192,128,.12)",
    },
    dark: {
      bg: "#2d353b", card: "#343f44", fg: "#d3c6aa", muted: "#a7b0a4",
      border: "rgba(211,198,170,.18)", borderHi: "rgba(211,198,170,.34)",
      accent: "#8fd0b4", accentSoft: "rgba(111,196,157,.16)", link: "#a8c0b5", linkHover: "#d1e4da", linkVisited: "#b8b0ca",
      surface: "#323d43", surfaceRaised: "#3d484d",
      ambient: "rgba(131,192,146,.16)", ambientSoft: "rgba(167,192,128,.10)",
    },
  },
  nord: {
    label: "Nord",
    light: {
      bg: "#eceff4", card: "rgba(255,255,255,.80)", fg: "#2e3440", muted: "#4c566a",
      border: "rgba(76,86,106,.18)", borderHi: "rgba(76,86,106,.34)",
      accent: "#5e81ac", accentSoft: "rgba(94,129,172,.14)", link: "#5e81ac", linkHover: "#4c6a91", linkVisited: "#8f6fa5",
      surface: "rgba(255,255,255,.56)", surfaceRaised: "rgba(255,255,255,.80)",
      ambient: "rgba(129,161,193,.20)", ambientSoft: "rgba(136,192,208,.14)",
    },
    dark: {
      bg: "#2e3440", card: "rgba(59,66,82,.82)", fg: "#eceff4", muted: "#d8dee9",
      border: "rgba(216,222,233,.18)", borderHi: "rgba(216,222,233,.34)",
      accent: "#88c0d0", accentSoft: "rgba(136,192,208,.16)", link: "#88c0d0", linkHover: "#8fbcbb", linkVisited: "#b48ead",
      surface: "rgba(59,66,82,.48)", surfaceRaised: "rgba(67,76,94,.82)",
      ambient: "rgba(94,129,172,.22)", ambientSoft: "rgba(136,192,208,.14)",
    },
  },
  ...(window.PairTeXCustomPalettes || {}),
};
