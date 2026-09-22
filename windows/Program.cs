using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Windows.System.Power;

namespace Cove;

/// <summary>
/// Cove as a Windows desktop.
///
/// One borderless window per screen is parented under the icons, the same place the Mac
/// app uses the desktop window level for: files and folders stay on top and keep working.
/// The scene is the shared wallpaper page, in WebView2. The window does not take mouse
/// events. The cursor is read on a timer, and a short tap on bare desktop is observed
/// with a low-level hook that does not swallow the click, so Explorer still gets it.
/// </summary>
internal static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            using var mutex = new Mutex(true, @"Local\CoveWallpaper", out var created);
            if (!created) return;
            Application.Run(new CoveApp());
        }
        catch (AbandonedMutexException)
        {
            Application.Run(new CoveApp());
        }
        catch (FileNotFoundException error)
        {
            MessageBox.Show(error.Message, "Cove");
        }
    }
}

internal sealed record Habitat(string Id, string Title, string Emoji, Color Background);

internal sealed class CoveApp : ApplicationContext
{
    // The same four scenes as wallpaper/Wallpaper.swift. A new scene is registered in both.
    static readonly Habitat[] Habitats =
    [
        new("riverscape", "Riverscape", "🐟", Color.FromArgb(255, 8, 14, 12)),
        new("bunny", "Bunny", "🐇", Color.FromArgb(255, 201, 217, 237)),
        new("muse", "Muse · 互动换装", "👗", Color.FromArgb(255, 235, 232, 227)),
        new("critters", "Critters · 纸上小伙伴", "🐾", Color.FromArgb(255, 232, 227, 214)),
    ];

    readonly Settings settings = Settings.Load();
    readonly NotifyIcon tray = new();
    readonly Dictionary<string, Icon> icons = [];
    readonly ToolStripMenuItem stateItem = new() { Enabled = false };
    readonly ToolStripMenuItem feedItem = new();
    readonly ToolStripMenuItem pauseItem = new();
    readonly List<WallpaperForm> screens = [];
    readonly List<WallpaperForm> retiring = [];
    readonly string sceneRoot = SceneRoot();
    readonly PowerSignals power = new();
    readonly ToolStripMenuItem sceneMenu = new("Scene");
    SynchronizationContext? ui;
    Habitat current;
    DesktopHost host;
    string layoutKey = "";
    bool building;
    bool runtimeMissing;
    bool awake = true;
    bool stopped;
    int applied;
    int pointerRate = -1;
    int drag = 8;
    Point lastPoint = new(-100000, -100000);
    (Point Point, long Time)? press;
    System.Windows.Forms.Timer? pointerTimer;
    System.Windows.Forms.Timer? exposureTimer;
    System.Windows.Forms.Timer? watch;
    System.Windows.Forms.Timer? stillTimer;
    CoreWebView2Environment? environment;
    IntPtr hook;
    Native.HookProc? hookProc;

    public CoveApp()
    {
        ui = SynchronizationContext.Current;
        current = Habitats.FirstOrDefault(item => item.Id == settings.Scene) ?? Habitats[0];
        stopped = settings.Paused ?? AnimationsOff();
        Log.Write($"cove: windows host, scene {current.Id}, paused {stopped}");
        BuildTray();
        InstallHook();
        power.DisplayOn += on => OnUi(() =>
        {
            awake = on;
            ApplyRate();
        });
        SystemEvents.SessionSwitch += (_, e) => OnUi(() =>
        {
            if (e.Reason is SessionSwitchReason.SessionLock or SessionSwitchReason.SessionLogoff) awake = false;
            else if (e.Reason is SessionSwitchReason.SessionUnlock or SessionSwitchReason.SessionLogon) awake = true;
            ApplyRate();
        });
        SystemEvents.PowerModeChanged += (_, e) => OnUi(() =>
        {
            if (e.Mode == PowerModes.Suspend) awake = false;
            else if (e.Mode == PowerModes.Resume) awake = true;
            ApplyRate();
        });
        SystemEvents.DisplaySettingsChanged += (_, _) => OnUi(Rebuild);
        Application.Idle += FirstFrame;
    }

    void FirstFrame(object? sender, EventArgs e)
    {
        Application.Idle -= FirstFrame;
        ui = SynchronizationContext.Current ?? ui;
        Rebuild();
        watch = new System.Windows.Forms.Timer { Interval = 2000 };
        watch.Tick += (_, _) => Watch();
        watch.Start();
    }

    void Watch()
    {
        if (building || runtimeMissing) return;
        var alive = host.Parent != IntPtr.Zero && Native.IsWindow(host.Parent);
        if (!alive || LayoutKey() != layoutKey) Rebuild();
        else Restack();
    }

    void Rebuild()
    {
        if (building) return;
        building = true;
        try
        {
            host = Desktop.Find();
            layoutKey = LayoutKey();
            drag = Math.Max(8, (int)(8 * Native.GetDpiForSystem() / 96.0));
            CloseAll(screens);
            CloseAll(retiring);
            screens.Clear();
            retiring.Clear();
            if (host.Parent == IntPtr.Zero) return;
            screens.AddRange(Make(behind: false));
            Open(screens);
        }
        finally { building = false; }
    }

    void Crossfade()
    {
        if (host.Parent == IntPtr.Zero)
        {
            Rebuild();
            return;
        }
        CloseAll(retiring);
        retiring.Clear();
        retiring.AddRange(screens);
        screens.Clear();
        screens.AddRange(Make(behind: true));
        Open(screens);
    }

    List<WallpaperForm> Make(bool behind)
    {
        var born = new List<WallpaperForm>();
        foreach (var screen in Screen.AllScreens)
        {
            settings.Pets.TryGetValue(current.Id, out var saved);
            var wall = new WallpaperForm(current, sceneRoot, saved, OnPageMessage);
            wall.Attach(host, screen);
            if (behind)
            {
                var previous = retiring.FirstOrDefault(item => item.DeviceName == screen.DeviceName);
                if (previous is { IsHandleCreated: true }) wall.PlaceBehind(previous.Handle);
            }
            born.Add(wall);
        }
        return born;
    }

    async void Open(List<WallpaperForm> born)
    {
        try
        {
            if (runtimeMissing) return;
            if (environment == null)
            {
                var folder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cove", "WebView2");
                Directory.CreateDirectory(folder);
                environment = await CoreWebView2Environment.CreateAsync(null, folder);
            }
            var waiting = born.Count;
            foreach (var wall in born)
            {
                wall.WhenReady(() =>
                {
                    waiting--;
                    if (waiting > 0 || screens.Count == 0 || !born.Contains(screens[0])) return;
                    CloseAll(retiring);
                    retiring.Clear();
                    Restack();
                    ScheduleStill();
                });
            }
            ApplyRate();
            await Task.WhenAll(born.Select(wall => wall.Init(environment)));
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MissingRuntime();
        }
        catch (Exception error)
        {
            Log.Write("cove: " + error);
        }
    }

    void Restack()
    {
        if (!host.Raised || host.Below == IntPtr.Zero || retiring.Count > 0) return;
        foreach (var wall in screens)
        {
            if (!wall.IsHandleCreated || !IsAbove(wall.Handle, host.Below)) continue;
            Native.SetWindowPos(
                wall.Handle, host.Below, 0, 0, 0, 0,
                Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
        }
    }

    static bool IsAbove(IntPtr hwnd, IntPtr other)
    {
        for (var cursor = Native.GetWindow(other, Native.GW_HWNDPREV); cursor != IntPtr.Zero;
             cursor = Native.GetWindow(cursor, Native.GW_HWNDPREV))
        {
            if (cursor == hwnd) return true;
        }
        return false;
    }

    void ApplyScene(string id)
    {
        var next = Habitats.FirstOrDefault(item => item.Id == id);
        if (next == null || next.Id == current.Id) return;
        current = next;
        settings.Scene = id;
        settings.Save();
        Brand();
        Crossfade();
    }

    void OnPageMessage(string habitatId, string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var name = document.RootElement.GetProperty("name").GetString();
            var body = document.RootElement.TryGetProperty("body", out var value) ? value.GetString() ?? "" : "";
            switch (name)
            {
                case "report":
                    Log.Write("cove page: " + body);
                    break;
                case "state":
                    settings.Pets[habitatId] = body;
                    settings.Save();
                    break;
                case "scene":
                    OnUi(() => ApplyScene(body));
                    break;
            }
        }
        catch (Exception error)
        {
            Log.Write("cove: message: " + error.Message);
        }
    }

    void ApplyRate()
    {
        var battery = OnBattery();
        var hold = stopped || EnergySaver() || !awake;
        var blockers = hold ? [] : WindowBlockers();
        var full = battery ? 30 : 60;
        var changed = false;
        applied = 0;
        foreach (var wall in screens)
        {
            var showing = Exposure(wall.ScreenPx, blockers);
            var rate = hold || showing < 0.15 ? 0 : showing < 0.4 ? 20 : full;
            wall.SetPower(battery);
            if (wall.SetRate(rate)) changed = true;
            applied = Math.Max(applied, rate);
        }
        if (changed) lastPoint = new Point(-100000, -100000);
        UpdateTimers(pollExposure: !hold);
    }

    void UpdateTimers(bool pollExposure)
    {
        var wanted = Math.Min(30, applied);
        if (wanted != pointerRate)
        {
            press = null;
            pointerTimer?.Dispose();
            pointerTimer = null;
            pointerRate = wanted;
            if (wanted > 0)
            {
                pointerTimer = new System.Windows.Forms.Timer { Interval = Math.Max(1, 1000 / wanted) };
                pointerTimer.Tick += (_, _) => TrackPointer();
                pointerTimer.Start();
            }
        }
        if (!pollExposure)
        {
            exposureTimer?.Dispose();
            exposureTimer = null;
        }
        else if (exposureTimer == null)
        {
            exposureTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            exposureTimer.Tick += (_, _) => ApplyRate();
            exposureTimer.Start();
        }
    }

    void TrackPointer()
    {
        var point = Cursor.Position;
        if (point == lastPoint) return;
        lastPoint = point;
        foreach (var wall in screens)
            wall.SetPointer(wall.ContainsScreen(point) ? wall.ToClient(point) : null);
    }

    void DeliverTap(Point screen)
    {
        foreach (var wall in screens)
        {
            if (!wall.ContainsScreen(screen)) continue;
            wall.Tap(wall.ToClient(screen));
        }
    }

    void InstallHook()
    {
        hookProc = (code, wParam, lParam) =>
        {
            if (code >= 0)
            {
                var info = Marshal.PtrToStructure<Native.MSLLHOOKSTRUCT>(lParam);
                var point = new Point(info.pt.X, info.pt.Y);
                switch (wParam.ToInt32())
                {
                    case 0x0201: // WM_LBUTTONDOWN
                        press = Desktop.IsBare(point) ? (point, Environment.TickCount64) : null;
                        break;
                    case 0x0200 when press is { } start: // WM_MOUSEMOVE
                        if (Math.Abs(point.X - start.Point.X) > drag || Math.Abs(point.Y - start.Point.Y) > drag)
                            press = null;
                        break;
                    case 0x0202 when press is { } start: // WM_LBUTTONUP
                        press = null;
                        if (Environment.TickCount64 - start.Time < 650 &&
                            Math.Abs(point.X - start.Point.X) <= drag &&
                            Math.Abs(point.Y - start.Point.Y) <= drag &&
                            Desktop.IsBare(point))
                            Post(() => DeliverTap(point));
                        break;
                }
            }
            return Native.CallNextHookEx(hook, code, wParam, lParam);
        };
        hook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, hookProc, Native.GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) Log.Write("cove: the desktop tap hook did not start");
    }

    List<Rectangle> WindowBlockers()
    {
        var blockers = new List<Rectangle>();
        var pid = (uint)Environment.ProcessId;
        Native.EnumWindows((hwnd, _) =>
        {
            if (!Native.IsWindowVisible(hwnd) || Native.IsIconic(hwnd)) return true;
            Native.GetWindowThreadProcessId(hwnd, out var owner);
            if (owner == pid) return true;
            if (Native.DwmGetWindowAttribute(hwnd, 14, out var cloaked, sizeof(int)) == 0 && cloaked != 0) return true;
            var name = Native.ClassName(hwnd);
            if (name is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "SHELLDLL_DefView")
                return true;
            var style = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
            uint colorKey;
            byte alpha;
            uint layerFlags;
            if ((style & Native.WS_EX_LAYERED) != 0 &&
                Native.GetLayeredWindowAttributes(hwnd, out colorKey, out alpha, out layerFlags) &&
                (layerFlags & Native.LWA_ALPHA) != 0 && alpha < 242)
                return true;
            if (!Native.GetWindowRect(hwnd, out var rect)) return true;
            var bounds = rect.ToRectangle();
            if (bounds.Width <= 1 || bounds.Height <= 1) return true;
            blockers.Add(bounds);
            return true;
        }, IntPtr.Zero);
        return blockers;
    }

    static double Exposure(Rectangle screen, List<Rectangle> blockers)
    {
        if (blockers.Count == 0 || screen.Width <= 0 || screen.Height <= 0) return 1;
        const int columns = 16, rows = 10;
        var free = 0;
        for (var column = 0; column < columns; column++)
        {
            for (var row = 0; row < rows; row++)
            {
                var point = new Point(
                    screen.X + (int)(screen.Width * (column + 0.5) / columns),
                    screen.Y + (int)(screen.Height * (row + 0.5) / rows));
                if (!blockers.Any(blocker => blocker.Contains(point))) free++;
            }
        }
        return free / (double)(columns * rows);
    }

    void ScheduleStill()
    {
        stillTimer?.Dispose();
        if (!settings.Still) return;
        stillTimer = new System.Windows.Forms.Timer { Interval = 3000 };
        stillTimer.Tick += async (_, _) =>
        {
            stillTimer?.Dispose();
            try { await CaptureStill(); }
            catch (Exception error) { Log.Write("cove: still picture: " + error.Message); }
        };
        stillTimer.Start();
    }

    async Task CaptureStill()
    {
        var wall = screens.FirstOrDefault(item => item.Primary) ?? screens.FirstOrDefault();
        if (wall == null || await wall.ShowingError()) return;
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Cove", "still");
        Directory.CreateDirectory(folder);
        var png = Path.Combine(folder, $"{current.Id}-{DateTimeOffset.Now.ToUnixTimeSeconds()}.png");
        var bmp = Path.ChangeExtension(png, ".bmp");
        await wall.SavePreview(png);
        if (!File.Exists(png)) return;
        await Task.Run(() =>
        {
            using var image = Image.FromFile(png);
            image.Save(bmp, ImageFormat.Bmp);
            File.Delete(png);
        });
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", writable: true);
            key?.SetValue("WallpaperStyle", "10");
            key?.SetValue("TileWallpaper", "0");
        }
        catch (Exception error)
        {
            Log.Write("cove: wallpaper style: " + error.Message);
        }
        Native.SystemParametersInfoString(0x0014, 0, bmp, 0x01 | 0x02);
        foreach (var old in Directory.EnumerateFiles(folder))
        {
            if (string.Equals(old, bmp, StringComparison.OrdinalIgnoreCase)) continue;
            try { File.Delete(old); } catch (IOException) { /* the shell still has it open */ }
        }
        Log.Write("cove: desktop picture " + bmp);
    }

    void BuildTray()
    {
        var menu = new ContextMenuStrip { Renderer = new ToolStripProfessionalRenderer() };
        menu.Opening += (_, _) => RefreshMenu();
        feedItem.Click += (_, _) => { foreach (var wall in screens) wall.Feed(); };
        pauseItem.Click += (_, _) =>
        {
            stopped = !stopped;
            settings.Paused = stopped;
            settings.Save();
            ApplyRate();
        };
        menu.Items.Add(stateItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(feedItem);
        menu.Items.Add(pauseItem);
        menu.Items.Add(new ToolStripSeparator());
        for (var index = 0; index < Habitats.Length; index++)
        {
            var id = Habitats[index].Id;
            var choice = new ToolStripMenuItem(Habitats[index].Title) { Tag = id };
            choice.Click += (_, _) => ApplyScene(id);
            sceneMenu.DropDownItems.Add(choice);
        }
        menu.Items.Add(sceneMenu);
        menu.Items.Add(new ToolStripSeparator());
        var quit = new ToolStripMenuItem("Quit");
        quit.Click += (_, _) => Quit();
        menu.Items.Add(quit);
        tray.ContextMenuStrip = menu;
        tray.Visible = true;
        Brand();
    }

    void RefreshMenu()
    {
        var saver = EnergySaver();
        stateItem.Text =
            saver ? "Still, for Energy saver"
            : stopped ? (AnimationsOff() ? "Paused, animations are off" : "Paused")
            : !awake ? "Still, the screen is off"
            : applied == 0 ? "Resting behind your windows"
            : $"Running at {applied} frames a second";
        pauseItem.Text = stopped ? "Resume" : "Pause";
        pauseItem.Enabled = !saver;
        feedItem.Enabled = applied > 0;
        feedItem.Text = current.Id switch
        {
            "muse" => "Change outfit · 转身换装",
            "critters" => "New friends · 换一批",
            _ => "Feed",
        };
        foreach (ToolStripMenuItem item in sceneMenu.DropDownItems)
            item.Checked = item.Tag as string == current.Id;
    }

    void Brand()
    {
        tray.Icon = IconFor(current.Emoji);
        tray.Text = Fit($"Cove · {current.Title}");
    }

    Icon IconFor(string emoji)
    {
        if (icons.TryGetValue(emoji, out var cached)) return cached;
        using var bitmap = new Bitmap(32, 32, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Transparent);
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            using var font = new Font("Segoe UI Emoji", 20f, FontStyle.Regular, GraphicsUnit.Pixel);
            var size = graphics.MeasureString(emoji, font);
            graphics.DrawString(emoji, font, Brushes.Black, (32 - size.Width) / 2f, (32 - size.Height) / 2f);
        }
        var drawn = Icon.FromHandle(bitmap.GetHicon());
        icons[emoji] = drawn;
        return drawn;
    }

    static string Fit(string text) => text.Length <= 63 ? text : text[..63];

    void MissingRuntime()
    {
        if (runtimeMissing) return;
        runtimeMissing = true;
        Log.Write("cove: WebView2 runtime is missing");
        MessageBox.Show(
            "没有找到 Microsoft Edge WebView2 运行时。\nWindows 11 通常已经自带。Windows 10 需要安装一次：\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703",
            "Cove");
    }

    void Quit()
    {
        if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
        pointerTimer?.Dispose();
        exposureTimer?.Dispose();
        watch?.Dispose();
        stillTimer?.Dispose();
        CloseAll(screens);
        CloseAll(retiring);
        tray.Visible = false;
        tray.Dispose();
        foreach (var icon in icons.Values) icon.Dispose();
        power.DestroyHandle();
        ExitThread();
    }

    static void CloseAll(List<WallpaperForm> walls)
    {
        foreach (var wall in walls.ToArray()) wall.CloseDown();
    }

    void OnUi(Action action)
    {
        var context = ui;
        if (context != null && SynchronizationContext.Current != context) context.Post(_ => action(), null);
        else action();
    }

    /// <summary>Always deferred, so a mouse hook can return without waiting on the page.</summary>
    void Post(Action action)
    {
        var context = ui ?? SynchronizationContext.Current;
        if (context == null) action();
        else context.Post(_ => action(), null);
    }

    static string LayoutKey() => string.Join(
        ";",
        Screen.AllScreens.Select(screen =>
            $"{screen.DeviceName}:{screen.Bounds.X},{screen.Bounds.Y},{screen.Bounds.Width},{screen.Bounds.Height}"));

    static string SceneRoot()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "scene");
        var page = Path.Combine(root, "scenes", "riverscape", "wallpaper.html");
        if (!File.Exists(page))
            throw new FileNotFoundException("The scenes were not copied next to Cove.", page);
        return root;
    }

    static bool OnBattery() => SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;

    static bool EnergySaver()
    {
        try { return PowerManager.EnergySaverStatus == EnergySaverStatus.On; }
        catch (Exception) { return false; }
    }

    static bool AnimationsOff()
    {
        var enabled = 1;
        Native.SystemParametersInfoInt(0x1042, 0, ref enabled, 0);
        return enabled == 0;
    }
}

internal static class Log
{
    static readonly object Gate = new();
    static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cove", "cove.log");

    public static void Write(string line)
    {
        var text = DateTime.Now.ToString("HH:mm:ss ") + line;
        try
        {
            var directory = Path.GetDirectoryName(FilePath);
            if (directory != null) Directory.CreateDirectory(directory);
            lock (Gate) File.AppendAllText(FilePath, text + Environment.NewLine);
        }
        catch (IOException) { /* the log is a convenience */ }
        System.Diagnostics.Debug.WriteLine(text);
    }
}

internal sealed class Settings
{
    public string Scene { get; set; } = "riverscape";
    public bool? Paused { get; set; }
    public bool Still { get; set; } = true;
    public Dictionary<string, string> Pets { get; set; } = [];

    static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    static string PathName => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Cove", "settings.json");

    public static Settings Load()
    {
        try
        {
            if (!File.Exists(PathName)) return new Settings();
            return JsonSerializer.Deserialize<Settings>(File.ReadAllText(PathName), Json) ?? new Settings();
        }
        catch (Exception error)
        {
            Log.Write("cove: settings unreadable: " + error.Message);
            return new Settings();
        }
    }

    public void Save()
    {
        try
        {
            var directory = Path.GetDirectoryName(PathName);
            if (directory != null) Directory.CreateDirectory(directory);
            var temporary = PathName + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(this, Json));
            File.Move(temporary, PathName, overwrite: true);
        }
        catch (Exception error)
        {
            Log.Write("cove: could not save settings: " + error.Message);
        }
    }
}

/// <summary>Display on and off. Lock and sleep come from SystemEvents; this is the screen itself.</summary>
internal sealed class PowerSignals : NativeWindow
{
    public event Action<bool>? DisplayOn;
    Guid guid = new("6fe69556-704a-47a0-8f24-c28d936fda47");

    public PowerSignals()
    {
        CreateHandle(new CreateParams());
        Native.RegisterPowerSettingNotification(Handle, ref guid, 0);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0218 && message.WParam == (IntPtr)0x8013 && message.LParam != IntPtr.Zero)
        {
            var id = Marshal.PtrToStructure<Guid>(message.LParam);
            if (id == guid) DisplayOn?.Invoke(Marshal.ReadInt32(message.LParam, 20) != 0);
        }
        base.WndProc(ref message);
    }
}
