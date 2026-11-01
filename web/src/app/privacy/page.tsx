import type { Metadata } from "next";

// Put your own address here before you publish the app.
const CONTACT = "you@example.com";

export const metadata: Metadata = { title: "Privacy · Brain" };

// Public page: the App Store, Google and anyone else can read it without signing in.
export default function PrivacyPage() {
  return (
    <article className="doc-page">
      <h1>Privacy</h1>
      <p className="muted">Brain on the web, iPhone and Android. Last changed 1 November 2026.</p>

      <h2>What Brain is</h2>
      <p>
        Brain is a private archive. It keeps what you save from your own accounts and your phone, sorts it with
        AI, and answers questions about it. Only accounts the owner lets in can sign in.
      </p>

      <h2>What Brain keeps</h2>
      <ul>
        <li>Your account: name, email, and a hashed password or your Google or Apple sign in.</li>
        <li>What you save: links, posts, notes, tags, pictures, screenshots, files and voice memos.</li>
        <li>
          What you connect: bookmarks from X, saves from Feedly, Instagram, YouTube and Pinterest, and mail from
          Gmail or Outlook. Brain only reads these. It never posts, sends or deletes anything there.
        </li>
        <li>AI keys you add. They are stored encrypted, and Brain only ever shows their last four characters.</li>
      </ul>

      <h2>What the iPhone app reads</h2>
      <ul>
        <li>Photos: only when you turn on screenshot sync, and only the Screenshots album.</li>
        <li>Microphone and speech: only while you record a voice memo or speak a search.</li>
        <li>Camera: only when you take a photo to save.</li>
      </ul>

      <h2>Who else sees it</h2>
      <p>
        Your data lives on Cloudflare, which hosts Brain. To sort, read and answer, Brain sends the text of a save
        to the AI you pick in Settings (Anthropic, OpenAI or Google) using your own key, and uses Cloudflare Workers
        AI for search, speech to text and reading pictures. Nobody else gets it. Brain shows no ads, does not track
        you across apps or sites, and never sells or shares your data.
      </p>
      <p>
        Brain&apos;s use of information received from Google APIs follows the Google API Services User Data Policy,
        including its Limited Use rules. Gmail and YouTube data is used only to show and search your own saves in
        Brain.
      </p>

      <h2>Deleting</h2>
      <p>
        Delete any save and it goes to Trash, which you can empty. Disconnect a source in Sources to stop new saves
        from it. To delete your whole account and everything in it, write to the address below and it will be gone
        within 30 days.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}
