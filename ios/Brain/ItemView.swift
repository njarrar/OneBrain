import SwiftUI
import UIKit

/// One save: author, text, pictures, summary, then note, category, tags and source in one group.
/// Actions live in the glass toolbar at the bottom.
struct ItemView: View {
    let preview: Item

    @Environment(AppSession.self) private var session
    @Environment(MenuStore.self) private var store
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @AppStorage("blurSensitive") private var blur = true
    @State private var detail: ItemDetail?
    @State private var note = ""
    @State private var editingNote = false
    @State private var addingTag = false
    @State private var newTag = ""
    @State private var reveal = false
    @State private var error: String?
    @State private var confirmPurge = false
    @State private var confirmTrash = false
    @State private var related: [Item] = []
    @State private var pickingDate = false
    @State private var remindDate = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
    @FocusState private var noteFocus: Bool

    private var item: Item { detail?.item ?? preview }
    private var hidden: Bool { blur && item.isSensitive && !reveal }
    /// A voice memo or video, so its text was heard rather than read off a picture.
    private var heard: Bool { detail?.sounds.isEmpty == false || item.kind == "audio" || item.kind == "video" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                author
                text
                pictures
                if let sounds = detail?.sounds { ForEach(sounds, id: \.id) { VoicePlayer(file: $0) } }
                if let facts = item.facts, !facts.isEmpty { factsCard(facts) }
                if item.transcript?.isEmpty == false || detail?.textError != nil || detail?.sounds.isEmpty == false { transcriptCard }
                if let summary = item.summary, !summary.isEmpty { summaryCard(summary) }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.bad) }
                details
                if !related.isEmpty { relatedList }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let link = item.url, let url = URL(string: link) {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                }
                Menu {
                    if !item.inTrash { remindMenu }
                    if let link = item.url {
                        Button { UIPasteboard.general.string = link } label: { Label("Copy link", systemImage: "link") }
                    }
                    Button { UIPasteboard.general.string = item.body ?? item.mainText } label: { Label("Copy text", systemImage: "doc.on.doc") }
                    if !item.inTrash {
                        Button { Task { await reread() } } label: { Label("Read again", systemImage: "sparkles") }
                    }
                    if item.status != "inbox" && !item.inTrash {
                        Button { Task { await change(.init(status: "inbox")) } } label: { Label("Move to Inbox", systemImage: "tray") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .overlay(alignment: .topTrailing) {
                            // A reminder is set: a small accent dot on More, where the bell now lives.
                            if Dates.parse(item.remindAt) != nil {
                                Circle().fill(Theme.accentFill).frame(width: 6, height: 6).offset(x: 4, y: -3)
                            }
                        }
                }
                .accessibilityLabel("More")
            }
        }
        .overlay(alignment: .bottom) { toolbar }
        .toolbar(.hidden, for: .tabBar)
        .confirmationDialog("Delete this for good?", isPresented: $confirmPurge, titleVisibility: .visible) {
            Button("Delete forever", role: .destructive) { Task { await purge() } }
        }
        .confirmationDialog("Move this to Trash?", isPresented: $confirmTrash, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Haptic.warn()
                Task { await change(.init(trash: true)); dismiss() }
            }
        } message: {
            Text("You can restore it from Trash.")
        }
        .sheet(isPresented: $pickingDate) {
            NavigationStack {
                DatePicker("Remind me on", selection: $remindDate, in: Date.now..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding()
                    .navigationTitle("Remind me")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { pickingDate = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Set") {
                                pickingDate = false
                                Task { await remind(Self.morning(of: remindDate)) }
                            }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
        .alert("Add a tag", isPresented: $addingTag) {
            TextField("Tag", text: $newTag).textInputAutocapitalization(.never)
            Button("Add") { addTags() }
            Button("Cancel", role: .cancel) { newTag = "" }
        } message: {
            Text("Split more than one with commas.")
        }
        .task { await load() }
    }

    // MARK: Parts

    private var author: some View {
        HStack(spacing: 12) {
            Text(initial)
                .font(.ui(15, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 40, height: 40)
                .background(Theme.fill, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(item.author ?? Sources.label(item.sourceKey)).font(.ui(16, weight: .semibold)).lineLimit(1)
                Text([item.authorHandle, Dates.short(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  "))
                    .font(.ui(12, design: .monospaced)).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Spacer()
            SourceMark(source: item.sourceKey, size: 17).foregroundStyle(Theme.faint)
        }
        .foregroundStyle(Theme.ink)
    }

    @ViewBuilder private var text: some View {
        let align: TextAlignment = item.isArabic ? .trailing : .leading
        let frame: Alignment = item.isArabic ? .trailing : .leading
        if let title = item.title, !title.isEmpty {
            Text(title)
                .font(.ui(19, weight: item.body?.isEmpty == false ? .semibold : .regular))
                .lineSpacing(item.isArabic ? 14 : 9)
                .multilineTextAlignment(align).frame(maxWidth: .infinity, alignment: frame)
                .textSelection(.enabled)
        }
        if let body = item.body, !body.isEmpty {
            Text(body)
                .font(.ui(item.title?.isEmpty == false ? 16 : 19))
                .lineSpacing(item.isArabic ? 14 : 8)
                .foregroundStyle(item.title?.isEmpty == false ? Theme.ink2 : Theme.ink)
                .multilineTextAlignment(align).frame(maxWidth: .infinity, alignment: frame)
                .textSelection(.enabled)
        }
        if (item.title ?? "").isEmpty && (item.body ?? "").isEmpty, let link = item.url {
            Text(link).font(.ui(17)).foregroundStyle(Theme.accent).lineLimit(3)
        }
    }

    @ViewBuilder private var pictures: some View {
        ForEach(Array(item.pictures.enumerated()), id: \.offset) { i, url in
            // First picture at 16:10 as in the design; the rest keep their own shape.
            Group {
                if i == 0 {
                    Color.clear.aspectRatio(16 / 10, contentMode: .fit).frame(maxWidth: .infinity)
                        .overlay { RemoteImage(url: url) }
                } else {
                    RemoteImage(url: url, contentMode: .fit).frame(maxWidth: .infinity).frame(minHeight: 120)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .blur(radius: hidden ? 22 : 0)
            .overlay {
                if hidden && i == 0 {
                    Button("Show picture") { reveal = true }
                        .font(.ui(14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(.black.opacity(0.5), in: Capsule())
                }
            }
        }
    }

    /// The people and dates the AI found, so a birthday in a voice memo is plain to see.
    private func factsCard(_ facts: Facts) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "person.text.rectangle").foregroundStyle(Theme.accent)
                Text("What Brain found")
            }
            .font(.ui(12.5, weight: .medium))
            .foregroundStyle(Theme.soft)
            ForEach(Array(facts.dates.enumerated()), id: \.offset) { _, d in
                HStack(alignment: .firstTextBaseline) {
                    Text([d.person, d.what].compactMap { $0 }.joined(separator: ": ")).font(.ui(15, weight: .semibold))
                    Spacer(minLength: 8)
                    Text(Facts.dayLabel(d.date) + (d.yearly ? ", yearly" : "")).font(.ui(14)).foregroundStyle(Theme.ink2)
                }
            }
            ForEach(Array(facts.people.enumerated()), id: \.offset) { _, p in
                (Text(p.name).fontWeight(.semibold) + Text(p.about.isEmpty ? "" : "  \(p.about)").foregroundStyle(Theme.ink2))
                    .font(.ui(15))
            }
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
    }

    /// What was said in a voice memo, or the text in a picture, with Read again.
    private var transcriptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: heard ? "quote.bubble" : "text.viewfinder").foregroundStyle(Theme.accent)
                Text(heard ? "What was said" : "Text in the picture")
                Spacer()
                Button("Read again") { Task { await reread() } }.font(.ui(12.5, weight: .semibold))
            }
            .font(.ui(12.5, weight: .medium))
            .foregroundStyle(Theme.soft)
            if let t = item.transcript, !t.isEmpty {
                Text(t).font(.ui(15)).lineSpacing(4).foregroundStyle(Theme.ink2).textSelection(.enabled)
                    .multilineTextAlignment(item.isArabic ? .trailing : .leading)
                    .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
            } else if let e = detail?.textError {
                Text("Brain couldn't read this: \(e)").font(.footnote).foregroundStyle(Theme.bad)
            } else {
                Text("Brain is still listening to this one.").font(.footnote).foregroundStyle(Theme.faint)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
    }

    private func summaryCard(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Image(systemName: "sparkle").foregroundStyle(Theme.accent)
                Text("Summary")
            }
            .font(.ui(12.5, weight: .medium))
            .foregroundStyle(Theme.soft)
            Text(summary).font(.ui(15)).lineSpacing(4).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
    }

    private var details: some View {
        VStack(spacing: 0) {
            noteRow
            divider
            whyRow
            divider
            categoryRow
            divider
            tagsRow
            if let saves = detail?.saves, !saves.isEmpty {
                ForEach(saves, id: \.self) { s in
                    divider
                    savedRow(s)
                }
            }
        }
        .font(.ui(15))
        .foregroundStyle(Theme.ink)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }

    private var divider: some View { Rectangle().fill(Theme.divider).frame(height: 1) }

    private var noteRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "note.text").font(.ui(16)).foregroundStyle(Theme.accent)
            TextField("Note", text: $note, prompt: Text("Add a note").foregroundStyle(Theme.ink2), axis: .vertical)
                .lineLimit(1...8)
                .focused($noteFocus)
                .submitLabel(.done)
                .onChange(of: note) { _, v in
                    // Return ends the note rather than adding a line.
                    if v.hasSuffix("\n") { note = String(v.dropLast()); noteFocus = false }
                }
            if noteFocus || note != (detail?.item.note ?? "") {
                Button("Save") { saveNote() }.font(.ui(14, weight: .semibold)).foregroundStyle(Theme.accent)
                    .disabled(note == (detail?.item.note ?? ""))
            } else if !(detail?.item.note ?? "").isEmpty {
                Text("Saved").font(.ui(12)).foregroundStyle(Theme.faint)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 14)
        .onChange(of: noteFocus) { _, focused in if !focused { saveNote() } }
    }

    /// Why it was kept. Ask Brain, the digest and the podcast read it.
    private var whyRow: some View {
        Menu {
            if item.keptWhy != nil {
                Button("Not said") { Task { await setWhy(nil) } }
            }
            ForEach(KeptWhy.allCases) { w in
                Button(w.label) { Task { await setWhy(w) } }
            }
        } label: {
            HStack(spacing: 10) {
                Text("Kept").foregroundStyle(Theme.soft).frame(width: 78, alignment: .leading)
                if let label = KeptWhy.label(item.keptWhy) {
                    Text(label).foregroundStyle(Theme.ink).lineLimit(1)
                } else {
                    Text("Why did you keep it?").foregroundStyle(Theme.faint)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.chevron)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func setWhy(_ why: KeptWhy?) async {
        do {
            try await API.shared.keptWhy(preview.id, why)
            Haptic.tap()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private var categoryRow: some View {
        Menu {
            if item.category != nil {
                Button("No category") { Task { await change(.init(clearCategory: true)) } }
            }
            ForEach(store.menu?.categories ?? []) { c in
                Button(c.name) { Task { await change(.init(category: c.name)) } }
            }
        } label: {
            HStack(spacing: 10) {
                Text("Category").foregroundStyle(Theme.soft).frame(width: 78, alignment: .leading)
                if let category = item.category {
                    RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(item.categoryColor)).frame(width: 8, height: 8)
                    Text(category).foregroundStyle(Theme.ink).lineLimit(1)
                } else {
                    Text("Pick one").foregroundStyle(Theme.faint)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.chevron)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Solid tags are yours; dashed ones are the AI's suggestions. Tap a dashed tag to keep it; hold any tag to remove it.
    private var tagsRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Tags").foregroundStyle(Theme.soft).frame(width: 78, alignment: .leading)
            Flow(spacing: 6) {
                ForEach(detail?.tags ?? [], id: \.self) { t in
                    let suggested = t.addedBy != "user"
                    Button {
                        if suggested { Haptic.tap(); Task { await change(.init(addTags: [t.name])) } }
                    } label: {
                        Text("#\(t.name)")
                            .font(.ui(14))
                            .foregroundStyle(suggested ? Theme.soft : Theme.ink)
                            .padding(.horizontal, 10).frame(minHeight: 28)
                            .background(suggested ? Color.clear : Theme.raised, in: RoundedRectangle(cornerRadius: 6))
                            .overlay {
                                if suggested {
                                    RoundedRectangle(cornerRadius: 6).stroke(Theme.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        if suggested {
                            Button { Task { await change(.init(addTags: [t.name])) } } label: { Label("Keep tag", systemImage: "checkmark") }
                        }
                        Button(role: .destructive) { Task { await change(.init(removeTags: [t.name])) } } label: {
                            Label("Remove tag", systemImage: "xmark")
                        }
                    }
                    .accessibilityHint(suggested ? "Suggested by the AI. Tap to keep." : "")
                }
                Button { addingTag = true } label: {
                    Image(systemName: "plus").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.soft)
                        .frame(width: 28, height: 28)
                        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add a tag")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
    }

    private func savedRow(_ s: ItemDetail.Save) -> some View {
        HStack(spacing: 10) {
            Text("Saved from").foregroundStyle(Theme.soft).frame(width: 78, alignment: .leading)
            SourceMark(source: s.sourceId, size: 15).foregroundStyle(Theme.ink2)
            Text("\(s.name), \(Dates.row(Dates.parse(s.savedAt ?? s.createdAt)))").lineLimit(1)
            Spacer(minLength: 4)
            if let link = s.originalUrl, let url = URL(string: link) {
                Button { openURL(url) } label: {
                    Image(systemName: "arrow.up.right").font(.ui(13, weight: .semibold)).foregroundStyle(Theme.chevron)
                }
                .accessibilityLabel("See it there")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
    }

    // MARK: Remind me and Related

    /// 9 in the morning, local time, on the given day.
    private static func morning(of day: Date) -> Date {
        Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: day) ?? day
    }

    private static func inDays(_ n: Int) -> Date {
        morning(of: Calendar.current.date(byAdding: .day, value: n, to: .now) ?? .now)
    }

    private static var weekend: Date {
        let cal = Calendar.current
        let next = cal.nextDate(after: .now, matching: DateComponents(weekday: 7), matchingPolicy: .nextTime) ?? inDays(5)
        return morning(of: next)
    }

    /// Remind me, inside More: when this save should come back in Resurface.
    private var remindMenu: some View {
        let due = Dates.parse(item.remindAt)
        return Menu {
            if let due {
                Text("Comes back \(due.formatted(.dateTime.weekday(.wide).month().day()))")
            }
            Button { Task { await remind(Self.inDays(1)) } } label: { Label("Tomorrow", systemImage: "sunrise") }
            Button { Task { await remind(Self.weekend) } } label: { Label("This weekend", systemImage: "sofa") }
            Button { Task { await remind(Self.inDays(7)) } } label: { Label("Next week", systemImage: "calendar") }
            Button { Task { await remind(Self.inDays(30)) } } label: { Label("Next month", systemImage: "calendar.badge.clock") }
            Button { pickingDate = true } label: { Label("Pick a day…", systemImage: "calendar.day.timeline.left") }
            if due != nil {
                Button(role: .destructive) { Task { await change(.init(clearReminder: true)) } } label: {
                    Label("Don't remind me", systemImage: "bell.slash")
                }
            }
        } label: {
            Label(due == nil ? "Remind me" : "Reminder set", systemImage: due == nil ? "bell" : "bell.fill")
        }
    }

    private var relatedList: some View {
        VStack(alignment: .leading, spacing: 0) {
            GroupCaption("Related in your Brain")
            VStack(spacing: 0) {
                ForEach(related) { MiniItemRow(item: $0) }
            }
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
            .padding(.top, 6)
        }
    }

    // MARK: Toolbar

    private var toolbar: some View {
        HStack(spacing: 0) {
            if item.inTrash {
                tool("Restore", "arrow.uturn.backward", color: Theme.accent) { Task { await change(.init(trash: false)) } }
                tool("Delete forever", "trash", color: Theme.bad) { confirmPurge = true }
            } else {
                if let link = item.url, let url = URL(string: link) {
                    tool("Open", "arrow.up.right.square") { openURL(url) }
                }
                tool(item.isUnread ? "Read" : "Unread", item.isUnread ? "envelope.open" : "envelope") {
                    Task { await change(.init(read: item.isUnread)) }
                }
                if item.status == "archived" {
                    tool("Inbox", "tray", color: Theme.accent) { Task { await change(.init(status: "inbox")) } }
                } else {
                    tool("Archive", "archivebox", color: Theme.accent) {
                        Haptic.done()
                        Task { await change(.init(status: "archived")); dismiss() }
                    }
                }
                tool("Delete", "trash", color: Theme.bad) { confirmTrash = true }
            }
        }
        .frame(height: 62)
        .frame(maxWidth: .infinity)
        .glassBar()
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func tool(_ label: String, _ symbol: String, color: Color? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: symbol).font(.ui(20)).frame(height: 24)
                Text(label).font(.ui(11, weight: color == Theme.accent ? .semibold : .medium)).lineLimit(1)
            }
            .foregroundStyle(color ?? Theme.ink2)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private var initial: String {
        let name = (item.author ?? item.authorHandle ?? Sources.label(item.sourceKey)).trimmingCharacters(in: CharacterSet(charactersIn: "@ "))
        return String(name.prefix(1)).uppercased()
    }

    private func addTags() {
        let tags = CaptureChips.tags(newTag)
        newTag = ""
        guard !tags.isEmpty else { return }
        Haptic.tap()
        Task { await change(.init(addTags: tags)) }
    }

    private func saveNote() {
        guard detail != nil, note != (detail?.item.note ?? "") else { return }
        Task { await change(.init(note: note)) }
    }

    private func load() async {
        do {
            if Demo.on {
                detail = Demo.detail(preview)
            } else {
                detail = try await API.shared.item(preview.id)
            }
            note = detail?.item.note ?? ""
            // Opening a save reads it.
            if item.isUnread && !Demo.on { await change(.init(read: true)) }
            if !item.inTrash { related = (try? await API.shared.related(preview.id)) ?? [] }
        } catch APIError.signedOut {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func change(_ c: API.Change) async {
        do {
            let d = try await API.shared.change(preview.id, c)
            detail = d
            if !noteFocus { note = d.item.note ?? "" }
            error = nil
            store.edited = d.item
            await store.load(session: session)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remind(_ day: Date) async {
        await change(.init(remindAt: day))
        if error == nil { Haptic.done() }
    }

    private func reread() async {
        do {
            let d = try await API.shared.reread(preview.id)
            detail = d
            error = nil
            store.edited = d.item
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func purge() async {
        do {
            try await API.shared.purge(preview.id)
            store.purged = preview.id
            await store.load(session: session)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
