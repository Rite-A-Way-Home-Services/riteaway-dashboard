import './globals.css';

export const metadata = {
  title: 'Rite-A-Way Mission Control',
  description: 'Live operations dashboard for the Rite-A-Way team',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
