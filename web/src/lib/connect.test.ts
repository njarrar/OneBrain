import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailText, htmlToText, parseAddress, parseBatch, tidyMail } from "./connect/mailtext";
import { forTests as gmailT } from "./connect/gmail";
import { forTests as outlookT } from "./connect/outlook";
import { forTests as pinT } from "./connect/pinterest";

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("HTML mail becomes plain text", () => {
  const text = htmlToText("<html><head><style>p{}</style></head><body><p>Hi Sara&nbsp;&amp; Omar</p><p>See you<br>soon &#128578;</p></body></html>");
  assert.equal(tidyMail(text), "Hi Sara & Omar\nSee you\nsoon 🙂");
});

test("quoted replies are dropped", () => {
  assert.equal(tidyMail("Thanks!\n\nOn Mon, 3 Oct 2026 at 10:00, Sara <s@x.com> wrote:\n> old text"), "Thanks!");
});

test("addresses split into name and email", () => {
  assert.deepEqual(parseAddress('"Sara Ali" <sara@example.com>'), { name: "Sara Ali", email: "sara@example.com" });
  assert.deepEqual(parseAddress("sara@example.com"), { name: null, email: "sara@example.com" });
});

test("Gmail picks the plain part and reads UTF-8 and Arabic", () => {
  const m = {
    id: "a1",
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("مرحبا Omar, Lina turns 7 on 14 March.") } },
        { mimeType: "text/html", body: { data: b64url("<p>ignored</p>") } },
      ],
    },
  };
  assert.equal(gmailText(m), "مرحبا Omar, Lina turns 7 on 14 March.");
});

test("Gmail batch answers are split per message, failures counted", () => {
  const body = [
    "--batch_abc",
    "Content-Type: application/http",
    "Content-ID: <response-m0>",
    "",
    "HTTP/1.1 200 OK",
    "Content-Type: application/json; charset=UTF-8",
    "",
    '{ "id": "m0", "snippet": "a {brace}" }',
    "--batch_abc",
    "Content-Type: application/http",
    "",
    "HTTP/1.1 429 Too Many Requests",
    "",
    '{ "error": { "code": 429 } }',
    "--batch_abc--",
  ].join("\r\n");
  const out = parseBatch(body, "batch_abc");
  assert.deepEqual(out.ok, [{ id: "m0", snippet: "a {brace}" }]);
  assert.equal(out.failed, 1);
});

test("a Gmail message becomes a read email item with its own key", () => {
  const x = gmailT.toIncoming({
    id: "18c2",
    threadId: "t1",
    internalDate: "1790000000000",
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: "Sara Ali <sara@example.com>" }, { name: "Subject", value: "Kids party" }],
      body: { data: b64url("Lina loves Lego.") },
    },
  });
  assert.equal(x.kind, "email");
  assert.equal(x.status, "read");
  assert.equal(x.key, "mail:gmail:18c2");
  assert.equal(x.author, "Sara Ali");
  assert.equal(x.title, "Kids party");
  assert.match(x.body ?? "", /From: Sara Ali <sara@example.com>\n\nLina loves Lego\./);
});

test("an Outlook message keeps its web link and text", () => {
  const x = outlookT.toIncoming({
    id: "AAMk=",
    subject: "",
    from: { emailAddress: { name: "Omar", address: "omar@live.com" } },
    receivedDateTime: "2026-10-01T09:00:00Z",
    body: { contentType: "html", content: "<div>Hello</div>" },
    webLink: "https://outlook.live.com/owa/?ItemID=AAMk",
  });
  assert.equal(x.title, "(no subject)");
  assert.equal(x.url, "https://outlook.live.com/owa/?ItemID=AAMk");
  assert.match(x.body ?? "", /Hello$/);
});

test("a pin uses its title, board and biggest picture", () => {
  const x = pinT.toIncoming(
    { id: "99", description: "Wooden train set\nfor ages 5+", link: "https://shop.example/train", media: { images: { "600x": { url: "https://i.pinimg.com/600x/a.jpg" } } } },
    "Gift ideas",
  );
  assert.equal(x.title, "Wooden train set");
  assert.equal(x.url, "https://www.pinterest.com/pin/99/");
  assert.deepEqual(x.media, ["https://i.pinimg.com/600x/a.jpg"]);
  assert.match(x.body ?? "", /Board: Gift ideas\nLink: https:\/\/shop.example\/train/);
});
