import Foundation

enum Config {
    /// The web app. Set this to your own Worker address.
    static let baseURL = URL(string: "https://brain.example.workers.dev")!
    /// Shared by the app and the share sheet, so both use the same key.
    static let appGroup = "group.com.njarrar.brain"
    static let callbackScheme = "brain"
}
