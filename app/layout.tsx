import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import packageJson from "../package.json";
import { AppBuildBadge } from "./components/AppBuildBadge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cantare Music | Segment Practice",
  description: "Practice songs by segment, track confidence ratings, and rehearse playlists for performance.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const version = packageJson.version;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_APP_BRANCH ?? "local";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppBuildBadge version={version} branch={branch} commitSha={commitSha} />
        {children}
      </body>
    </html>
  );
}
