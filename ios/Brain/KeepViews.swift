import AVFoundation
import SwiftUI

// MARK: Clear the pile

/// Every inbox save, oldest first, one at a time, until none are left. Keep moves it to the
/// Archive, Let go moves it to Trash, Snooze hides it for two weeks. After Keep, one tap says why.
struct PileView: View {
    @Environment(AppSession.self) private var session
    @Environment(MenuStore.self) private var store
    @State private var cards: [Item] = []
    @State private var left = 0
    @State private var cleared = 0
    @State private var loaded = false
    @State private var history: [(item: Item, how: String)] = []
    @State private var handled: [String] = []
    @State private var asking: Item?
    @State private var picked: KeptWhy?
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Oldest first. Decide on each save until none are left.")
                    .font(.ui(15)).foregroundStyle(Theme.soft)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    bar
                    if let asking { why(asking) }
                    if let card = cards.first {
                        cardView(card)
                        calls(card)
                    } else {
                        empty
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.bad) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 80)
        }
        .background(Theme.grouped)
        .navigationTitle("Clear the pile")
        .task { await load() }
        .onDisappear { Task { await store.load(session: session) } }
    }

    private var bar: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(left.formatted()).font(.ui(28, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.ink)
                .contentTransition(.numericText())
            Text("left").font(.ui(14, design: .monospaced)).foregroundStyle(Theme.soft)
            if cleared > 0 {
                Text("· \(cleared) cleared").font(.ui(13)).foregroundStyle(Theme.faint)
            }
            Spacer()
            Button { Task { await undo() } } label: {
                Label("Undo", systemImage: "arrow.uturn.backward").font(.ui(14, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(history.isEmpty ? Theme.faint : Theme.accent)
            .disabled(history.isEmpty)
        }
    }

    private func why(_ item: Item) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Why did you keep it?").font(.ui(13, weight: .medium)).foregroundStyle(Theme.soft)
            Flow(spacing: 6) {
                ForEach(KeptWhy.allCases) { w in
                    Button {
                        Haptic.tap()
                        let next: KeptWhy? = picked == w ? nil : w
                        picked = next
                        Task { try? await API.shared.keptWhy(item.id, next) }
                    } label: {
                        Text(w.label).font(.ui(14, weight: .medium))
                            .padding(.horizontal, 12).frame(minHeight: 34)
                            .foregroundStyle(picked == w ? Theme.accentInk : Theme.ink)
                            .background(picked == w ? Theme.accentFill : Theme.card, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.accentBG, in: RoundedRectangle(cornerRadius: 12))
    }

    private func cardView(_ item: Item) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(Sources.label(item.sources?.first ?? "manual")) · \(Dates.short(item.date))")
                .font(.ui(12, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 10).frame(minHeight: 24)
                .background(Theme.accentBG, in: Capsule())
            if let author = item.author ?? item.authorHandle {
                Text(author).font(.ui(14, weight: .medium)).foregroundStyle(Theme.soft)
            }
            Text(item.mainText)
                .font(.ui(item.isArabic ? 21 : 19, weight: .medium))
                .lineSpacing(item.isArabic ? 12 : 6)
                .lineLimit(12)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(item.isArabic ? .trailing : .leading)
                .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
            if let summary = item.summary, !summary.isEmpty {
                Text(summary).font(.ui(15)).foregroundStyle(Theme.ink2)
            }
            if let url = item.pictures.first, !item.isSensitive {
                Color.clear.aspectRatio(16 / 10, contentMode: .fit).frame(maxWidth: .infinity)
                    .overlay { RemoteImage(url: url) }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            HStack {
                if let category = item.category { CategoryLabel(name: category, color: item.categoryColor) }
                Spacer()
                NavigationLink(value: Route.item(item)) {
                    Text("Open").font(.ui(14, weight: .semibold)).foregroundStyle(Theme.accent)
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
        .id(item.id)
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
    }

    private func calls(_ item: Item) -> some View {
        HStack(spacing: 10) {
            call("Let go", "trash", how: "letgo", item)
            call("Snooze", "moon.zzz", how: "snooze", item)
            call("Keep", "checkmark", how: "done", item, main: true)
        }
    }

    private func call(_ label: String, _ symbol: String, how: String, _ item: Item, main: Bool = false) -> some View {
        Button { decide(item, how: how) } label: {
            Label(label, systemImage: symbol)
                .font(.ui(15, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 46)
                .foregroundStyle(main ? Theme.accentInk : Theme.ink)
                .background(main ? Theme.accentFill : Theme.card, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Text("0").font(.ui(40, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.accent)
            Text("The pile is clear.").font(.ui(17, weight: .semibold)).foregroundStyle(Theme.ink)
            Text("New saves land here. Snoozed ones come back in two weeks.")
                .font(.ui(14)).foregroundStyle(Theme.soft).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    /// Moves on at once and saves behind you. If saving fails, the card comes back.
    private func decide(_ item: Item, how: String) {
        how == "letgo" ? Haptic.warn() : Haptic.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            cards.removeFirst()
            left = max(0, left - 1)
            cleared += 1
        }
        history = Array((history + [(item: item, how: how)]).suffix(20))
        handled.append(item.id)
        asking = how == "done" ? item : nil
        picked = nil
        error = nil
        Task {
            do {
                try await API.shared.pileCall(item.id, how: how)
            } catch {
                cards.removeAll { $0.id == item.id }
                cards.insert(item, at: 0)
                left += 1
                cleared = max(0, cleared - 1)
                self.error = "Couldn't save that. Try again."
            }
            await more()
        }
    }

    private func undo() async {
        guard let last = history.popLast() else { return }
        Haptic.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            cards.removeAll { $0.id == last.item.id }
            cards.insert(last.item, at: 0)
            left += 1
            cleared = max(0, cleared - 1)
        }
        asking = nil
        do {
            try await API.shared.pileCall(last.item.id, how: "undo")
        } catch {
            self.error = "Couldn't take that back. Try again."
        }
    }

    private func load() async {
        do {
            let page = try await API.shared.pile()
            cards = page.items
            left = page.left
            error = nil
        } catch APIError.signedOut {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    /// Fetches more before the screen runs out.
    private func more() async {
        guard !loading, cards.count < 6, left > cards.count else { return }
        loading = true
        defer { loading = false }
        if let page = try? await API.shared.pile(skip: cards.map(\.id) + handled.suffix(60)) {
            let have = Set(cards.map(\.id))
            cards += page.items.filter { !have.contains($0.id) }
        }
    }
}

// MARK: Topic map

/// Each circle is a category, sized by how much you saved in it. Lines join categories whose
/// saves share tags. Tap a circle to open it.
struct TopicMapView: View {
    @Environment(AppSession.self) private var session
    @State private var map: TopicMap?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let map {
                    Text("\(map.total.formatted()) saves. Bigger circles hold more. Lines join topics that share tags.")
                        .font(.ui(15)).foregroundStyle(Theme.soft)
                    if map.nodes.isEmpty {
                        Text("Nothing is sorted yet.").foregroundStyle(Theme.faint).padding(.top, 20)
                    } else {
                        canvas(map)
                        list(map)
                    }
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.bad)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 80)
        }
        .background(Theme.grouped)
        .navigationTitle("Topic map")
        .task {
            do {
                map = try await API.shared.topicMap()
            } catch APIError.signedOut {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func canvas(_ map: TopicMap) -> some View {
        GeometryReader { geo in
            let scale = geo.size.width / 1040
            let at = { (x: Double, y: Double) in CGPoint(x: (x + 20) * scale, y: (y + 20) * scale) }
            let byName = Dictionary(uniqueKeysWithValues: map.nodes.map { ($0.name, $0) })
            let most = Double(map.links.map(\.shared).max() ?? 1)
            ZStack(alignment: .topLeading) {
                Path { p in
                    for l in map.links {
                        guard let a = byName[l.a], let b = byName[l.b] else { continue }
                        p.move(to: at(a.x, a.y))
                        p.addLine(to: at(b.x, b.y))
                    }
                }
                .stroke(Theme.faint.opacity(0.6), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [5, 4]))
                ForEach(map.links, id: \.self) { l in
                    if let a = byName[l.a], let b = byName[l.b], Double(l.shared) / most > 0.5 {
                        Path { p in
                            p.move(to: at(a.x, a.y))
                            p.addLine(to: at(b.x, b.y))
                        }
                        .stroke(Theme.soft.opacity(0.5), lineWidth: 2.5)
                    }
                }
                ForEach(map.nodes) { n in
                    let c = at(n.x, n.y)
                    let r = n.r * scale
                    NavigationLink(value: Route.list(.all { $0.category = n.name })) {
                        VStack(spacing: 2) {
                            Circle()
                                .fill(Theme.swatch(n.color).opacity(0.22))
                                .overlay(Circle().stroke(Theme.swatch(n.color), lineWidth: 1.5))
                                .overlay(Text(n.count.formatted()).font(.ui(max(9, r * 0.5), weight: .semibold, design: .monospaced)).foregroundStyle(Theme.ink))
                                .frame(width: r * 2, height: r * 2)
                            Text(n.name.uppercased()).font(.ui(9, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Theme.ink).lineLimit(1).fixedSize()
                        }
                    }
                    .buttonStyle(.plain)
                    .position(x: c.x, y: c.y + 7)
                    .accessibilityLabel("\(n.name), \(n.count) saves")
                }
            }
        }
        .aspectRatio(1040 / 1060, contentMode: .fit)
    }

    private func list(_ map: TopicMap) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(map.nodes.enumerated()), id: \.element.id) { i, n in
                NavigationLink(value: Route.list(.all { $0.category = n.name })) {
                    VStack(alignment: .leading, spacing: 4) {
                        GroupRow(label: n.name, value: n.count.formatted(), divider: false, minHeight: 40) {
                            RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(n.color)).frame(width: 10, height: 10).padding(.horizontal, 5)
                        }
                        if !n.subtopics.isEmpty {
                            Text(n.subtopics.map { "\($0.name) \($0.count)" }.joined(separator: " · "))
                                .font(.ui(12.5)).foregroundStyle(Theme.soft).lineLimit(2)
                                .padding(.horizontal, 14).padding(.bottom, 10)
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if i < map.nodes.count - 1 { Rectangle().fill(Theme.divider).frame(height: 1) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .groupBox()
    }
}

// MARK: Podcast

/// Two hosts talk through the last thirty days of what you kept. Make writes a new episode.
struct PodcastView: View {
    @Environment(AppSession.self) private var session
    @State private var episodes: [Podcast] = []
    @State private var loaded = false
    @State private var making = false
    @State private var note: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Maya and Sam talk through the last thirty days of what you saved and kept, and push back on each other.")
                    .font(.ui(15)).foregroundStyle(Theme.soft)
                Button { Task { await make() } } label: {
                    HStack(spacing: 8) {
                        if making { ProgressView() } else { Image(systemName: "waveform") }
                        Text(making ? "Making it, about a minute…" : episodes.isEmpty ? "Make" : "Make a new one")
                    }
                    .font(.ui(15, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 14).frame(minHeight: 40)
                    .background(Theme.accentBG, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(making)
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.soft) }
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                } else if episodes.isEmpty {
                    Text("No episode yet.").foregroundStyle(Theme.faint).padding(.top, 20)
                }
                ForEach(episodes) { p in
                    GroupCaption(p.span)
                    VStack(alignment: .leading, spacing: 10) {
                        Text(p.title).font(.ui(17, weight: .semibold)).foregroundStyle(Theme.ink)
                        EpisodePlayer(episode: p)
                        DisclosureGroup("Read the script") {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(Array(p.lines.enumerated()), id: \.offset) { _, l in
                                    (Text(l.host + ": ").bold() + Text(l.text)).font(.ui(14.5)).foregroundStyle(Theme.ink)
                                }
                            }
                            .padding(.top, 6)
                        }
                        .font(.ui(14, weight: .medium))
                        .tint(Theme.accent)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .groupBox()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 80)
        }
        .background(Theme.grouped)
        .navigationTitle("Podcast")
        .task { await load() }
    }

    private func load() async {
        do {
            episodes = try await API.shared.podcasts()
        } catch APIError.signedOut {
            session.signOut()
        } catch {
            note = error.localizedDescription
        }
        loaded = true
    }

    private func make() async {
        making = true
        defer { making = false }
        do {
            let out = try await API.shared.makePodcast()
            note = out.made ? nil : out.reason
            if out.made { Haptic.done() }
            episodes = try await API.shared.podcasts()
        } catch {
            note = error.localizedDescription
        }
    }
}

/// Plays one episode. The sound needs the key, so it is loaded first, then played from a copy.
private struct EpisodePlayer: View {
    let episode: Podcast

    @State private var player: AVPlayer?
    @State private var playing = false
    @State private var loading = false
    @State private var failed = false
    @State private var position: Double = 0
    @State private var length: Double = 0
    @State private var observer: Any?

    var body: some View {
        HStack(spacing: 12) {
            Button { Task { await toggle() } } label: {
                Group {
                    if loading { ProgressView() } else {
                        Image(systemName: playing ? "pause.fill" : "play.fill").font(.ui(16, weight: .semibold))
                    }
                }
                .foregroundStyle(Theme.accentInk)
                .frame(width: 44, height: 44)
                .background(Theme.accentFill, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playing ? "Pause" : "Play")
            if length > 0 {
                Slider(value: $position, in: 0...length) { editing in
                    if !editing { player?.seek(to: CMTime(seconds: position, preferredTimescale: 600)) }
                }
                .tint(Theme.accent)
            } else {
                Spacer()
            }
            Text(failed ? "Couldn't load" : "\(Self.clock(position)) / \(Self.clock(length > 0 ? length : episode.seconds ?? 0))")
                .font(.ui(12, design: .monospaced)).foregroundStyle(failed ? Theme.bad : Theme.faint)
        }
        .onDisappear {
            player?.pause()
            playing = false
            if let observer { player?.removeTimeObserver(observer) }
            observer = nil
        }
    }

    private func toggle() async {
        if playing {
            player?.pause()
            playing = false
            return
        }
        guard let p = await load() else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        p.play()
        playing = true
    }

    private func load() async -> AVPlayer? {
        if let player { return player }
        loading = true
        defer { loading = false }
        do {
            let data = try await API.shared.podcastAudio(episode)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("brain-podcast-\(episode.id).mp3")
            try data.write(to: url, options: .atomic)
            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            if let seconds = try? await item.asset.load(.duration).seconds, seconds.isFinite { length = seconds }
            observer = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { t in
                Task { @MainActor in
                    position = t.seconds
                    if length > 0, t.seconds >= length - 0.3 { playing = false }
                }
            }
            player = p
            failed = false
            return p
        } catch {
            failed = true
            return nil
        }
    }

    private static func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
