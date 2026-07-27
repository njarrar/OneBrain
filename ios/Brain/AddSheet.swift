import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Add to Brain: one field for a link or a note, plus photos, the camera, voice and files.
struct AddSheet: View {
    /// Runs after a save, to refresh the lists.
    var saved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var sort = true
    @State private var tagging = false
    @State private var tagText = ""
    @State private var pictures: [Data] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var preview: API.LinkPreview?
    @State private var camera = false
    @State private var files = false
    @State private var saving = false
    @State private var error: String?
    @State private var dictation = Dictation()
    @FocusState private var focused: Bool

    private var url: String? { Detected.firstURL(in: text) }
    private var detected: Detected { .of(text: text, url: url, pictures: pictures.count) }
    private var canSave: Bool { !saving && detected != .empty }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("Cancel") { dismiss() }.foregroundStyle(Theme.ink2)
                Spacer()
                Text("Add to Brain").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                Button { Task { await save() } } label: {
                    Group {
                        if saving { ProgressView().tint(Theme.accentInk) } else { Text("Save") }
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.accentInk)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(Theme.accentFill, in: Capsule())
                    .opacity(canSave || saving ? 1 : 0.45)
                }
                .disabled(!canSave)
            }
            .font(.system(size: 16))
            .padding(.top, 14)

            TextField("Paste a link or write a note", text: $text, axis: .vertical)
                .font(.system(size: 17))
                .foregroundStyle(Theme.ink)
                .lineLimit(1...8)
                .focused($focused)
                .textInputAutocapitalization(.sentences)
                .padding(.vertical, 4)

            if let url, let preview { linkCard(url, preview) }
            if !pictures.isEmpty { strip }
            if tagging {
                TextField("Tags, split with commas", text: $tagText)
                    .font(.system(size: 15))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Theme.fill, in: RoundedRectangle(cornerRadius: 10))
            }
            CaptureChips(sort: $sort, tagging: $tagging)
            if let error = error ?? dictation.error {
                Text(error).font(.footnote).foregroundStyle(Theme.bad)
            }

            HStack(spacing: 10) {
                PhotosPicker(selection: $picks, maxSelectionCount: 10, matching: .images) {
                    RoundIcon(symbol: "photo")
                }
                .accessibilityLabel("Photos")
                Button { camera = true } label: { RoundIcon(symbol: "camera") }
                    .accessibilityLabel("Camera")
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                Button { Task { await dictation.toggle() } } label: {
                    RoundIcon(symbol: dictation.listening ? "mic.fill" : "mic", on: dictation.listening)
                        .symbolEffect(.pulse, isActive: dictation.listening)
                }
                .accessibilityLabel(dictation.listening ? "Stop" : "Speak a note")
                Button { files = true } label: { RoundIcon(symbol: "paperclip") }
                    .accessibilityLabel("Files")
                Spacer()
                if detected != .empty {
                    HStack(spacing: 6) {
                        SourceMark(source: detected.source, size: 13)
                        Text(detected.label)
                    }
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.soft)
                    .padding(.horizontal, 9).frame(height: 26)
                    .background(Theme.raised, in: RoundedRectangle(cornerRadius: 6))
                }
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .overlay(alignment: .top) { Rectangle().fill(Theme.divider).frame(height: 1) }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .background(Theme.bg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .onAppear { focused = true }
        .task(id: url) { await loadPreview() }
        .onChange(of: picks) { _, items in Task { await load(items) } }
        .onChange(of: dictation.text) { _, spoken in if !spoken.isEmpty { text = spoken } }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { data in if let data, pictures.count < 10 { pictures.append(data) } }
                .ignoresSafeArea()
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { addFiles(urls) }
        }
    }

    private func linkCard(_ url: String, _ p: API.LinkPreview) -> some View {
        HStack(spacing: 12) {
            if let image = p.image, let u = URL(string: image) {
                RemoteImage(url: u).frame(width: 60, height: 60).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(p.title ?? url).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink).lineLimit(2)
                Text(URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") ?? "")
                    .font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }

    private var strip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(pictures.enumerated()), id: \.offset) { i, data in
                    if let img = UIImage(data: data) {
                        Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(alignment: .topTrailing) {
                                Button { pictures.remove(at: i) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 18))
                                        .symbolRenderingMode(.palette).foregroundStyle(.white, .black.opacity(0.55))
                                }
                                .padding(3)
                                .accessibilityLabel("Remove picture")
                            }
                    }
                }
            }
        }
    }

    // MARK: Work

    private func loadPreview() async {
        preview = nil
        guard let url else { return }
        try? await Task.sleep(for: .milliseconds(400))
        if Task.isCancelled { return }
        preview = try? await API.shared.unfurl(url)
    }

    private func load(_ items: [PhotosPickerItem]) async {
        for item in items where pictures.count < 10 {
            if let data = try? await item.loadTransferable(type: Data.self), let jpeg = Pictures.jpeg(data) {
                pictures.append(jpeg)
            }
        }
        picks = []
    }

    private func addFiles(_ urls: [URL]) {
        for u in urls where pictures.count < 10 {
            let open = u.startAccessingSecurityScopedResource()
            defer { if open { u.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: u), let jpeg = Pictures.jpeg(data) { pictures.append(jpeg) }
        }
    }

    private func save() async {
        dictation.stop()
        saving = true
        error = nil
        defer { saving = false }
        let options = API.SaveOptions(sort: sort, tags: tagging ? CaptureChips.tags(tagText) : [])
        let note = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if pictures.isEmpty {
                _ = try await API.shared.save(url: url, text: note.isEmpty ? nil : note, options: options)
            } else {
                // Each picture is its own save, with the text as its caption.
                for (i, data) in pictures.enumerated() {
                    _ = try await API.shared.save(image: data, filename: "added-\(i + 1).jpg", mime: "image/jpeg",
                                                  externalId: nil, takenAt: nil, text: note.isEmpty ? nil : note, options: options)
                }
            }
            await saved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The phone camera, for the Add sheet.
struct CameraPicker: UIViewControllerRepresentable {
    var done: (Data?) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        c.sourceType = .camera
        c.delegate = context.coordinator
        return c
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            parent.done(image.flatMap { $0.jpegData(compressionQuality: 0.9) }.flatMap { Pictures.jpeg($0) })
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.done(nil)
            parent.dismiss()
        }
    }
}
