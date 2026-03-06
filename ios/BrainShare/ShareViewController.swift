import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Save to Brain" in the share sheet. Takes a link, text or one picture from any app.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
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

@Observable
final class ShareModel {
    enum State { case reading, ready, saving, saved, failed(String) }

    @ObservationIgnored private weak var context: NSExtensionContext?
    var state: State = .reading
    var url: String?
    var text: String?
    var image: Data?
    var note = ""

    init(context: NSExtensionContext?) {
        self.context = context
    }

    var preview: String {
        if let url { return url }
        if let text { return text }
        return image != nil ? "A picture" : ""
    }

    func read() async {
        let providers = (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for p in providers {
            if url == nil, p.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !u.isFileURL {
                url = u.absoluteString
            } else if image == nil, p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                image = await loadImage(p)
            } else if text == nil, p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                      let t = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                text = t
            }
        }
        if url == nil, let t = text, let found = t.range(of: #"https?://\S+"#, options: .regularExpression) {
            url = String(t[found])
        }
        if url == nil && text == nil && image == nil {
            state = .failed("Nothing to save here.")
        } else if Secrets[.account] == nil {
            state = .failed("Open Brain and sign in first.")
        } else {
            state = .ready
        }
    }

    private func loadImage(_ p: NSItemProvider) async -> Data? {
        let item = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier)
        let raw: Data?
        switch item {
        case let u as URL: raw = try? Data(contentsOf: u)
        case let d as Data: raw = d
        case let i as UIImage: raw = i.jpegData(compressionQuality: 0.85)
        default: raw = nil
        }
        // Re-encode as a JPEG no bigger than 1600 points, so it stays small and Claude can read it.
        guard let raw, let img = UIImage(data: raw) else { return raw }
        let scale = min(1, 1600 / max(img.size.width, img.size.height, 1))
        let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        return UIGraphicsImageRenderer(size: size).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
            .jpegData(compressionQuality: 0.8)
    }

    func save() async {
        state = .saving
        let extra = note.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let image {
                _ = try await Store.shared.save(image: image, externalId: nil, takenAt: nil, text: extra.isEmpty ? text : extra)
            } else {
                let body = [text, extra.isEmpty ? nil : extra].compactMap { $0 }.joined(separator: "\n\n")
                _ = try await Store.shared.save(url: url, text: body.isEmpty ? nil : body)
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

struct ShareView: View {
    @Bindable var model: ShareModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button("Cancel") { model.close() }
                    Spacer()
                    Text("Save to Brain").font(.headline)
                    Spacer()
                    Button("Save") { Task { await model.save() } }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
                switch model.state {
                case .reading:
                    ProgressView().frame(maxWidth: .infinity)
                case .failed(let message):
                    Text(message).foregroundStyle(.red)
                case .saved:
                    Label("Saved", systemImage: "checkmark.circle.fill").foregroundStyle(.green).frame(maxWidth: .infinity)
                default:
                    if let data = model.image, let img = UIImage(data: data) {
                        Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 180).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    if !model.preview.isEmpty, model.image == nil {
                        Text(model.preview).font(.callout).foregroundStyle(.secondary).lineLimit(4)
                    }
                    TextField("Add a note (optional)", text: $model.note, axis: .vertical)
                        .lineLimit(2...5)
                        .textFieldStyle(.roundedBorder)
                    if case .saving = model.state { ProgressView().frame(maxWidth: .infinity) }
                }
            }
            .padding(18)
            .background(Color(red: 0.08, green: 0.11, blue: 0.17), in: RoundedRectangle(cornerRadius: 18))
            .padding(12)
        }
        .preferredColorScheme(.dark)
        .tint(Color(red: 0.96, green: 0.62, blue: 0.04))
    }

    private var canSave: Bool {
        if case .ready = model.state { return true }
        return false
    }
}
