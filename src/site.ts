// Site-wide settings. Change these here, not in the templates.

export const SITE = {
  name: "Leadcrystal",
  url: "https://leadcrystal.co",
  tagline: "Energy Evolved.",
  description:
    "Next-generation lead crystal battery systems for a sustainable future. High-performance, high-safety, and 99% recyclable. 2V, 6V, 8V and 12V batteries from Riyadh, Saudi Arabia.",
  location: "Riyadh, Saudi Arabia",
  // Shown on the site only when filled in. The old site published no email or phone.
  email: "",
  phone: "",
  parent: "Bin Othaimeen Group",
  // GA4 measurement ID (G-XXXXXXX). Empty = no analytics script at all.
  ga4: "",
  // Set PUBLIC_NOINDEX=1 when building a staging copy so it stays out of Google.
  noindex: import.meta.env.PUBLIC_NOINDEX === "1",
};

export const NAV = [
  { href: "/#technology", label: "Technology" },
  { href: "/catalogue/", label: "Products" },
  { href: "/insights/", label: "Insights" },
];

// Headline figures used across the site. All are the figures the old site already published.
export const KEY_FIGURES = [
  { value: "6,000+", unit: "cycles", note: "at 20% depth of discharge" },
  { value: "−40/+65", unit: "°C", note: "operating range, no active cooling" },
  { value: "2.5", unit: "hours", note: "0 to 100% fast charge" },
  { value: "99", unit: "%", note: "recyclable, non-hazardous" },
];
