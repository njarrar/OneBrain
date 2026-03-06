import SwiftUI

/// One item: the full text and pictures, then status, note, category and tags.
struct ItemDetailView: View {
    let id: String
    let preview: Item
    var onChange: (Item) -> Void

    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var detail: ItemDetail?
    @State private var note = ""
    @State private var newTag = ""
    @State private var categories: [MenuData.Category] = []
    @State private var error: String?
    @State private var saving = false

    private var item: Item { detail?.item ?? preview }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let sub = item.subtopic {
                    Text(sub).font(.caption).foregroundStyle(Theme.soft)
                }
                if let title = item.title, !title.isEmpty {
                    Text(title).font(.title2.weight(.semibold)).multilineTextAlignment(align)
                        .frame(maxWidth: .infinity, alignment: frameAlign)
                }
                if let summary = item.summary { Text(summary).foregroundStyle(Theme.soft) }
                if let body = item.body, !body.isEmpty {
                    Text(body).font(item.title == nil ? .title3 : .body).lineSpacing(item.isArabic ? 6 : 3)
                        .multilineTextAlignment(align).frame(maxWidth: .infinity, alignment: frameAlign)
                        .textSelection(.enabled)
                }
                ForEach(item.pictures, id: \.self) { url in
                    RemoteImage(url: url, contentMode: .fit)
                        .frame(maxWidth: .infinity).frame(minHeight: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                actions
                if let error { Text(error).foregroundStyle(.red).font(.footnote) }
                panel("Your note") {
                    TextField("Why you saved this, what to do with it…", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                    Button("Save note") { Task { await change(.init(note: note)) } }
                        .disabled(saving || note == (detail?.item.note ?? ""))
                }
                panel("Category and tags") {
                    Menu {
                        ForEach(categories) { c in
                            Button(c.name) { Task { await change(.init(category: c.name)) } }
                        }
                    } label: {
                        HStack {
                            Circle().fill(Color(hex: item.categoryColor, fallback: Theme.soft)).frame(width: 8, height: 8)
                            Text(item.category ?? "Pick a category")
                            Image(systemName: "chevron.up.chevron.down").font(.caption)
                        }
                    }
                    FlowTags(tags: detail?.tags ?? []) { name in
                        Task { await change(.init(removeTags: [name])) }
                    }
                    HStack {
                        TextField("Add tags, split with commas", text: $newTag).onSubmit(addTags)
                        Button("Add", action: addTags).disabled(newTag.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                if let saves = detail?.saves, !saves.isEmpty {
                    panel("Saved") {
                        ForEach(saves, id: \.self) { s in
                            HStack {
                                Text(Sources.label(s.sourceId)).font(.caption.weight(.medium)).foregroundStyle(Theme.accent)
                                Text(Dates.short(Dates.parse(s.savedAt ?? s.createdAt))).font(.caption).foregroundStyle(Theme.soft)
                                Spacer()
                                if let link = s.originalUrl, let url = URL(string: link) {
                                    Link("See it there", destination: url).font(.caption)
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var align: TextAlignment { item.isArabic ? .trailing : .leading }
    private var frameAlign: Alignment { item.isArabic ? .trailing : .leading }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                if let author = item.author { Text(author).font(.headline) }
                Text([item.authorHandle, Dates.short(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption.monospaced()).foregroundStyle(Theme.soft)
            }
            Spacer()
        }
    }

    private var actions: some View {
        HStack(spacing: 10) {
            if let link = item.url, let url = URL(string: link) {
                Button { openURL(url) } label: { Label("Open", systemImage: "arrow.up.right.square") }
                    .buttonStyle(.borderedProminent).foregroundStyle(.black)
            }
            if item.status == "archived" {
                Button { Task { await change(.init(status: "inbox")) } } label: { Label("To inbox", systemImage: "tray") }
                    .buttonStyle(.bordered)
            } else {
                Button { Task { await change(.init(status: "archived")) } } label: { Label("Archive", systemImage: "archivebox") }
                    .buttonStyle(.bordered)
            }
            if item.status == "inbox" {
                Button { Task { await change(.init(status: "read")) } } label: { Label("Read", systemImage: "checkmark") }
                    .buttonStyle(.bordered)
            }
            if let link = item.url, let url = URL(string: link) {
                ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }.buttonStyle(.bordered)
            }
        }
    }

    private func panel(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).font(.caption.monospaced()).foregroundStyle(Theme.soft)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
    }

    private func addTags() {
        let tags = newTag.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !tags.isEmpty else { return }
        newTag = ""
        Task { await change(.init(addTags: tags)) }
    }

    private func load() async {
        do {
            async let d = Store.shared.item(id)
            async let m = Store.shared.menu()
            detail = try await d
            note = detail?.item.note ?? ""
            categories = (try? await m)?.categories ?? []
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func change(_ c: Store.Change) async {
        saving = true
        defer { saving = false }
        do {
            let d = try await Store.shared.change(id, c)
            detail = d
            note = d.item.note ?? ""
            error = nil
            onChange(d.item)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Tags that wrap onto new lines. Tap the x to remove one.
struct FlowTags: View {
    let tags: [ItemDetail.Tag]
    var remove: (String) -> Void

    var body: some View {
        if tags.isEmpty {
            Text("No tags yet.").font(.footnote).foregroundStyle(Theme.soft)
        } else {
            Flow(spacing: 6) {
                ForEach(tags, id: \.self) { t in
                    HStack(spacing: 4) {
                        Text(t.name)
                        Button { remove(t.name) } label: { Image(systemName: "xmark").font(.caption2) }
                            .buttonStyle(.plain).foregroundStyle(Theme.soft)
                    }
                    .font(.caption)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Theme.bg, in: Capsule())
                    .overlay(Capsule().stroke(t.addedBy == "user" ? Color.clear : Theme.line, style: StrokeStyle(lineWidth: 1, dash: [3])))
                }
            }
        }
    }
}

/// A simple wrapping layout.
struct Flow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing
            row = max(row, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            row = max(row, s.height)
        }
    }
}
