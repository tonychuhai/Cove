// The aquarium as a desktop wallpaper.
//
// One borderless window per screen sits at the desktop window level: above the still
// wallpaper picture, below the desktop icons, so files and folders stay on top of the
// water and keep working normally. The scene comes from a web view fed by the copy of
// the aquarium inside this app bundle, served over a private scheme so its module
// imports resolve the way they do from a web server.
//
// The window never takes mouse events. The pointer reaches the fish another way: the
// global cursor position is read on a timer and handed to the page as a pointer move,
// so clicking and dragging on the desktop still belongs to the Finder.

import Cocoa
import WebKit
import IOKit.ps

let sceneScheme = "cove"
let sceneHost = "local"

/// The scenes the app can show. Each lives in scenes/<id>/ with a wallpaper.html; the
/// choice is kept in UserDefaults and survives a restart.
struct Habitat {
  let id: String
  let title: String
  let symbol: String
}
let habitats = [
  Habitat(id: "riverscape", title: "Riverscape", symbol: "fish"),
  Habitat(id: "bunny", title: "Bunny", symbol: "hare"),
  Habitat(id: "muse", title: "Muse · 互动换装", symbol: "tshirt"),
  Habitat(id: "critters", title: "Critters · 纸上小伙伴", symbol: "pawprint"),
]
var currentHabitat: Habitat {
  let id = UserDefaults.standard.string(forKey: "scene") ?? habitats[0].id
  return habitats.first { $0.id == id } ?? habitats[0]
}
var scenePage: String { "/scenes/\(currentHabitat.id)/wallpaper.html" }

/// What a scene remembers between runs, for scenes that keep a companion: the page sends
/// its state through the `state` message handler and gets it back as
/// `window.habitatSavedState` on the next load. The web view itself keeps no site data.
final class StateStore: NSObject, WKScriptMessageHandler {
  static let shared = StateStore()
  private static func key(_ habitat: Habitat) -> String { "petState.\(habitat.id)" }
  func saved(for habitat: Habitat) -> String? {
    UserDefaults.standard.string(forKey: Self.key(habitat))
  }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard let text = message.body as? String else { return }
    UserDefaults.standard.set(text, forKey: Self.key(currentHabitat))
  }
  /// A script that hands the saved state to the page before any of its own code runs.
  func injection(for habitat: Habitat) -> WKUserScript {
    let encoded = saved(for: habitat).flatMap { $0.data(using: .utf8)?.base64EncodedString() } ?? ""
    return WKUserScript(
      source: """
        (() => {
          const encoded = "\(encoded)";
          if (!encoded) return;
          try {
            const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
            window.habitatSavedState = new TextDecoder().decode(bytes);
          } catch (error) { console.warn('saved state unreadable', error); }
        })();
        """,
      injectionTime: .atDocumentStart, forMainFrameOnly: true)
  }
}

/// Serves the bundled copy of the aquarium to the web view.
final class SceneHandler: NSObject, WKURLSchemeHandler {
  private let root: URL
  private static let types = [
    "html": "text/html",
    "js": "text/javascript",
    "css": "text/css",
    "json": "application/json",
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "bin": "application/octet-stream",
    "gltf": "model/gltf+json",
    "glb": "model/gltf-binary",
  ]

  init(root: URL) { self.root = root.standardizedFileURL }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    let path = url.path == "" || url.path == "/" ? scenePage : url.path
    let file = root.appendingPathComponent(path).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
      task.didFailWithError(
        NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
      return
    }
    let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
    // A real HTTP response, so that fetch() and Three's loaders see a 200 rather than
    // the status 0 a bare URLResponse reports, which they treat as failure.
    let response =
      HTTPURLResponse(
        url: url, statusCode: 200, httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": type, "Content-Length": String(data.count)])
      ?? URLResponse(url: url, mimeType: type, expectedContentLength: data.count, textEncodingName: nil)
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Puts whatever the page complains about into the agent's log.
final class Reporter: NSObject, WKScriptMessageHandler {
  static let shared = Reporter()
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    NSLog("cove page: \(message.body)")
  }
}

/// The left-rail buttons ask the host to rebuild around another scene.
final class ScenePicker: NSObject, WKScriptMessageHandler {
  static let shared = ScenePicker()
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard let id = message.body as? String else { return }
    // Not from inside the web view's own callback: the switch tears that view down.
    DispatchQueue.main.async { Controller.shared?.applyScene(id) }
  }
}

/// A window that keeps the exact frame it is given. AppKit insets ordinary windows from
/// the screen edges; a wallpaper has to reach them.
final class DesktopWindow: NSWindow {
  override func constrainFrameRect(_ rect: NSRect, to screen: NSScreen?) -> NSRect { rect }
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

/// One screen's worth of aquarium.
final class Wallpaper: NSObject, WKNavigationDelegate {
  let window: DesktopWindow
  let view: WKWebView
  private var loaded = false
  private var inside = false
  private var rate = 0
  private var battery = false
  private var readyHandlers: [() -> Void] = []
  private var ready = false
  private var readyPolls = 0
  private let born = ProcessInfo.processInfo.systemUptime
  private let sceneID = currentHabitat.id

  /// Invisible until told otherwise, so a scene that takes seconds to compile can be
  /// brought up behind the one it replaces and shown only once it has a frame to show.
  init(screen: NSScreen, root: URL, concealed: Bool = false) {
    let settings = WKWebViewConfiguration()
    settings.setURLSchemeHandler(SceneHandler(root: root), forURLScheme: sceneScheme)
    settings.suppressesIncrementalRendering = true
    // The page holds no state worth keeping between runs and should never leave traces.
    settings.websiteDataStore = .nonPersistent()
    // The agent has no window to look at, so anything the page reports goes to the log.
    settings.userContentController.addUserScript(
      WKUserScript(
        source: """
          const report = (text) => webkit.messageHandlers.report.postMessage(String(text));
          for (const level of ['error', 'warn']) {
            const original = console[level];
            console[level] = (...parts) => {
              report(parts.map((part) => part && part.stack ? part.stack : part).join(' '));
              original.apply(console, parts);
            };
          }
          addEventListener('error', (event) =>
            report(`${event.message} at ${event.filename}:${event.lineno}`));
          addEventListener('unhandledrejection', (event) => report(event.reason));
          """,
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    // A pointer move the page can read, sent from the global cursor position.
    settings.userContentController.addUserScript(
      WKUserScript(
        source: """
          window.habitatPointerCount = 0;
          window.habitatPointer = (x, y) => {
            const canvas = document.querySelector('#scene');
            window.habitatPointerCount++;
            if (canvas)
              canvas.dispatchEvent(
                new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
          };
          window.habitatPointerOut = () => {
            const canvas = document.querySelector('#scene');
            if (canvas) canvas.dispatchEvent(new PointerEvent('pointerleave'));
          };
          """,
        injectionTime: .atDocumentStart, forMainFrameOnly: true))

    settings.userContentController.addUserScript(StateStore.shared.injection(for: currentHabitat))

    view = WKWebView(frame: screen.frame, configuration: settings)
    settings.userContentController.add(Reporter.shared, name: "report")
    settings.userContentController.add(StateStore.shared, name: "state")
    settings.userContentController.add(ScenePicker.shared, name: "scene")
    // WebKit stops a page whose window it thinks is covered, and AppKit never reports a
    // background agent's window as visible, so the scene would never start. This asks
    // WebKit not to make that call; the agent works out what is covered instead.
    if view.responds(to: NSSelectorFromString("setWindowOcclusionDetectionEnabled:"))
      || view.responds(to: NSSelectorFromString("_setWindowOcclusionDetectionEnabled:"))
    {
      view.setValue(false, forKey: "windowOcclusionDetectionEnabled")
    }
    if currentHabitat.id == "critters" {
      view.underPageBackgroundColor = NSColor(calibratedRed: 0.91, green: 0.89, blue: 0.84, alpha: 1)
    } else if currentHabitat.id == "muse" {
      view.underPageBackgroundColor = NSColor(calibratedRed: 0.92, green: 0.91, blue: 0.89, alpha: 1)
    } else if currentHabitat.id == "bunny" {
      view.underPageBackgroundColor = NSColor(calibratedRed: 0.79, green: 0.85, blue: 0.93, alpha: 1)
    } else {
      view.underPageBackgroundColor = NSColor(calibratedRed: 0.031, green: 0.055, blue: 0.047, alpha: 1)
    }
    view.autoresizingMask = [.width, .height]

    window = DesktopWindow(
      contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false,
      screen: screen)
    super.init()

    view.navigationDelegate = self
    window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
    window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
    window.ignoresMouseEvents = true
    window.isOpaque = true
    window.hasShadow = false
    window.backgroundColor = NSColor(calibratedRed: 0.031, green: 0.055, blue: 0.047, alpha: 1)
    window.isReleasedWhenClosed = false
    window.contentView = view
    // Hiding the agent, or another app's "Hide Others", must not take the water away.
    window.canHide = false
    window.setFrame(screen.frame, display: true)
    if concealed { window.alphaValue = 0 }
    window.orderFrontRegardless()

    view.load(URLRequest(url: URL(string: "\(sceneScheme)://\(sceneHost)\(scenePage)")!))
  }

  /// Runs once the page has drawn its first frame, or after a generous wait if it never
  /// says so. Called straight away if that has already happened.
  func whenReady(_ handler: @escaping () -> Void) {
    if ready { handler() } else { readyHandlers.append(handler) }
  }

  /// Fades the window in over the scene beneath it.
  func reveal() {
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.45
      window.animator().alphaValue = 1
    }
  }

  private func becomeReady() {
    guard !ready else { return }
    ready = true
    NSLog("cove: \(sceneID) showed its first frame after %.1f s", ProcessInfo.processInfo.systemUptime - born)
    // A page with a frame has certainly defined its hooks: make sure it has the state.
    send()
    let handlers = readyHandlers
    readyHandlers = []
    for handler in handlers { handler() }
  }

  /// The scenes cover themselves with #loading until their first frame, then start
  /// fading it. The moment the fade is asked for is the moment there is a picture; a
  /// page without such a cover is ready as soon as it has loaded.
  private func pollReady() {
    readyPolls += 1
    view.evaluateJavaScript(
      """
      (() => {
        const loading = document.querySelector('#loading');
        if (!loading || loading.hidden || loading.style.opacity === '0') return true;
        const style = getComputedStyle(loading);
        return style.display === 'none' || style.opacity === '0';
      })()
      """
    ) { [weak self] value, _ in
      guard let self else { return }
      if value as? Bool == true || self.readyPolls > 150 {
        self.becomeReady()
      } else {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.pollReady() }
      }
    }
  }

  func close() {
    NotificationCenter.default.removeObserver(self)
    view.navigationDelegate = nil
    view.configuration.userContentController.removeAllUserScripts()
    view.configuration.userContentController.removeScriptMessageHandler(forName: "report")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "state")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "scene")
    view.removeFromSuperview()
    window.contentView = nil
    window.orderOut(nil)
    window.close()
  }

  /// Send only state changes. didFinish resends once after navigation, so there is no
  /// need to cross the WebKit process boundary every second with an unchanged rate.
  @discardableResult
  func setRate(_ wanted: Int) -> Bool {
    guard wanted != rate else { return false }
    rate = wanted
    if rate == 0 && inside {
      if loaded { view.evaluateJavaScript("habitatPointerOut()") }
      inside = false
    }
    NSLog("cove: \(rate) fps")
    send()
    return true
  }

  func setPower(_ onBattery: Bool) {
    guard battery != onBattery else { return }
    battery = onBattery
    send()
  }

  /// The page only learns the rate when it changes, so one delivery has to land. A page
  /// that has finished loading may still be evaluating its module script; until it has
  /// defined the hooks, the state is offered again a moment later.
  private var resending = false
  private var resends = 0
  private func send() {
    guard loaded, !resending else { return }
    view.evaluateJavaScript(
      """
      (() => {
        if (typeof habitatRate !== 'function') return false;
        typeof habitatPower === 'function' && habitatPower(\(battery ? "true" : "false"));
        habitatRate(\(rate));
        return true;
      })()
      """
    ) { [weak self] value, _ in
      guard let self, value as? Bool != true else { return }
      self.resends += 1
      if self.resends == 1 { NSLog("cove: \(self.sceneID) was not listening yet; the rate will be offered again") }
      guard self.resends <= 300 else { return }
      self.resending = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
        guard let self else { return }
        self.resending = false
        self.send()
      }
    }
  }

  /// A pinch of food on the water, asked for from the menu rather than by clicking. The
  /// window never takes a mouse event, so there is no cursor position to drop it at: the
  /// page picks its own spot on the surface. Nothing is sent while the scene is stopped,
  /// where the food would only pile up unseen until it started again.
  func feed() {
    guard loaded, rate > 0 else { return }
    view.evaluateJavaScript("typeof habitatFeed === 'function' && habitatFeed()")
  }

  /// A cursor position in this screen's coordinates, or nil when the cursor left it.
  func setPointer(_ point: NSPoint?) {
    guard loaded, rate > 0 else { return }
    guard let point else {
      if inside { view.evaluateJavaScript("habitatPointerOut()") }
      inside = false
      return
    }
    inside = true
    view.evaluateJavaScript(
      "habitatPointer(\(String(format: "%.1f", point.x)),\(String(format: "%.1f", point.y)))")
  }

  /// A short tap on bare desktop. Delivered even while the scene holds still behind
  /// windows, so the left rail can always change scenes; each scene decides for itself
  /// whether anything else should happen while it is stopped.
  func click(at point: NSPoint) {
    guard loaded else { return }
    view.evaluateJavaScript(
      "typeof habitatClick === 'function' && habitatClick(\(String(format: "%.1f", point.x)),\(String(format: "%.1f", point.y)))")
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    send()
    pollReady()
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    NSLog("cove: the scene did not load: \(error.localizedDescription)")
    becomeReady()
  }

  /// What the page thinks it is doing, for the log.
  func probe() {
    view.evaluateJavaScript(
      """
      (() => {
        const canvas = document.querySelector('#scene');
        const context = canvas && canvas.getContext('webgl2');
        const loading = document.querySelector('#loading');
        const stats = typeof habitatStats === 'function' ? habitatStats() : null;
        return JSON.stringify({
          pixels: canvas && [canvas.width, canvas.height],
          covered: Boolean(loading && !loading.hidden),
          webgl2: Boolean(context),
          gpu: context && context.getParameter(context.RENDERER),
          hidden: document.hidden,
          pointers: window.habitatPointerCount,
          frames: stats && stats.renderedFrames,
          loop: stats && stats.loop,
        });
      })()
      """
    ) { value, error in
      NSLog("cove page state: \(value ?? error?.localizedDescription ?? "unreadable")")
    }
  }

  /// Whether the page has given up and is showing its error instead of a scene.
  func showingError(_ done: @escaping (Bool) -> Void) {
    view.evaluateJavaScript("Boolean(document.querySelector('#loading[role=\"alert\"]'))") { value, _ in
      done(value as? Bool ?? true)
    }
  }

  /// What this screen is showing right now. The agent has no window of its own to look
  /// at, so this is how it can be checked.
  func snapshot(to file: URL, then done: @escaping () -> Void) {
    view.takeSnapshot(with: nil) { image, _ in
      defer { done() }
      guard let image, let data = image.tiffRepresentation,
        let png = NSBitmapImageRep(data: data)?.representation(using: .png, properties: [:])
      else { return }
      try? png.write(to: file)
      NSLog("cove: wrote \(file.path)")
    }
  }
}

final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {
  static var shared: Controller?
  private var screens: [Wallpaper] = []
  private var root = Bundle.main.resourceURL!.appendingPathComponent("scene")
  private var awake = true
  private var layout: [CGRect] = []
  private var lastPoint = NSPoint(x: -1e4, y: -1e4)
  private var leftWasDown = false
  private var desktopPress: (point: NSPoint, time: TimeInterval)?
  private var snapshots: DispatchSourceSignal?
  private var status: NSStatusItem?
  private let state = NSMenuItem()
  private let pause = NSMenuItem()
  private let feed = NSMenuItem()
  private let sceneMenu = NSMenuItem()
  private var applied = 0
  private var pointerTimer: Timer?
  private var pointerRate = 0
  private var exposureTimer: Timer?
  /// The choice outlives a restart, so a paused tank is still paused after logging in.
  /// Until one has been made there is nothing under the key at all, which is what lets a
  /// machine that asks for less motion start still without overruling anybody who has
  /// since decided otherwise.
  private var stopped =
    UserDefaults.standard.object(forKey: "paused") as? Bool ?? reduceMotion
  private var lowPower: Bool { ProcessInfo.processInfo.isLowPowerModeEnabled }
  /// Reduce Motion is a durable choice about the whole machine, not a passing shortage
  /// like Low Power Mode, so it decides how the wallpaper starts and never more than that:
  /// somebody who installed an animated wallpaper is allowed to want it anyway.
  private static var reduceMotion: Bool {
    NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
  }
  private var reduceMotion: Bool { Controller.reduceMotion }

  func applicationDidFinishLaunching(_ note: Notification) {
    Controller.shared = self
    build()
    addMenu()

    let center = NotificationCenter.default
    center.addObserver(
      self, selector: #selector(screensChanged),
      name: NSApplication.didChangeScreenParametersNotification, object: nil)

    // Drawing while the display is off, asleep or locked would only cost power.
    let workspace = NSWorkspace.shared.notificationCenter
    for (name, value) in [
      (NSWorkspace.screensDidSleepNotification, false),
      (NSWorkspace.screensDidWakeNotification, true),
      (NSWorkspace.sessionDidResignActiveNotification, false),
      (NSWorkspace.sessionDidBecomeActiveNotification, true),
    ] {
      workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.awake = value
        self?.applyRate()
      }
    }
    let distributed = DistributedNotificationCenter.default()
    for (name, value) in [("com.apple.screenIsLocked", false), ("com.apple.screenIsUnlocked", true)]
    {
      distributed.addObserver(forName: .init(name), object: nil, queue: .main) { [weak self] _ in
        self?.awake = value
        self?.applyRate()
      }
    }

    // Low Power Mode holds the scene still, like any other reason not to draw.
    NotificationCenter.default.addObserver(
      forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main
    ) { [weak self] _ in self?.applyRate() }

    // Turning Reduce Motion on mid-session stops the water for the same reason it starts
    // stopped under it, unless the tank has already been asked for deliberately.
    workspace.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self, UserDefaults.standard.object(forKey: "paused") == nil else { return }
      self.stopped = self.reduceMotion
      self.applyRate()
    }

    // Running on the battery halves the frame rate; the scene is slow enough to hold up.
    if let source = IOPSNotificationCreateRunLoopSource({ _ in
      DispatchQueue.main.async { Controller.shared?.applyRate() }
    }, nil)?.takeRetainedValue() {
      CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode)
    }

    // `kill -USR1` writes what the first screen is showing to /tmp/cove.png.
    signal(SIGUSR1, SIG_IGN)
    snapshots = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
    snapshots?.setEventHandler { [weak self] in self?.snapshot() }
    snapshots?.resume()
  }

  /// Draws for a moment even if the desktop is covered, then saves the frame.
  private func snapshot() {
    guard let first = screens.first else { return }
    for screen in screens { screen.setRate(60) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
      first.probe()
      first.snapshot(to: URL(fileURLWithPath: "/tmp/cove.png")) {
        self?.applyRate()
      }
    }
  }

  // MARK: - The still picture

  /// The desktop picture under the live layer is what the lock screen, Mission Control
  /// and Stage Manager show, so it follows the scene: a frame is taken a few seconds after
  /// each change, once the scene has settled. Always a new file, because the lock screen
  /// caches the picture by path and would keep an old frame if the same file were
  /// rewritten. Off with `defaults write com.tonyzhu.cove still -bool false`.
  private var stillWork: DispatchWorkItem?
  private var stillFolder: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Cove/still", isDirectory: true)
  }
  private func scheduleStill() {
    guard UserDefaults.standard.object(forKey: "still") as? Bool ?? true else { return }
    stillWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.captureStill() }
    stillWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
  }
  private func captureStill() {
    guard let first = screens.first else { return }
    // A scene that failed to load must not become the lock screen.
    first.showingError { [weak self] failed in
      guard let self, !failed, self.screens.first === first else { return }
      let folder = self.stillFolder
      let files = FileManager.default
      try? files.createDirectory(at: folder, withIntermediateDirectories: true)
      let file = folder.appendingPathComponent("\(currentHabitat.id)-\(Int(Date().timeIntervalSince1970)).png")
      first.snapshot(to: file) {
        guard files.fileExists(atPath: file.path) else { return }
        for screen in NSScreen.screens {
          try? NSWorkspace.shared.setDesktopImageURL(file, for: screen, options: [:])
        }
        for old in (try? files.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        where old.lastPathComponent != file.lastPathComponent {
          try? files.removeItem(at: old)
        }
      }
    }
  }

  // Putting a full-screen window on a screen is itself a screen-parameter change, so the
  // arrangement is compared before anything is rebuilt.
  @objc private func screensChanged() {
    guard NSScreen.screens.map(\.frame) != layout else { return }
    build()
  }

  private func build() {
    desktopPress = nil
    leftWasDown = NSEvent.pressedMouseButtons & 1 != 0
    layout = NSScreen.screens.map(\.frame)
    for screen in screens + retiring { screen.close() }
    retiring = []
    screens = NSScreen.screens.map { Wallpaper(screen: $0, root: root) }
    applyRate()
    screens.first?.whenReady { [weak self] in self?.scheduleStill() }
  }

  /// A scene change the person is watching. The old scene stays up while the new one
  /// loads and compiles behind it; when every screen has a first frame the new one fades
  /// in and the old one goes. Compared with a bare rebuild, nothing goes blank.
  private var retiring: [Wallpaper] = []
  private func crossfade() {
    desktopPress = nil
    leftWasDown = NSEvent.pressedMouseButtons & 1 != 0
    layout = NSScreen.screens.map(\.frame)
    // A switch during a switch: whatever was on its way out goes now.
    for screen in retiring { screen.close() }
    retiring = screens
    screens = NSScreen.screens.map { Wallpaper(screen: $0, root: root, concealed: true) }
    applyRate()
    let arriving = screens
    var waiting = arriving.count
    for screen in arriving {
      screen.whenReady { [weak self] in
        waiting -= 1
        guard waiting == 0, let self, self.screens.first === arriving.first else { return }
        for screen in arriving { screen.reveal() }
        let leaving = self.retiring
        self.retiring = []
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
          for screen in leaving { screen.close() }
        }
        self.scheduleStill()
      }
    }
  }

  private var onBattery: Bool {
    guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
      let kind = IOPSGetProvidingPowerSourceType(blob)?.takeRetainedValue() as String?
    else { return false }
    return kind == kIOPSBatteryPowerValue
  }

  /// Full speed while the wallpaper is in plain sight, a slow beat when windows leave only
  /// part of it showing, and nothing at all behind a full screen of work or a dark display.
  /// Power depends on the machine and display; it must be measured on the target Mac.
  func applyRate() {
    let battery = onBattery
    let full = battery ? 30 : 60
    let still = stopped || lowPower || !awake
    // Read the window list once for all displays, and never while deliberately still.
    let blockers = still ? [] : windowBlockers()
    applied = 0
    var changed = false
    for (index, screen) in screens.enumerated() {
      let showing = index < layout.count ? exposure(layout[index], blockers: blockers) : 1
      let rate = still || showing < 0.15 ? 0 : showing < 0.4 ? 20 : full
      screen.setPower(battery)
      if screen.setRate(rate) { changed = true }
      applied = max(applied, rate)
    }
    if changed { lastPoint = NSPoint(x: -1e4, y: -1e4) }
    updateTimers(pollExposure: !still)
  }

  private func updateTimers(pollExposure: Bool) {
    // Pointer sampling need not outrun the animation. A wallpaper merely resting behind
    // windows keeps a slow beat, so a tap on the left rail still changes the scene; only
    // one that is deliberately still (paused, Low Power Mode, dark display) sleeps.
    let wanted = pollExposure ? max(15, min(30, applied)) : 0
    if wanted != pointerRate {
      desktopPress = nil
      leftWasDown = NSEvent.pressedMouseButtons & 1 != 0
      pointerTimer?.invalidate()
      pointerTimer = nil
      pointerRate = wanted
      if wanted > 0 {
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / Double(wanted), repeats: true) { [weak self] _ in
          self?.trackPointer()
        }
        timer.tolerance = 0.003
        pointerTimer = timer
      }
    }
    if !pollExposure {
      exposureTimer?.invalidate()
      exposureTimer = nil
    } else if exposureTimer == nil {
      // Continue this low-frequency check while merely covered so uncovering resumes.
      let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        self?.applyRate()
      }
      timer.tolerance = 0.25
      exposureTimer = timer
    }
  }

  /// How much of a screen ordinary windows leave uncovered, from none to all of it.
  /// AppKit's own occlusion never reports this agent's windows as visible, hence the
  /// direct look at what is on screen.
  private func windowBlockers() -> [CGRect] {
    guard
      let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID)
        as? [[String: Any]]
    else { return [] }
    let me = ProcessInfo.processInfo.processIdentifier
    // Only ordinary app windows count. The menu bar, the Dock and other system layers
    // hold full-screen windows that are almost entirely transparent.
    return list.compactMap { info -> CGRect? in
      guard info[kCGWindowLayer as String] as? Int == 0,
        info[kCGWindowOwnerPID as String] as? Int32 != me,
        info[kCGWindowAlpha as String] as? Double ?? 0 > 0.95,
        let bounds = info[kCGWindowBounds as String] as? [String: CGFloat]
      else { return nil }
      return CGRect(dictionaryRepresentation: bounds as CFDictionary)
    }
  }

  private func exposure(_ frame: CGRect, blockers: [CGRect]) -> Double {
    guard !blockers.isEmpty else { return 1 }
    let flipped = CGRect(
      x: frame.minX, y: (NSScreen.screens.first?.frame.height ?? frame.maxY) - frame.maxY,
      width: frame.width, height: frame.height)
    let columns = 16, rows = 10
    var free = 0
    for column in 0..<columns {
      for row in 0..<rows {
        let point = CGPoint(
          x: flipped.minX + flipped.width * (Double(column) + 0.5) / Double(columns),
          y: flipped.minY + flipped.height * (Double(row) + 0.5) / Double(rows))
        if !blockers.contains(where: { $0.contains(point) }) { free += 1 }
      }
    }
    return Double(free) / Double(columns * rows)
  }

  // MARK: - The menu bar

  /// The agent's only visible piece: the scene's animal in the menu bar, which can stop
  /// the scene, feed it, or swap it for another.
  private func addMenu() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    status = item
    brandMenuBar()

    let menu = NSMenu()
    menu.delegate = self
    // The items say for themselves when they are available; AppKit's own guess would
    // leave Pause enabled in Low Power Mode, where pressing it would do nothing.
    menu.autoenablesItems = false
    state.isEnabled = false
    menu.addItem(state)
    menu.addItem(.separator())
    feed.title = "Feed"
    feed.target = self
    feed.action = #selector(feedFish)
    menu.addItem(feed)
    pause.target = self
    pause.action = #selector(togglePause)
    menu.addItem(pause)
    menu.addItem(.separator())
    let scenes = NSMenu(title: "Scene")
    for (index, habitat) in habitats.enumerated() {
      let choice = NSMenuItem(title: habitat.title, action: #selector(chooseScene(_:)), keyEquivalent: "")
      choice.target = self
      choice.tag = index
      scenes.addItem(choice)
    }
    sceneMenu.title = "Scene"
    sceneMenu.submenu = scenes
    menu.addItem(sceneMenu)
    menu.addItem(.separator())
    let leave = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
    leave.target = self
    menu.addItem(leave)
    item.menu = menu
    if item.button?.window == nil || !item.isVisible {
      NSLog("cove: the menu bar item did not appear")
    }
  }

  /// The menu bar icon and tooltip follow the scene.
  private func brandMenuBar() {
    guard let item = status else { return }
    let habitat = currentHabitat
    let symbol = NSImage(systemSymbolName: habitat.symbol, accessibilityDescription: "Cove")
      ?? NSImage(systemSymbolName: "leaf", accessibilityDescription: "Cove")
    symbol?.isTemplate = true
    item.button?.image = symbol
    if symbol == nil { item.button?.title = "Cove" }
    item.button?.toolTip = "Cove · \(habitat.title)"
  }

  /// Another scene: remembered, then every screen is rebuilt around it.
  func applyScene(_ id: String) {
    guard habitats.contains(where: { $0.id == id }), id != currentHabitat.id else { return }
    UserDefaults.standard.set(id, forKey: "scene")
    brandMenuBar()
    crossfade()
  }

  @objc private func chooseScene(_ sender: NSMenuItem) {
    guard habitats.indices.contains(sender.tag) else { return }
    applyScene(habitats[sender.tag].id)
  }

  /// Says what the wallpaper is doing, and why, whenever the menu is opened. Most of the
  /// reasons it holds still are deliberate, and unexplained stillness reads as a fault.
  func menuNeedsUpdate(_ menu: NSMenu) {
    state.title =
      lowPower
      ? "Still, for Low Power Mode"
      : stopped
        ? reduceMotion ? "Paused, for Reduce Motion" : "Paused"
        : !awake
          ? "Still, the screen is off"
          : applied == 0
            ? "Resting behind your windows"
            : "Running at \(applied) frames a second"
    pause.title = stopped ? "Resume" : "Pause"
    // In Low Power Mode nothing is going to draw, so the item would be a false promise.
    // Reduce Motion is not the same case: the machine can perfectly well draw, it has
    // merely been asked not to, and Resume is how somebody says they want this one anyway.
    pause.isEnabled = !lowPower
    // Food that nothing is going to draw would sit in still water until the tank started
    // again and then all arrive at once, so Feed says so rather than promising a feeding.
    feed.isEnabled = applied > 0
    feed.title =
      currentHabitat.id == "muse"
      ? "Change outfit · 转身换装"
      : currentHabitat.id == "critters" ? "New friends · 换一批" : "Feed"
    if let scenes = sceneMenu.submenu {
      for item in scenes.items {
        item.state = habitats.indices.contains(item.tag) && habitats[item.tag].id == currentHabitat.id ? .on : .off
      }
    }
  }

  /// Every screen, because each one runs its own tank with its own fish rather than one
  /// scene stretched across them: feeding only the screen the menu bar happens to be on
  /// would leave the others watching an unfed aquarium.
  @objc private func feedFish() {
    for screen in screens { screen.feed() }
  }

  @objc private func togglePause() {
    stopped.toggle()
    UserDefaults.standard.set(stopped, forKey: "paused")
    applyRate()
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  /// The cursor belongs to the Finder, so its position is read rather than captured.
  private func trackPointer() {
    let point = NSEvent.mouseLocation
    trackDesktopTap(at: point)
    guard abs(point.x - lastPoint.x) > 0.2 || abs(point.y - lastPoint.y) > 0.2 else { return }
    lastPoint = point
    for (index, screen) in NSScreen.screens.enumerated() where index < screens.count {
      let frame = screen.frame
      screens[index].setPointer(
        frame.contains(point)
          ? NSPoint(x: point.x - frame.minX, y: frame.maxY - point.y) : nil)
    }
  }

  /// Sample only the button state. No event interception or input permission; Finder
  /// still receives the original click. A drag or a click over an app is ignored.
  private func trackDesktopTap(at point: NSPoint) {
    let down = NSEvent.pressedMouseButtons & 1 != 0
    defer { leftWasDown = down }
    if down && !leftWasDown {
      desktopPress = desktopPointIsExposed(point) ? (point, ProcessInfo.processInfo.systemUptime) : nil
    }
    if down, let start = desktopPress, hypot(point.x - start.point.x, point.y - start.point.y) > 8 {
      desktopPress = nil
    }
    guard !down, leftWasDown, let start = desktopPress else { return }
    desktopPress = nil
    guard ProcessInfo.processInfo.systemUptime - start.time < 0.65,
      hypot(point.x - start.point.x, point.y - start.point.y) <= 8,
      desktopPointIsExposed(point) else { return }
    for (index, screen) in NSScreen.screens.enumerated() where index < screens.count {
      if screen.frame.contains(point) {
        screens[index].click(at: NSPoint(x: point.x - screen.frame.minX, y: screen.frame.maxY - point.y))
      }
    }
  }

  private func desktopPointIsExposed(_ point: NSPoint) -> Bool {
    guard let screen = NSScreen.screens.first(where: { $0.frame.contains(point) }),
      screen.visibleFrame.contains(point) else { return false }
    let flipped = CGPoint(x: point.x, y: (NSScreen.screens.first?.frame.height ?? 0) - point.y)
    return !windowBlockers().contains(where: { $0.contains(flipped) })
  }
}

let application = NSApplication.shared
let controller = Controller()
application.setActivationPolicy(.accessory)
application.delegate = controller
application.run()
