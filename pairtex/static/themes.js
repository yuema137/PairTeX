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
      bg: "#f1f6fb", card: "rgba(255,255,255,.78)", fg: "#101f2e", muted: "#526c87",
      border: "rgba(22,62,105,.14)", borderHi: "rgba(22,62,105,.30)",
      accent: "#1a4e7a", accentSoft: "rgba(58,126,187,.12)", link: "#1a5f9e", linkHover: "#124c80", linkVisited: "#68459a",
      surface: "rgba(255,255,255,.54)", surfaceRaised: "rgba(255,255,255,.78)",
      ambient: "rgba(96,164,228,.22)", ambientSoft: "rgba(126,186,235,.16)",
    },
    dark: {
      bg: "#08131d", card: "rgba(255,255,255,.06)", fg: "#e3edf8", muted: "#8ba6c2",
      border: "rgba(150,200,245,.16)", borderHi: "rgba(150,200,245,.30)",
      accent: "#8ec8f0", accentSoft: "rgba(90,169,224,.14)", link: "#a8b3c2", linkHover: "#d0d7de", linkVisited: "#b8a9c9",
      surface: "rgba(255,255,255,.035)", surfaceRaised: "rgba(255,255,255,.06)",
      ambient: "rgba(62,132,188,.20)", ambientSoft: "rgba(56,111,158,.14)",
    },
  },
  sage: {
    label: "Sage",
    light: {
      bg: "#f1f7f4", card: "rgba(255,255,255,.80)", fg: "#142a25", muted: "#55736b",
      border: "rgba(38,103,82,.15)", borderHi: "rgba(38,103,82,.31)",
      accent: "#2e765f", accentSoft: "rgba(46,118,95,.13)", link: "#26785e", linkHover: "#1c5e49", linkVisited: "#73509b",
      surface: "rgba(255,255,255,.56)", surfaceRaised: "rgba(255,255,255,.80)",
      ambient: "rgba(89,174,143,.19)", ambientSoft: "rgba(101,184,153,.13)",
    },
    dark: {
      bg: "#0b1916", card: "rgba(220,255,239,.065)", fg: "#e1f2ea", muted: "#91b7a8",
      border: "rgba(143,208,180,.17)", borderHi: "rgba(143,208,180,.31)",
      accent: "#8fd0b4", accentSoft: "rgba(111,196,157,.16)", link: "#a8c0b5", linkHover: "#d1e4da", linkVisited: "#b8b0ca",
      surface: "rgba(220,255,239,.038)", surfaceRaised: "rgba(220,255,239,.065)",
      ambient: "rgba(53,137,106,.20)", ambientSoft: "rgba(54,117,92,.14)",
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
