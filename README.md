# 小菇爱评论

给**腾讯视频**自动发评论的工具,自己用的。

多个号可以同时跑:每个号一个独立的数据仓和悬浮窗,评论内容从远程评论池拉。

> ⚠️ 这是自用工具,不是产品 —— 没有客服,也不保证适合你的用法。

---

## 下载

**当前版本 1.9** · `qq-comment.apk`(3.37 MB)· 需要 **Android 11 或更新**

| 从哪下 | 地址 |
|---|---|
| **Gitee**(国内走这个) | https://gitee.com/flyten1129/qq-comment/releases/download/apk/qq-comment.apk |
| GitHub | https://github.com/xiaogubiaobai/qq-comment/releases/latest/download/qq-comment.apk |

两处是同一个文件。这两条地址**不会变** —— 以后出新版还是它们,直接重新下就行。

### 尝鲜版(beta)

想先试新东西的话,还有一个 **beta 版**。它是**另一个 App**(名字叫「小菇爱评论(beta)」),
和上面那个**并排装在同一台手机上**,互不干扰 —— beta 出问题,正在跑的那个不受影响。

| 从哪下 | 地址 |
|---|---|
| **Gitee**(国内走这个) | https://gitee.com/flyten1129/qq-comment/releases/download/beta/qq-comment-beta.apk |
| GitHub | https://github.com/xiaogubiaobai/qq-comment/releases |

**beta 版本 1.9-beta**(这个数由 `打包.py --通道 beta` 自己回填,别手改)

⚠️ **它的帐号是空的。** 两个 App 的数据各自独立 —— beta 里要测,得重新扫码登一次。
⚠️ beta 会更新得更勤,也更容易出毛病。**日常用正式那个就好。**

## 怎么装

1. 下载 `qq-comment.apk`。
2. 点开装。系统会问「要不要允许从这个来源安装」—— 允许。
   (这是 Android 对所有非商店应用的统一提示,不是这个 App 特别要什么权限。)
3. 第一次启动后,`账号` 页顶上有一块「**开始之前**」,跟着它开**悬浮窗**权限。
   这是**唯一**一个要你自己去系统里开的权限。

   ⚠️ **那个开关是灰的、点了弹「已拒绝访问」?** 安卓 13 起对「不是从应用商店装的
   App」多了一道闸,先解开它:**系统设置 → 应用 → 小菇爱评论 → 右上角那三个点 →
   允许受限设置**,再回去开那个开关。安卓对所有侧载应用都这样,不是这个 App 特别要什么。

## 怎么确认下载的没被动过

1.9 的 sha256:

```
17b44bb53ad11046fe4cd4f23dbd907879a73856c9db5bedc347a70a85bcdf1c
```

Windows:

```
certutil -hashfile qq-comment.apk SHA256
```

Mac / Linux:

```
shasum -a 256 qq-comment.apk
```

出来的那串要和上面**一模一样**。不一样就别装。

## 要的权限(一共 6 个)

| 权限 | 干什么的 |
|---|---|
| 网络 | 拉评论池、查更新 |
| 前台服务 + specialUse | 跑的时候不被系统弄死 |
| 唤醒锁 | 跑的时候别息屏睡死 |
| 悬浮窗 | 每个号一个悬浮窗 |
| 通知 | Android 13+ 的前台服务必须能发通知 |

**没有**:短信、通讯录、摄像头、定位、文件访问、安装应用。

## 为什么要 Android 11 以上

多数据仓要 WebView ≥ 113,悬浮窗和 specialUse 前台服务也都是新 API。
比这老的机器这条线本来就跑不了。

---

## 这个仓里有什么

| | |
|---|---|
| Release 附件 | 安装包。Gitee 挂在固定标签 `apk` 下,GitHub 按版本号 |
| `qqcomment/` | App 的**在线更新**文件:`manifest.json` + 几份脚本和界面 |

App 每隔几小时会来这儿看一眼 `qqcomment/manifest.json`。有新版就把文件下到本地,
**逐个核对 sha256**,全部对上才启用,下次启动生效 —— 少一个字节都整批作废。

两个镜像放的是同一份东西:Gitee 排第一(国内通),拉不到会自动换 GitHub。
所以其中一边挂了也不影响更新。

**源码不在这个仓里。** 这里只放发出去的东西。
