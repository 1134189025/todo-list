# 清新待办

Windows 桌面待办应用，基于 Electron + React + TypeScript。

- 今天 / 之后两个列表，支持新建、勾选完成、删除（可撤销）。
- 底部输入框可以让 AI 把一段话拆成多条待办。
- 右侧「今日总结」，可重新生成、复制、朗读；每晚自动生成（可关）。

## 开发运行

```
npm install
npm run dev
```

## 打包

```
npm run dist
```

安装包输出到 `dist\qingxin-todo-setup-<版本>.exe`（NSIS 安装程序，默认当前用户安装，可改安装目录）。
`dist\win-unpacked\` 是未安装的解包目录。第一次打包会下载 electron-builder 需要的工具，需要能访问 GitHub。

## 第一次使用：配置 AI

程序使用 OpenAI 兼容的接口。打开标题栏右侧的「设置」→「AI 服务」：

1. **地址**：填服务商的接口地址，例如 `https://api.deepseek.com/v1`（程序会自动拼上 `/chat/completions`，只允许 http / https）。
2. **模型**：填服务商的模型名。
3. **API Key**：粘贴 Key，点「保存」。保存后界面不再显示 Key，留空表示不修改，「清除」可删除。
4. 点「测试连接」确认能通。

Key 使用系统加密（Electron `safeStorage`）保存，settings.json 里只有密文。如果系统加密不可用，程序拒绝保存 Key，不会明文写盘。

## 用法

- **Enter**：让 AI 把输入内容拆成待办，弹出确认卡片；勾选需要的、修改标题和时间，点「添加」。
- **Ctrl+Enter**：不经过 AI，直接添加为今天的待办。
- 没有配置 AI 时，Enter 也会直接添加，并提示一次。
- 点圆圈勾选完成；鼠标悬停在待办上会出现删除按钮，删除后可以撤销。
- **语音**：麦克风按钮和语音快捷键（默认 `Ctrl + Shift + Space`，可在设置里修改）目前只显示「语音识别还没接入」。语音识别本版未接入。
- 设置里还有每晚自动总结（默认 21:00，可关、可改时间）和开机自动打开。

## 数据位置

数据保存在 `%APPDATA%\清新待办\`：

- `tasks.json`：所有待办。
- `settings.json`：AI 地址、模型、加密后的 Key、窗口位置、快捷键等设置。

文件读不懂时，会自动改名备份为 `tasks.corrupt-<时间>.json` 或 `settings.corrupt-<时间>.json`，然后用默认值启动。tasks.json 里个别待办不合法时，只跳过这几条，原文件备份为 `tasks.corrupt-<时间>.json`。备份文件不会被自动删除。

## 挡板模式（测试用）

用环境变量切换，不影响正常使用：

- `QINGXIN_SANDBOX=1`：挡板模式。不注册全局快捷键，开机自动打开只记在设置里、不写入系统，AI 地址只允许 `127.0.0.1`、`localhost`、`[::1]`，不弹系统通知。
- `QINGXIN_DATA_DIR=<绝对路径>`：挡板模式下必填，数据改存到该目录，不碰真实数据。缺少时程序直接退出。
- `QINGXIN_SANDBOX_QUIET=1`：挡板模式下窗口放到所有屏幕之外、不抢焦点、不进任务栏，给自动化验收用。

示例（PowerShell）：

```
$env:QINGXIN_SANDBOX='1'; $env:QINGXIN_DATA_DIR='C:\qx-test\data'; npm run dev
```

挡板只防止程序误用真实数据、真实网络和注册表，不防故意绕过。

## 验收

验收方式见 [docs/Hack验收.md](docs/Hack验收.md)，实现依据见 [docs/初版计划.md](docs/初版计划.md)。
