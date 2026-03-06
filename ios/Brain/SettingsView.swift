import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    let menu: MenuData?
    var changed: () async -> Void = {}
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var screenshots = ScreenshotSync.shared
    @State private var sorter = Sorter.shared
    @AppStorage("blurSensitive") private var blur = true

    @State private var xOn = XBookmarks.connected
    @State private var youtubeOn = YouTube.connected
    @State private var busy: String?
    @State private var note: [String: String] = [:]
    @State private var pickInstagram = false
    @State private var anthropicKey = ""
    @State private var hasKey = Sorter.ready

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Signed in", value: session.name ?? "Yes")
                } footer: {
                    Text("Your saves live on this phone. iPhone backup and iCloud Backup keep a copy.")
                }

                xSection
                youtubeSection
                instagramSection
                screenshotSection
                claudeSection
                webSection

                Section("Show") {
                    Toggle("Blur sensitive items", isOn: $blur)
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        session.signOut()
                        dismiss()
                    }
                } footer: {
                    Text("To save from any app, tap Share, then Save to Brain. If you don't see it, scroll the app row to the end, tap More, and turn it on.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .fileImporter(isPresented: $pickInstagram, allowedContentTypes: [.json, .zip]) { result in
                guard case .success(let file) = result else { return }
                work("instagram") {
                    let r = try await InstagramImport.run(file)
                    return "Found \(r.found) posts, \(r.added) new."
                }
            }
        }
    }

    private func source(_ id: String) -> MenuData.Source? { menu?.sources.first { $0.id == id } }

    private func info(_ id: String) -> some View {
        Group {
            if let n = note[id] {
                Text(n).font(.footnote).foregroundStyle(Theme.soft)
            } else if let s = source(id) {
                Text([s.items > 0 ? "\(s.items.formatted()) items" : nil,
                      s.lastSyncAt.flatMap(Dates.parse).map { "last synced \(Dates.short($0))" },
                      s.lastError].compactMap { $0 }.joined(separator: ", "))
                    .font(.footnote).foregroundStyle(s.lastError == nil ? Theme.soft : .red)
            }
        }
    }

    /// Runs one job at a time and shows its result under the source.
    private func work(_ id: String, _ job: @escaping () async throws -> String) {
        busy = id
        note[id] = "Working…"
        Task {
            do { note[id] = try await job() } catch { note[id] = error.localizedDescription }
            busy = nil
            await changed()
            if Sorter.ready { await Sorter.shared.run() }
            await changed()
        }
    }

    private var xSection: some View {
        Section {
            if xOn {
                Button("Sync X bookmarks now") { work("x") { let n = try await XBookmarks.sync(); return "\(n) new." } }
                    .disabled(busy != nil)
                Button("Disconnect X", role: .destructive) { XBookmarks.disconnect(); xOn = false }
            } else {
                Button("Connect X") {
                    work("x") {
                        try await XBookmarks.connect()
                        xOn = true
                        let n = try await XBookmarks.sync()
                        return "Connected. \(n) new."
                    }
                }
                .disabled(busy != nil)
            }
            info("x")
        } header: {
            Text("X")
        } footer: {
            Text("Brain reads your newest 800 bookmarks, which is all X allows. It stops at the first page it has already seen.")
        }
    }

    private var youtubeSection: some View {
        Section {
            if youtubeOn {
                NavigationLink("Pick playlists (\(YouTube.picked.count))") { PlaylistPicker() }
                Button("Sync YouTube now") { work("youtube") { let n = try await YouTube.sync(); return "\(n) new." } }
                    .disabled(busy != nil)
            } else {
                Button("Connect YouTube") {
                    work("youtube") {
                        let t = try await OAuth.signIn(OAuth.google, name: "Google")
                        guard let r = t.refresh else { throw SourceError.api("Google didn't give lasting access. Try again.") }
                        Secrets[.googleRefresh] = r
                        youtubeOn = true
                        return "Connected. Pick the playlists you want."
                    }
                }
                .disabled(busy != nil)
            }
            info("youtube")
        } header: {
            Text("YouTube")
        }
    }

    private var instagramSection: some View {
        Section {
            Button("Import saved posts file") { pickInstagram = true }.disabled(busy != nil)
            info("instagram")
        } header: {
            Text("Instagram")
        } footer: {
            Text("In Instagram, go to Accounts Center, Your information and permissions, Download your information, and pick JSON. Open the zip in Files, then pick saved_posts.json here. Or share any post to Save to Brain.")
        }
    }

    private var screenshotSection: some View {
        Section {
            Toggle("Add new screenshots", isOn: Binding(
                get: { screenshots.enabled },
                set: { on in
                    if on { Task { _ = await screenshots.turnOn() } } else { screenshots.enabled = false }
                }
            ))
            if screenshots.enabled {
                Button("Add new screenshots now") { Task { await screenshots.sync() } }
                    .disabled(screenshots.running)
                Button("Add older screenshots") { Task { await screenshots.sync(older: true) } }
                    .disabled(screenshots.running)
            }
            if let status = screenshots.status {
                Text(status).font(.footnote).foregroundStyle(Theme.soft)
            }
        } header: {
            Text("Screenshots")
        } footer: {
            Text("Brain checks for new screenshots each time you open it. Claude reads the text in them.")
        }
    }

    private var claudeSection: some View {
        Section {
            if hasKey {
                Button("Sort now") { Task { await sorter.run(); await changed() } }.disabled(sorter.running)
                Button("Remove key", role: .destructive) { Secrets[.anthropic] = nil; hasKey = false }
            } else {
                SecureField("Anthropic key", text: $anthropicKey)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Save key") {
                    Secrets[.anthropic] = anthropicKey.trimmingCharacters(in: .whitespacesAndNewlines)
                    anthropicKey = ""
                    hasKey = Sorter.ready
                }
                .disabled(anthropicKey.isEmpty)
            }
            if let s = sorter.status { Text(s).font(.footnote).foregroundStyle(Theme.soft) }
        } header: {
            Text("Sorting with Claude")
        } footer: {
            Text("The key stays in this phone's Keychain. Claude sees each new item's text, and the picture for screenshots, to sort it.")
        }
    }

    private var webSection: some View {
        Section {
            Button(WebImport.done ? "Copy from the web app again" : "Copy from the web app") {
                work("web") {
                    let added = try await WebImport.run { seen, total in note["web"] = "Copied \(seen) of \(total)…" }
                    return "Done. \(added) new items."
                }
            }
            .disabled(busy != nil)
            if let n = note["web"] { Text(n).font(.footnote).foregroundStyle(Theme.soft) }
        } header: {
            Text("Web app")
        } footer: {
            Text("Copies your saves, categories, tags and notes from the web app to this phone, once. After that the phone and the web app don't share anything.")
        }
    }
}

/// Pick which YouTube playlists come into Brain. Tick as many as you like.
struct PlaylistPicker: View {
    @State private var lists: [YouTube.Playlist] = []
    @State private var picked = YouTube.picked
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        List {
            row(YouTube.liked, "Liked videos", nil)
            Section("Your playlists") {
                if loading { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
                ForEach(lists) { l in row(l.id, l.title, l.count) }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("Playlists")
        .task {
            do { lists = try await YouTube.playlists() } catch { self.error = error.localizedDescription }
            loading = false
        }
        .onChange(of: picked) { _, now in YouTube.picked = now }
    }

    private func row(_ id: String, _ title: String, _ count: Int?) -> some View {
        Button {
            if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
        } label: {
            HStack {
                Image(systemName: picked.contains(id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(picked.contains(id) ? Theme.accent : Theme.soft)
                Text(title).foregroundStyle(Theme.ink)
                Spacer()
                if let count { Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(Theme.soft) }
            }
        }
    }
}
