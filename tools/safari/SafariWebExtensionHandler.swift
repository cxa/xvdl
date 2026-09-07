//
//  SafariWebExtensionHandler.swift
//  XVDL Extension
//
//  Created by Realazy on 2026-04-30.
//

import Foundation
import SafariServices
import os.log
import Darwin
import AppKit

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

        guard let payload = message as? [String: Any] else {
            complete(context, message: [
                "ok": false,
                "error": "Unsupported native message."
            ])
            return
        }

        switch payload["type"] as? String {
        case "download": download(payload, context: context)
        case "check-update": checkForUpdate(context)
        case "open-update": openUpdater(context)
        default: complete(context, message: ["ok": false, "error": "Unsupported native message."])
        }
    }

    private func checkForUpdate(_ context: NSExtensionContext) {
        let url = URL(string: "https://github.com/cxa/xvdl/releases/latest/download/appcast.xml")!
        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200,
                  let data, data.count < 1_000_000 else {
                self.complete(context, message: ["ok": false])
                return
            }
            let installedBuild = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0
            guard let version = UpdateFeed.availableVersion(in: data, installedBuild: installedBuild) else {
                self.complete(context, message: ["ok": false])
                return
            }
            self.complete(context, message: ["ok": true, "version": version])
        }.resume()
    }

    private func openUpdater(_ context: NSExtensionContext) {
        let appURL = Bundle.main.bundleURL.appendingPathComponent("../../..").standardizedFileURL
        DispatchQueue.main.async {
            NSWorkspace.shared.open([URL(string: "xvdl://check-for-updates")!], withApplicationAt: appURL, configuration: .init()) { _, error in
                self.complete(context, message: ["ok": error == nil])
            }
        }
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
        guard let downloadsDirectory = userDownloadsDirectory() else {
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

    private func userDownloadsDirectory() -> URL? {
        guard let passwd = getpwuid(getuid()), let home = passwd.pointee.pw_dir else {
            return FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        }

        return URL(fileURLWithPath: String(cString: home), isDirectory: true)
            .appendingPathComponent("Downloads", isDirectory: true)
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

private final class UpdateFeed: NSObject, XMLParserDelegate {
    var build = ""
    var version = ""
    private var element = ""
    private var finished = false

    static func availableVersion(in data: Data, installedBuild: Int) -> String? {
        let feed = UpdateFeed()
        let parser = XMLParser(data: data)
        parser.shouldResolveExternalEntities = false
        parser.delegate = feed
        guard parser.parse(), let build = Int(feed.build.trimmingCharacters(in: .whitespacesAndNewlines)), build > 0 else { return nil }
        let version = feed.version.trimmingCharacters(in: .whitespacesAndNewlines)
        guard version.range(of: #"^\d{6}\.\d+$"#, options: .regularExpression) != nil else { return nil }
        return build > installedBuild ? version : ""
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        element = elementName
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard !finished else { return }
        if element == "sparkle:version" { build += string }
        if element == "sparkle:shortVersionString" { version += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName: String?) {
        // ponytail: the release feed contains one stable update; select compatible items if channels are added.
        if elementName == "item" { finished = true }
        element = ""
    }
}
