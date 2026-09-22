using System.Runtime.InteropServices;
using System.Text;

namespace Cove;

/// <summary>
/// Where a wallpaper window has to live. Windows 10 keeps a WorkerW behind the icons;
/// Windows 11 24H2 (the "raised" desktop) draws icons in a layered child of Progman and
/// has no redirection bitmap of its own, so the window has to be a layered sibling of
/// that icon view, underneath it. Both are found here.
/// </summary>
internal readonly record struct DesktopHost(IntPtr Parent, IntPtr Below, bool Raised);

internal static class Desktop
{
    public static DesktopHost Find()
    {
        var progman = Native.FindWindow("Progman", null);
        if (progman == IntPtr.Zero)
        {
            Log.Write("cove: Progman is missing; the shell is not up yet");
            return new DesktopHost(IntPtr.Zero, IntPtr.Zero, false);
        }

        // 0,0 spawns the classic WorkerW. 0xD,1 is what the raised desktop answers to.
        // Sending both is harmless on a shell that ignores one of them.
        Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);
        Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), 0, 1000, out _);

        var style = Native.GetWindowLongPtr(progman, Native.GWL_EXSTYLE).ToInt64();
        var raised = (style & Native.WS_EX_NOREDIRECTIONBITMAP) != 0;
        if (raised)
        {
            var icons = FindDefView(progman);
            Log.Write(icons == IntPtr.Zero
                ? "cove: raised desktop, icon view not found yet"
                : "cove: raised desktop, under the icons");
            return new DesktopHost(progman, icons, true);
        }

        IntPtr worker = IntPtr.Zero;
        Native.EnumWindows((hwnd, _) =>
        {
            var view = Native.FindWindowEx(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (view != IntPtr.Zero)
                worker = Native.FindWindowEx(IntPtr.Zero, hwnd, "WorkerW", null);
            return true;
        }, IntPtr.Zero);
        if (worker != IntPtr.Zero)
        {
            Log.Write("cove: classic desktop, behind the icons");
            return new DesktopHost(worker, IntPtr.Zero, false);
        }

        Log.Write("cove: no WorkerW; drawing on Progman");
        return new DesktopHost(progman, IntPtr.Zero, false);
    }

    /// <summary>A point on the wallpaper or the icons, rather than on an app window or the taskbar.</summary>
    public static bool IsBare(Point screen)
    {
        var hwnd = Native.WindowFromPoint(new Native.POINT { X = screen.X, Y = screen.Y });
        if (hwnd == IntPtr.Zero) return false;
        var root = Native.GetAncestor(hwnd, Native.GA_ROOT);
        var name = Native.ClassName(root == IntPtr.Zero ? hwnd : root);
        return name is "Progman" or "WorkerW" or "SHELLDLL_DefView";
    }

    static IntPtr FindDefView(IntPtr progman)
    {
        var direct = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (direct != IntPtr.Zero) return direct;
        var child = Native.FindWindowEx(progman, IntPtr.Zero, null, null);
        while (child != IntPtr.Zero)
        {
            var nested = Native.FindWindowEx(child, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (nested != IntPtr.Zero) return nested;
            child = Native.FindWindowEx(progman, child, null, null);
        }
        return IntPtr.Zero;
    }
}

internal static class Native
{
    internal const int GWL_EXSTYLE = -20;
    internal const long WS_EX_LAYERED = 0x00080000;
    internal const long WS_EX_NOACTIVATE = 0x08000000;
    internal const long WS_EX_TOOLWINDOW = 0x00000080;
    internal const long WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
    internal const uint LWA_ALPHA = 0x2;
    internal const uint SWP_NOSIZE = 0x0001;
    internal const uint SWP_NOMOVE = 0x0002;
    internal const uint SWP_NOACTIVATE = 0x0010;
    internal const uint SWP_SHOWWINDOW = 0x0040;
    internal const uint GA_ROOT = 2;
    internal const uint GW_HWNDPREV = 3;
    internal const int WH_MOUSE_LL = 14;

    internal delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    internal delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    internal struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RECT
    {
        public int Left, Top, Right, Bottom;
        public readonly Rectangle ToRectangle() => Rectangle.FromLTRB(Left, Top, Right, Bottom);
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MSLLHOOKSTRUCT
    {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern IntPtr FindWindow(string? className, string? windowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string? className, string? windowName);

    [DllImport("user32.dll")]
    internal static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr SendMessageTimeout(
        IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    internal static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    internal static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern bool SetWindowPos(
        IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll")]
    internal static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint key, byte alpha, uint flags);

    [DllImport("user32.dll")]
    internal static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);

    [DllImport("user32.dll")]
    internal static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    internal static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    internal static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    internal static extern bool IsIconic(IntPtr hwnd);

    [DllImport("user32.dll")]
    internal static extern IntPtr GetWindow(IntPtr hwnd, uint command);

    [DllImport("user32.dll")]
    internal static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

    [DllImport("user32.dll")]
    internal static extern IntPtr WindowFromPoint(POINT point);

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);

    [DllImport("user32.dll")]
    internal static extern bool GetLayeredWindowAttributes(IntPtr hwnd, out uint key, out byte alpha, out uint flags);

    [DllImport("dwmapi.dll")]
    internal static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint threadId);

    [DllImport("user32.dll")]
    internal static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    internal static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    internal static extern IntPtr GetModuleHandle(string? name);

    [DllImport("user32.dll")]
    internal static extern uint GetDpiForSystem();

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr RegisterPowerSettingNotification(IntPtr recipient, ref Guid setting, uint flags);

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern bool SystemParametersInfoInt(uint action, uint param, ref int value, uint winIni);

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern bool SystemParametersInfoString(uint action, uint param, string value, uint winIni);

    internal static string ClassName(IntPtr hwnd)
    {
        var name = new StringBuilder(256);
        return GetClassName(hwnd, name, name.Capacity) == 0 ? "" : name.ToString();
    }
}
