import SwiftUI

/// A small row for an item inside another screen: category dot, text, date. Taps open the item.
struct MiniItemRow: View {
    let item: Item
    var number: Int?

    var body: some View {
        NavigationLink(value: Route.item(item)) {
            HStack(spacing: 10) {
                if let number {
                    Text("\(number)").font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.accent).frame(width: 18)
                } else {
                    RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(item.categoryColor)).frame(width: 8, height: 8)
                }
                Text(item.mainText).lineLimit(1).foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
                Text(Dates.row(item.date)).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.faint)
            }
            .font(.system(size: 15))
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: Resurface

/// A few saves each day: ones you asked to see again, and ones from this day in past years.
/// Keep brings a card back later (then less and less often), Tomorrow brings it back tomorrow, Done lets it go.
struct ResurfaceView: View {
    @Environment(AppSession.self) private var session
    @Environment(MenuStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var cards: [ResurfaceCard] = []
    @State private var index = 0
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("A few things from your memory, every day.").font(.system(size: 15)).foregroundStyle(Theme.soft)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if index < cards.count {
                    progress
                    card(cards[index])
                    answers(cards[index])
                } else {
                    empty
                }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.bad) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(Theme.grouped)
        .navigationTitle("Resurface")
        .task { await load() }
    }

    private var progress: some View {
        HStack(spacing: 4) {
            ForEach(cards.indices, id: \.self) { i in
                Capsule().fill(i <= index ? Theme.accent : Theme.line).frame(height: 3)
            }
        }
    }

    private func card(_ c: ResurfaceCard) -> some View {
        let item = c.item
        return VStack(alignment: .leading, spacing: 12) {
            Text(c.why)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 10).frame(height: 24)
                .background(Theme.accentBG, in: Capsule())
            if let author = item.author {
                Text(author).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.soft)
            }
            Text(item.mainText)
                .font(.system(size: item.isArabic ? 21 : 19, weight: .medium))
                .lineSpacing(item.isArabic ? 12 : 6)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(item.isArabic ? .trailing : .leading)
                .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
            if let summary = item.summary, !summary.isEmpty {
                Text(summary).font(.system(size: 15)).foregroundStyle(Theme.ink2)
            }
            if let url = item.pictures.first {
                Color.clear.aspectRatio(16 / 10, contentMode: .fit).frame(maxWidth: .infinity)
                    .overlay { RemoteImage(url: url) }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            HStack {
                if let category = item.category {
                    CategoryLabel(name: category, color: item.categoryColor)
                }
                Spacer()
                NavigationLink(value: Route.item(item)) {
                    Text("Open").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.accent)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16)
                .fill(Theme.swatch(item.categoryColor)).frame(height: 3)
        }
        .id(c.id)
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
    }

    private func answers(_ c: ResurfaceCard) -> some View {
        HStack(spacing: 10) {
            answer("Done", "checkmark", how: "done", c)
            answer("Tomorrow", "clock", how: "later", c)
            answer("Keep", "sparkles", how: "keep", c, main: true)
        }
        .disabled(busy)
    }

    private func answer(_ label: String, _ symbol: String, how: String, _ c: ResurfaceCard, main: Bool = false) -> some View {
        Button { Task { await review(c, how: how) } } label: {
            Label(label, systemImage: symbol)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 46)
                .foregroundStyle(main ? Theme.accentInk : Theme.ink)
                .background(main ? Theme.accentFill : Theme.card, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "sparkles").font(.system(size: 34)).foregroundStyle(Theme.accent)
            Text(cards.isEmpty ? "Nothing to look back on today." : "That's all for today.")
                .font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.ink)
            Text("Use Remind me on any save to have it come back here.")
                .font(.system(size: 14)).foregroundStyle(Theme.soft).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 50)
    }

    private func load() async {
        do {
            cards = try await API.shared.resurface()
            index = 0
            error = nil
        } catch APIError.signedOut {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func review(_ c: ResurfaceCard, how: String) async {
        busy = true
        defer { busy = false }
        do {
            try await API.shared.review(c.id, how: how)
            error = nil
            withAnimation(.easeOut(duration: 0.22)) { index += 1 }
            if index >= cards.count { await store.load(session: session) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: Weekly digest

/// One short write-up per week of what was saved, made by the chosen AI on Sunday evenings.
struct DigestView: View {
    @Environment(AppSession.self) private var session
    @State private var digests: [Digest] = []
    @State private var loaded = false
    @State private var writing = false
    @State private var note: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Your AI writes one every Sunday evening from what you saved that week.")
                    .font(.system(size: 15)).foregroundStyle(Theme.soft)
                Button { Task { await make() } } label: {
                    HStack(spacing: 8) {
                        if writing { ProgressView() } else { Image(systemName: "sparkles") }
                        Text(writing ? "Writing…" : "Write this week's now")
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 14).frame(height: 40)
                    .background(Theme.accentBG, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(writing)
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.soft) }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                } else if digests.isEmpty {
                    Text("No digests yet.").foregroundStyle(Theme.faint).padding(.top, 20)
                }
                ForEach(digests) { d in
                    GroupCaption("\(d.title) · \(d.saved) saved")
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(paragraphs(d.body).enumerated()), id: \.offset) { _, p in
                            Text(p).font(.system(size: 15)).lineSpacing(4).foregroundStyle(Theme.ink)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .groupBox()
                    let cited = d.items.enumerated().filter { $0.element.deletedAt == nil }
                    if !cited.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(cited, id: \.element.id) { n, item in MiniItemRow(item: item, number: n + 1) }
                        }
                        .groupBox()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(Theme.grouped)
        .navigationTitle("Weekly digest")
        .task { await load() }
    }

    private func paragraphs(_ body: String) -> [String] {
        body.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func load() async {
        do {
            digests = try await API.shared.digests()
        } catch APIError.signedOut {
            session.signOut()
        } catch {
            note = error.localizedDescription
        }
        loaded = true
    }

    private func make() async {
        writing = true
        defer { writing = false }
        do {
            let out = try await API.shared.makeDigest()
            digests = out.digests
            note = out.made == true ? nil : out.reason
        } catch {
            note = error.localizedDescription
        }
    }
}

// MARK: Ask Brain

/// The Ask tab: type or say a question, or tap an example. Brain links up notes, voice memos,
/// screenshots, bookmarks, emails and pins to answer it.
struct AskHome: View {
    @Binding var path: [Route]

    @State private var text = ""
    @State private var dictation = Dictation()
    @AppStorage("recentQuestions") private var recentRaw = ""
    @FocusState private var focused: Bool

    private static let examples = [
        "What gift should I get my colleague's kids?",
        "Whose birthday is coming up this month?",
        "What did I save about places to visit in Tunis?",
        "What did my landlord email me about the lease?",
    ]

    private var recent: [String] {
        recentRaw.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ask Brain").font(.system(size: 32, weight: .bold)).tracking(-0.3)
                Text("Answers from your own saves, and joins them up: a name in a voice memo, a screenshot, a bookmark, an email.")
                    .font(.system(size: 14)).foregroundStyle(Theme.soft)
                HStack(spacing: 8) {
                    TextField("Ask anything you've saved", text: $text)
                        .font(.system(size: 16))
                        .focused($focused)
                        .submitLabel(.send)
                        .onSubmit { ask(text) }
                    Button { Task { await dictation.toggle() } } label: {
                        Image(systemName: dictation.listening ? "mic.fill" : "mic")
                            .font(.system(size: 17))
                            .foregroundStyle(dictation.listening ? Theme.accent : Theme.faint)
                            .symbolEffect(.pulse, isActive: dictation.listening)
                    }
                    .accessibilityLabel(dictation.listening ? "Stop listening" : "Ask by voice")
                    Button { ask(text) } label: {
                        Image(systemName: "arrow.up.circle.fill").font(.system(size: 26))
                            .foregroundStyle(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Theme.faint : Theme.accent)
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("Ask")
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14))
                if let error = dictation.error {
                    Text(error).font(.footnote).foregroundStyle(Theme.bad)
                }

                if !recent.isEmpty {
                    GroupCaption("Recent")
                    questions(recent)
                }
                GroupCaption("Try")
                questions(Self.examples)
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Theme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: dictation.text) { _, spoken in if !spoken.isEmpty { text = spoken } }
        .onChange(of: dictation.listening) { _, on in if !on, !text.isEmpty { ask(text) } }
    }

    private func questions(_ list: [String]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.offset) { n, q in
                Button { ask(q) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles").font(.system(size: 13)).foregroundStyle(Theme.accent)
                        Text(q).font(.system(size: 15)).multilineTextAlignment(.leading).foregroundStyle(Theme.ink)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.chevron)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) {
                        if n < list.count - 1 { Rectangle().fill(Theme.divider).frame(height: 1).padding(.leading, 14) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .groupBox()
    }

    private func ask(_ question: String) {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        focused = false
        recentRaw = ([q] + recent.filter { $0 != q }).prefix(5).joined(separator: "\n")
        text = ""
        path.append(.ask(String(q.prefix(500))))
    }
}

/// Ask a question of your own saves. the chosen AI answers from the closest ones and cites them as [1], [2] …
struct AskView: View {
    let question: String

    @Environment(AppSession.self) private var session
    @State private var answer: Answer?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(question).font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.ink)
                if let answer {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("From your saves", systemImage: "sparkles")
                            .font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.accent)
                        Text(answer.answer ?? (answer.sources.isEmpty
                            ? "Nothing you've saved seems to be about that yet."
                            : "Add an AI key in Settings, AI to get written answers. These look closest:"))
                            .font(.system(size: 16)).lineSpacing(5).foregroundStyle(Theme.ink)
                            .textSelection(.enabled)
                        if let searched = answer.searched, !searched.isEmpty {
                            Text("Looked for: " + searched.joined(separator: " · "))
                                .font(.system(size: 12.5)).foregroundStyle(Theme.soft)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accentBG, in: RoundedRectangle(cornerRadius: 12))
                    if !answer.sources.isEmpty {
                        GroupCaption("Sources")
                        VStack(spacing: 0) {
                            ForEach(Array(answer.sources.enumerated()), id: \.element.id) { n, item in
                                MiniItemRow(item: item, number: n + 1)
                            }
                        }
                        .groupBox()
                    }
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.bad)
                } else {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Looking through your saves and linking them up…").foregroundStyle(Theme.soft)
                    }
                    .padding(.top, 10)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(Theme.grouped)
        .navigationTitle("Ask Brain")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                answer = try await API.shared.ask(question)
            } catch APIError.signedOut {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
