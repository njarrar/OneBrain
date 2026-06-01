import SwiftUI

struct SettingsView: View {
    let menu: MenuData?
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var screenshots = ScreenshotSync.shared
    @AppStorage("blurSensitive") private var blur = true

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Send new screenshots", isOn: Binding(
                        get: { screenshots.enabled },
                        set: { on in
                            if on { Task { _ = await screenshots.turnOn() } } else { screenshots.enabled = false }
                        }
                    ))
                    if screenshots.enabled {
                        Button("Send new screenshots now") { Task { await screenshots.sync() } }
                            .disabled(screenshots.running)
                        Button("Send older screenshots") { Task { await screenshots.sync(older: true) } }
                            .disabled(screenshots.running)
                    }
                    if let status = screenshots.status {
                        Text(status).font(.footnote).foregroundStyle(Theme.soft)
                    }
                } header: {
                    Text("Screenshots")
                } footer: {
                    Text("Brain checks for new screenshots each time you open it. Claude reads the text in them.")
                }

                if let status = LocalUpload.shared.status {
                    Section("From this phone") {
                        Text(status).font(.footnote).foregroundStyle(Theme.soft)
                    }
                }

                Section("Show") {
                    Toggle("Blur sensitive items", isOn: $blur)
                }

                if let sources = menu?.sources {
                    Section {
                        ForEach(sources) { s in
                            HStack {
                                Text(s.name)
                                Spacer()
                                Text("\(s.items.formatted())").foregroundStyle(Theme.soft).font(.callout.monospacedDigit())
                            }
                        }
                        Button("Connect sources on the web") {
                            openURL(Config.baseURL.appendingPathComponent("sources"))
                        }
                    } header: {
                        Text("Sources")
                    } footer: {
                        Text("Sources, playlist picks and your Claude key are set once on the web and shared with this phone. To save from any app, tap Share, then Save to Brain. If you don't see it, scroll the app row to the end, tap More, and turn it on.")
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        session.signOut()
                        dismiss()
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
