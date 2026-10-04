import AVFoundation
import Foundation

/// Plays the alarm sound and reports when it has run its course.
@MainActor
final class AlarmPlayer: NSObject, AVAudioPlayerDelegate {
    /// The built-in alert sounds are a second or two long, so they are repeated for about this
    /// long to make the alarm hard to miss.
    private static let systemSoundRingDuration: TimeInterval = 20

    private static let systemSoundDirectory = URL(fileURLWithPath: "/System/Library/Sounds")

    /// Names of the alert sounds that ship with macOS.
    static let systemSoundNames: [String] = {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: systemSoundDirectory, includingPropertiesForKeys: nil)) ?? []
        let names = files.filter { $0.pathExtension == "aiff" }
            .map { $0.deletingPathExtension().lastPathComponent }
            .sorted()
        return names.isEmpty ? ["Glass"] : names
    }()

    /// Where a user-chosen sound file is kept. Copying it here means the alarm keeps working
    /// if the original is moved, and avoids folder-access prompts for Downloads or Documents.
    static let customSoundDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Namaz", isDirectory: true)
    }()

    /// File name of the sound the user imported, if there is one.
    static var importedSoundName: String? {
        (try? FileManager.default.contentsOfDirectory(atPath: customSoundDirectory.path))?
            .first { !$0.hasPrefix(".") }
    }

    private var player: AVAudioPlayer?
    private var onFinish: (() -> Void)?

    var isPlaying: Bool { player?.isPlaying ?? false }

    /// Starts `sound`, calling `onFinish` when it ends on its own (not when stopped).
    /// Returns false if there is nothing to play or the file cannot be opened.
    @discardableResult
    func play(_ sound: AlarmSound, volume: Double, onFinish: @escaping () -> Void) -> Bool {
        stop()
        guard let url = Self.url(for: sound), let player = try? AVAudioPlayer(contentsOf: url) else {
            return false
        }
        player.delegate = self
        player.volume = Float(min(max(volume, 0), 1))
        if case .system = sound, player.duration > 0 {
            player.numberOfLoops = max(0, Int((Self.systemSoundRingDuration / player.duration).rounded(.up)) - 1)
        }
        guard player.play() else { return false }
        self.player = player
        self.onFinish = onFinish
        return true
    }

    func stop() {
        player?.stop()
        player = nil
        onFinish = nil
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let finished = ObjectIdentifier(player)
        Task { @MainActor in
            // Ignore a late callback from a player that has since been replaced or stopped.
            guard let current = self.player, ObjectIdentifier(current) == finished else { return }
            let callback = self.onFinish
            self.stop()
            callback?()
        }
    }

    static func url(for sound: AlarmSound) -> URL? {
        switch sound {
        case .silent:
            nil
        case .adhan:
            // Missing only when the bare executable runs outside the app bundle.
            Bundle.main.url(forResource: "Adhan", withExtension: "m4a")
        case .system(let name):
            systemSoundDirectory.appendingPathComponent(name).appendingPathExtension("aiff")
        case .custom(let fileName):
            customSoundDirectory.appendingPathComponent(fileName)
        }
    }

    /// Copies an audio file the user picked into the app's support folder, replacing any earlier
    /// one, and returns the sound setting that refers to it.
    static func importCustomSound(from source: URL) throws -> AlarmSound {
        // Opening it first rejects files that are not playable audio.
        _ = try AVAudioPlayer(contentsOf: source)

        let manager = FileManager.default
        try manager.createDirectory(at: customSoundDirectory, withIntermediateDirectories: true)
        for existing in (try? manager.contentsOfDirectory(
            at: customSoundDirectory, includingPropertiesForKeys: nil)) ?? [] {
            try? manager.removeItem(at: existing)
        }
        let destination = customSoundDirectory.appendingPathComponent(source.lastPathComponent)
        try manager.copyItem(at: source, to: destination)
        return .custom(fileName: source.lastPathComponent)
    }
}
