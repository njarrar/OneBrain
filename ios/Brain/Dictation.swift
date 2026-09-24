import AVFoundation
import Speech

/// Turns speech into text as you talk, for the search field and the Add sheet.
/// With keepAudio (the Add sheet), it also keeps what you said as a voice memo, so the server can
/// write it out in full and keep the sound.
@MainActor
@Observable
final class Dictation {
    var listening = false
    var text = ""
    var error: String?
    /// The voice memo from the last time you spoke, when keepAudio is on.
    var recording: URL?
    var seconds: Double = 0

    @ObservationIgnored private let keepAudio: Bool
    @ObservationIgnored private var file: AVAudioFile?

    init(keepAudio: Bool = false) {
        self.keepAudio = keepAudio
    }

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?

    func toggle() async {
        if listening { stop() } else { await start() }
    }

    func start() async {
        error = nil
        text = ""
        discardRecording()
        let speech = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
        guard speech == .authorized else {
            error = "Brain needs speech recognition. Allow it in Settings, Brain."
            return
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            error = "Brain needs the microphone. Allow it in Settings, Brain."
            return
        }
        // Arabic when the phone is set to Arabic, else the phone's language.
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            error = "Speech recognition isn't available right now."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.request = request
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            if keepAudio {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("memo-\(UUID().uuidString).m4a")
                file = try AVAudioFile(forWriting: url, settings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: format.sampleRate,
                    AVNumberOfChannelsKey: format.channelCount,
                    AVEncoderBitRateKey: 64000,
                ], commonFormat: format.commonFormat, interleaved: format.isInterleaved)
                recording = url
            }
            input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Self.feed(request, file))
            engine.prepare()
            try engine.start()
            listening = true
            task = recognizer.recognitionTask(with: request, resultHandler: Self.handler { [weak self] said, finished in
                guard let self else { return }
                if let said { self.text = said }
                if finished { self.stop() }
            })
        } catch {
            self.error = error.localizedDescription
            stop()
        }
    }

    // The audio and speech callbacks run off the main thread, so they are made outside the main actor.
    private nonisolated static func feed(_ request: SFSpeechAudioBufferRecognitionRequest, _ file: AVAudioFile?) -> AVAudioNodeTapBlock {
        { buffer, _ in
            request.append(buffer)
            try? file?.write(from: buffer)
        }
    }

    private nonisolated static func handler(_ update: @escaping @MainActor (String?, Bool) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, err in
            let said = result?.bestTranscription.formattedString
            let finished = err != nil || result?.isFinal == true
            Task { @MainActor in update(said, finished) }
        }
    }

    func stop() {
        guard listening || request != nil else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        listening = false
        if let file {
            seconds = Double(file.length) / max(file.processingFormat.sampleRate, 1)
            // Closes the file, so the memo is complete.
            self.file = nil
        }
        if seconds < 1 { discardRecording() }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Drops the voice memo, for "remove" in the Add sheet or a fresh start.
    func discardRecording() {
        if let recording { try? FileManager.default.removeItem(at: recording) }
        recording = nil
        seconds = 0
    }
}
