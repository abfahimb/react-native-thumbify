import Foundation
import AVFoundation
import UIKit

@objc(RNThumbify)
class RNThumbify: NSObject {

  // MARK: - Main Generate

  @objc
  func generate(
    _ options: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let uri = options["uri"] as? String, !uri.isEmpty else {
      reject("INVALID_URI", "uri is required and must be non-empty", nil)
      return
    }

    let timeMs    = options["timeMs"] as? Double ?? 0
    let format    = options["format"] as? String ?? "jpeg"
    let quality   = options["quality"] as? Double ?? 80
    let maxWidth  = options["maxWidth"] as? CGFloat ?? 0
    let maxHeight = options["maxHeight"] as? CGFloat ?? 0
    let headers   = options["headers"] as? [String: String] ?? [:]
    let timeoutMs = options["timeoutMs"] as? Double ?? 15_000
    let cacheDir  = options["cacheDir"] as? String ?? NSTemporaryDirectory()
    let cacheFile = options["cacheFilename"] as? String ?? "thumb.jpg"

    let cacheURL = URL(fileURLWithPath: cacheDir).appendingPathComponent(cacheFile)

    // Return cached file if exists
    if FileManager.default.fileExists(atPath: cacheURL.path),
       let attrs = try? FileManager.default.attributesOfItem(atPath: cacheURL.path),
       let img = UIImage(contentsOfFile: cacheURL.path) {
      let fileSize = (attrs[.size] as? Int) ?? 0
      resolve([
        "path": cacheURL.path,
        "width": Int(img.size.width),
        "height": Int(img.size.height),
        "size": fileSize,
      ])
      return
    }

    ensureCacheDir(cacheDir)

    DispatchQueue.global(qos: .userInitiated).async {
      self.extractFrame(
        uri: uri,
        timeMs: timeMs,
        format: format,
        quality: quality,
        maxWidth: maxWidth,
        maxHeight: maxHeight,
        headers: headers,
        timeoutMs: timeoutMs,
        outputURL: cacheURL,
        resolve: resolve,
        reject: reject
      )
    }
  }

  // MARK: - Frame Extraction

  private func extractFrame(
    uri: String,
    timeMs: Double,
    format: String,
    quality: Double,
    maxWidth: CGFloat,
    maxHeight: CGFloat,
    headers: [String: String],
    timeoutMs: Double,
    outputURL: URL,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let asset = buildAsset(uri: uri, headers: headers) else {
      reject("INVALID_URI", "Cannot build AVAsset from uri: \(uri)", nil)
      return
    }

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(value: 200, timescale: 1_000) // ±200ms
    generator.requestedTimeToleranceAfter  = CMTime(value: 200, timescale: 1_000)

    if maxWidth > 0 || maxHeight > 0 {
      generator.maximumSize = CGSize(width: maxWidth > 0 ? maxWidth : 9999,
                                     height: maxHeight > 0 ? maxHeight : 9999)
    }

    let cmTime = CMTime(value: CMTimeValue(timeMs), timescale: 1_000)
    var actualTime = CMTime.zero

    do {
      let cgImage = try generator.copyCGImage(at: cmTime, actualTime: &actualTime)
      let uiImage = UIImage(cgImage: cgImage)
      let sized   = maxWidth > 0 || maxHeight > 0 ? self.resize(uiImage, maxWidth: maxWidth, maxHeight: maxHeight) : uiImage

      guard let data = self.encode(sized, format: format, quality: quality / 100.0) else {
        reject("ENCODE_FAILED", "Failed to encode image as \(format)", nil)
        return
      }

      try data.write(to: outputURL, options: .atomicWrite)
      let size = data.count

      resolve([
        "path": outputURL.path,
        "width": Int(sized.size.width),
        "height": Int(sized.size.height),
        "size": size,
      ])
    } catch {
      let err = error as NSError
      let code = self.mapAVError(err)
      reject(code, err.localizedDescription, err)
    }
  }

  // MARK: - Asset Builder (local + remote + auth headers)

  private func buildAsset(uri: String, headers: [String: String]) -> AVAsset? {
    if uri.hasPrefix("http://") || uri.hasPrefix("https://") {
      guard var components = URLComponents(string: uri),
            let url = components.url else { return nil }
      if headers.isEmpty {
        return AVURLAsset(url: url)
      }
      // Custom headers via AVURLAsset options
      var headerDict = [String: AnyObject]()
      for (k, v) in headers { headerDict[k] = v as AnyObject }
      return AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headerDict])
    } else {
      // Local file — strip file:// prefix if present
      let path = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
      return AVURLAsset(url: URL(fileURLWithPath: path))
    }
  }

  // MARK: - Image Resize (maintain aspect ratio)

  private func resize(_ image: UIImage, maxWidth: CGFloat, maxHeight: CGFloat) -> UIImage {
    let w = image.size.width
    let h = image.size.height
    guard w > 0, h > 0 else { return image }

    let scaleW = maxWidth > 0  ? maxWidth / w  : CGFloat.greatestFiniteMagnitude
    let scaleH = maxHeight > 0 ? maxHeight / h : CGFloat.greatestFiniteMagnitude
    let scale  = min(scaleW, scaleH, 1.0) // never upscale

    if scale >= 1.0 { return image }

    let newSize = CGSize(width: floor(w * scale), height: floor(h * scale))
    let renderer = UIGraphicsImageRenderer(size: newSize)
    return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
  }

  // MARK: - Encode

  private func encode(_ image: UIImage, format: String, quality: Double) -> Data? {
    switch format {
    case "png":
      return image.pngData()
    case "webp":
      // WebP via ImageIO (iOS 14+) — fallback to JPEG on older OS
      if #available(iOS 14.0, *) {
        if let cgImage = image.cgImage {
          let data = NSMutableData()
          if let dest = CGImageDestinationCreateWithData(data, "org.webmproject.webp" as CFString, 1, nil) {
            let opts: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
            CGImageDestinationAddImage(dest, cgImage, opts as CFDictionary)
            if CGImageDestinationFinalize(dest) { return data as Data }
          }
        }
      }
      // Fallback to JPEG
      return image.jpegData(compressionQuality: quality)
    default: // jpeg
      return image.jpegData(compressionQuality: quality)
    }
  }

  // MARK: - Cache Helpers

  private func ensureCacheDir(_ dir: String) {
    var isDir: ObjCBool = false
    if !FileManager.default.fileExists(atPath: dir, isDirectory: &isDir) || !isDir.boolValue {
      try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }
  }

  @objc
  func clearCache(_ directory: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    do {
      let files = try FileManager.default.contentsOfDirectory(atPath: directory)
      for file in files where file.hasPrefix("thumbify_") {
        try FileManager.default.removeItem(atPath: "\(directory)/\(file)")
      }
      resolve(nil)
    } catch {
      reject("NATIVE_ERROR", error.localizedDescription, error as NSError)
    }
  }

  @objc
  func getCacheSize(_ directory: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    do {
      let files = try FileManager.default.contentsOfDirectory(atPath: directory)
      var total: Int64 = 0
      for file in files where file.hasPrefix("thumbify_") {
        let attrs = try FileManager.default.attributesOfItem(atPath: "\(directory)/\(file)")
        total += (attrs[.size] as? Int64) ?? 0
      }
      resolve(total)
    } catch {
      reject("NATIVE_ERROR", error.localizedDescription, error as NSError)
    }
  }

  // MARK: - Error Mapping

  private func mapAVError(_ err: NSError) -> String {
    switch err.code {
    case AVError.fileFailedToParse.rawValue:        return "DECODE_FAILED"
    case AVError.noLongerPlayable.rawValue:         return "DECODE_FAILED"
    case AVError.mediaServicesWereReset.rawValue:   return "NATIVE_ERROR"
    case AVError.operationNotSupportedForAsset.rawValue: return "UNSUPPORTED_FORMAT"
    case NSURLErrorTimedOut:                        return "TIMEOUT"
    case NSURLErrorNotConnectedToInternet,
         NSURLErrorNetworkConnectionLost:           return "NETWORK_ERROR"
    case NSURLErrorCancelled:                       return "CANCELLED"
    default:                                        return "NATIVE_ERROR"
    }
  }

  // MARK: - RCT Threading

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
