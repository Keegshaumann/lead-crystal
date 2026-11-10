import productsJson from "../data/products.json";
import insightsJson from "../data/insights.json";

export type Spec = { label: string; value: string };
export type Product = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  family: "Standard" | "Front Terminal" | "EV" | "High-Cycle";
  voltage: number;
  capacityAh: number;
  weight: string;
  summary: string;
  heading: string;
  intro: string;
  attributes: string[];
  specs: Spec[];
  tags: string[];
  image: string | null;
  specSheet: string | null;
  seoTitle: string;
  seoDescription: string;
  oldUrl: string;
  oldImage: string | null;
  oldSpecSheet: string | null;
};

export type Article = {
  slug: string;
  title: string;
  date: string;
  modified: string;
  categories: string[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  readingMinutes: number;
  html: string;
};

export const products = productsJson as Product[];
export const articles = insightsJson as Article[];

export const VOLTAGES = [2, 6, 8, 12] as const;

export const FAMILIES: { key: Product["family"]; label: string; code: string; blurb: string }[] = [
  {
    key: "Standard",
    label: "Deep cycle",
    code: "CNFJ",
    blurb: "General-purpose deep-cycle batteries for solar, telecom, UPS and industrial storage.",
  },
  {
    key: "Front Terminal",
    label: "Front terminal",
    code: "CNFT",
    blurb: "Front-access designs for telecom installations, industrial UPS and rack mounting.",
  },
  {
    key: "EV",
    label: "EV & mobility",
    code: "EVFJ",
    blurb: "EV-grade batteries for electric vehicles, high-discharge equipment and heavy-duty cycling.",
  },
  {
    key: "High-Cycle",
    label: "High-cycle",
    code: "HCNFJ",
    blurb: "Frequent deep cycling for medical devices, security systems and portable equipment.",
  },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Applications are derived from the product tags the old WooCommerce store used.
export const APPLICATIONS: { key: string; label: string; tags: string[]; blurb: string }[] = [
  {
    key: "solar",
    label: "Solar & off-grid",
    tags: ["solar", "solar-battery", "small-solar", "commercial-solar", "off-grid", "renewable"],
    blurb: "Daily cycling for residential, commercial and off-grid solar storage.",
  },
  {
    key: "telecom",
    label: "Telecom",
    tags: ["telecom", "telecom-battery"],
    blurb: "Backup power for towers, shelters and remote sites in extreme heat.",
  },
  {
    key: "ups",
    label: "UPS & data centres",
    tags: ["ups", "data-center", "rack-mount"],
    blurb: "Standby power for UPS systems, server rooms and rack installations.",
  },
  {
    key: "mobility",
    label: "EV & mobility",
    tags: ["mobility", "wheelchair"],
    blurb: "Traction power for electric vehicles and material handling equipment.",
  },
  {
    key: "marine",
    label: "Marine",
    tags: ["marine"],
    blurb: "Maintenance-free deep-cycle power on the water.",
  },
  {
    key: "security",
    label: "Security & emergency",
    tags: ["security", "emergency-lighting", "medical", "portable"],
    blurb: "Alarm systems, emergency lighting, medical and portable equipment.",
  },
  {
    key: "utility",
    label: "Utility & large scale",
    tags: ["utility", "utility-scale", "large-scale", "mega-scale", "national-scale"],
    blurb: "2V cells for utility-scale storage and large backup installations.",
  },
];

export function productApps(p: Product): string[] {
  const t = new Set(p.tags.map(slug));
  return APPLICATIONS.filter((a) => a.tags.some((x) => t.has(x))).map((a) => a.key);
}

export function familyOf(p: Product) {
  return FAMILIES.find((f) => f.key === p.family)!;
}

export function spec(p: Product, label: string): string {
  return p.specs.find((s) => s.label.toLowerCase().startsWith(label.toLowerCase()))?.value ?? "";
}

export function formatAh(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}Ah`;
}

export function byVoltage(v: number) {
  return products.filter((p) => p.voltage === v);
}

export function capacityRange(list: Product[]) {
  const c = list.map((p) => p.capacityAh);
  return [Math.min(...c), Math.max(...c)] as const;
}

export function related(p: Product, n = 4): Product[] {
  return products
    .filter((x) => x.sku !== p.sku && x.voltage === p.voltage)
    .sort(
      (a, b) =>
        Number(a.family !== p.family) - Number(b.family !== p.family) ||
        Math.abs(Math.log(a.capacityAh / p.capacityAh)) - Math.abs(Math.log(b.capacityAh / p.capacityAh)),
    )
    .slice(0, n);
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
