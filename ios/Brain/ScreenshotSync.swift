import Photos
import UIKit

/// Adds new screenshots from the phone's Screenshots album to Brain. They stay on the phone.
/// The first run takes the last 30 days; "Send older screenshots" takes the rest.
@Observable
final class ScreenshotSync {
    static let shared = ScreenshotSync()

    @ObservationIgnored private let defaults = UserDefaults(suiteName: Config.appGroup) ?? .standard
    @ObservationIgnored private let firstRunDays = 30
    @ObservationIgnored private let maxPerRun = 150

    var enabled = false {
        didSet { defaults.set(enabled, forKey: "screenshotsOn") }
    }

    init() {
        enabled = defaults.bool(forKey: "screenshotsOn")
    }
    var running = false
    var status: String?

    private var lastDate: Date? {
        get { defaults.object(forKey: "screenshotsLast") as? Date }
        set { defaults.set(newValue, forKey: "screenshotsLast") }
    }

    func turnOn() async -> Bool {
        let s = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard s == .authorized || s == .limited else {
            status = "Brain needs photo access. Allow it in Settings, Brain, Photos."
            return false
        }
        enabled = true
        await sync()
        return true
    }

    func syncIfOn() async {
        if enabled { await sync() }
    }

    /// Sends screenshots newer than the last one sent (or, with `older`, everything before the first run).
    func sync(older: Bool = false) async {
        guard !running else { return }
        running = true
        defer { running = false }

        let since = older ? nil : (lastDate ?? Calendar.current.date(byAdding: .day, value: -firstRunDays, to: .now))
        let before = older ? Calendar.current.date(byAdding: .day, value: -firstRunDays, to: .now) : nil
        let assets = fetch(since: since, before: before)
        if assets.isEmpty { status = "No new screenshots."; return }

        var sent = 0
        for asset in assets.prefix(maxPerRun) {
            guard let data = await jpeg(asset) else { continue }
            do {
                let saved = try await Store.shared.save(image: data, externalId: asset.localIdentifier, takenAt: asset.creationDate)
                if !saved.existed { sent += 1 }
                if !older, let d = asset.creationDate, d > (lastDate ?? .distantPast) { lastDate = d }
                status = "Added \(sent) of \(min(assets.count, maxPerRun))…"
            } catch {
                status = error.localizedDescription
                return
            }
        }
        status = assets.count > maxPerRun
            ? "Added \(sent). More left; they come next time."
            : "Added \(sent) screenshots."
    }

    private func fetch(since: Date?, before: Date?) -> [PHAsset] {
        let albums = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .smartAlbumScreenshots, options: nil)
        guard let album = albums.firstObject else { return [] }
        let options = PHFetchOptions()
        var preds: [NSPredicate] = []
        if let since { preds.append(NSPredicate(format: "creationDate > %@", since as NSDate)) }
        if let before { preds.append(NSPredicate(format: "creationDate < %@", before as NSDate)) }
        if !preds.isEmpty { options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: preds) }
        // New screenshots go oldest first, so an interrupted run picks up where it stopped.
        // Older ones go newest first.
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: before == nil)]
        let result = PHAsset.fetchAssets(in: album, options: options)
        var out: [PHAsset] = []
        result.enumerateObjects { a, _, _ in out.append(a) }
        return out
    }

    /// A JPEG no larger than 1600 points on the long side, small enough for Claude to read.
    private func jpeg(_ asset: PHAsset) async -> Data? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        options.resizeMode = .exact
        let scale = min(1, 1600 / Double(max(asset.pixelWidth, asset.pixelHeight, 1)))
        let size = CGSize(width: Double(asset.pixelWidth) * scale, height: Double(asset.pixelHeight) * scale)
        return await withCheckedContinuation { cont in
            PHImageManager.default().requestImage(for: asset, targetSize: size, contentMode: .aspectFit, options: options) { image, _ in
                cont.resume(returning: image?.jpegData(compressionQuality: 0.8))
            }
        }
    }
}
