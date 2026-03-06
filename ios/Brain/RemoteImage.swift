import SwiftUI
import UIKit

/// Keeps loaded pictures in memory while the app runs.
final class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    init() { cache.countLimit = 400 }
    func get(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func set(_ url: URL, _ image: UIImage) { cache.setObject(image, forKey: url as NSURL) }
}

/// Like AsyncImage, but also reads Brain's own pictures from the phone.
struct RemoteImage: View {
    let url: URL
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?
    @State private var failed = false

    static func load(_ url: URL) async throws -> Data {
        if url.isFileURL { return try Data(contentsOf: url) }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 0) < 400 else { throw URLError(.fileDoesNotExist) }
        return data
    }

    var body: some View {
        ZStack {
            Theme.raised
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else if failed {
                Image(systemName: "photo").foregroundStyle(Theme.soft)
            } else {
                ProgressView().tint(Theme.soft)
            }
        }
        .clipped()
        .task(id: url) {
            if let hit = ImageCache.shared.get(url) { image = hit; return }
            do {
                let data = try await Self.load(url)
                if let img = UIImage(data: data) {
                    ImageCache.shared.set(url, img)
                    image = img
                } else {
                    failed = true
                }
            } catch {
                failed = true
            }
        }
    }
}
