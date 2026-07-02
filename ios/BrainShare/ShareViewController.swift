import ImageIO
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
                           let data = Self.downsample(url: u) {
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
        case let u as URL: return downsample(url: u)
        case let d as Data:
            guard let source = CGImageSourceCreateWithData(d as CFData, nil) else { return nil }
            return downsample(source)
        case let i as UIImage:
            guard let d = i.jpegData(compressionQuality: 0.9), let source = CGImageSourceCreateWithData(d as CFData, nil) else { return nil }
            return downsample(source)
        default: return nil
        }
    }

    private nonisolated static func downsample(url: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        return downsample(source)
    }

    /// A JPEG no longer than 2048 pixels on its long side: small enough to upload fast and to keep
    /// ten pictures within the share sheet's memory, big enough for Claude to read a screenshot.
    private nonisolated static func downsample(_ source: CGImageSource) -> Data? {
        autoreleasepool { () -> Data? in
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return UIImage(cgImage: cg).jpegData(compressionQuality: 0.8)
        }
    }

    // MARK: Saving

    func save() async {
        let extra = note.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if url == nil, !images.isEmpty {
                // Each picture becomes its own item, with the note on each.
                let caption = extra.isEmpty ? text : extra
                for (i, image) in images.enumerated() {
                    state = .saving(done: i, of: images.count)
                    _ = try await API.shared.save(image: image, filename: "shared-\(i + 1).jpg", mime: "image/jpeg",
                                                  externalId: nil, takenAt: nil, text: caption)
                }
            } else {
                state = .saving(done: 0, of: 1)
                let body = [text, extra.isEmpty ? nil : extra].compactMap { $0 }.joined(separator: "\n\n")
                _ = try await API.shared.save(url: url, text: body.isEmpty ? nil : body, title: url == nil ? nil : title)
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

@MainActor
struct ShareView: View {
    @Bindable var model: ShareModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button("Cancel") { model.close() }
                    Spacer()
                    Text("Save to Brain").font(.headline).foregroundStyle(Theme.ink)
                    Spacer()
                    Button("Save") { Task { await model.save() } }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
                switch model.state {
                case .reading:
                    ProgressView().frame(maxWidth: .infinity)
                case .failed(let message):
                    Text(message).foregroundStyle(Theme.bad)
                case .saved:
                    Label(savedLabel, systemImage: "checkmark.circle.fill").foregroundStyle(Theme.ok).frame(maxWidth: .infinity)
                default:
                    content
                }
            }
            .padding(18)
            .themedCard(radius: 20)
            .padding(12)
        }
        .fontDesign(Theme.palette.fontDesign)
        .tint(Theme.accent)
    }

    @ViewBuilder private var content: some View {
        if model.url == nil, let first = model.images.first, let img = UIImage(data: first) {
            Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 180)
                .clipShape(RoundedRectangle(cornerRadius: Theme.smallRadius))
                .overlay(alignment: .topTrailing) {
                    if model.images.count > 1 {
                        Text("\(model.images.count) pictures")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Theme.accentInk)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Theme.accentFill, in: Capsule())
                            .padding(6)
                    }
                }
                .frame(maxWidth: .infinity)
            if model.images.count > 1 {
                Text("Each picture is saved as its own item.").font(.footnote).foregroundStyle(Theme.soft)
            }
        } else if !model.preview.isEmpty {
            Text(model.preview).font(.callout).foregroundStyle(Theme.soft).lineLimit(4)
        }
        TextField("Add a note (optional)", text: $model.note, axis: .vertical)
            .lineLimit(2...5)
            .padding(10)
            .background(Theme.bg, in: RoundedRectangle(cornerRadius: Theme.smallRadius))
            .overlay(RoundedRectangle(cornerRadius: Theme.smallRadius).stroke(Theme.line))
            .foregroundStyle(Theme.ink)
        if case .saving(let done, let total) = model.state {
            if total > 1 {
                ProgressView(value: Double(done), total: Double(total)) {
                    Text("Saving \(done + 1) of \(total)").font(.footnote).foregroundStyle(Theme.soft)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
    }

    private var savedLabel: String {
        model.url == nil && model.images.count > 1 ? "Saved \(model.images.count) pictures" : "Saved"
    }

    private var canSave: Bool {
        if case .ready = model.state { return true }
        return false
    }
}
