#if DEBUG
import UIKit

/// Sample data for screenshots, in debug builds only. Launch with `-demo` to skip sign in and fill
/// Brain with made-up saves, and `-screen menu|item|settings` to open on that screen.
enum Demo {
    static let on = ProcessInfo.processInfo.arguments.contains("-demo")

    static var screen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-screen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private struct Sample {
        let id, author, handle, source, kind, category, subtopic, summary, body: String
        var tags: [String] = []
        var note: String?
        var picture: (UIColor, UIColor, String)?
        var lang = "en"
        var days = 1
    }

    private static let samples: [Sample] = [
        Sample(id: "x-demo1", author: "Lina Haddad", handle: "@linabuilds", source: "x", kind: "post",
               category: "AI, Code & Dev Tools", subtopic: "AI Agents & Vibe Coding",
               summary: "How one team cut an agent's API bill by 60% with caching and batches.",
               body: "We cut our agent's token bill by 60% in a week. Three changes: cache the long system prompt, batch 20 items per call, and stop sending the full history every turn.",
               tags: ["Agents", "Cost"], note: "Try the batching idea on the sorter.",
               picture: (.systemIndigo, .systemTeal, "−60%")),
        Sample(id: "x-demo2", author: "Levant Notes", handle: "@levant_notes", source: "x", kind: "post",
               category: "MENA Geopolitics & Society", subtopic: "Levant, Regional Conflict & Diplomacy",
               summary: "An explainer on water sharing deals between Jordan and its neighbours.",
               body: "Why water is the quiet center of Jordan's foreign policy: a thread on the Yarmouk, the Disi aquifer and the water for power deals.",
               tags: ["Jordan", "Water"], days: 2),
        Sample(id: "youtube-demo3", author: "Film Essays", handle: "", source: "youtube", kind: "video",
               category: "Cinema, Gaming, History & Culture", subtopic: "Film Craft & Directors",
               summary: "How long takes build tension, from Hitchcock to modern thrillers.",
               body: "The long take, explained: why some of the most tense scenes in film never cut.",
               tags: ["Film"], picture: (.systemRed, .systemOrange, "▶ 18:42"), days: 3),
        Sample(id: "x-demo4", author: "مدونة الاقتصاد", handle: "@iqtisad", source: "x", kind: "post",
               category: "Markets, Startups & Finance", subtopic: "MENA Fintech & Venture",
               summary: "A thread on how Gulf startups raised money this year.",
               body: "كيف جمعت الشركات الناشئة في الخليج تمويلها هذا العام؟ سلسلة عن أكبر الصفقات وما تعنيه للمنطقة.",
               tags: ["Startups"], lang: "ar", days: 3),
        Sample(id: "instagram-demo5", author: "savile.notes", handle: "@savile.notes", source: "instagram", kind: "post",
               category: "Menswear, Design & Travel", subtopic: "Classic Menswear, Tailoring & Carry",
               summary: "Soft-shoulder navy double-breasted jacket and how to size the lapel.",
               body: "Post by @savile.notes", tags: ["Tailoring"], picture: (.systemBlue, .systemGray, "DB"), days: 4),
        Sample(id: "photos-demo6", author: "", handle: "", source: "photos", kind: "image",
               category: "Health, Biotech & Longevity", subtopic: "Nutrition, Medicine & Biomarkers",
               summary: "Sleep tracker screenshot: 7h 12m average over 30 days, deep sleep up 18%.",
               body: "", tags: ["Sleep"], picture: (.black, .systemPurple, "7h 12m"), days: 5),
        Sample(id: "feedly-demo7", author: "Dev Tools Daily", handle: "", source: "feedly", kind: "article",
               category: "AI, Code & Dev Tools", subtopic: "AI Products & Open-Source Repos",
               summary: "An open-source library for vector search stored in a single SQLite file.",
               body: "lite-vectors: vector search that lives in one SQLite file. No server, no extra process.",
               tags: ["Search"], days: 6),
        Sample(id: "x-demo8", author: "Weird Web", handle: "@weirdweb", source: "x", kind: "post",
               category: "Viral Threads & Internet Culture", subtopic: "Viral Memes, Stories & Curiosities",
               summary: "Someone rebuilt a 1998 flight simulator inside a spreadsheet.",
               body: "Someone rebuilt a 1998 flight sim inside a spreadsheet and it actually flies.",
               tags: ["Humor"], picture: (.systemGreen, .systemYellow, "✈︎"), days: 7),
    ]

    /// Fills an empty database with the samples. Runs before the first screen appears.
    static func seed() {
        guard on else { return }
        _ = Store.shared   // makes the tables
        guard let db = try? DB(path: Paths.database),
              (try? db.count("select count(*) from items")) == 0 else { return }
        for s in samples {
            let posted = Dates.iso(Date.now.addingTimeInterval(Double(-s.days) * 86_400))
            try? db.run("""
                insert into items (id, title, summary, body, note, url, kind, category, subtopic, lang, status,
                  author, author_handle, posted_at, media, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, '[]', ?)
                """, args: [s.id, s.source == "instagram" ? s.body : nil, s.summary, s.body.isEmpty ? nil : s.body,
                            s.note, "https://example.com/\(s.id)", s.kind, s.category, s.subtopic, s.lang,
                            s.author.isEmpty ? nil : s.author, s.handle.isEmpty ? nil : s.handle, posted, posted])
            try? db.run("insert into saves (item_id, source_id, external_id, created_at) values (?, ?, ?, ?)",
                        s.id, s.source, s.id, posted)
            for t in s.tags {
                try? db.run("insert into item_tags (item_id, name, added_by) values (?, ?, 'claude')", s.id, t)
            }
            if let p = s.picture, let data = picture(p.0, p.1, p.2) {
                let file = "demo-\(s.id)"
                try? data.write(to: Paths.file(file))
                try? db.run("insert into files (id, item_id, filename, mime, created_at) values (?, ?, ?, 'image/jpeg', ?)",
                            file, s.id, "\(file).jpg", posted)
            }
        }
        try? db.run("update sources set last_sync_at = ? where id in ('x', 'youtube', 'instagram')", Dates.iso(.now))
    }

    private static func picture(_ a: UIColor, _ b: UIColor, _ label: String) -> Data? {
        let size = CGSize(width: 900, height: 600)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [a.cgColor, b.cgColor] as CFArray
            if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                ctx.cgContext.drawLinearGradient(g, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }
            let text = NSAttributedString(string: label, attributes: [
                .font: UIFont.systemFont(ofSize: 120, weight: .bold), .foregroundColor: UIColor.white,
            ])
            let r = text.boundingRect(with: size, options: .usesLineFragmentOrigin, context: nil)
            text.draw(at: CGPoint(x: (size.width - r.width) / 2, y: (size.height - r.height) / 2))
        }.jpegData(compressionQuality: 0.85)
    }
}
#endif
