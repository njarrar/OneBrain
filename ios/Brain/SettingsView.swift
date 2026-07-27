import SwiftUI

/// Appearance, capture, storage and account, as grouped rows.
struct SettingsView: View {
    @Environment(AppSession.self) private var session
    @Environment(MenuStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var screenshots = ScreenshotSync.shared
    @AppStorage("blurSensitive") private var blur = true
    @State private var look = Look.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Settings").font(.system(size: 32, weight: .bold)).tracking(-0.3).padding(.bottom, 6)

                GroupCaption("Appearance")
                modePicker
                Text("Syncs with the web app.").font(.system(size: 13)).foregroundStyle(Theme.faint).padding(.horizontal, 4)
                VStack(spacing: 0) {
                    Menu {
                        Picker("Design", selection: Binding(get: { look.design }, set: { look.set(design: $0) })) {
                            ForEach(Design.allCases) { d in Text(d.label).tag(d) }
                        }
                    } label: {
                        GroupRow(label: "Design", value: look.design.label, mono: false, divider: false)
                    }
                    .buttonStyle(.plain)
                }
                .groupBox()
                .padding(.top, 6)
                if let error = look.error {
                    Text(error).font(.footnote).foregroundStyle(Theme.bad).padding(.horizontal, 4)
                }

                GroupCaption("Capture")
                VStack(spacing: 0) {
                    toggleRow("Sync Screenshots album", isOn: Binding(
                        get: { screenshots.enabled },
                        set: { on in
                            if on { Task { _ = await screenshots.turnOn() } } else { screenshots.enabled = false }
                        }
                    ))
                    if screenshots.enabled {
                        Button { Task { await screenshots.sync(older: true) } } label: {
                            GroupRow(label: "Send older screenshots", chevron: false)
                        }
                        .disabled(screenshots.running)
                    }
                    GroupRow(label: "Claude sorting", value: sortingStatus, mono: false, chevron: false)
                    toggleRow("Blur sensitive pictures", isOn: $blur, divider: false)
                }
                .groupBox()
                .buttonStyle(.plain)
                ForEach([screenshots.status, LocalUpload.shared.status].compactMap { $0 }, id: \.self) { s in
                    Text(s).font(.system(size: 13)).foregroundStyle(Theme.faint).padding(.horizontal, 4)
                }

                GroupCaption("Storage")
                VStack(spacing: 0) {
                    NavigationLink(value: Route.trash) {
                        GroupRow(label: "Trash", value: (store.menu?.views.trash ?? 0).formatted())
                    }
                    Button { openURL(Config.baseURL.appendingPathComponent("sources")) } label: {
                        GroupRow(label: "Sources", value: "Set up on the web", mono: false, divider: false)
                    }
                }
                .groupBox()
                .buttonStyle(.plain)
                Text("To save from any app, tap Share, then Save to Brain.")
                    .font(.system(size: 13)).foregroundStyle(Theme.faint).padding(.horizontal, 4)

                GroupCaption("Account")
                VStack(spacing: 0) {
                    GroupRow(label: "Signed in on this iPhone", chevron: false)
                    Button { session.signOut() } label: {
                        Text("Sign out").font(.system(size: 16)).foregroundStyle(Theme.bad)
                            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .groupBox()
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .background(Theme.grouped)
        .navigationBarTitleDisplayMode(.inline)
    }

    /// System, Light and Dark. The design shows only Light and Dark; System stays so the phone can follow itself.
    private var modePicker: some View {
        HStack(spacing: 2) {
            ForEach(Mode.allCases) { m in
                let on = look.mode == m
                Button { Task { await look.set(mode: m) } } label: {
                    HStack(spacing: 7) {
                        Image(systemName: m == .light ? "sun.max" : m == .dark ? "moon" : "iphone")
                        Text(m.label)
                    }
                    .font(.system(size: 15, weight: on ? .semibold : .medium))
                    .foregroundStyle(on ? Theme.ink : Theme.soft)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(on ? Theme.selected : .clear, in: RoundedRectangle(cornerRadius: 9))
                    .shadow(color: .black.opacity(on ? 0.12 : 0), radius: 2, y: 1)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }

    private var sortingStatus: String {
        guard let waiting = store.menu?.views.unsorted else { return "On" }
        return waiting == 0 ? "Up to date" : "\(waiting.formatted()) to sort"
    }

    private func toggleRow(_ label: String, isOn: Binding<Bool>, divider: Bool = true) -> some View {
        Toggle(label, isOn: isOn)
            .font(.system(size: 16))
            .tint(Theme.accentFill)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .overlay(alignment: .bottom) {
                if divider { Rectangle().fill(Theme.divider).frame(height: 1) }
            }
    }
}
