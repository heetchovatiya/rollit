export const sections = [
  "Inventory",
  "Menu",
  "Restock",
  "Sales history",
  "Overview",
  "Calendar",
  "Bills",
  "Google Sheets",
  "Settings",
  "Orders",
  "Activity log",
  "Users",
] as const;
export type Section = (typeof sections)[number];
export interface BusinessSettings {
  revision: number;
  orderResetTime:string;
  dailyReportEnabled:boolean;
  reportEmails:string[];
  reportSender:string;
  reportReplyTo:string;
  reportStartAt:string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  receiptFooter: string;
  defaultCategory: string;
  defaultPayment: "Cash" | "UPI" | "Card";
  menuOrder: string[];
  quickCustomers: string[];
  quickKitchenNotes: string[];
  defaultOrderType: "Takeaway" | "Dine-in" | "Delivery";
  theme: "light" | "dark" | "system";
  accent: "green" | "orange" | "blue" | "purple";
  density: "comfortable" | "compact";
  productView: "grid" | "list";
  cartPosition: "right" | "left";
  sidebar: "expanded" | "icons";
  columns: 2 | 3 | 4;
  width: "wide" | "boxed";
  textSize: "normal" | "large";
  showStats: boolean;
  showStock: boolean;
  showSku: boolean;
  navigation: Section[];
  hiddenSections: Section[];
}
export function defaultSettings(): BusinessSettings {
  return {
    revision: 0,
    orderResetTime:"00:00",
    dailyReportEnabled:false,
    reportEmails:["officialrollit@gmail.com"],
    reportSender:"",
    reportReplyTo:"officialrollit@gmail.com",
    reportStartAt:"",
    businessName: "Roll It",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    receiptFooter: "Thank you for visiting our food cart!",
    defaultCategory: "Food",
    defaultPayment: "Cash",
    defaultOrderType: "Dine-in",
    menuOrder: [],
    quickCustomers: ["ttec", "lj", "repeat"],
    quickKitchenNotes: ["Less spicy", "Spicy", "No onion", "No capsicum"],
    theme: "light",
    accent: "orange",
    density: "comfortable",
    productView: "grid",
    cartPosition: "right",
    sidebar: "expanded",
    columns: 3,
    width: "wide",
    textSize: "normal",
    showStats: true,
    showStock: true,
    showSku: true,
    navigation: [...sections],
    hiddenSections: [],
  };
}
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "RI"
  );
}
