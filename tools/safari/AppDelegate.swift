import Cocoa
import Sparkle

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    private let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSMenuItem(title: "Check for Updates…", action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)), keyEquivalent: "")
        item.target = updater
        NSApp.mainMenu?.items.first?.submenu?.insertItem(item, at: 1)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(URL(string: "xvdl://check-for-updates")!) else { return }
        DispatchQueue.main.async {
            if self.updater.updater.canCheckForUpdates {
                self.updater.checkForUpdates(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
