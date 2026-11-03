import "./globals.css";
export const metadata = {
  title: "Roll It POS",
  description: "Your food-cart inventory, checkout and business workspace.",
};
const themeScript = `try{var admin=location.pathname==='/';var t=admin?(localStorage.getItem('roll-it-theme')||'light'):'light';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.accent='orange'}catch(e){document.documentElement.dataset.theme='light';document.documentElement.dataset.accent='orange'}`;
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
