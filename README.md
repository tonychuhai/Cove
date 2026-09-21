# Cove

[English](docs/README.en.md)

https://github.com/user-attachments/assets/675e99c0-0e4f-43cf-b887-8cfe9d6ef589

https://github.com/user-attachments/assets/dea84ad3-d054-4328-b521-40fcbdb68cec

Mac 桌面上的活场景。两个场景，菜单栏一键切换：

- **Riverscape 鱼缸** —— 一缸会认鼠标的鱼。鼠标是一根钓线，停在鱼群边上会有鱼咬钩，提到屏幕顶端就能把它拎出来再放回去。
- **Bunny 兔子** —— 一只住在阳光房间里的垂耳兔。鼠标是一把小扫帚，挥一挥它就追着咬；停下来慢慢摸它，是抚摸。会记住亲密度和心情。

全部本地渲染（Three.js + WebGL2），不联网、不要账号、不要任何权限。目前只支持 macOS 13 及以上。

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

它会拉代码、编译、装到 `~/Applications/Cove.app`，并设为登录自启。第一帧大约 20 秒后出现。安装过程中 macOS 可能会问"终端是否可以控制系统事件"，同意即可——只是把一张静态画面设为桌面图片，垫在动画下面；拒绝也不影响。

### 手动安装

```sh
xcode-select --install        # 已装过可跳过
git clone https://github.com/tonychuhai/cove.git && cd cove
sh wallpaper/install.sh
```

更新：`git pull` 之后再跑一次 `sh wallpaper/install.sh`。
卸载：`sh wallpaper/uninstall.sh`，然后在系统设置里换回你原来的壁纸。

## 怎么玩

点菜单栏的 🐟 / 🐇 图标：

| 菜单 | 作用 |
| --- | --- |
| **Feed** | 鱼缸撒一把鱼食；兔子放一根胡萝卜 |
| **Pause / Resume** | 暂停 / 继续，选择会记住 |
| **Scene** | 切换 Riverscape / Bunny |
| **Quit** | 退出，直到下次登录或手动打开 |

**鱼缸**：把钓线停在鱼旁边等它咬钩；上钩后鱼会拽线乱窜，把鼠标提到屏幕最顶端停一秒多就"收鱼"，随后放生；猛甩鼠标鱼会脱钩。空钩提出水面半秒自动换饵。

**兔子**：挥动鼠标，它先竖耳，再蹦过来对着扫帚头起跳、咬住、甩头；连咬三口会得意地歇一会儿。扫帚不动它就过来闻闻；没人理会洗脸、溜达，四分钟后趴下睡觉，鼠标靠近就醒。

桌面图标、点击、拖拽一切照常，壁纸不接收鼠标事件，只读取光标位置。

## 常见问题

**耗电吗？** 比静态壁纸多一点。壁纸完全露出时最高 60 fps（电池 30），被窗口盖住大半降到 20，几乎全盖住就停，低电量模式、锁屏、合盖时不画。

**会监听键盘吗？** 不会。只读光标位置和窗口位置（用来判断露出多少），不记录、不上传。

**多显示器？** 每块屏一个独立场景，Feed 对所有屏生效。

**画面不动了？** 打开菜单看状态行，多半是被盖住、低电量或开了"减弱动态效果"（此时会以暂停状态启动，点 Resume 即可）。

## 浏览器里试试

需要 Node.js 20+，项目目录下运行 `npm start`，打开 http://127.0.0.1:8080 是鱼缸，`/scenes/bunny/` 是兔子。浏览器版可以点击：点水面撒食，兔子那边有喂食 / 抚摸 / 逗它 / 休息按钮。空格暂停，F 全屏。端口被占就 `PORT=8081 npm start`。

## 开发

| 位置 | 内容 |
| --- | --- |
| `scenes/riverscape/` | 鱼缸：`src/fish*.js` 鱼的解剖与行为，`src/tackle.js` 钓线 |
| `scenes/bunny/` | 兔子：`src/scene.js` 房间，`src/rabbit.js` 兔子，`src/broom.js` 扫帚，`src/pet-state.js` 记忆 |
| `wallpaper/` | Mac App（Swift，一个 WebView 放在桌面层）与安装 / 卸载脚本 |
| `vendor/` | 随包附带的 Three.js |

`npm run check` 做语法检查，`npm test` 跑鱼群行为、渲染预算、植物几何的无头测试。壁纸日志在 `/tmp/cove.log`，给进程发 `SIGUSR1` 会把第一块屏的画面存到 `/tmp/cove.png`。新场景放在 `scenes/<名字>/`，在 `wallpaper/Wallpaper.swift` 的 `habitats` 列表里登记一行即可出现在 Scene 菜单。

## 致谢与许可

Cove 基于 Chase Lean 的 [Desktop Habitats](https://github.com/chaseleantj/desktop-habitats)：Riverscape 鱼缸的水、植物、鱼，以及 macOS 壁纸 App 都是他的工作，MIT 协议；钓线、青鳉、兔子场景和场景菜单是 Cove 加的。两份版权声明都保留在 [LICENSE](LICENSE) 里，Cove 同样采用 MIT。

Three.js 0.180.0 以 [MIT](vendor/THREE-LICENSE.txt) 附带。石头、木头、沙子纹理来自 Poly Haven（[CC0](https://polyhaven.com/license)）：[Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry)、[Rough Wood](https://polyhaven.com/a/rough_wood)、[Sand 01](https://polyhaven.com/a/sand_01)。
