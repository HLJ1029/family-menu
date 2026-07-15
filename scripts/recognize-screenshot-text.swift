import AppKit
import Foundation
import Vision

struct OcrRecord: Codable {
  let path: String
  let text: String
  let error: String?
}

let records = CommandLine.arguments.dropFirst().map { path -> OcrRecord in
  guard let image = NSImage(contentsOfFile: path) else {
    return OcrRecord(path: path, text: "", error: "Unable to open image.")
  }
  var rect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    return OcrRecord(path: path, text: "", error: "Unable to create CGImage.")
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["zh-Hans", "en-US"]
  request.usesLanguageCorrection = true

  do {
    try VNImageRequestHandler(cgImage: cgImage).perform([request])
    let text = (request.results ?? [])
      .compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: "\n")
    return OcrRecord(path: path, text: text, error: nil)
  } catch {
    return OcrRecord(path: path, text: "", error: error.localizedDescription)
  }
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(records)
print(String(decoding: data, as: UTF8.self))
