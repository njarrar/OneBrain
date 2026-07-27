import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Save to Brain" in the share sheet. Takes a link (Safari, Instagram, X), text,
/// or up to ten pictures (screenshots from Photos), each picture saved as its own item.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // Same look as the app: the last design and mode it saw, kept in the app group.
        switch Look.shared.mode {
        case .system: overrideUserInterfaceStyle = .unspecified
        case .light: overrideUserInterfaceStyle = .light
        case .dark: overrideUserInterfaceStyle = .dark
        }
        let model = ShareModel(context: extensionContext)
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.backgroundColor = .clear
        view.addSubview(host.view)
        host.didMove(toParent: self)
        Task { await model.read() }
    }
}

@MainActor
@Observable
final class ShareModel {
    enum State { case reading, ready, saving(done: Int, of: Int), saved, failed(String) }

    /// Matches NSExtensionActivationSupportsImageWithMaxCount in Info.plist.
    static let maxImages = 10

    @ObservationIgnored private weak var context: NSExtensionContext?
    var state: State = .reading
    var url: String?
    /// A web page's own title, as Safari shares it.
    var title: String?
    var text: String?
    var images: [Data] = []
    var note = ""
    var sort = true
    var tagging = false
    var tagText = ""

    init(context: NSExtensionContext?) {
        self.context = context
    }

    var preview: String {
        [title, url, text].compactMap { $0 }.joined(separator: "\n")
    }

    func read() async {
        let items = context?.inputItems as? [NSExtensionItem] ?? []
        var texts: [String] = []
        for item in items {
            // Safari puts the page title here; other apps may put the post's text.
            for t in [item.attributedTitle?.string, item.attributedContentText?.string] {
                if let t = t?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { texts.append(t) }
            }
            for p in item.attachments ?? [] {
                // Pictures first: a photo from Photos can also look like a (file) URL.
                if p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    if images.count < Self.maxImages, let data = await Self.loadImage(p) { images.append(data) }
                } else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    guard let u = await Self.loadURL(p) else { continue }
                    if u.isFileURL {
                        // A picture shared as a file, for example from Files.
                        if images.count < Self.maxImages, UTType(filenameExtension: u.pathExtension)?.conforms(to: .image) == true,
                           let data = Pictures.jpeg(url: u) {
                            images.append(data)
                        }
                    } else if url == nil, ["http", "https"].contains(u.scheme?.lowercased() ?? "") {
                        url = u.absoluteString
                    }
                } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let t = await Self.loadText(p)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
                    texts.append(t)
                }
            }
        }

        // X and others often share the text of a post with its link inside.
        if url == nil, images.isEmpty {
            for t in texts {
                if let found = t.range(of: #"https?://[^\s<>"']+"#, options: .regularExpression) {
                    url = String(t[found])
                    break
                }
            }
        }
        sortTexts(texts)

        if url == nil && text == nil && title == nil && images.isEmpty {
            state = .failed("Nothing to save here.")
        } else if KeyStore.token == nil {
            state = .failed("Open Brain and sign in first.")
        } else {
            state = .ready
        }
    }

    /// With a link, one short line without a link of its own is the page title; anything else is kept as text.
    private func sortTexts(_ texts: [String]) {
        var seen = Set<String>()
        var kept: [String] = []
        for t in texts where !seen.contains(t) && t != url {
            seen.insert(t)
            let oneLine = !t.contains("\n") && t.count <= 200 && t.range(of: "https?://", options: .regularExpression) == nil
            if url != nil, title == nil, oneLine {
                title = t
            } else if !(title.map { t.contains($0) && t.count < $0.count + 4 } ?? false) {
                kept.append(t)
            }
        }
        text = kept.isEmpty ? nil : kept.joined(separator: "\n\n")
    }

    // MARK: Loading

    private nonisolated static func loadURL(_ p: NSItemProvider) async -> URL? {
        guard let item = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) else { return nil }
        switch item {
        case let u as URL: return u
        case let s as String: return URL(string: s)
        case let d as Data: return URL(dataRepresentation: d, relativeTo: nil)
        default: return nil
        }
    }

    private nonisolated static func loadText(_ p: NSItemProvider) async -> String? {
        guard let item = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) else { return nil }
        switch item {
        case let s as String: return s
        case let a as NSAttributedString: return a.string
        case let d as Data: return String(data: d, encoding: .utf8)
        default: return nil
        }
    }

    private nonisolated static func loadImage(_ p: NSItemProvider) async -> Data? {
        guard let item = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) else { return nil }
        switch item {
        case let u as URL: return Pictures.jpeg(url: u)
        case let d as Data: return Pictures.jpeg(d)
        case let i as UIImage: return i.jpegData(compressionQuality: 0.9).flatMap { Pictures.jpeg($0) }
        default: return nil
        }
    }

    // MARK: Saving

    func save() async {
        let extra = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let options = API.SaveOptions(sort: sort, tags: tagging ? CaptureChips.tags(tagText) : [])
        do {
            if url == nil, !images.isEmpty {
                // Each picture becomes its own item, with the note on each.
                let caption = extra.isEmpty ? text : extra
                for (i, image) in images.enumerated() {
                    state = .saving(done: i, of: images.count)
                    _ = try await API.shared.save(image: image, filename: "shared-\(i + 1).jpg", mime: "image/jpeg",
                                                  externalId: nil, takenAt: nil, text: caption, options: options)
                }
            } else {
                state = .saving(done: 0, of: 1)
                let body = [text, extra.isEmpty ? nil : extra].compactMap { $0 }.joined(separator: "\n\n")
                _ = try await API.shared.save(url: url, text: body.isEmpty ? nil : body, title: url == nil ? nil : title, options: options)
            }
            state = .saved
            try? await Task.sleep(for: .milliseconds(700))
            close()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func close() {
        context?.completeRequest(returningItems: nil)
    }
}

/// Save to Brain, from the share sheet in any app: what's being saved, a note, and one Save button.
@MainActor
struct ShareView: View {
    @Bindable var model: ShareModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                Capsule().fill(Theme.lineStrong).frame(width: 36, height: 5).frame(maxWidth: .infinity)
                HStack(spacing: 10) {
                    Image("Pocket").resizable().frame(width: 32, height: 32).clipShape(RoundedRectangle(cornerRadius: 8))
                    Text("Save to Brain").font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.ink)
                    Spacer()
                    Button { model.close() } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.soft)
                            .frame(width: 32, height: 32).background(Theme.fill, in: Circle())
                    }
                    .accessibilityLabel("Close")
                }
                switch model.state {
                case .reading:
                    ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                case .failed(let message):
                    Text(message).foregroundStyle(Theme.bad)
                    if canSave { content }
                case .saved:
                    Label(savedLabel, systemImage: "checkmark.circle.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ok).frame(maxWidth: .infinity, minHeight: 80)
                default:
                    content
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 24)
            .background(Theme.bg, in: RoundedRectangle(cornerRadius: 34))
            .shadow(color: .black.opacity(0.18), radius: 15, y: -10)
            .padding(8)
        }
        .tint(Theme.accent)
    }

    @ViewBuilder private var content: some View {
        preview
        TextField("Add a note (optional)", text: $model.note, axis: .vertical)
            .font(.system(size: 15))
            .lineLimit(1...5)
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(minHeight: 46)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
        if model.tagging {
            TextField("Tags, split with commas", text: $model.tagText)
                .font(.system(size: 15))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 12).frame(height: 40)
                .background(Theme.fill, in: RoundedRectangle(cornerRadius: 10))
        }
        CaptureChips(sort: $model.sort, tagging: $model.tagging)
        if case .saving(let done, let total) = model.state, total > 1 {
            ProgressView(value: Double(done), total: Double(total)) {
                Text("Saving \(done + 1) of \(total)").font(.footnote).foregroundStyle(Theme.soft)
            }
        }
        Button { Task { await model.save() } } label: {
            Group {
                if case .saving = model.state { ProgressView().tint(Theme.accentInk) } else { Text("Save to inbox") }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accentInk)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Theme.accentFill, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!canSave)
    }

    /// The post or page being shared, or the pictures.
    @ViewBuilder private var preview: some View {
        if model.url == nil, let first = model.images.first, let img = UIImage(data: first) {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(maxWidth: .infinity).frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(alignment: .topTrailing) {
                    if model.images.count > 1 {
                        Text("\(model.images.count) pictures, each saved on its own")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.accentInk)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Theme.accentFill, in: Capsule())
                            .padding(8)
                    }
                }
        } else if model.url != nil || model.text != nil || model.title != nil {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    SourceMark(source: source, size: 15).foregroundStyle(Theme.ink2)
                    Text(model.title ?? Sources.label(source)).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    if let host {
                        Text(host).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.faint).lineLimit(1)
                    }
                }
                if let body = model.text ?? model.url {
                    Text(body).font(.system(size: 15)).lineSpacing(3).lineLimit(3).foregroundStyle(Theme.ink2)
                }
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
        }
    }

    private var source: String { model.url.map(Detected.sourceOf) ?? "note" }
    private var host: String? { model.url.flatMap { URL(string: $0)?.host?.replacingOccurrences(of: "www.", with: "") } }

    private var savedLabel: String {
        model.url == nil && model.images.count > 1 ? "Saved \(model.images.count) pictures" : "Saved to your inbox"
    }

    private var canSave: Bool {
        switch model.state {
        case .ready: return true
        // After a failed save, try again; not when there's nothing to save or no sign in.
        case .failed: return KeyStore.token != nil && (!model.images.isEmpty || model.url != nil || model.text != nil)
        default: return false
        }
    }
}
