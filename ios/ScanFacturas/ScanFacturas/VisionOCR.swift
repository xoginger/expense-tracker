import UIKit
import Vision

enum VisionOCR {
    static func recognize(image: UIImage) async -> String {
        guard let cgImage = image.cgImage else { return "" }
        return await withCheckedContinuation { continuation in
            var resumed = false
            let finish: (String) -> Void = { text in
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: text)
            }

            let request = VNRecognizeTextRequest { req, _ in
                let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
                let lines = observations.compactMap { $0.topCandidates(1).first?.string }
                finish(lines.joined(separator: "\n"))
            }
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["es-MX", "es-ES", "es"]
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try handler.perform([request])
                    if !resumed { finish("") }
                } catch {
                    finish("")
                }
            }
        }
    }
}
