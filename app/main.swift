//
// zcode-dream-skin/app/main.swift
// ZCode Dream Skin 菜单栏常驻程序（LSUIElement，无 Dock 图标）。
// 复用 bundle 内 engine（scripts/*.mjs），通过 /bin/zsh -lc 调 node 执行。
// @author DamonYanglong
// @date 2026/09/18
//

import AppKit

// ---------- 路径与常量 ----------
let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("ZCodeDreamSkin")
let userThemesDir = appSupport.appendingPathComponent("themes", isDirectory: true)
let stateFile = appSupport.appendingPathComponent("current-theme")

let engineURL: URL = {
    Bundle.main.resourceURL?.appendingPathComponent("engine", isDirectory: true)
        ?? URL(fileURLWithPath: "engine")
}()
let scriptsDir = engineURL.appendingPathComponent("scripts")

// ---------- 主题发现 ----------
struct Theme { let id: String; let name: String; let dir: URL }

func readThemes(in dir: URL) -> [Theme] {
    guard let subs = try? FileManager.default.contentsOfDirectory(
        at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) else { return [] }
    return subs.compactMap { sub -> Theme? in
        let meta = sub.appendingPathComponent("theme.json")
        guard let data = try? Data(contentsOf: meta),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let id = obj["id"] as? String else { return nil }
        return Theme(id: id, name: obj["name"] as? String ?? id, dir: sub)
    }.sorted { $0.name < $1.name }
}

func allThemes() -> [Theme] {
    // 用户目录优先，同 id 覆盖内置
    var map = [String: Theme]()
    for t in readThemes(in: engineURL.appendingPathComponent("themes", isDirectory: true)) { map[t.id] = t }
    for t in readThemes(in: userThemesDir) { map[t.id] = t }
    return map.values.sorted { $0.name < $1.name }
}

func currentThemeId() -> String? {
    (try? String(contentsOf: stateFile, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
}

// ---------- 引擎调用 ----------
func runEngine(script: String, args: String, completion: @escaping (String?) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        // login shell 以继承用户 PATH 找到 node；主题与状态都指向用户支持目录
        p.arguments = ["-lc", "node \"\(scriptsDir.path)/\(script)\" \(args) 2>&1"]
        var env = ProcessInfo.processInfo.environment
        env["ZDS_THEMES_DIR"] = userThemesDir.path
        env["ZDS_STATE_DIR"] = appSupport.path
        // login shell 不一定含 Homebrew 路径，显式补全以找到 node
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin")
        p.environment = env
        let out = Pipe()
        p.standardOutput = out
        p.standardError = out
        do {
            try p.run()
            p.waitUntilExit()
            let data = out.fileHandleForReading.readDataToEndOfFile()
            let text = String(data: data, encoding: .utf8) ?? ""
            if p.terminationStatus == 0 {
                completion(nil)
            } else {
                completion(String(text.prefix(600)))
            }
        } catch {
            completion("无法执行: \(script)\n\(error.localizedDescription)")
        }
    }
}

func alert(_ title: String, _ body: String) {
    NSApp.activate(ignoringOtherApps: true)
    let a = NSAlert()
    a.messageText = title
    a.informativeText = body
    a.alertStyle = .warning
    a.runModal()
}

// ---------- 菜单栏 app ----------
final class MenuController: NSObject, NSMenuDelegate {
    var statusItem: NSStatusItem?
    let menu = NSMenu()

    override init() {
        super.init()
        menu.delegate = self
        menu.autoenablesItems = false
    }

    /// 必须在 app 完成启动（runloop 转起来）之后再创建 status item：
    /// 过早创建会拿到陈旧坐标（实测落在所有显示器之外，永不纠正）。
    func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = item.button {
            if let img = NSImage(systemSymbolName: "paintpalette", accessibilityDescription: "ZCode Dream Skin") {
                img.isTemplate = true
                button.image = img
            } else {
                button.title = "ZDS"
            }
        }
        item.menu = menu
        statusItem = item
    }

    // 每次打开菜单时重建：主题列表/当前勾选保持新鲜
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let themes = allThemes()
        let current = currentThemeId()

        let title = NSMenuItem(title: "ZCode Dream Skin", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        let status = NSMenuItem(
            title: current == nil ? "状态：官方外观" : "当前主题：\(current!)",
            action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        menu.addItem(.separator())

        let section = NSMenuItem(title: "切换主题", action: nil, keyEquivalent: "")
        section.isEnabled = false
        menu.addItem(section)
        if themes.isEmpty {
            let none = NSMenuItem(title: "（无主题，先导入）", action: nil, keyEquivalent: "")
            none.isEnabled = false
            menu.addItem(none)
        }
        for t in themes {
            let item = NSMenuItem(title: t.name, action: #selector(applyTheme(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = t.id
            item.state = (t.id == current) ? .on : .off
            menu.addItem(item)
        }

        menu.addItem(.separator())
        self.addItem("以换肤模式启动 ZCode…", #selector(startThemed))
        self.addItem("重新注入当前主题", #selector(reapply))
        self.addItem("恢复官方外观", #selector(restore))
        self.addItem("导入 Codex 主题库全部…", #selector(importAll))
        self.addItem("打开主题文件夹", #selector(openThemes))
        menu.addItem(.separator())
        self.addItem("关于 ZCode Dream Skin", #selector(about))
        menu.addItem(.separator())
        self.addItem("退出", #selector(quit))
    }

    private func addItem(_ title: String, _ action: Selector) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    // ---------- actions ----------
    @objc func applyTheme(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        runEngine(script: "apply.mjs", args: "--theme \"\(id)\"") { err in
            DispatchQueue.main.async {
                if let err = err { alert("切换主题失败", err) }
            }
        }
    }

    @objc func startThemed() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", "\"\(scriptsDir.path)/start-themed.sh\" 2>&1"]
        let out = Pipe(); p.standardOutput = out; p.standardError = out
        do { try p.run() } catch { alert("启动失败", error.localizedDescription) }
        DispatchQueue.global(qos: .userInitiated).async {
            p.waitUntilExit()
            let text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            if p.terminationStatus != 0 {
                DispatchQueue.main.async { alert("换肤模式启动失败", String(text.prefix(600))) }
            }
        }
    }

    @objc func reapply() {
        guard let id = currentThemeId() else {
            alert("尚无已应用主题", "请先切换一个主题。")
            return
        }
        runEngine(script: "apply.mjs", args: "--theme \"\(id)\"") { err in
            DispatchQueue.main.async { if let err = err { alert("重新注入失败", err) } }
        }
    }

    @objc func restore() {
        runEngine(script: "restore.mjs", args: "") { err in
            DispatchQueue.main.async { if let err = err { alert("恢复失败", err) } }
        }
    }

    @objc func importAll() {
        runEngine(script: "import-theme.mjs", args: "--all") { err in
            DispatchQueue.main.async {
                if let err = err { alert("导入失败", err) }
                else { alert("导入完成", "Codex 主题库已全部转换为 ZCode 主题（自动配色）。") }
            }
        }
    }

    @objc func openThemes() {
        try? FileManager.default.createDirectory(at: userThemesDir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(userThemesDir)
    }

    @objc func about() {
        alert("ZCode Dream Skin",
              "给 ZCode 桌面端换肤的非官方小工具。\n本机回环 CDP 注入，不修改官方安装包。\n\n感谢 Codex Dream Skin 的工程范式与主题资产。")
    }

    @objc func quit() { NSApp.terminate(nil) }
}

// ---------- 启动 ----------
let app = NSApplication.shared
let controller = MenuController()
app.setActivationPolicy(.accessory)
// runloop 转起来后再装 status item，确保拿到正确的屏幕坐标
DispatchQueue.main.async { controller.installStatusItem() }
app.run()
