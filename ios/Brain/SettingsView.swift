import SwiftUI

struct SettingsView: View {
    let menu: MenuData?
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var screenshots = ScreenshotSync.shared
    @AppStorage("blurSensitive") private var blur = true
    @State private var look = Look.shared

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

                Section {
                    Picker("Design", selection: Binding(
                        get: { look.design },
                        set: { d in Task { await look.set(design: d) } }
                    )) {
                        ForEach(Design.allCases) { d in
                            DesignRow(design: d).tag(d)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    Picker("Mode", selection: Binding(
                        get: { look.mode },
                        set: { m in Task { await look.set(mode: m) } }
                    )) {
                        ForEach(Mode.allCases) { m in Text(m.label).tag(m) }
                    }
                    .pickerStyle(.segmented)
                    if let error = look.error {
                        Text(error).font(.footnote).foregroundStyle(Theme.bad)
                    }
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("System follows your phone. The web uses the same choices.")
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

/// A design's name with a small preview of its colours.
private struct DesignRow: View {
    let design: Design

    private var swatch: [Color] {
        switch design {
        case .vault: return [Color(hex: "#0B0F17"), Color(hex: "#151D2B"), Color(hex: "#F59E0B")]
        case .sunroom: return [Color(hex: "#FBF8F1"), Color(hex: "#F0E9DC"), Color(hex: "#DC9242")]
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 0) {
                ForEach(Array(swatch.enumerated()), id: \.offset) { _, c in
                    c.frame(width: 12, height: 18)
                }
            }
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Theme.lineStrong))
            Text(design.label)
        }
    }
}
