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
    @FocusState private var noteFocus: Bool

    private var item: Item { detail?.item ?? preview }
    private var hidden: Bool { blur && item.isSensitive && !reveal }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                author
                text
                pictures
                if let summary = item.summary, !summary.isEmpty { summaryCard(summary) }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.bad) }
                details
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
                    if let link = item.url {
                        Button { UIPasteboard.general.string = link } label: { Label("Copy link", systemImage: "link") }
                    }
                    Button { UIPasteboard.general.string = item.body ?? item.mainText } label: { Label("Copy text", systemImage: "doc.on.doc") }
                    if item.status != "inbox" && !item.inTrash {
                        Button { Task { await change(.init(status: "inbox")) } } label: { Label("Move to Inbox", systemImage: "tray") }
                    }
                } label: { Image(systemName: "ellipsis") }
            }
        }
        .overlay(alignment: .bottom) { toolbar }
        .confirmationDialog("Delete this for good?", isPresented: $confirmPurge, titleVisibility: .visible) {
            Button("Delete forever", role: .destructive) { Task { await purge() } }
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
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 40, height: 40)
                .background(Theme.fill, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(item.author ?? Sources.label(item.sourceKey)).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                Text([item.authorHandle, Dates.short(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  "))
                    .font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.faint).lineLimit(1)
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
                .font(.system(size: 19, weight: item.body?.isEmpty == false ? .semibold : .regular))
                .lineSpacing(item.isArabic ? 14 : 9)
                .multilineTextAlignment(align).frame(maxWidth: .infinity, alignment: frame)
                .textSelection(.enabled)
        }
        if let body = item.body, !body.isEmpty {
            Text(body)
                .font(.system(size: item.title?.isEmpty == false ? 16 : 19))
                .lineSpacing(item.isArabic ? 14 : 8)
                .foregroundStyle(item.title?.isEmpty == false ? Theme.ink2 : Theme.ink)
                .multilineTextAlignment(align).frame(maxWidth: .infinity, alignment: frame)
                .textSelection(.enabled)
        }
        if (item.title ?? "").isEmpty && (item.body ?? "").isEmpty, let link = item.url {
            Text(link).font(.system(size: 17)).foregroundStyle(Theme.accent).lineLimit(3)
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
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .blur(radius: hidden ? 22 : 0)
            .overlay {
                if hidden && i == 0 {
                    Button("Show picture") { reveal = true }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(.black.opacity(0.5), in: Capsule())
                }
            }
        }
    }

    private func summaryCard(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Image(systemName: "sparkle").foregroundStyle(Theme.accent)
                Text("Summary")
            }
            .font(.system(size: 12.5, weight: .medium))
            .foregroundStyle(Theme.soft)
            Text(summary).font(.system(size: 15)).lineSpacing(4).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
    }

    private var details: some View {
        VStack(spacing: 0) {
            noteRow
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
        .font(.system(size: 15))
        .foregroundStyle(Theme.ink)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }

    private var divider: some View { Rectangle().fill(Theme.divider).frame(height: 1) }

    private var noteRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "note.text").font(.system(size: 16)).foregroundStyle(Theme.faint)
            TextField("Add a note", text: $note, axis: .vertical)
                .lineLimit(1...8)
                .focused($noteFocus)
                .submitLabel(.done)
                .onChange(of: note) { _, v in
                    // Return ends the note rather than adding a line.
                    if v.hasSuffix("\n") { note = String(v.dropLast()); noteFocus = false }
                }
            if noteFocus || note != (detail?.item.note ?? "") {
                Button("Save") { saveNote() }.font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.accent)
                    .disabled(note == (detail?.item.note ?? ""))
            } else if !(detail?.item.note ?? "").isEmpty {
                Text("Saved").font(.system(size: 12)).foregroundStyle(Theme.faint)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 14)
        .onChange(of: noteFocus) { _, focused in if !focused { saveNote() } }
    }

    private var categoryRow: some View {
        Menu {
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
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.chevron)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Solid tags are yours; dashed ones are Claude's suggestions. Tap a dashed tag to keep it; hold any tag to remove it.
    private var tagsRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Tags").foregroundStyle(Theme.soft).frame(width: 78, alignment: .leading)
            Flow(spacing: 6) {
                ForEach(detail?.tags ?? [], id: \.self) { t in
                    let suggested = t.addedBy != "user"
                    Button {
                        if suggested { Task { await change(.init(addTags: [t.name])) } }
                    } label: {
                        Text("#\(t.name)")
                            .font(.system(size: 14))
                            .foregroundStyle(suggested ? Theme.soft : Theme.ink)
                            .padding(.horizontal, 10).frame(height: 28)
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
                    .accessibilityHint(suggested ? "Suggested by Claude. Tap to keep." : "")
                }
                Button { addingTag = true } label: {
                    Image(systemName: "plus").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.soft)
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
                    Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.chevron)
                }
                .accessibilityLabel("See it there")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
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
                        Task { await change(.init(status: "archived")); dismiss() }
                    }
                }
                tool("Delete", "trash", color: Theme.bad) {
                    Task { await change(.init(trash: true)); dismiss() }
                }
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
                Image(systemName: symbol).font(.system(size: 20)).frame(height: 24)
                Text(label).font(.system(size: 11, weight: color == Theme.accent ? .semibold : .medium)).lineLimit(1)
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
