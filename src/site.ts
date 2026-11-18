// Site-wide settings. Change these here, not in the templates.

export const SITE = {
  name: "Leadcrystal",
  url: "https://leadcrystal.co",
  tagline: "Energy Evolved.",
  description:
    "Next-generation lead crystal battery systems for a sustainable future. High-performance, high-safety, and 99% recyclable. 2V, 6V, 8V and 12V batteries from Riyadh, Saudi Arabia.",
  location: "Riyadh, Saudi Arabia",
  // Shown on the site only when filled in.
  email: "info@leadcrystal.co",
  phone: "",
  parent: "Bin Othaimeen Group",
  // GA4 measurement ID (G-XXXXXXX). Empty = no analytics script at all.
  ga4: "",
  // Set PUBLIC_NOINDEX=1 when building a staging copy so it stays out of Google.
  noindex: import.meta.env.PUBLIC_NOINDEX === "1",
};

// T-ROX sits last and is drawn in its own logo style (amber, expanded, slanted) so it reads as a
// separate range from the Leadcrystal batteries (Frank, 18 Nov 2026).
export const NAV = [
  { href: "/#technology", label: "Technology" },
  { href: "/catalogue/", label: "Products" },
  { href: "/about/", label: "About" },
  { href: "/insights/", label: "Insights" },
  { href: "/t-rox/", label: "T-ROX", brand: "trox" },
];

// Leadcrystal and Lead Crystal Technologies (leadcrystaltechnologies.com) present as one company:
// the manufacturer's story, figures, certificates and contacts live on /about/ and /contact/.
export const COMPANY = {
  manufacturer: "Lead Crystal Technologies",
  brand: "Lead Crystal® Batteries",
  founded: 2004,
  figures: [
    { value: "2004", label: "Founded" },
    { value: "13", label: "Invention patents" },
    { value: "20", label: "Utility models" },
    { value: "100+", label: "Product specifications" },
  ],
};

export const OFFICES = [
  {
    label: "Saudi Arabia",
    name: "Leadcrystal, Riyadh",
    lines: ["Riyadh, Kingdom of Saudi Arabia"],
    email: "info@leadcrystal.co",
    note: "Sales, quotes and support across Saudi Arabia and the Gulf.",
  },
  {
    label: "Headquarters and factory",
    name: "Lead Crystal Technologies",
    lines: ["No. 15 Chuangye Road, Shangqiang Industrial Zone", "Wuxing District, Huzhou, China"],
    email: "info@leadcrystaltechnologies.com",
    phone: "+84 765 471 801",
    whatsapp: "84765471801",
    note: "Research, development and production. Customer service line, also on WhatsApp.",
  },
];

// Headline figures used across the site. All are the figures the old site already published.
export const KEY_FIGURES = [
  { value: "6,000+", unit: "cycles", note: "at 20% depth of discharge" },
  { value: "−40/+65", unit: "°C", note: "operating range, no active cooling" },
  { value: "2.5", unit: "hours", note: "0 to 100% fast charge" },
  { value: "99", unit: "%", note: "recyclable, non-hazardous" },
];
