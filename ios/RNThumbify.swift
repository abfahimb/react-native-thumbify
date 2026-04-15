import ExpoModulesCore
import AVFoundation
import UIKit

private struct ThumbifyError: LocalizedError {
  let errorDescription: String?
  init(_ msg: String) { errorDescription = msg }
}

public class ThumbifyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Thumbify")

    // MARK: - generate

    AsyncFunction("generate") { (options: [String: Any]) throws -> [String: Any] in
      guard let uri = options["uri"] as? String, !uri.isEmpty else {
        throw ThumbifyError("INVALID_URI: uri is required and must be non-empty")
      }

      let timeMs    = options["timeMs"]        as? Double  ?? 0
      let format    = options["format"]        as? String  ?? "jpeg"
      let quality   = options["quality"]       as? Double  ?? 80
      let maxWidth  = options["maxWidth"]      as? CGFloat ?? 0
      let maxHeight = options["maxHeight"]     as? CGFloat ?? 0
      let headers   = options["headers"]       as? [String: String] ?? [:]
      let cacheDir  = options["cacheDir"]      as? String  ?? NSTemporaryDirectory()
      let cacheFile = options["cacheFilename"] as? String  ?? "thumb.jpg"

      let cacheURL = URL(fileURLWithPath: cacheDir).appendingPathComponent(cacheFile)

      // Return cached file if it exists
      if FileManager.default.fileExists(atPath: cacheURL.path),
         let attrs = try? FileManager.default.attributesOfItem(atPath: cacheURL.path),
         let img = UIImage(contentsOfFile: cacheURL.path) {
        let fileSize = (attrs[.size] as? Int) ?? 0
        return [
          "path":   cacheURL.path,
          "width":  Int(img.size.width),
          "height": Int(img.size.height),
          "size":   fileSize,
        ]
      }

      ensureCacheDir(cacheDir)

      guard let asset = buildAsset(uri: uri, headers: headers) else {
        throw ThumbifyError("INVALID_URI: Cannot build AVAsset from uri: \(uri)")
      }

      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.requestedTimeToleranceBefore = CMTime(value: 200, timescale: 1_000)
      generator.requestedTimeToleranceAfter  = CMTime(value: 200, timescale: 1_000)

      if maxWidth > 0 || maxHeight > 0 {
        generator.maximumSize = CGSize(
          width:  maxWidth  > 0 ? maxWidth  : 9999,
          height: maxHeight > 0 ? maxHeight : 9999
        )
      }

      let cmTime = CMTime(value: CMTimeValue(timeMs), timescale: 1_000)
      var actualTime = CMTime.zero

      let cgImage: CGImage
      do {
        cgImage = try generator.copyCGImage(at: cmTime, actualTime: &actualTime)
      } catch {
        let nsErr = error as NSError
        throw ThumbifyError("\(mapAVErrorCode(nsErr)): \(nsErr.localizedDescription)")
      }

      let image = UIImage(cgImage: cgImage)

      guard let data = encode(image, format: format, quality: quality / 100.0) else {
        throw ThumbifyError("ENCODE_FAILED: Failed to encode image as \(format)")
      }

      do {
        try data.write(to: cacheURL, options: .atomicWrite)
      } catch {
        throw ThumbifyError("DISK_FULL: Failed to write thumbnail: \(error.localizedDescription)")
      }

      return [
        "path":   cacheURL.path,
        "width":  Int(image.size.width),
        "height": Int(image.size.height),
        "size":   data.count,
      ]
    }

    // MARK: - clearCache

    AsyncFunction("clearCache") { (directory: String) throws in
      guard FileManager.default.fileExists(atPath: directory) else { return }
      let files = try FileManager.default.contentsOfDirectory(atPath: directory)
      for file in files where file.hasPrefix("thumbify_") {
        try FileManager.default.removeItem(atPath: "\(directory)/\(file)")
      }
    }

    // MARK: - getCacheSize

    AsyncFunction("getCacheSize") { (directory: String) throws -> Int64 in
      guard FileManager.default.fileExists(atPath: directory) else { return 0 }
      let files = try FileManager.default.contentsOfDirectory(atPath: directory)
      return try files
        .filter { $0.hasPrefix("thumbify_") }
        .reduce(Int64(0)) { total, file in
          let attrs = try FileManager.default.attributesOfItem(atPath: "\(directory)/\(file)")
          return total + ((attrs[.size] as? Int64) ?? 0)
        }
    }
  }

  // MARK: - Private helpers

  private func buildAsset(uri: String, headers: [String: String]) -> AVAsset? {
    if uri.hasPrefix("http://") || uri.hasPrefix("https://") {
      guard let url = URL(string: uri) else { return nil }
      if headers.isEmpty { return AVURLAsset(url: url) }
      var headerDict = [String: AnyObject]()
      for (k, v) in headers { headerDict[k] = v as AnyObject }
      return AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headerDict])
    } else {
      let path = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
      return AVURLAsset(url: URL(fileURLWithPath: path))
    }
  }

  private func encode(_ image: UIImage, format: String, quality: Double) -> Data? {
    switch format {
    case "png":
      return image.pngData()
    case "webp":
      if #available(iOS 14.0, *), let cgImage = image.cgImage {
        let data = NSMutableData()
        if let dest = CGImageDestinationCreateWithData(data, "org.webmproject.webp" as CFString, 1, nil) {
          let opts: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
          CGImageDestinationAddImage(dest, cgImage, opts as CFDictionary)
          if CGImageDestinationFinalize(dest) { return data as Data }
        }
      }
      return image.jpegData(compressionQuality: quality)
    default:
      return image.jpegData(compressionQuality: quality)
    }
  }

  private func ensureCacheDir(_ dir: String) {
    var isDir: ObjCBool = false
    if !FileManager.default.fileExists(atPath: dir, isDirectory: &isDir) || !isDir.boolValue {
      try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }
  }

  private func mapAVErrorCode(_ err: NSError) -> String {
    switch err.code {
    case AVError.fileFailedToParse.rawValue,
         AVError.noLongerPlayable.rawValue,
         AVError.operationNotSupportedForAsset.rawValue:
      return "DECODE_FAILED"
    case NSURLErrorTimedOut:
      return "TIMEOUT"
    case NSURLErrorNotConnectedToInternet,
         NSURLErrorNetworkConnectionLost:
      return "NETWORK_ERROR"
    case NSURLErrorCancelled:
      return "CANCELLED"
    default:
      return "NATIVE_ERROR"
    }
  }
}
