import SwiftUI

/// Pick the AI that sorts saves, reads voice memos and pictures, answers Ask Brain and writes the
/// weekly digest: Claude, ChatGPT or Gemini. Same choice and keys as the web's Settings.
struct AISettingsView: View {
    @State private var state: API.AIState?
    @State private var error: String?
    @State private var keys: [String: String] = [:]
    @State private var models: [String: String] = [:]
    @State private var tests: [String: API.TestResult] = [:]
    @State private var busy: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Sorts your saves, picks out names and dates from voice memos and pictures, answers Ask Brain and writes the weekly digest. Keys are stored encrypted on the server and shown only by their last four characters.")
                    .font(.ui(13)).foregroundStyle(Theme.faint).padding(.horizontal, 4)

                if let state {
                    GroupCaption("In use")
                    Picker("AI", selection: Binding(get: { state.provider }, set: { p in Task { await apply { try await API.shared.setAI(provider: p) } } })) {
                        ForEach(state.providers) { Text($0.name).tag($0.id) }
                    }
                    .pickerStyle(.segmented)
                    if let current = state.current, !current.hasKey {
                        Text("\(current.name) has no key yet. Add one below, or nothing gets sorted.")
                            .font(.footnote).foregroundStyle(Theme.bad).padding(.horizontal, 4)
                    }
                    ForEach(state.providers) { p in provider(p, active: p.id == state.provider) }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.bad).padding(.horizontal, 4) }
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .background(Theme.grouped)
        .navigationTitle("AI")
        .navigationBarTitleDisplayMode(.large)
        .toolbar(.hidden, for: .tabBar)
        .scrollDismissesKeyboard(.interactively)
        .task { await apply { try await API.shared.ai() } }
    }

    private func provider(_ p: API.AIState.Provider, active: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            GroupCaption(active ? "\(p.name), in use" : p.name)
            VStack(spacing: 0) {
                GroupRow(label: "Key", value: p.last4.map { "…\($0)" } ?? (p.fromEnv ? "On the server" : "None"), chevron: false)
                HStack {
                    SecureField(p.keyHint, text: Binding(get: { keys[p.id] ?? "" }, set: { keys[p.id] = $0 }))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(p.last4 == nil ? "Save" : "Replace") {
                        let value = keys[p.id] ?? ""
                        Task {
                            await apply(p.id) { try await API.shared.setAI(keyOf: p.id, key: value) }
                            keys[p.id] = ""
                        }
                    }
                    .disabled((keys[p.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty || busy != nil)
                }
                .font(.ui(16))
                .padding(.horizontal, 14).frame(minHeight: 50)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.divider).frame(height: 1) }
                let editedModel = (models[p.id] ?? p.model).trimmingCharacters(in: .whitespaces)
                HStack {
                    Text("Model").foregroundStyle(Theme.ink)
                    TextField(p.defaultModel, text: Binding(get: { models[p.id] ?? p.model }, set: { models[p.id] = $0 }))
                        .multilineTextAlignment(.trailing)
                        .font(.ui(15, design: .monospaced))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit {
                            Task { await apply(p.id) { try await API.shared.setAI(modelOf: p.id, model: editedModel.isEmpty ? nil : editedModel) } }
                        }
                    if editedModel != p.model {
                        Button("Save") {
                            Task { await apply(p.id) { try await API.shared.setAI(modelOf: p.id, model: editedModel.isEmpty ? nil : editedModel) } }
                        }
                        .disabled(busy != nil)
                    }
                }
                .font(.ui(16))
                .padding(.horizontal, 14).frame(minHeight: 50)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.divider).frame(height: 1) }
                HStack(spacing: 16) {
                    Button(busy == p.id ? "Testing…" : "Test") {
                        Task {
                            busy = p.id
                            defer { busy = nil }
                            do { tests[p.id] = try await API.shared.testAI(p.id) } catch { self.error = error.localizedDescription }
                        }
                    }
                    .disabled(!p.hasKey || busy != nil)
                    if p.last4 != nil {
                        Rectangle().fill(Theme.divider).frame(width: 1, height: 20)
                        Button("Remove key", role: .destructive) {
                            Task { await apply(p.id) { try await API.shared.setAI(keyOf: p.id, key: nil) } }
                        }
                        .foregroundStyle(Theme.bad)
                    }
                    Spacer()
                    if let url = URL(string: p.keyUrl) {
                        Link("Get a key", destination: url).font(.ui(14))
                    }
                }
                .font(.ui(16))
                .padding(.horizontal, 14).frame(minHeight: 50)
            }
            .groupBox()
            .buttonStyle(.borderless)
            if let t = tests[p.id] {
                Text(t.message).font(.footnote).foregroundStyle(t.ok ? Theme.faint : Theme.bad).padding(.horizontal, 4).padding(.top, 4)
            }
        }
    }

    private func apply(_ who: String? = nil, _ work: () async throws -> API.AIState) async {
        do {
            state = try await work()
            error = nil
            if let who { tests[who] = nil }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
