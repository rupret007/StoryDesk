import AppKit
import Foundation

struct CommandEnvelope: Decodable {
    let command: String
    let config: VirtualDisplayConfig?
}

struct VirtualDisplayConfig: Decodable {
    let width: Int
    let height: Int
    let fps: Int
    let hidpi: Bool
}

final class Output {
    private let lock = NSLock()

    func event(_ payload: [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let line = String(data: data, encoding: .utf8) else {
            return
        }
        print(line)
        fflush(stdout)
    }
}

final class VirtualDisplayController {
    private var display: CGVirtualDisplay?
    private let output: Output

    init(output: Output) {
        self.output = output
    }

    func start(config: VirtualDisplayConfig) {
        stop()

        let descriptor = CGVirtualDisplayDescriptor()
        descriptor.setDispatchQueue(DispatchQueue.main)
        descriptor.name = "StoryDesk Virtual Display"
        descriptor.maxPixelsWide = UInt32(max(config.width, 5120))
        descriptor.maxPixelsHigh = UInt32(max(config.height, 2880))
        descriptor.sizeInMillimeters = CGSize(width: 600, height: 340)
        descriptor.productID = 0x5354
        descriptor.vendorID = 0x4453
        descriptor.serialNum = 0x0001
        descriptor.terminationHandler = { [weak self] _, virtualDisplay in
            self?.output.event([
                "type": "terminated",
                "displayID": virtualDisplay.displayID
            ])
        }

        let newDisplay = CGVirtualDisplay(descriptor: descriptor)
        let settings = CGVirtualDisplaySettings()
        settings.hiDPI = config.hidpi ? 1 : 0
        settings.modes = displayModes(config: config)

        guard newDisplay.apply(settings) else {
            output.event(["type": "error", "message": "Unable to apply virtual display settings"])
            return
        }

        display = newDisplay
        output.event([
            "type": "ready",
            "displayID": newDisplay.displayID,
            "width": config.width,
            "height": config.height,
            "fps": config.fps,
            "hidpi": config.hidpi
        ])
    }

    func stop() {
        guard display != nil else {
            return
        }
        display = nil
        output.event(["type": "stopped"])
    }

    private func displayModes(config: VirtualDisplayConfig) -> [CGVirtualDisplayMode] {
        let refresh = CGFloat(config.fps)
        let requested = CGVirtualDisplayMode(
            width: UInt(config.width),
            height: UInt(config.height),
            refreshRate: refresh
        )
        let presets = [
            CGVirtualDisplayMode(width: 3840, height: 2160, refreshRate: 60),
            CGVirtualDisplayMode(width: 2560, height: 1440, refreshRate: 60),
            CGVirtualDisplayMode(width: 1920, height: 1080, refreshRate: 60),
            CGVirtualDisplayMode(width: 1600, height: 900, refreshRate: 60),
            CGVirtualDisplayMode(width: 1280, height: 720, refreshRate: 60),
            CGVirtualDisplayMode(width: 1920, height: 1200, refreshRate: 60),
            CGVirtualDisplayMode(width: 1440, height: 900, refreshRate: 60),
            CGVirtualDisplayMode(width: 1280, height: 800, refreshRate: 60)
        ]
        return [requested] + presets
    }
}

let output = Output()
let controller = VirtualDisplayController(output: output)
let decoder = JSONDecoder()

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8) else {
            continue
        }
        do {
            let envelope = try decoder.decode(CommandEnvelope.self, from: data)
            DispatchQueue.main.async {
                switch envelope.command {
                case "start":
                    guard let config = envelope.config else {
                        output.event(["type": "error", "message": "Missing display config"])
                        return
                    }
                    controller.start(config: config)
                case "stop":
                    controller.stop()
                case "shutdown":
                    controller.stop()
                    exit(0)
                default:
                    output.event(["type": "error", "message": "Unknown command"])
                }
            }
        } catch {
            output.event(["type": "error", "message": "Invalid command: \(error.localizedDescription)"])
        }
    }
}

RunLoop.main.run()
