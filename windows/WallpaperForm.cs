using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Cove;

/// <summary>One screen of a scene. The window never takes the mouse; the cursor is read for it.</summary>
internal sealed class WallpaperForm : Form
{
    const string ReadyJs = """
        (() => {
          const loading = document.querySelector('#loading');
          if (!loading || loading.hidden || loading.style.opacity === '0') return true;
          const style = getComputedStyle(loading);
          return style.display === 'none' || style.opacity === '0';
        })()
        """;

    readonly Habitat habitat;
    readonly string sceneRoot;
    readonly string? saved;
    readonly Action<string, string> onMessage;
    readonly WebView2 view = new() { Dock = DockStyle.Fill };
    readonly List<Action> readyHandlers = [];
    CoreWebView2? core;
    System.Windows.Forms.Timer? poll;
    bool loaded;
    bool ready;
    bool closing;
    bool allowClose;
    bool inside;
    bool battery;
    bool polling;
    int rate = -1;
    int resends;
    bool resending;
    int pointerBusy;
    int polls;

    public string DeviceName { get; private set; } = "";
    public bool Primary { get; private set; }
    public Rectangle ScreenPx { get; private set; }

    public WallpaperForm(Habitat habitat, string sceneRoot, string? saved, Action<string, string> onMessage)
    {
        this.habitat = habitat;
        this.sceneRoot = sceneRoot;
        this.saved = saved;
        this.onMessage = onMessage;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = habitat.Background;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= (int)(Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW);
            return parameters;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var style = Native.GetWindowLongPtr(Handle, Native.GWL_EXSTYLE).ToInt64();
        style |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
        Native.SetWindowLongPtr(Handle, Native.GWL_EXSTYLE, new IntPtr(style));
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!allowClose) e.Cancel = true;
        base.OnFormClosing(e);
    }

    public void Attach(DesktopHost host, Screen screen)
    {
        DeviceName = screen.DeviceName;
        Primary = screen.Primary;
        ScreenPx = screen.Bounds;
        if (host.Parent == IntPtr.Zero) return;

        Bounds = screen.Bounds;
        // The raised desktop has no redirection bitmap. A layered, fully opaque child is
        // what it will composite under the icons; the classic WorkerW does not need that.
        if (host.Raised) MakeLayered();
        Native.SetParent(Handle, host.Parent);
        var origin = new Native.POINT();
        Native.ClientToScreen(host.Parent, ref origin);
        var insertAfter = !host.Raised
            ? IntPtr.Zero
            : host.Below != IntPtr.Zero ? host.Below : new IntPtr(1);
        Native.SetWindowPos(
            Handle, insertAfter,
            ScreenPx.X - origin.X, ScreenPx.Y - origin.Y, ScreenPx.Width, ScreenPx.Height,
            Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
        if (host.Raised) MakeLayered();
        Visible = true;
        Log.Write($"cove: {DeviceName} {ScreenPx.Width}x{ScreenPx.Height} @ {DeviceDpi} dpi");
    }

    void MakeLayered()
    {
        var style = Native.GetWindowLongPtr(Handle, Native.GWL_EXSTYLE).ToInt64();
        style |= Native.WS_EX_LAYERED;
        Native.SetWindowLongPtr(Handle, Native.GWL_EXSTYLE, new IntPtr(style));
        Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);
    }

    /// <summary>Put this window just under another one, both of them already under the icons.</summary>
    public void PlaceBehind(IntPtr other)
    {
        if (other == IntPtr.Zero || !IsHandleCreated) return;
        Native.SetWindowPos(Handle, other, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
    }

    public bool ContainsScreen(Point screen) =>
        screen.X >= ScreenPx.Left && screen.X < ScreenPx.Right &&
        screen.Y >= ScreenPx.Top && screen.Y < ScreenPx.Bottom;

    /// <summary>Screen pixels to the CSS pixels the page's pointer events are in.</summary>
    public Point ToClient(Point screen) => IsHandleCreated ? PointToClient(screen) : Point.Empty;

    public async Task Init(CoreWebView2Environment environment)
    {
        if (closing || !IsHandleCreated)
        {
            BecomeReady();
            return;
        }
        try
        {
            Controls.Add(view);
            view.DefaultBackgroundColor = habitat.Background;
            await view.EnsureCoreWebView2Async(environment);
            if (closing) return;
            core = view.CoreWebView2;
            var settings = core.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.SetVirtualHostNameToFolderMapping(
                "cove.local", sceneRoot, CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += (_, e) =>
            {
                string? text;
                try { text = e.TryGetWebMessageAsString(); }
                catch (ArgumentException) { return; }
                if (text != null) Ui(() => onMessage(habitat.Id, text));
            };
            await core.AddScriptToExecuteOnDocumentCreatedAsync(BootScript(saved));
            core.NavigationCompleted += (_, e) =>
            {
                if (!e.IsSuccess)
                {
                    Log.Write($"cove: {habitat.Id} did not load ({e.WebErrorStatus})");
                    BecomeReady();
                    return;
                }
                loaded = true;
                Send();
                PollReady();
            };
            if ((Native.GetWindowLongPtr(Handle, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_LAYERED) != 0)
                Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);
            core.Navigate($"https://cove.local/scenes/{habitat.Id}/wallpaper.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            throw;
        }
        catch (Exception error)
        {
            Log.Write($"cove: {habitat.Id} did not load: {error.Message}");
            BecomeReady();
        }
    }

    public void WhenReady(Action handler)
    {
        if (ready) handler();
        else readyHandlers.Add(handler);
    }

    public bool SetRate(int wanted)
    {
        if (wanted == rate) return false;
        rate = wanted;
        if (rate == 0 && inside)
        {
            inside = false;
            Eval("habitatPointerOut()");
        }
        Log.Write($"cove: {rate} fps");
        Send();
        return true;
    }

    public void SetPower(bool onBattery)
    {
        if (battery == onBattery) return;
        battery = onBattery;
        Send();
    }

    public void SetPointer(Point? css)
    {
        if (!loaded || rate <= 0 || core == null || closing) return;
        if (css == null)
        {
            if (!inside) return;
            inside = false;
            Eval("habitatPointerOut()");
            return;
        }
        if (Interlocked.Exchange(ref pointerBusy, 1) == 1) return;
        inside = true;
        var js = $"habitatPointer({css.Value.X},{css.Value.Y})";
        _ = core.ExecuteScriptAsync(js).ContinueWith(_ => Interlocked.Exchange(ref pointerBusy, 0));
    }

    public void Tap(Point css)
    {
        if (!loaded || core == null || closing) return;
        Eval($"typeof habitatClick === 'function' && habitatClick({css.X},{css.Y})");
    }

    public void Feed()
    {
        if (!loaded || rate <= 0 || core == null || closing) return;
        Eval("typeof habitatFeed === 'function' && habitatFeed()");
    }

    public async Task<bool> ShowingError()
    {
        if (core == null) return true;
        try
        {
            var value = await core.ExecuteScriptAsync("Boolean(document.querySelector('#loading[role=\"alert\"]'))");
            return value == "true";
        }
        catch { return true; }
    }

    public async Task SavePreview(string path)
    {
        if (core == null) return;
        await using var stream = File.Create(path);
        await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
    }

    public void CloseDown()
    {
        if (closing) return;
        closing = true;
        poll?.Dispose();
        try { view.Dispose(); } catch (InvalidOperationException) { /* already gone */ }
        allowClose = true;
        if (!IsDisposed) Dispose();
    }

    void PollReady()
    {
        polls = 0;
        poll?.Dispose();
        poll = new System.Windows.Forms.Timer { Interval = 100 };
        poll.Tick += async (_, _) =>
        {
            if (polling || closing || core == null) return;
            polling = true;
            try
            {
                polls++;
                string? value = null;
                try { value = await core.ExecuteScriptAsync(ReadyJs); }
                catch (InvalidOperationException) { return; }
                if (closing) return;
                if (value == "true" || polls > 150)
                {
                    poll.Dispose();
                    BecomeReady();
                }
            }
            finally { polling = false; }
        };
        poll.Start();
    }

    void BecomeReady()
    {
        if (ready) return;
        ready = true;
        Log.Write($"cove: {habitat.Id} showed its first frame");
        Send();
        var handlers = readyHandlers.ToArray();
        readyHandlers.Clear();
        foreach (var handler in handlers) handler();
    }

    void Send()
    {
        if (!loaded || resending || core == null || closing) return;
        var js = $$"""
            (() => {
              if (typeof habitatRate !== 'function') return false;
              typeof habitatPower === 'function' && habitatPower({{(battery ? "true" : "false")}});
              habitatRate({{rate}});
              return true;
            })()
            """;
        _ = core.ExecuteScriptAsync(js).ContinueWith(task => Ui(() =>
        {
            var ok = task.Status == TaskStatus.RanToCompletion && task.Result == "true";
            if (ok)
            {
                resends = 0;
                return;
            }
            resends++;
            if (resends == 1)
                Log.Write($"cove: {habitat.Id} was not listening yet; the rate will be offered again");
            if (resends > 300) return;
            resending = true;
            var retry = new System.Windows.Forms.Timer { Interval = 100 };
            retry.Tick += (_, _) =>
            {
                retry.Dispose();
                resending = false;
                Send();
            };
            retry.Start();
        }));
    }

    void Eval(string js)
    {
        if (core == null || closing) return;
        _ = core.ExecuteScriptAsync(js);
    }

    void Ui(Action action)
    {
        if (closing || IsDisposed) return;
        try
        {
            if (InvokeRequired) BeginInvoke(action);
            else action();
        }
        catch (InvalidOperationException) { /* the handle has gone */ }
    }

    static string BootScript(string? saved)
    {
        var encoded = string.IsNullOrEmpty(saved) ? "" : Convert.ToBase64String(Encoding.UTF8.GetBytes(saved));
        return """
            (() => {
              const post = (name, body) => {
                try { chrome.webview.postMessage(JSON.stringify({ name, body: String(body) })); }
                catch (error) {}
              };
              window.webkit = window.webkit || {};
              window.webkit.messageHandlers = {
                scene: { postMessage: (body) => post('scene', body) },
                state: { postMessage: (body) => post('state', body) },
                report: { postMessage: (body) => post('report', body) },
              };
              const report = (text) => post('report', text);
              for (const level of ['error', 'warn']) {
                const original = console[level];
                console[level] = (...parts) => {
                  report(parts.map((part) => part && part.stack ? part.stack : part).join(' '));
                  original.apply(console, parts);
                };
              }
              addEventListener('error', (event) => report(`${event.message} at ${event.filename}:${event.lineno}`));
              addEventListener('unhandledrejection', (event) => report(event.reason));
              window.habitatPointerCount = 0;
              window.habitatPointer = (x, y) => {
                const canvas = document.querySelector('#scene');
                window.habitatPointerCount++;
                if (canvas)
                  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
              };
              window.habitatPointerOut = () => {
                const canvas = document.querySelector('#scene');
                if (canvas) canvas.dispatchEvent(new PointerEvent('pointerleave'));
              };
              const encoded = "%%STATE%%";
              if (!encoded) return;
              try {
                const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
                window.habitatSavedState = new TextDecoder().decode(bytes);
              } catch (error) { console.warn('saved state unreadable', error); }
            })();
            """.Replace("%%STATE%%", encoded, StringComparison.Ordinal);
    }
}
