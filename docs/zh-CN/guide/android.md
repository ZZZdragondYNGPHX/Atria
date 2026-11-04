# Android 应用

Atria Android 应用可以在本机运行内置服务，也可以连接已配置的远程服务。使用本机模式时，应用启动服务并在 WebView 中打开界面。

可以从此仓库在本地构建 APK。构建依赖、签名与输出路径见 [Android 构建指南](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/android-app/README.md)；是否提供现成 APK 取决于实际发布情况。

首选数据目录为 `Android/data/com.atria.app/files/atria-data`；外部应用存储不可用时使用内部存储。更换构建或卸载应用前，请单独保存[备份](/zh-CN/guide/migration)。
