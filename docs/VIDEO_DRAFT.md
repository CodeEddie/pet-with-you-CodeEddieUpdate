# 视频评论草稿

先在桌宠设置选择聊天服务。右键桌宠选择“发给大肥鱼看”，可输入标题、字幕或剧情生成一条草稿。这条路径只需要已配置的聊天服务。

| 输入 | 可用组件与位置 |
| --- | --- |
| 本地视频 | 在桌宠数据目录的 `video-tools/` 放入 [FFmpeg](https://ffmpeg.org/download.html) 的 `ffmpeg.exe`、`ffprobe.exe`，用于抽取字幕和画面。 |
| 视频语音 | 可在同一目录放入 `ggml-base.bin`，将 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) Windows 运行文件放在 `whisper/Release/`，其中包括 `whisper-cli.exe` 及所需 DLL。没有转录组件时，仍可按可取得的字幕或画面生成。 |
| 抖音分享链接 | 在 `video-tools/` 放入 [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) 的 `yt-dlp.exe`。链接读取受抖音接口和账号可见性影响，失败后可改用分享文案或拖入本地视频。 |
| 可选的抖音会话读取 | 将 [dsh-douyin-whale v1.9.2](https://github.com/jackey670/dsh-douyin-whale/tree/v1.9.2) 放在 `video-tools/dsh-douyin-whale/`，按该项目说明在目录内创建 `.venv`、安装 `python/requirements.txt` 和 Playwright 浏览器。使用草稿窗口中的“登录抖音会话”和“用抖音会话看”。 |

正式启动使用 `%APPDATA%\pet-with-you`，`npm start` 使用源码目录的 `.local/dev-data`。组件、模型和登录态由使用者在对应的数据目录准备。模型会收到草稿所需的文字及所选画面，视觉能力取决于服务商配置。

窗口显示进度、草稿和生成依据，结果可复制。评论或私信由用户自行发送。这里提供桌宠内的草稿入口，独立轮询和发送任务属于另一个工具。
