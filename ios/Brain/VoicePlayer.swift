import AVFoundation
import AVKit
import SwiftUI

/// Plays a voice memo or video saved in Brain. The file needs the key, so it is loaded first,
/// then played from a copy on the phone.
struct VoicePlayer: View {
    let file: ItemDetail.File

    @State private var player: AVPlayer?
    @State private var playing = false
    @State private var loading = false
    @State private var failed = false
    @State private var length: Double = 0
    @State private var done: NSObjectProtocol?

    private var isVideo: Bool { file.isVideo }

    var body: some View {
        Group {
            if isVideo, let player {
                VideoPlayer(player: player).aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            } else {
                HStack(spacing: 12) {
                    Button { Task { await toggle() } } label: {
                        Group {
                            if loading { ProgressView() } else {
                                Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 16, weight: .semibold))
                            }
                        }
                        .foregroundStyle(Theme.accentInk)
                        .frame(width: 40, height: 40)
                        .background(Theme.accentFill, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(playing ? "Pause" : "Play")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(isVideo ? "Video" : "Voice memo").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                        Text(failed ? "Couldn't load the sound." : length > 0 ? Self.clock(length) : file.filename)
                            .font(.system(size: 12, design: .monospaced)).foregroundStyle(failed ? Theme.bad : Theme.faint).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "waveform").foregroundStyle(Theme.faint)
                }
                .padding(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
            }
        }
        .task { if isVideo { _ = await load() } }
        .onDisappear {
            player?.pause()
            playing = false
            if let done { NotificationCenter.default.removeObserver(done) }
            done = nil
        }
    }

    private func toggle() async {
        if playing {
            player?.pause()
            playing = false
            return
        }
        guard let p = await load() else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        p.play()
        playing = true
    }

    /// Loads the file once, into a copy the player can read.
    private func load() async -> AVPlayer? {
        if let player { return player }
        loading = true
        defer { loading = false }
        do {
            let data = try await API.shared.fileData(file.id)
            let ext = (file.filename as NSString).pathExtension
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("brain-\(file.id)").appendingPathExtension(ext.isEmpty ? "m4a" : ext)
            try data.write(to: url, options: .atomic)
            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            if let seconds = try? await item.asset.load(.duration).seconds, seconds.isFinite { length = seconds }
            if let done { NotificationCenter.default.removeObserver(done) }
            done = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { _ in
                Task { @MainActor in
                    playing = false
                    p.seek(to: .zero)
                }
            }
            player = p
            failed = false
            return p
        } catch {
            failed = true
            return nil
        }
    }

    private static func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
