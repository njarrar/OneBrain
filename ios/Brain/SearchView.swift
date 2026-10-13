import SwiftUI

/// The Search tab, which also asks Brain. Saves that match show as you type, and the
/// "Ask Brain" row on top turns what you typed into an answer from your own saves.
/// Before you type: recent questions, questions drawn from your saves, categories and tags.
struct SearchView: View {
    @Binding var path: [Route]

    @Environment(MenuStore.self) private var store
    @State private var text = ""
    @State private var query = ""
    @State private var dictation = Dictation()
    @State private var focused = false
    @AppStorage("recentQuestions") private var recentRaw = ""

    private var typed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            if let error = dictation.error {
                Text(error).font(.footnote).foregroundStyle(Theme.bad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.bottom, 6)
            }
            if typed.isEmpty {
                suggestions
            } else {
                askRow
                if query.isEmpty {
                    Spacer()
                } else {
                    ItemList(filter: .all { $0.q = query }, mode: .search).id(query)
                }
            }
        }
        .background(Theme.bg)
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.large)
        // In the Search tab on iOS 26 the field sits at the bottom, by the tab bar.
        .searchable(text: $text, isPresented: $focused, prompt: "Search or ask, in English or Arabic")
        .autocorrectionDisabled()
        .onSubmit(of: .search) { query = typed }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await dictation.toggle() } } label: {
                    Image(systemName: dictation.listening ? "mic.fill" : "mic")
                        .symbolEffect(.pulse, isActive: dictation.listening)
                }
                .accessibilityLabel(dictation.listening ? "Stop listening" : "Search by voice")
            }
        }
        // Matching saves follow the typing, after a short pause.
        .task(id: typed) {
            if typed.isEmpty { query = ""; return }
            try? await Task.sleep(for: .milliseconds(350))
            if !Task.isCancelled { query = typed }
        }
        .onChange(of: dictation.text) { _, spoken in if !spoken.isEmpty { text = spoken } }
        .onChange(of: dictation.listening) { _, on in if !on { query = typed } }
    }

    /// "Ask Brain: …" on top of the results.
    private var askRow: some View {
        Button { ask(typed) } label: {
            HStack(spacing: 10) {
                Image(systemName: "sparkles").foregroundStyle(Theme.accent)
                Text("Ask Brain: “\(typed)”").lineLimit(2).multilineTextAlignment(.leading).foregroundStyle(Theme.ink)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.chevron)
            }
            .font(.ui(15, weight: .medium))
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 48)
            .background(Theme.accentBG, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
    }

    // MARK: Before typing

    private var recent: [String] {
        recentRaw.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }

    /// Questions built from what you have saved, so the first tap always finds something.
    private var examples: [String] {
        guard let menu = store.menu else {
            return ["What did I save this week?", "Whose birthday is coming up this month?"]
        }
        var out: [String] = []
        if let c = menu.categories.max(by: { $0.count < $1.count }) {
            out.append("What have I saved about \(c.name.components(separatedBy: CharacterSet(charactersIn: ",&")).first?.trimmingCharacters(in: .whitespaces) ?? c.name)?")
        }
        if let t = menu.tags.first { out.append("What did I save tagged #\(t.name)?") }
        if let s = menu.sources.filter({ $0.items > 0 }).max(by: { $0.items < $1.items }) {
            out.append("What are the best things I saved from \(Sources.label(s.id))?")
        }
        out.append("What did I save this week?")
        return out
    }

    private var suggestions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if !recent.isEmpty {
                    GroupCaption("Recent questions")
                    questions(recent)
                }
                GroupCaption("Ask Brain")
                questions(examples)
                if let menu = store.menu {
                    if !menu.categories.isEmpty {
                        GroupCaption("Categories")
                        Flow(spacing: 8) {
                            ForEach(menu.categories) { c in
                                NavigationLink(value: Route.list(.all { $0.category = c.name })) {
                                    HStack(spacing: 7) {
                                        RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(c.color)).frame(width: 8, height: 8)
                                        Text(c.name).lineLimit(1)
                                    }
                                    .font(.ui(14, weight: .medium))
                                    .foregroundStyle(Theme.ink2)
                                    .padding(.horizontal, 12).frame(minHeight: 32)
                                    .background(Theme.fill, in: Capsule())
                                }
                            }
                        }
                    }
                    if !menu.tags.isEmpty {
                        GroupCaption("Top tags")
                        Flow(spacing: 8) {
                            ForEach(menu.tags.prefix(20)) { t in
                                NavigationLink(value: Route.list(.all { $0.tag = t.name })) {
                                    Chip("#\(t.name)")
                                }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    private func questions(_ list: [String]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.offset) { n, q in
                Button { ask(q) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles").font(.ui(13)).foregroundStyle(Theme.accent)
                        Text(q).font(.ui(15)).multilineTextAlignment(.leading).foregroundStyle(Theme.ink)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.chevron)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) {
                        if n < list.count - 1 { Rectangle().fill(Theme.divider).frame(height: 1).padding(.leading, 14) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 16))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func ask(_ question: String) {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        recentRaw = ([q] + recent.filter { $0 != q }).prefix(5).joined(separator: "\n")
        path.append(.ask(String(q.prefix(500))))
    }
}
