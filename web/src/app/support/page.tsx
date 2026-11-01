import type { Metadata } from "next";

// Put your own address here before you publish the app.
const CONTACT = "you@example.com";

export const metadata: Metadata = { title: "Help · Brain" };

// Public page, linked from the App Store listing.
export default function SupportPage() {
  return (
    <article className="doc-page">
      <h1>Help</h1>
      <p>
        Brain keeps what you save from X, Feedly, Instagram, YouTube, Pinterest, Gmail, Outlook, your screenshots and
        your voice memos in one place, and its AI answers questions about all of it.
      </p>
      <h2>Getting started on iPhone</h2>
      <ol>
        <li>Open Brain and tap Sign in.</li>
        <li>Sign in with your Brain account, then tap Connect.</li>
        <li>To save from any app, tap Share, then Save to Brain.</li>
      </ol>
      <h2>Questions or problems</h2>
      <p>
        Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Read how Brain treats your data on the{" "}
        <a href="/privacy">privacy page</a>.
      </p>
    </article>
  );
}
