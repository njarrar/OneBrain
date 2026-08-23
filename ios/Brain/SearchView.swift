import SwiftUI

/// Search every save, in English or Arabic. The mic fills the field by voice.
struct SearchView: View {
    @Binding var listening: Bool

    @Environment(MenuStore.self) private var store
    @State private var text = ""
    @State private var query = ""
    @State private var dictation = Dictation()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Search").font(.system(size: 32, weight: .bold)).tracking(-0.3)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 16)).foregroundStyle(Theme.faint)
                    TextField("Search or ask, in English or Arabic", text: $text)
                        .font(.system(size: 16))
                        .focused($focused)
                        .submitLabel(.search)
                        .autocorrectionDisabled()
                        .onSubmit { query = text.trimmingCharacters(in: .whitespaces) }
                    if !text.isEmpty {
                        Button { text = ""; query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.faint)
                        }
                        .accessibilityLabel("Clear")
                    }
                    Button { Task { await dictation.toggle() } } label: {
                        Image(systemName: dictation.listening ? "mic.fill" : "mic")
                            .font(.system(size: 16))
                            .foregroundStyle(dictation.listening ? Theme.accent : Theme.faint)
                            .symbolEffect(.pulse, isActive: dictation.listening)
                    }
                    .accessibilityLabel(dictation.listening ? "Stop listening" : "Search by voice")
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
                if let error = dictation.error {
                    Text(error).font(.footnote).foregroundStyle(Theme.bad)
                }
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 8)

            let typed = text.trimmingCharacters(in: .whitespaces)
            if !typed.isEmpty {
                NavigationLink(value: Route.ask(typed)) {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles").foregroundStyle(Theme.accent)
                        Text("Ask Brain: “\(typed)”").lineLimit(1).foregroundStyle(Theme.ink)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.chevron)
                    }
                    .font(.system(size: 15))
                    .padding(.horizontal, 14).frame(height: 44)
                    .background(Theme.accentBG, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16).padding(.bottom, 8)
                }
                .buttonStyle(.plain)
            }
            if query.isEmpty {
                suggestions
            } else {
                ItemList(filter: .all { $0.q = query }, mode: .search).id(query)
            }
        }
        .background(Theme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if listening {
                listening = false
                Task { await dictation.start() }
            } else if query.isEmpty {
                focused = true
            }
        }
        .onChange(of: listening) { _, now in
            if now { listening = false; Task { await dictation.start() } }
        }
        .onChange(of: dictation.text) { _, spoken in if !spoken.isEmpty { text = spoken } }
        .onChange(of: dictation.listening) { _, on in
            if !on { query = text.trimmingCharacters(in: .whitespaces) }
        }
    }

    /// Before a search: tap a category or tag to see its saves.
    private var suggestions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let menu = store.menu {
                    GroupCaption("Categories")
                    Flow(spacing: 8) {
                        ForEach(menu.categories) { c in
                            NavigationLink(value: Route.list(.all { $0.category = c.name })) {
                                HStack(spacing: 7) {
                                    RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(c.color)).frame(width: 8, height: 8)
                                    Text(c.name).lineLimit(1)
                                }
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.ink2)
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(Theme.fill, in: Capsule())
                            }
                        }
                    }
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
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.immediately)
    }
}
