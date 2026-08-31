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
      accent: "#1a4e7a", accentSoft: "rgba(58,126,187,.12)",
      ambient: "rgba(96,164,228,.22)", ambientSoft: "rgba(126,186,235,.16)",
    },
    dark: {
      accent: "#8ec8f0", accentSoft: "rgba(90,169,224,.14)",
      ambient: "rgba(62,132,188,.20)", ambientSoft: "rgba(56,111,158,.14)",
    },
  },
  sage: {
    label: "Sage",
    light: {
      accent: "#2e765f", accentSoft: "rgba(46,118,95,.13)",
      ambient: "rgba(89,174,143,.19)", ambientSoft: "rgba(101,184,153,.13)",
    },
    dark: {
      accent: "#8fd0b4", accentSoft: "rgba(111,196,157,.16)",
      ambient: "rgba(53,137,106,.20)", ambientSoft: "rgba(54,117,92,.14)",
    },
  },
  plum: {
    label: "Plum",
    light: {
      accent: "#744b7d", accentSoft: "rgba(116,75,125,.13)",
      ambient: "rgba(178,124,187,.18)", ambientSoft: "rgba(170,114,181,.13)",
    },
    dark: {
      accent: "#d3a4dc", accentSoft: "rgba(211,164,220,.16)",
      ambient: "rgba(133,74,143,.20)", ambientSoft: "rgba(119,62,131,.14)",
    },
  },
  ...(window.PairTeXCustomPalettes || {}),
};
