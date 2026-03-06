import Foundation

enum Config {
    /// Shared by the app and the share sheet, so both see the same data and keys.
    static let appGroup = "group.com.njarrar.brain"
    static let callbackScheme = "brain"

    /// The web app. The phone talks to it only once, to copy your saves across.
    static let webURL = URL(string: "https://brain.example.workers.dev")!

    /// Google iOS client, from Google Cloud, Credentials. Not a secret.
    static let googleClientID = ""
    /// X app client ID, from the X developer portal, Keys and tokens, OAuth 2.0. Not a secret.
    static let xClientID = ""

    static var googleScheme: String {
        "com.googleusercontent.apps." + googleClientID.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
    }
}

/// Where Brain keeps its data: in the app group, so the share sheet can write to it too.
/// iPhone backup and iCloud Backup copy this folder.
enum Paths {
    static let root: URL = {
        let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Config.appGroup)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Brain", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir.appendingPathComponent("files"), withIntermediateDirectories: true)
        return dir
    }()
    static var database: URL { root.appendingPathComponent("brain.sqlite") }
    static var files: URL { root.appendingPathComponent("files", isDirectory: true) }
    static func file(_ id: String) -> URL { files.appendingPathComponent(id) }
}
