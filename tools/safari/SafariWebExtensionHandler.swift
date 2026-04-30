//
//  SafariWebExtensionHandler.swift
//  XVDL Extension
//
//  Created by Realazy on 2026-04-30.
//

import Foundation
import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received native message: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        guard let payload = message as? [String: Any], payload["type"] as? String == "download" else {
            complete(context, message: [
                "ok": false,
                "error": "Unsupported native message."
            ])
            return
        }

        download(payload, context: context)
    }

    private func download(_ payload: [String: Any], context: NSExtensionContext) {
        guard
            let urlString = payload["url"] as? String,
            let url = URL(string: urlString),
            url.scheme?.lowercased() == "https",
            url.host?.lowercased() == "video.twimg.com",
            url.pathExtension.lowercased() == "mp4"
        else {
            complete(context, message: [
                "ok": false,
                "error": "Unsupported video URL."
            ])
            return
        }

        let filename = sanitizedFilename(payload["filename"] as? String)
        guard let downloadsDirectory = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first else {
            complete(context, message: [
                "ok": false,
                "error": "Could not locate the Downloads folder."
            ])
            return
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")

        let task = URLSession.shared.downloadTask(with: request) { temporaryURL, response, error in
            if let error {
                self.complete(context, message: [
                    "ok": false,
                    "error": error.localizedDescription
                ])
                return
            }

            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                self.complete(context, message: [
                    "ok": false,
                    "error": "Video request failed with HTTP \(httpResponse.statusCode)."
                ])
                return
            }

            guard let temporaryURL else {
                self.complete(context, message: [
                    "ok": false,
                    "error": "Safari did not provide a downloaded temporary file."
                ])
                return
            }

            do {
                try FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
                let destination = self.uniqueDestination(for: filename, in: downloadsDirectory)
                try FileManager.default.moveItem(at: temporaryURL, to: destination)
                self.complete(context, message: [
                    "ok": true,
                    "path": destination.path
                ])
            } catch {
                self.complete(context, message: [
                    "ok": false,
                    "error": error.localizedDescription
                ])
            }
        }

        task.resume()
    }

    private func sanitizedFilename(_ rawFilename: String?) -> String {
        let fallback = "xvdl-video.mp4"
        let rawValue = rawFilename?.isEmpty == false ? rawFilename ?? fallback : fallback
        let invalidCharacters = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        let cleaned = rawValue
            .components(separatedBy: invalidCharacters)
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let filename = cleaned.isEmpty ? fallback : cleaned
        return filename.lowercased().hasSuffix(".mp4") ? filename : "\(filename).mp4"
    }

    private func uniqueDestination(for filename: String, in directory: URL) -> URL {
        let file = filename as NSString
        let baseName = file.deletingPathExtension
        let fileExtension = file.pathExtension
        var destination = directory.appendingPathComponent(filename, isDirectory: false)
        var index = 2

        while FileManager.default.fileExists(atPath: destination.path) {
            let indexedFilename = fileExtension.isEmpty ? "\(baseName)-\(index)" : "\(baseName)-\(index).\(fileExtension)"
            destination = directory.appendingPathComponent(indexedFilename, isDirectory: false)
            index += 1
        }

        return destination
    }

    private func complete(_ context: NSExtensionContext, message: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: message]
        } else {
            response.userInfo = ["message": message]
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

}
