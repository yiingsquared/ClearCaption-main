# ClearCaption · 0.1.0 development preview

ClearCaption is an ICS4U project for classroom captions, English / French / Simplified Chinese translation, and editable study notes. It includes a marketing website, a web workspace, a Windows desktop application, and Intel / Apple silicon Mac applications.

## 当前状态

- 已实现：三语界面、演讲者与听众流程、免账号课堂码加入、独立听课、透明置顶桌面字幕、账号、文字记录编辑与保存、笔记编辑、TXT / Markdown / PDF 导出。
- 示例演示使用预设文字、译文和笔记，明确标注，不会使用麦克风。
- 真实语音识别、翻译和 AI 总结已接入服务调用代码，需要有效的 OpenAI API 密钥及相应服务额度。未使用真实密钥做端到端语音测试，不能把示例演示当作识别质量验证。
- 桌面 ZIP 为未签名开发测试包；没有 Apple 公证或 Windows 发布者签名。需要在目标 Windows / macOS 电脑上验证麦克风权限、透明置顶和导出。
- 网站默认是私有预览。其他人要加入同一课堂，必须能够访问同一个共享服务。私有预览的访问权限不等于 APP 内的课堂访客权限。
- 不自动发布到 Google Classroom。导出文件后，由老师自行上传。

## Run the source

Use Node.js 24. The desktop build embeds its own Node runtime.

```sh
npm ci
cp .env.example .env
# Edit .env and add OPENAI_API_KEY, if you want live AI features.
npm run dev
```

Open `http://localhost:3000`. For the desktop interface:

```sh
node node_modules/electron/install.js
npm start
```

The desktop application starts its bundled server on a random loopback port. Account data, transcripts and notes live in the operating system's ClearCaption application data directory. Accounts created on this device do not automatically exist on a different service. API keys can be entered in desktop Settings; they are saved using Electron safeStorage only when system encryption is available. They are never returned to the renderer. Changing the service signs you out.

## Use the demo

1. Choose **Explore the demo** on the website or in the workspace.
2. Choose a spoken language and a translation, then start the sample lesson.
3. Try pause, the caption window and the translation selector.
4. End the session. Edit a transcript paragraph, load the clearly labelled sample notes, and export.

For a complete shared demo, create a test account on one service, start a presenter demo, and join its code from a separate browser or application connected to that same service. Anonymous guests may join and export; signing in is required for persistent personal saved sessions.

## Live use

1. Configure `OPENAI_API_KEY` on the service host, or enter your own key in desktop Settings when using the local service. API usage is billed by the provider.
2. Sign in and choose Presenter or Independent listening. Disable the sample-demo checkbox.
3. Choose the actual spoken language, allow microphone access and start speaking.
4. Presenter mode publishes text to the room. Guests choose their own translation. Independent listening captures the listener's microphone; a distant speaker or noisy room will reduce accuracy.
5. End the session. Review recognition errors before generating notes. AI notes can be inaccurate; review them before sharing.

Desktop speech streams microphone audio over WebRTC to the provider. There is no audio recorder and no saved audio file. ClearCaption saves only account data, text and notes. Provider processing/retention is governed by the configured provider's terms; “no recordings saved by ClearCaption” does not mean audio never leaves the device.

## Shared service

The same `server/api.mjs` runs locally with SQLite or on a Cloudflare Worker with D1. The marketing site and app use same-origin `/api/` routes. Shared classrooms require a reachable server with HTTPS, database storage, and an API key configured by the service owner. Desktop **Settings → Service URL** accepts an HTTPS origin, or localhost for development. Never place API keys in frontend files.

The provided Sites project is owner-private until the owner explicitly changes sharing. A desktop app cannot bypass that site's access policy. To run a classroom pilot, deploy the service to an endpoint reachable by the participants and configure every app to that same endpoint. Native remote API requests send account/room tokens; they do not transmit an administrator's long-lived AI key.

The local server can bind to another interface using HOST and PORT for deployment behind an HTTPS reverse proxy. Browser microphone access requires a secure context (HTTPS or localhost).

## Data and access boundaries

- Passwords: salted PBKDF2 SHA-256 hashes. Login bearer tokens are random, stored as hashes server-side, and expire after 7 days. This first version has no email verification or password reset.
- Class codes: random 6-character join codes, limited join attempts. Anyone with the code can read the class as a guest; only its owner can publish or end it. Avoid including sensitive personal information in a shared demonstration.
- Live classes last at most 12 hours. Temporary shared-room text older than 24 hours is cleaned up when a new room is created. Ending a room prevents new joins and new text, while existing participants can finish exporting.
- Guest text remains in browser/app memory until leaving. Export it before closing. Signed-in session copies are stored on the connected service and can be deleted from the export menu.
- Saved sessions are isolated by account. API limits control excessive requests. A production school rollout still needs operational monitoring, account recovery, provider quota management, and an agreed classroom consent policy.

## Build and verify

```sh
npm test
npm run build
npm run package:desktop -- darwin x64
npm run package:desktop -- darwin arm64
npm run package:desktop -- win32 x64
```

Desktop packaging uses Electron 43.8.12 to retain macOS 12 compatibility. ZIP archives preserve macOS framework symlinks. The generated `.app` and `.exe` are development builds; code signing and notarization are separate release steps. Never disable system-wide security protections to open a build.

`server/schema.js` is the database schema. `npm run db:generate` creates versioned SQL migrations in `drizzle/`. The local server applies them at startup; the hosting workflow applies them to D1 before deployment. Do not edit already-applied migrations.

## Project map

| Directory | Purpose |
| --- | --- |
| web/ | Marketing page, downloadable release links, shared translations |
| web/app/ | Workspace, sample lesson, WebRTC speech client, caption window |
| desktop/ | Electron main process and isolated preload bridges |
| server/ | Shared API, local SQLite adapter, Worker entry point |
| drizzle/ | Versioned database migrations |
| scripts/ | Worker build and desktop packaging |
| tests/ | Account, room permissions, text persistence and provider-boundary tests |

## API references

- https://platform.openai.com/docs/guides/realtime-transcription
- https://platform.openai.com/docs/guides/realtime-webrtc
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#transparent-window

## Release verification boundary

Automated API tests and browser interaction checks cover the implemented flow. Live provider accuracy, latency, billing limits, real microphone behavior, and native Windows / Mac window behavior require target-device and configured-provider testing. Do not present this development preview as a production accessibility service.
