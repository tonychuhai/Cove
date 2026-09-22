# Cove

[English](docs/README.en.md)

https://github.com/user-attachments/assets/675e99c0-0e4f-43cf-b887-8cfe9d6ef589

https://github.com/user-attachments/assets/dea84ad3-d054-4328-b521-40fcbdb68cec

https://github.com/user-attachments/assets/00aa7a90-b081-4724-a405-42f3d7d9ed08

桌面上的活场景。四个场景，Mac 菜单栏或 Windows 托盘一键切换：

- **Riverscape 鱼缸** —— 一缸会认鼠标的鱼。鼠标是一根钓线，停在鱼群边上会有鱼咬钩，提到屏幕顶端就能把它拎出来再放回去。
- **Bunny 兔子** —— 一只住在阳光房间里的垂耳兔。鼠标是一把小扫帚，挥一挥它就追着咬；停下来慢慢摸它，是抚摸。会记住亲密度和心情。
- **Muse 互动换装** —— 点击人物转一圈，在日常、上海、伦敦、东京四套穿搭间切换，城市背景同步过渡。
- **Critters 纸上小伙伴** —— 一群用线条画出来的小动物。鼠标靠近，附近的会转头盯着你；离得远的打哈欠、说小话。菜单栏可以换一批。

全部本地渲染（Three.js / WebGL2 与 Canvas 2D），不联网、不要账号、不要任何权限。支持 macOS 13 及以上，以及 64 位 Windows 10（2004 起）和 Windows 11。Windows 没有单独的安装包，克隆仓库后在 PowerShell 里运行 `windows/install.ps1` 即可，脚本会在本机编译并装好。

## 安装

### 用 Codex 一键安装

打开 Codex（终端里输入 `codex`；用 Cursor 或 Claude Code 也一样），把下面这段话整段粘贴给它：

```text
帮我安装 Cove 桌面壁纸：
1. 先检查 Xcode 命令行工具装没装（swiftc --version），没有就运行 xcode-select --install 并等它完成；
2. 把 https://github.com/tonychuhai/cove.git 克隆到 ~/Documents/code/cove；
3. 进入该目录运行 sh wallpaper/install.sh；
4. 装完告诉我菜单栏图标在哪、怎么切换场景。
```

它会拉代码、编译、装到 `~/Applications/Cove.app`，并设为登录自启。第一帧几秒后出现。App 会把当前场景的一帧设为桌面图片垫在动画下面——锁屏、调度中心看到的就是它，切场景后几秒会跟着换。不想让它碰桌面图片：`defaults write com.tonyzhu.cove still -bool false`。

### 手动安装

```sh
xcode-select --install        # 已装过可跳过
git clone https://github.com/tonychuhai/cove.git && cd cove
sh wallpaper/install.sh
```

更新：`git pull` 之后再跑一次 `sh wallpaper/install.sh`。
卸载：`sh wallpaper/uninstall.sh`，然后在系统设置里换回你原来的壁纸。

### Windows

Windows 10 2004 或 Windows 11，64 位。编译需要 [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)，运行需要 WebView2（Windows 11 已自带；Windows 10 若没有，安装脚本会给出链接）。

用 PowerShell，在项目目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File windows/install.ps1
```

也可以把下面这段话整段交给 Codex、Cursor 或 Claude Code：

```text
帮我在 Windows 上安装 Cove 桌面壁纸：
1. 确认 dotnet --version 能看到 .NET 8 或更新的 SDK，没有就安装 https://dotnet.microsoft.com/download/dotnet/8.0 ；
2. 把 https://github.com/tonychuhai/cove.git 克隆到文档目录的 code\cove；
3. 在该目录运行 powershell -ExecutionPolicy Bypass -File windows\install.ps1；
4. 装完告诉我托盘图标在哪、怎么切换场景。
```

脚本会编译，装到 `%LOCALAPPDATA%\Cove`，写入当前用户的登录启动项并立刻运行。不需要管理员。画面在桌面图标下面，图标、点击、拖拽照常。任务栏托盘里是和 Mac 菜单栏同一份菜单。

第一帧要几秒。之后会把当前场景的一帧设成桌面壁纸，锁屏看到的就是这张静止的图；切场景约 3 秒后跟着换。不想改原来的壁纸：把 `%APPDATA%\Cove\settings.json` 里的 `"still"` 改成 `false`。

更新：拉完代码再跑一次安装脚本。卸载：`powershell -ExecutionPolicy Bypass -File windows/uninstall.ps1`，然后在设置里换回原来的壁纸。场景选择、暂停和兔子的记忆留在 `%APPDATA%\Cove\settings.json`。

## 怎么玩

左侧竖条一键换场景。Mac 上图标在菜单栏，Windows 上在任务栏托盘，菜单是同一份：

| 菜单 | 作用 |
| --- | --- |
| **Feed** | 鱼缸撒一把鱼食；兔子放一根胡萝卜 |
| **Change outfit · 转身换装** | Muse 转身切换下一套穿搭 |
| **New friends · 换一批** | 纸上小伙伴换一批新面孔 |
| **Pause / Resume** | 暂停 / 继续，选择会记住 |
| **Scene** | 切换 Riverscape / Bunny / Muse / Critters |
| **Quit** | 退出，直到下次登录或手动打开 |

**鱼缸**：把钓线停在鱼旁边等它咬钩；上钩后鱼会拽线乱窜，把鼠标提到屏幕最顶端停一秒多就"收鱼"，随后放生；猛甩鼠标鱼会脱钩。空钩提出水面半秒自动换饵。

**兔子**：挥动鼠标，它先竖耳，再蹦过来对着扫帚头起跳、咬住、甩头；连咬三口会得意地歇一会儿。扫帚不动它就过来闻闻；没人理会洗脸、溜达，四分钟后趴下睡觉，鼠标靠近就醒。

**Muse**：点击人物或右下角「转身换装」，也可点左下角色板选择穿搭。转到背面时换装，转回正面后停住；会记住上次穿搭。人物使用按参考图生成的八方向照片序列，并非可自由旋转的 3D 模型。

**纸上小伙伴**：鼠标移过去，周围 3×3 格子里的小动物会转头看你；再近一点会眯眼被摸。点一下谁，谁就开心地蹦一下。菜单栏「换一批」换新朋友，这一批会记住。十五个物种，每一笔都是代码画的。

桌面图标、点击、拖拽一切照常，壁纸不拦截鼠标事件。左侧切换条和 Muse / 纸上小伙伴只旁听鼠标左键的按下与松开（不需要辅助功能权限，Finder 照常收到点击），仅响应未被窗口遮挡的桌面短点击，拖拽不触发。

## 常见问题

**耗电吗？** 比静态壁纸多一点。壁纸完全露出时最高 60 fps（电池 30），被窗口盖住大半降到 20，几乎全盖住就停，低电量模式（Windows 上是节能模式）、锁屏、合盖或休眠时不画。

**会监听键盘吗？** 不会。只读光标位置、窗口位置（用来判断露出多少），以及左键的按下松开（用来点切换条），不记录、不上传。

**多显示器？** 每块屏一个独立场景，Feed 对所有屏生效。

**画面不动了？** 打开菜单看状态行，多半是被盖住、低电量或开了"减弱动态效果"（此时会以暂停状态启动，点 Resume 即可）。

**锁屏时鱼怎么不动？** 锁屏画面是系统画的，第三方窗口到不了那一层，Cove 只能把当前场景的一帧交给它当背景。切场景后约 3 秒这张图会跟着换。Mac 上旧版本把它存在 `~/Pictures/Cove.png`，可以删掉。Windows 上这张图在 `%APPDATA%\Cove\still`。

## 浏览器里试试

需要 Node.js 20+，项目目录下运行 `npm start`，打开 http://127.0.0.1:8080 是鱼缸，`/scenes/bunny/` 是兔子，`/scenes/muse/` 是互动换装，`/scenes/critters/` 是纸上小伙伴。浏览器版可以点击：点水面撒食，兔子那边有喂食 / 抚摸 / 逗它 / 休息按钮，纸上小伙伴点「换一批」或按空格。端口被占就 `PORT=8081 npm start`。

## 开发

| 位置 | 内容 |
| --- | --- |
| `scenes/riverscape/` | 鱼缸：`src/fish*.js` 鱼的解剖与行为，`src/tackle.js` 钓线 |
| `scenes/bunny/` | 兔子：`src/scene.js` 房间，`src/rabbit.js` 兔子，`src/broom.js` 扫帚，`src/pet-state.js` 记忆 |
| `scenes/muse/` | 互动换装：透明人物图集、城市背景、转身状态与按需绘制 |
| `scenes/critters/` | 纸上小伙伴：物种、手绘线条、注视与随机小动作 |
| `wallpaper/` | Mac App（Swift，一个 WebView 放在桌面层）与安装 / 卸载脚本 |
| `windows/` | Windows 壁纸（C# / WebView2，窗口在桌面图标后面）与安装 / 卸载脚本 |
| `vendor/` | 随包附带的 Three.js |

`npm run check` 做语法检查，`npm test` 跑鱼群行为、渲染预算、植物几何、Muse 换装和纸上小伙伴的无头测试。Mac 壁纸日志在 `/tmp/cove.log`，给进程发 `SIGUSR1` 会把第一块屏的画面存到 `/tmp/cove.png`。Windows 日志在 `%LOCALAPPDATA%\Cove\cove.log`。新场景放在 `scenes/<名字>/`，在 `wallpaper/Wallpaper.swift` 和 `windows/Program.cs` 的场景列表里各登记一行，才会出现在 Scene 菜单。

## 致谢与许可

Cove 以 [AGPL-3.0](LICENSE) 开源：可以自由使用、修改、分发，改了要开源，拿去做网络服务也要开源。

Cove 基于 Chase Lean 的 [Desktop Habitats](https://github.com/chaseleantj/desktop-habitats)：Riverscape 鱼缸的水、植物、鱼，以及 macOS 壁纸 App 都是他的工作，MIT 协议，声明保留在 [NOTICE](NOTICE)；钓线、青鳉、兔子场景、Muse 互动换装、纸上小伙伴和场景切换是 Cove 加的。纸上小伙伴改编自 GordenSun 的 [little-critters](https://github.com/GordenSun/little-critters)。

Three.js 0.180.0 以 [MIT](vendor/THREE-LICENSE.txt) 附带。石头、木头、沙子纹理来自 Poly Haven（[CC0](https://polyhaven.com/license)）：[Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry)、[Rough Wood](https://polyhaven.com/a/rough_wood)、[Sand 01](https://polyhaven.com/a/sand_01)。
