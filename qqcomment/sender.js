// 发送器 · 原生驱动版(2026-09-20 阶段1-A)
//
// ⚠️ 为什么长这样:实测(13:18~13:24)发现 App 退到后台后,Chromium 把页面里的
//    setTimeout 完全冻住 —— 不是变慢,是停摆。上一版用 await sleep() 串起来的流程
//    卡在第一个 await 上一动不动,直到 App 回到前台才解冻、把积压的活一次性跑完
//    (回前台那一刻补发了一条评论,feed_id 148618799982693421)。
//
// → 所以这一版【页面里没有任何定时器,也没有 Promise】。
//   每个步骤都是同步函数、立刻返回结果;「等」全部交给 Java 侧的 Handler。
//   判断逻辑(选择器、校验判据)和上一版一字不差,只是把等待抽走了。
//
// 用法(Java):web.evaluateJavascript("__qqStep('状态')", cb) —— 回调里拿到 JSON 对象。
(function () {
  if (window.__qqStepInstalled) return;
  window.__qqStepInstalled = true;

  function 发布区() { return document.querySelector('.at-feed-stream-post'); }

  function 读计数(post) {
    var c = post && post.querySelector('.at-feed-stream-post-count');
    return c ? c.textContent.trim() : '(无)';
  }

  function 填字器() {
    return Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  }

  // 腾讯会莫名其妙地弹一个登录窗上来（用户 2026-09-20 指出，是已知行为）。
  // 它一挡，发布区那套就全乱：请求挂着、回调不回来。插件那边靠 rot-timer 的「登录弹窗自愈」治它，
  // 治法就是重刷。这里只负责报告「看起来有个登录浮层」，重刷与否由原生侧决定。
  function 找登录窗() {
    try {
      var 候选 = document.querySelectorAll('[class*="login" i],[id*="login" i],iframe[src*="login"]');
      for (var i = 0; i < 候选.length; i++) {
        var e = 候选[i];
        if (e.offsetWidth < 120 || e.offsetHeight < 80) continue;   // 太小的是按钮不是弹窗
        var cs = window.getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        var z = parseInt(cs.zIndex, 10);
        if (cs.position === 'fixed' || (z > 100)) {
          return (e.className || e.id || e.tagName) + '@' + e.offsetWidth + 'x' + e.offsetHeight;
        }
      }
    } catch (e) {}
    return null;
  }

  // ── 把桌面版式缩到刚好一屏宽 ──────────────────────────────────
  // ⚠️ UA 和布局宽【都不动】—— 桌面 DOM 原样保留,下面那一堆选择器才不会挂。
  //    只改 initial-scale。
  //
  // 为什么要这个(2026-09-25 模拟器实测):
  //   `/x/search/` 没写 meta viewport → WebView 的 loadWithOverviewMode 自动缩到一屏,正常。
  //   一移到 `/channel/tv`,腾讯自己写了 `width=1210,initial-scale=1` ——
  //   **initial-scale=1 把缩放钉死**,1210px 的版面塞进 411px 的视窗,
  //   只看得见 34%,要横着拖才看得全。
  //
  // ⚠️ 本来就铺满的页面【一个字都不碰】。登录落地页就是这种:
  //    那页的 `放大登录框` 是按「屏宽 992」算的,动了视口这套数就全变了。
  function 合屏宽() {
    var v = window.visualViewport;
    if (!v) return '没有 visualViewport';
    var 布局宽 = document.documentElement.clientWidth;
    if (!布局宽) return '布局宽是 0';
    // ⚠️ 这一条同时是【自激保护】—— 改完就走这一支,不会来回改
    if (Math.abs(v.width - 布局宽) < 2) return '本来就铺满';
    var 设备宽 = v.width * v.scale;              // 不随缩放变,拿它当分子
    var 比 = 设备宽 / 布局宽;
    if (!(比 > 0.05 && 比 < 1.5)) return '比例离谱(' + 比.toFixed(3) + ')不动';
    var 要 = 'width=' + Math.round(布局宽) + ',initial-scale=' + 比.toFixed(4)
           + ',minimum-scale=' + 比.toFixed(4);   // 钉住下限 = 捏不出比一屏更小的
    var m = document.querySelector('meta[name=viewport]');
    if (m && m.getAttribute('content') === 要) return '没变';
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'viewport');
      (document.head || document.documentElement).appendChild(m);
    }
    m.setAttribute('content', 要);
    return 要;
  }

  // 两种情况会让它跑偏,两种都会打出 resize:
  //   ① SPA 换路由,腾讯重写一遍 meta → 缩放变 → visualViewport 的 resize
  //   ② 底盘切 TAB / 顶栏收起,窗口高宽变 → window 的 resize
  // ⚠️ 靠事件,【没有定时器】(铁律 4)。这是显示层的事,页面冻住了也没人在看。
  try {
    var 排合宽 = function () { try { 合屏宽(); } catch (e) {} };
    window.addEventListener('resize', 排合宽);
    // ⚠️ 我们是在 onPageStarted 注进来的 —— 那一刻 clientWidth 还是 0,首拍必然 no-op。
    //    只挂 load 的话,v.qq.com 这种页要等好几秒 → 用户看到的就是「一打开是放大的」。
    //    DOMContentLoaded 在 DOM 解析完就触发(不等图片),能把那段闪烁砍掉一大截。
    document.addEventListener('DOMContentLoaded', 排合宽);
    document.addEventListener('readystatechange', 排合宽);
    window.addEventListener('load', 排合宽);
    window.addEventListener('pageshow', 排合宽);     // 从 bfcache 回来
    if (window.visualViewport) window.visualViewport.addEventListener('resize', 排合宽);
    排合宽();
    window.__合宽装了 = true;   // 给探针看的,不然查不出它到底装没装
  } catch (e) {}

  // ── 掐掉视频 ────────────────────────────────────────────────
  // ⚠️ 2026-10-24 模拟器【整块屏幕变黑】时挖出来的:
  //    三个腾讯页在 1×1 的隐形窗里【一直在放片】 —— 探针读出来 `停:false 静:true 秒:501`,
  //    八分多钟的片子一帧不落地解完了。三个解码器各占一个 31MB 的 buffer pool,
  //    内存 3.58G/4G、swap 吃掉 441M,Chromium 要不到 GL 上下文,
  //    `ContextResult::kFatalFailure: too few uniforms or varyings supported` 刷屏,
  //    最后【整个显示】(连系统状态栏一起)合成出来全黑 —— 看着像 App 卡死,
  //    其实心跳 3 秒 13 拍、面板 DOM 活的、状态机照常收动作。
  //
  // ⚠️ `setMediaPlaybackRequiresUserGesture(true)`(窗口池.java)为什么没挡住:
  //    那条只管【有声】的。静音自动播在 Chromium 的自动播放策略里一律放行,
  //    而腾讯播放器正是静音起播 —— 那个 Java 开关对它完全无效。
  //
  // 治法:把 `play()` 变成【浏览器自己挡自动播放时的样子】 —— 抛 NotAllowedError。
  // 这是每个播放器都认得、都处理得了的一等状态(显示海报 + 播放钮),
  // 比「监听 play 再 pause」稳 —— 后者会和播放器的重试互掐,CPU 白烧。
  //
  // ⚠️ 发评论一点都不靠播放器:评论区(.at-feed-stream-post)是另一条数据线。
  // ⚠️ 真机上 GPU 扛得住,但【流量和电照样白烧】 —— 所以这不是只治模拟器。
  // ⚠️ 要放开就改这个文件(层 2,能远程更新),不必重装 APK。
  try {
    window.__掐了几个 = 0;
    var 停一个 = function (x) {
      try { x.muted = true; } catch (e) {}
      try { x.autoplay = false; } catch (e) {}
      try { x.removeAttribute('autoplay'); } catch (e) {}
      try { if (!x.paused) { x.pause(); window.__掐了几个++; } } catch (e) {}
    };
    var 扫媒体 = function () {
      var m = document.querySelectorAll('video,audio');
      for (var i = 0; i < m.length; i++) 停一个(m[i]);
      return m.length;
    };
    var 媒体原型 = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (媒体原型 && !window.__掐视频装了) {
      var 真播 = 媒体原型.play;
      媒体原型.play = function () {
        if (window.__准播) return 真播.apply(this, arguments);
        停一个(this);
        // ⚠️ 必须返回一个【被拒绝的 Promise】。播放器 await 它、拿到 NotAllowedError
        //    就走「自动播放被挡」那条路;返回 undefined 会让它的 `.catch` 当场炸,
        //    整段播放器脚本跟着停 —— 那就不是省资源,是把页面弄坏了。
        try { return Promise.reject(new DOMException('掐掉了', 'NotAllowedError')); }
        catch (e) { return Promise.reject(new Error('NotAllowedError')); }
      };
      // 兜底:有的播放器在我们注进来之前就把 play 的引用存走了,盖原型盖不到它。
      document.addEventListener('play', function (ev) {
        if (window.__准播) return;
        if (ev && ev.target) 停一个(ev.target);
      }, true);
      扫媒体();
      document.addEventListener('DOMContentLoaded', 扫媒体);
      window.addEventListener('load', 扫媒体);
      window.__扫媒体 = 扫媒体;
      window.__掐视频装了 = true;   // 给探针/冒烟看的
    }
  } catch (e) {}

  // ── 藏播放器 ────────────────────────────────────────────────
  // ⭐ 整段搬自 `../android-spike/app/src/main/assets/hideplayer.js`(2026-09-07 实测定稿),
  //    用户 2026-10-24:「之前我们做测试时,启动评论页面用的是故意省略不 load 视频的介面」。
  //
  // ⚠️⚠️ 那边一共试过【三条路】,只有这一条留下来了,别又去走另外两条:
  //   ① 极简页(自己造空页挂评论 SDK)—— **此路不通**:评论 SDK 被打进播放页主包,
  //      主包硬依赖全局 `SuperPlayer`,没有播放器主程序当场崩。
  //   ② 杀播放器(`[class*=player],[id*=player]` 全删)—— 实测一次删掉 **45 个节点**,
  //      页面自己的 JS 再去找就拿到 null。失败模式发散,只当手动重锤。
  //   ③ **藏播放器(这一条)—— 一条 CSS,0 个节点**。页面 JS 该找到的照样找得到。
  //
  // ⚠️ 必须藏【最外面】那层。三层容器由外到内:
  //      .container-player > .main-player-wrapper > .main-player-container
  //    只藏最里面那层的话,`.container-player` 自带 background:#000 + 298px 高,
  //    播放器没了还杵着一个**黑方块**(那边实测踩过)。两个都写上:
  //    腾讯改了其中一个名字另一个兜得住,真两个都失效 → **黑块回来,看得见**。
  //
  // ⚠️ 这是【显示层】的事,和「掐视频」是两件事,两个都要:
  //    掐视频 = 不解码(省电省流量);藏播放器 = 不占地方(眼睛看得见的那块)。
  //    光藏不掐的话,它在看不见的地方照样解片子(2026-10-24 把模拟器 GL 烧没的就是这个)。
  //
  // ⚠️ 没拦网络的时候播放器会自己报「网络状况异常,请检查网络后重试」——
  //    那个报错框也在这两层里面,一起藏掉了。
  // ⚠️⚠️ 2026-10-24 真机上当场抓到:**那条 style 会被解析器吃掉**。
  //    我们是在 onPageStarted 注进来的,那一刻 `document.head` 还不存在,
  //    于是 style 挂到了 `<html>` 上;解析器接着把 head/body 建起来,那个野生节点就没了。
  //    症状极阴:`window.__藏播放器已装` 还是 true(同一个 JS 上下文),
  //    `.container-player` 却是 `display:block` —— 查「装了没」查不出来,得查 style 还在不在。
  //    而且**时有时无**:先前验的 b4101a4h21c 那页就活下来了,换一页就没了。
  // 治法照抄上面「合屏宽」那一套:**写成幂等的,靠 DOM 事件补几次**。
  //    没有定时器(铁律 4),补一次的代价是一次 getElementById。
  try {
    var 补藏播放器 = function () {
      try {
        if (document.getElementById('__藏播放器')) return;      // 还在,什么都不做
        var st = document.createElement('style');
        st.id = '__藏播放器';
        st.textContent = '.container-player,.main-player-container{display:none !important}';
        (document.head || document.documentElement).appendChild(st);
        window.__藏播放器补了 = (window.__藏播放器补了 || 0) + 1;
      } catch (e) {}
    };
    补藏播放器();
    document.addEventListener('DOMContentLoaded', 补藏播放器);
    document.addEventListener('readystatechange', 补藏播放器);
    window.addEventListener('load', 补藏播放器);
    window.addEventListener('pageshow', 补藏播放器);      // 从 bfcache 回来
    window.__补藏播放器 = 补藏播放器;    // 给探针/原生补刀用
    window.__藏播放器已装 = true;
  } catch (e) {}

  window.__qqStep = function (步, 参数) {
    try {
      var post = 发布区();

      // ① 找发布区。评论区是懒加载的,没出来就滚一屏 —— 但只滚一次就返回,
      //    要不要再滚由 Java 决定(它有真的能跑的定时器)。
      // 手动再扫一遍 + 报数。装的时候已经自动扫过,这个是给探针和冒烟核对用的。
      if (步 === '掐视频') {
        var 个数 = window.__扫媒体 ? window.__扫媒体() : -1;
        var 在播 = 0;
        var 媒 = document.querySelectorAll('video,audio');
        for (var mi = 0; mi < 媒.length; mi++) if (!媒[mi].paused) 在播++;
        return { 装了: !!window.__掐视频装了, 媒体数: 个数, 还在播: 在播, 累计掐了: window.__掐了几个 || 0 };
      }
      if (步 === '找发布区') {
        if (post) {
          post.scrollIntoView({ block: 'center' });
          return { 有发布区: true };
        }
        window.scrollBy(0, Math.round(window.innerHeight * 0.8));
        return { 有发布区: false };
      }

      // ── 登录弹窗:找到它、放大它 ──────────────────────
      // ⭐ 整段照插件 `qq-unified/content.js:1030-1105`(findLoginBox / zoomLoginBox)。
      //    那边是手机桌面模式下「📐 放大登录框」那个钮。
      // ⚠️ 放大的是【弹窗那个盒子】,不是整页。
      //    整页放大 2026-09-24 试过:弹窗会跑到中央外面,还得横着拖,用户当场否了。

      // 把登录弹窗叫出来。⚠️ 只是【点开那个入口】,登录本身仍然不脚本化(DESIGN §6)——
      //    弹出来之后走哪条路(微信/QQ/手机号/扫码)、怎么扫,全是用户自己的事。
      if (步 === '点登录钮') {
        var 钮 = document.querySelector('.quick_login:not(.none), #mod_head_login:not(.none)');
        if (!看得见(钮)) {
          // 兜底:找文字恰好是「登录」的可见元素(防它改版换 class)
          钮 = null;
          var 挑 = document.querySelectorAll('a,button,[role="button"],span,div,li');
          for (var q = 0; q < 挑.length; q++) {
            var 文 = (挑[q].textContent || '');
            if (文.length > 20) continue;
            if (文.replace(/\s/g, '') !== '登录') continue;
            var rq = 挑[q].getBoundingClientRect();
            if (rq.width > 20 && rq.height > 10) { 钮 = 挑[q]; break; }
          }
        }
        if (!钮) return { 点了: false, 原因: '页面上没有登录钮' };
        钮.click();
        return { 点了: true };
      }

      if (步 === '找登录框') {
        var 框 = 找登录框();
        if (!框) return { 有: false };
        var r0 = 框.getBoundingClientRect();
        return { 有: true, 宽: Math.round(r0.width), 高: Math.round(r0.height) };
      }

      if (步 === '放大登录框') {
        var 盒 = 找登录框();
        if (!盒) return { 错: '没找到登录框' };
        if (已放大) return { 放大了: false, 原因: '已经放大过了' };

        // ⚠️ 先【摆竖】再量 —— 它会把弹窗从 670x400(横)改成竖的
        //    (机上实测 333x651),倍数必须按改完的尺寸算。
        //    ⚠️ 别写死这个数:它跟着 码占屏宽 和屏幕尺寸走。
        //    摆不动就照老路走(下面那个 放大二维码)。
        var 旧样式 = [];
        var 记旧 = function (el) {
          if (!el) return;
          for (var i0 = 0; i0 < 旧样式.length; i0++) if (旧样式[i0].el === el) return;
          旧样式.push({ el: el, css: el.style.cssText });
        };
        var 竖 = 摆成竖排(盒, 记旧);

        var r = 盒.getBoundingClientRect();
        var W = document.documentElement.clientWidth;
        var H = document.documentElement.clientHeight;
        // ⚠️ 倍数按【本机实测尺寸】算,不写死 —— 屏幕和弹窗尺寸都会变。
        //    ×0.96 留一点边,不要顶满。
        var K = Math.max(1, Math.min(W / r.width, H / r.height) * 0.96);
        var cs = window.getComputedStyle(盒);
        已放大 = {
          盒: 盒, t: 盒.style.transform, o: 盒.style.transformOrigin,
          tr: 盒.style.transition, z: 盒.style.zIndex, 旧样式: 旧样式,
        };
        盒.style.transition = 'none';
        盒.style.transformOrigin = 'center center';
        // ⚠️ 要【叠在】它原有的 transform 上,不能直接覆盖 —— 弹窗常常自带一个居中的 translate,
        //    覆盖掉它就跑偏了。而且要 important,腾讯的样式优先级不低。
        盒.style.setProperty('transform',
            (cs.transform && cs.transform !== 'none' ? cs.transform + ' ' : '')
            + 'scale(' + K.toFixed(3) + ')', 'important');
        盒.style.zIndex = '2147483646';
        盒.scrollIntoView({ block: 'center', inline: 'center' });

        // ⚠️ 摆竖成了就不许再动码了 —— 那时候码已经在排版里,再 transform 一下
        //    又会压到说明文字,正好把摆竖换来的「协调」赔掉。
        var 码倍 = 竖.成 ? 0 : 放大二维码(盒);

        // ⚠️ 码的【CSS 尺寸】(竖.码)单看没意义,得连着 屏上/占比 一起报 ——
        //    中间隔着一个 scale(K),同一个 CSS 尺寸在不同屏上占的比例完全不同。
        return { 放大了: true, 倍: +K.toFixed(2), 框宽: Math.round(r.width), 屏宽: W,
                 竖排: 竖.成 ? 竖.码 : 0, 码屏: 竖.成 ? 竖.屏 : 0, 占: 竖.成 ? 竖.占 : 0,
                 没竖: 竖.成 ? null : 竖.因, 码倍: 码倍 };
      }

      if (步 === '还原登录框') {
        if (!已放大) return { 还原: false, 原因: '没放大过' };
        var g = 已放大;
        g.盒.style.transform = g.t; g.盒.style.transformOrigin = g.o;
        g.盒.style.transition = g.tr; g.盒.style.zIndex = g.z;
        // ⚠️ 摆竖动过十几个元素的行内样式,得照着退回去 ——
        //    倒着退:同一个元素只记了【第一次】动它之前那份,顺序反了会把别的覆盖没。
        var 旧 = g.旧样式 || [];
        for (var i9 = 旧.length - 1; i9 >= 0; i9--) 旧[i9].el.style.cssText = 旧[i9].css;
        已放大 = null;
        return { 还原: true };
      }

      // ── 这个号还有效吗 ──────────────────────────────
      // ⭐ 照插件 `qq-unified/content.js:1316-1327`(loginState)。
      //
      // ⚠️ 判据是【页面右上角那个头像】,不是 cookie。
      //    cookie 在只说明「登过」,token 可能已经失效 ——
      //    插件里那句 `有身份 cookie 但页面显示「登录」= 登出后残留` 就是这个意思。
      // ⚠️ 三态,不是两态。都没命中要返回 pending(DOM 还没就绪),
      //    **绝不能当成已登录** —— 那样会把一个死号当活号派去发评论。
      /**
       * 从【页面】读昵称。
       *
       * ⚠️ 为什么不能只靠 cookie(2026-09-26 实测):这次 QQ 扫码登进来,
       *    仓里 44 条 cookie **一条昵称都没有**(上一个号那次有 `qq_nick` ×2)。
       *    腾讯给不给这个 cookie 不稳定,但**页面上一定有**:
       *      <span class="title-ellipsis_1 user-nick">腾讯网友</span>
       *    插件只能读 cookie(它没有常驻页面),我们有 —— 就别自缚。
       */
      if (步 === '读昵称') {
        var 区n = document.querySelector('#mod_head_user, .quick_user');
        if (!区n) return { 昵称: null, 因为: '没有头像区' };
        var 元n = 区n.querySelector('.user-nick, [class*="user-nick"], [class*="userNick"]');
        var 名n = 元n ? (元n.textContent || '').trim() : '';
        // ⚠️ 登出时这一片会是「登录」两个字 —— 别把它当昵称存下来
        if (名n && 名n.length <= 30 && 名n !== '登录' && 名n !== '登錄') return { 昵称: 名n };
        return { 昵称: null, 因为: 名n ? ('不像昵称:' + 名n.slice(0, 16)) : '找不到 .user-nick' };
      }

      // 平时靠上面那两个 resize 事件自己维持,这一步是给原生【强制补一刀】用的
      // (以及探针上查数)。它幂等 —— 已经铺满就原样返回「本来就铺满」。
      if (步 === '合屏宽') {
        var vv = window.visualViewport || {};
        // ⚠️ 顺手补一刀藏播放器 —— 它和合屏宽同一个毛病:**页面会把我们写的东西弄掉**。
        //    这一步本来就是原生隔几拍推一次的幂等修补,挂在这儿零成本。
        //    (SPA 换路由不触发 load 事件,只有这条补得到。)
        if (window.__补藏播放器) window.__补藏播放器();
        return {
          合: 合屏宽(),
          藏播放器补了: window.__藏播放器补了 || 0,
          布局宽: document.documentElement.clientWidth,
          视觉宽: Math.round(vv.width || 0),
          缩放: vv.scale,
        };
      }

      if (步 === '登录态') {
        // ⚠️⚠️ 【顺序和插件相反,而且不能照抄它的判据】。
        //    插件是「.quick_user 可见 → in」。2026-09-24 实测:现在的 v.qq.com 首页上
        //    `.quick_user` 是个【容器】,里面装着下拉菜单(登录/个人中心/我的关注/退出…),
        //    **登出时它照样 74×34 可见** —— 照抄会一律判成已登录,
        //    等于把死号当活号派去发评论。
        //
        //    新判据:
        //      ① `.quick_login` 可见 → out。这是【可靠的否定证据】,先查
        //      ② 头像图【画出来了】而且【图数据也载好了】→ in。**两个都要。**
        //
        // ⚠️ 两个条件各管一件事,少任何一个都会错:
        //
        //    · 只看 `naturalWidth > 0` → 【登出时误判成已登录】。
        //      2026-09-25 实测(模拟器 acc_7 登出态):`img.quick_user_avatar`
        //      **登出时就在**,src 是站点公用默认头像
        //      `vfiles.gtimg.cn/vupload/202005/07_common_avatar.png`(名字里就是 common),
        //      `naturalWidth = 240`。光看这条会把死号判成活号派去发评论。
        //
        //    · 只看渲染尺寸 → 号刚登上、头像图还没下下来的那几百毫秒会先判成 in,
        //      而插件(`background.js waitLoginAvatar`)这条硬判据是用户拍板定的:
        //      「必须有头像 img 且 complete + naturalWidth>0」。
        //
        //    ⚠️ 尺寸这一条为什么管用 —— 2026-09-25 量到的祖先链:
        //        IMG.quick_user_avatar         0×0   inline
        //        DIV.quick_link _checklogin none 0×0 display:none   ← 登录态开关
        //        DIV.quick_item quick_user    74×34  flex
        //      头像的父容器 `.quick_link._checklogin` 登出时 `display:none`,
        //      **那不是收起的下拉菜单,那就是腾讯自己的登录态开关**
        //      (`data-avatarsize="40"`,登上了就是 40×40)。
        if (看得见(document.querySelector('#mod_head_login:not(.none), .quick_login:not(.none)'))) {
          return { 态: 'out' };
        }
        var 头 = document.querySelector('#mod_head_user, .quick_user');
        if (头) {
          // 优先精确命中右上角头像(插件实测过的真实 DOM)
          var 像 = 头.querySelector('img.quick_user_avatar, img[data-type="avatar"]');
          if (!像) {
            // 兜底:改版换了类名时,挑块里【画出来最大】的那张。
            // ⚠️ 面积必须 > 0,0×0 的一律不选 —— 宁可返回 pending,
            //    也不能把一个死号判成活号派去发评论(见上面的三态注释)。
            var 图们 = 头.querySelectorAll('img'), 最大 = 0;
            for (var k = 0; k < 图们.length; k++) {
              var 图 = 图们[k];
              if ((图.src || '').indexOf('data:') === 0) continue;   // data: 的是图标不是头像
              var rr = 图.getBoundingClientRect(), 面积 = rr.width * rr.height;
              if (面积 > 最大) { 最大 = 面积; 像 = 图; }
            }
          }
          if (像 && 看得见(像) && 像.complete && 像.naturalWidth > 0) {
            return { 态: 'in', 头像: (像.src || '').slice(0, 80) };
          }
        }
        // 兜底:通用「登录」文字,应对它改版换 id
        var 些 = document.querySelectorAll('a,button,[role="button"],span,div,li');
        for (var n = 0; n < 些.length; n++) {
          var 原 = 些[n].textContent || '';
          if (原.length > 20) continue;      // 「登录」很短;跳过长文本容器,防卡
          var t = 原.replace(/\s/g, '');
          if ((t === '登录' || t === '登錄') && 看得见(些[n])) return { 态: 'out' };
        }
        return { 态: 'pending' };
      }

      // ⚠️⚠️ 上面这几步必须排在下面那道守卫【之前】——
      //    登录页上没有 `.at-feed-stream-post`,守卫会直接 return,
      //    后面的步骤一个都到不了。2026-09-24 就是这么静默失败了一轮。

      if (!post) return { 错: '发布区不见了' };

      // ② 状态快照。Java 靠轮询这个来判断「展开了没」「按钮就绪没」。
      //    ⚠️ 判展开态用「有没有 textarea」,不能用 .at-feed-stream-post__login 在不在 ——
      //       框一张开 SDK 就把 __login 删了,引擎因此才要每 0.7s 塞个假的进去。
      //    ⚠️ 按钮就绪判 className 含 active,不能判 disabled —— 实测空/非空都是 false。
      if (步 === '状态') {
        var ta = post.querySelector('textarea');
        var btn = post.querySelector('.at-feed-stream-post__action button');
        return {
          登录窗: 找登录窗(),
          有textarea: !!ta,
          有展开入口: !!post.querySelector('.at-feed-stream-post__login'),
          值: ta ? ta.value : null,
          计数: 读计数(post),
          有按钮: !!btn,
          按钮类名: btn ? btn.className : '',
          按钮就绪: !!btn && /\bactive\b/.test(btn.className)
        };
      }

      if (步 === '展开') {
        var opener = post.querySelector('.at-feed-stream-post__login');
        if (!opener) return { 点了: false, 原因: '没有展开入口' };
        opener.click();
        return { 点了: true };
      }

      // ③ 原生 setter 填字。引擎用 ta.value= 直接赋值 —— 对这个 SDK(Vue 2.7)有效,
      //    对 React 受控组件无效。原生 setter 两边都吃。
      if (步 === '填字') {
        var ta2 = post.querySelector('textarea');
        if (!ta2) return { 错: '没有输入框' };
        var 原值 = ta2.value;
        var 计数前 = 读计数(post);
        ta2.focus();
        填字器().call(ta2, 参数);
        ta2.dispatchEvent(new Event('input', { bubbles: true }));
        // ⚠️ 校验不能拿 "0/999" 当基准 —— 有残留草稿时它本来就不是 0,
        //    只能比对填字【前后】,再加上 ta.value === 文本。
        var 计数后 = 读计数(post);
        return {
          原值: 原值,
          值换掉了: ta2.value === 参数,
          计数前: 计数前, 计数后: 计数后,
          计数变了: 计数后 !== 计数前,
          计数对得上: 计数后.indexOf(String(参数.length) + '/') === 0
        };
      }

      if (步 === '点发布') {
        var btn2 = post.querySelector('.at-feed-stream-post__action button');
        if (!btn2) return { 错: '没有发送按钮' };
        btn2.click();
        // ⚠️ 点完就返回。发布后 DOM 不可信(计数器消失、旧引用里字还在),
        //    成功与否只认 hook.js 报回来的 feed_id,由 Java 那边等。
        return { 点了: true };
      }

      // 干跑收尾:把原来的内容放回去,不改变现场
      if (步 === '还原') {
        var ta3 = post.querySelector('textarea');
        if (!ta3) return { 还原: false, 原因: '没有输入框' };
        填字器().call(ta3, 参数 == null ? '' : 参数);
        ta3.dispatchEvent(new Event('input', { bubbles: true }));
        return { 还原: ta3.value === (参数 == null ? '' : 参数), 计数: 读计数(post) };
      }

      return { 错: '未知步骤 ' + 步 };
    } catch (e) {
      return { 错: '异常: ' + String((e && e.message) || e) };
    }
  };

  var 已放大 = null;

  /** 照插件的 _visible:量出来有宽有高才算看得见 */
  function 看得见(e) {
    if (!e) return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /**
   * 二维码在【屏幕上】要占多宽。用户 2026-10-31:
   *   「这个二维码在手机上还是太大了吧。如果是上下排列,我觉得可以 40%~50 屏宽就好了」
   * -> 取中间 45%。
   *
   * ⚠️ 是占【屏宽】的比例 —— 不是 CSS 像素,也不是占弹窗的比例。
   *    要调大调小就只动这一个数;底下那个二分只负责把它瞄准,别去动它。
   */
  var 码占屏宽 = 0.45;

  /**
   * 把登录弹窗【摆成竖的】。成了返回 {成:true, 码:码的新边长, 轮:迭代了几轮},
   * 摆不动返回 {成:false, 因:'...'} —— 这时候外面照老路走(放大二维码)。
   *
   * ⚠️⚠️ 2026-10-31。这一版换的是【思路】,不是参数。用户:「不够大。有点不协调」。
   *   老路:弹窗原样(670x400,横的)整体放大,再单独把二维码撑大。
   *     整窗卡在【宽】-> x1.42;码再 x2.5 -> 码最终 371px(占屏宽 37%)。
   *     代价是码脱离了排版:盖住副标题后半句、盖掉「打开腾讯视频APP扫码」和
   *     「如何扫码」,还比它那一栏的中线偏左 13px。
   *     ⚠️ 「不够大」和「不协调」其实是【同一个】原因:在一个横框里给码抢地方,
   *        抢到的那块又小又偏。调系数治不了,只能换思路。
   *   新路:先把框摆成竖的(两栏改上下、窗口收窄),再用插件那个整窗放大公式。
   *     375x784 -> x2.54 -> 码最终 815px(占屏宽 82%)。**是老路的 2.2 倍**。
   *     而且码是【排版里】的:说明文字跟着走在它下面,三个钮在它上面,一个没盖。
   *
   * ⚠️⚠️ 2026-10-31 下午,同一个用户又说:「这个二维码在手机上还是太大了吧。
   *   如果是上下排列,我觉得可以 40%~50 屏宽就好了」。**82% 是能到,不是该到** ——
   *   一屏几乎只剩一张码,而扫码压根用不着那么大。
   *   所以现在求的不是最大值,是 `码占屏宽` 那个目标值(见 ⑧)。
   *   💡 「摆竖」这一整套照旧,一步都没少 —— 它换来的不只是尺寸,
   *      还有「码在排版里、谁也不盖谁」,那部分和码多大无关。
   *
   * ⚠️ 为什么能大这么多:屏是【竖】的(992x2074),框是【横】的(670x400)。
   *    min(992/670, 2074/400) —— 宽这侧 1.48 早到顶,高那侧 5.19 一点没用上。
   *    摆竖之后两侧才一起吃满。这是【比例】的事,不是系数的事。
   *    ⚠️ 所以插件那边没有这一段不是它漏了:它跑在浏览器里,用户能自己双指缩放。
   *
   * 📐 天花板在哪是有解析解的(**现在不走这条,留着当注脚**):
   *      宽这侧 K = W/(q+外)    高那侧 K = H/(h0+q)
   *      两边相等 -> q = (W*h0 - H*外) / (H - W)
   *      (q=码边长, 外=码两侧占掉的宽, h0=弹窗去掉码之后的净高)
   *    码越大窗越高、整窗倍数越小,这个 q 就是乘出来最大的那一点。实测 q=321 -> 屏上 82%。
   *    ⚠️ 它还得迭代两轮:窗一变宽,副标题和协议那两行就从两行变一行,
   *       h0 从 509 掉到 463,最优解跟着动(363 -> 321)。
   *    ⚠️ 「外」只能沿着「码 -> 弹窗」把 padding+border 加起来量(=54);
   *       拿「弹窗宽 - 码宽」量会得到 566(那会儿窗还没箍紧),公式直接出负数。
   *    -> 这些坑现在全绕开了:⑧ 改成二分【量结果】,一个中间量都不用。
   *
   * ⚠️ 横屏不摆(H <= W)。那时候 (H-W) <= 0,公式直接炸;而且横屏本来就没这毛病。
   * ⚠️ 找东西【先几何后类名】:腾讯的类名是 CSS Module 带哈希的
   *    (app-qr-login-module_qr-code__WP6Hw),哈希随时会变,只敢拿几何当判据。
   * ⚠️ 动过的行内样式全记进 记旧(),「还原登录框」要照着退回去。
   */
  function 摆成竖排(弹窗, 记旧) {
    var W = document.documentElement.clientWidth;
    var H = document.documentElement.clientHeight;
    if (H <= W * 1.1) return { 成: false, 因: '屏不是竖的' };

    var 码 = 找二维码(弹窗);
    if (!码) return { 成: false, 因: '没找到二维码' };

    // 从码往上爬,第一个宽度 >= 弹窗一半的,就是【装两栏的那一层】
    var 弹 = 弹窗.getBoundingClientRect();
    var 栏 = 码, p = 码.parentElement;
    while (p && p !== 弹窗) {
      if (p.getBoundingClientRect().width >= 弹.width * 0.5) break;
      栏 = p; p = p.parentElement;
    }
    var 主体 = p;
    if (!主体 || 主体 === 弹窗) return { 成: false, 因: '爬不到两栏那一层' };

    // 另一栏 = 主体里不含码、又够宽的那个(宽 < 3 的是中间那条分隔线)
    var 钮栏 = null, 线 = [];
    for (var i = 0; i < 主体.children.length; i++) {
      var c = 主体.children[i];
      if (c === 栏 || c.contains(码)) continue;
      var rc = c.getBoundingClientRect();
      if (rc.width < 3) { 线.push(c); continue; }
      if (!钮栏 || rc.width > 钮栏.getBoundingClientRect().width) 钮栏 = c;
    }
    if (!钮栏) return { 成: false, 因: '没找到登录钮那一栏' };

    // 窗 = 白框本体 = 弹窗底下那一层
    var 窗 = 码;
    while (窗.parentElement && 窗.parentElement !== 弹窗) 窗 = 窗.parentElement;

    var 设 = function (el, k, v) {
      if (!el) return;
      记旧(el);
      el.style.setProperty(k, v, 'important');
    };

    // ① 码到它那一栏之间:尺寸全放开,让码自己撑开(腾讯把壳写死成 118x118 了)
    for (var a = 码.parentElement; a && a !== 主体; a = a.parentElement) {
      设(a, 'width', 'auto'); 设(a, 'height', 'auto');
    }
    // ② 两栏改上下
    设(主体, 'flex-direction', 'column');
    设(主体, 'align-items', 'center');
    设(主体, 'width', '100%');
    设(主体, 'height', 'auto');
    // ③ 主体【上面】那几层:高度放开。它们写死了 400/360,不放开码一长就溢出白框
    for (var b = 主体.parentElement; b && b !== 弹窗.parentElement; b = b.parentElement) {
      设(b, 'height', 'auto'); 设(b, 'min-height', '0');
    }
    // ④ 分隔线藏掉;码上面那个引导动画也藏掉(它是 absolute 定位的,摆竖之后正好压在码上)
    for (var d = 0; d < 线.length; d++) 设(线[d], 'display', 'none');
    var 浮 = 栏.querySelectorAll('*');
    for (var e2 = 0; e2 < 浮.length; e2++) {
      var el2 = 浮[e2];
      if (window.getComputedStyle(el2).position !== 'absolute') continue;
      // ⚠️ 只藏【没字】的装饰。二维码失效时那层「点击刷新」也是 absolute 压在码上,
      //    那个是用户【必须看见】的,藏了就只剩一张废码,他会一直扫不上。
      if ((el2.textContent || '').trim()) continue;
      设(el2, 'display', 'none');
    }
    // ⑤ 钮跟着铺满。窗一收窄、钮还钉在原来那个宽度的话,左右就空一截 —— 又不协调了
    设(钮栏, 'width', '100%');
    var 钮 = 钮栏.querySelectorAll('*');
    for (var f = 0; f < 钮.length; f++) {
      var rf = 钮[f].getBoundingClientRect();
      if (rf.width > 弹.width * 0.3 && rf.height > 30) {
        设(钮[f], 'width', '100%'); 设(钮[f], 'max-width', 'none');
      }
    }

    // ⑥ 钮和码之间留一口气。⚠️ 2026-10-31 用户:「二维码跟上面的按钮区太近了吧,没有间隙」。
    //    病根:原来两栏是【左右】排的,中间隔着那条竖分隔线;改成上下之后线藏了,
    //    **竖直方向上谁也没给它留过空** —— 码就贴着「手机号登录」。
    //    实测(机上,CSS px):钮和钮之间 20、码下面到「打开腾讯视频APP扫码」也是 20,
    //    就码【上面】这一道只有 7 —— 一眼看出来的那种不匀。
    // ⚠️ 留多少【从弹窗自己身上量】:取「钮和钮之间」那个间距当一口气。
    //    腾讯哪天改了自己的节奏,我们跟着它改;量不出来(钮栏结构变了)就【不补】,不瞎补。
    // ⚠️ 用 margin-top 不用 flex 的 `gap`:gap 只在 flex/grid 里管用,而这一层是不是 flex
    //    是腾讯说了算的(我们只设了 flex-direction,万一哪天它不是 flex,gap 就白设了)。
    //    ⚠️ 这一步必须排在 ⑧ 二分【之前】:它把弹窗撑高一点,码的最优尺寸跟着变。
    var 块 = [];
    for (var g1 = 0; g1 < 钮.length; g1++) {
      var rg1 = 钮[g1].getBoundingClientRect();        // ⚠️ 重新量:上面刚把钮改成 100% 宽
      if (rg1.width > 弹.width * 0.3 && rg1.height > 30) 块.push(rg1);
    }
    块.sort(function (a, b) { return a.top - b.top; });
    var 一口气 = 0;
    for (var g2 = 1; g2 < 块.length; g2++) {
      var d2 = 块[g2].top - 块[g2 - 1].bottom;         // 嵌套的那几层会算出 <= 0,正好滤掉
      if (d2 > 0 && (!一口气 || d2 < 一口气)) 一口气 = d2;
    }
    // ⚠️ 现有的那一道要量到【码本身】,不是量到它那一栏 —— 栏上可能本来就有内边距,
    //    用户看见的是码的边,不是栏的边。
    var 现有 = 码.getBoundingClientRect().top - 钮栏.getBoundingClientRect().bottom;
    // 现有 < 0 = 码在钮上面(DOM 里钮栏在前,正常不会),那种时候不动。
    if (一口气 && 现有 >= 0 && 现有 < 一口气) 设(栏, 'margin-top', Math.round(一口气 - 现有) + 'px');

    // ⑦ 窗口自己去箍住里头最宽的那个 —— 别写死像素宽。
    //    ⚠️ 这条【不只是好看】:码现在是刻意留得比钮栏还窄的(见 ⑧),
    //       窗不箍紧的话,码就在一个 670 宽的白框里飘着、左右各空一大截 —— 又不协调了。
    //    ⚠️ 万一哪天 WebView 不认 fit-content:窗会杵在原宽度不动,
    //       底下那个二分【照样瞄得准】(它量的是真尺寸),只是白框左右会空一截。
    //       老版这儿还有个「不认就改写像素宽」的兜底,2026-10-31 删了 ——
    //       它的判据是「窗比 码+外 宽就算没生效」,而现在「窗比码宽」是【正常】的,
    //       照那个判据会把钮栏和说明文字一起挤变形。宁可空一截。
    设(窗, 'width', 'fit-content');
    设(窗, 'max-width', 'none');

    // ⑧ 码多大。⚠️⚠️ 这里【瞄一个目标】,不是求最大(为什么见函数头)。
    //
    // ⚠️ 瞄的是【屏幕上】那个尺寸,不是 CSS 尺寸:外头还要给整窗来一下 scale(K),
    //    而 K 又反过来被码决定(码越大 -> 窗越高 -> K 越小)。两头互相咬,
    //    所以只能「设一个 q -> 量真窗 -> 按同一个式子算 K -> 看 q*K 落在哪」。
    //    ⚠️⚠️ K 这个式子必须和「放大登录框」那边【逐字一样】,差一点这儿就瞄歪了。
    //
    // ⚠️⚠️ 用二分,不解方程。解析解是有的(q*K=目标,宽/高两侧各解一个取大的),
    //    可 q 和屏上尺寸之间夹着好几件量不准的事:窗一宽副标题就从两行变一行(h0 跳变)、
    //    码比钮栏窄之后窗宽改由钮栏说了算(换了个式子)、这台 WebView 认不认 fit-content。
    //    每多一种情况就多一个能写错的地方 —— 2026-10-31 上午那版就是这么栽的:
    //    「外」量错 -> 公式出负数 -> 夹到下限 -> 码反而只剩 29% 屏宽(比不摆还差)。
    //    二分【量的是结果本身】,上面那些一件都不用管,连 外 和 钮宽 都不用量。
    //    (单调性:宽这侧 q*K = 0.96*W*q/(q+外)、高那侧 = 0.96*H*q/(h0+q),两个都随 q 增;
    //     两个增函数取 min 还是增的 -> 二分成立。)
    var 目标 = W * 码占屏宽;
    var 轮 = 0, 低 = 100, 高 = 900, q = 0, 屏上 = 0;
    for (; 轮 < 11; 轮++) {
      q = Math.round((低 + 高) / 2);
      设(码, 'width', q + 'px'); 设(码, 'height', q + 'px');
      // ⚠️ getBoundingClientRect 会【同步】逼出一次重排,所以不用等 ——
      //    这一轮改完,立刻就量得到新的窗口尺寸。
      var r1 = 弹窗.getBoundingClientRect();
      屏上 = q * Math.max(1, Math.min(W / r1.width, H / r1.height) * 0.96);
      if (Math.abs(屏上 - 目标) <= 3) break;
      if (屏上 > 目标) 高 = q; else 低 = q;
      if (高 - 低 <= 1) break;
    }

    // ⚠️ 那张码的原图是 300x300,撑过 300 才需要【点阵】放大(默认那种平滑插值
    //    会把黑白格子的边糊掉,扫码器反而更难认)。瞄 45% 一般到不了 300,
    //    所以这一句现在基本不触发 —— 留着是为了屏特别宽的那天。
    //    ⚠️ 反过来【缩小】时绝不能开:点阵缩小会让格子宽窄不均,更糟。
    if ((码.naturalWidth || 0) && q >= 码.naturalWidth) 设(码, 'image-rendering', 'pixelated');

    return { 成: true, 码: q, 屏: Math.round(屏上), 占: Math.round(屏上 / W * 100), 轮: 轮 + 1 };
  }

  /**
   * 【兜底路】把二维码本身再放大一次。返回放大了几倍(0 = 没找到/没放)。
   *
   * ⚠️ 2026-10-31 起正路是上面那个「摆成竖排」—— 整窗摆竖再放大,码按 码占屏宽 瞄
   *    (现在 45%,机上 448px;摆竖之后的天花板是 82%)。
   *    这一段只在摆竖失败时走(腾讯改了 DOM、横屏、找不到钮那一栏……),
   *    它只能到 371px(37%),而且会盖住说明文字。**别再在这里调系数了**,
   *    它的天花板在注释里算过:弹窗横着的时候,码左右就那 299px 自由带。
   *
   * ⚠️⚠️ 2026-10-30 重写了【取景】那一段。老的是「以码自己的中心为原点、两边对称地长」:
   *        能到多宽 = 2 × min(心 - 弹.left, 弹.right - 心) × 0.98
   *      可弹窗是【两栏】的 —— 左边三个登录钮,右边这一栏放码 —— 码的中心天然偏右,
   *      所以卡住它的永远是右边那一侧。拿真页量过(腾讯 992 布局,数在 CLAUDE.md):
   *        弹窗 [161,831] · 码 104px 居中在 695 → 能长到 266px(×2.57)
   *        长完是 [562,828]:离弹窗右边框【只剩 3px】,左边却空着 53px。
   *      用户 2026-10-30:「好像太靠右边缘了,看起来有点怪」—— 就是这 3px 对 53px。
   *
   * 新的:码【可以挪】,不再钉死在自己的中心上 ——
   *   ① 右界 = 弹窗右边 - 边距。边距取【弹窗自己留给这一栏的右内边距】(腾讯那版 19px),
   *      跟着它自己的留白走,不自己拍一个数。
   *   ② 左界 = 码左边那些「不在本栏里」的东西(三个登录钮、「账号登录」页签)
   *      最靠右的那条边 + 边距。
   *   ③ 长到 [左界,右界] 这么宽,并且平移到这一段的【正中】。
   *      同一组真页数据:×2.50,两边各留 19px(屏上 28px)。
   *
   * ⚠️ 尺寸几乎没变(2.57 → 2.50)。不是没调好 —— 「不许盖住左边那三个钮」这条
   *    本来就已经把它顶到天花板了,老算法只是把富余全堆在左边那条缝里。
   * ⚠️⚠️ 2026-10-31 更正:我当时在这里写过「要再大只能去动 DESIGN §6」——【写错了】。
   *    出路不在这个函数里,也不用动那条规矩:**把弹窗摆成竖的**,码能到 815px
   *    (2.2 倍),四条路一条没少。见上面的 `摆成竖排`。
   *    教训:「在当前这个框里到顶了」不等于「到顶了」—— 先问问框本身能不能换个摆法。
   * ⚠️ 本栏【里面】的字(「打开腾讯视频APP扫码」「如何扫码」)可以盖 —— 盖的是码自己的
   *    说明,老算法本来也盖着。栏外的一个都不许盖。分界线就是「栏」那一爬。
   * ⚠️ 只扫【左边】。弹窗右边除了内边距什么都没有;右边也扫的话会被右上角那个
   *    24px 的「×」顶住 —— 它和放大后的码只压上 2px,为这 2px 要少掉 19% 的尺寸,
   *    而且宽度会在 217/261 两个值之间来回跳、不收敛。
   * ⚠️ 用 transform 不改 width —— 改 width 会触发腾讯自己的布局重算,
   *    二维码可能被重画成原尺寸。
   */
  /** 弹窗里最大的那个【方】图就是二维码(logo、钮上的小图标都很小)。没有返回 null。 */
  function 找二维码(弹窗) {
    var 码 = null, 最大 = 0;
    var 全部 = 弹窗.querySelectorAll('img,canvas');
    for (var i = 0; i < 全部.length; i++) {
      var e = 全部[i], r = e.getBoundingClientRect();
      if (r.width < 60 || Math.abs(r.width - r.height) > r.width * 0.15) continue;
      if (r.width > 最大) { 最大 = r.width; 码 = e; }
    }
    return 码;
  }

  function 放大二维码(弹窗) {
    var 码 = 找二维码(弹窗);
    if (!码) return 0;

    var 弹 = 弹窗.getBoundingClientRect();
    var r2 = 码.getBoundingClientRect();
    var 心x = r2.left + r2.width / 2, 心y = r2.top + r2.height / 2;

    // ⚠️ 下面量到的全是【已经被弹窗那一层 scale 过】的屏上坐标,一路用屏上的数算,
    //    只有最后写 transform 那一下才换算回码自己的坐标系。
    function 真看得见(el) {
      var rr = el.getBoundingClientRect();
      if (rr.width < 4 || rr.height < 4) return false;
      var ss = window.getComputedStyle(el);
      return ss.visibility !== 'hidden' && ss.display !== 'none';
    }

    /** 真正动手。[左,右] 是【屏上】要占的那一段 */
    function 贴上去(左, 右) {
      var 要多宽 = 右 - 左;
      if (!(要多宽 > r2.width * 1.05)) return 0;      // 涨不了多少就别动,免得反而糊
      var K = 要多宽 / r2.width;
      // ⚠️ translate 吃的是【码自己】的坐标系,而码正长在一个被 scale 过的弹窗里,
      //    所以屏上要挪多少,得先除掉弹窗那一层的倍数,不然会挪过头。
      var 盒倍 = (弹窗.offsetWidth ? 弹.width / 弹窗.offsetWidth : 1) || 1;
      var 挪 = ((左 + 右) / 2 - 心x) / 盒倍;
      var cs = window.getComputedStyle(码);
      码.style.transformOrigin = 'center center';
      // ⚠️ 顺序是 translate 在前、scale 在后 —— 这样挪的距离【不】跟着 K 一起放大。
      码.style.setProperty('transform',
          (cs.transform && cs.transform !== 'none' ? cs.transform + ' ' : '')
          + (Math.abs(挪) >= 1 ? 'translateX(' + 挪.toFixed(1) + 'px) ' : '')
          + 'scale(' + K.toFixed(3) + ')', 'important');
      // ⚠️ 二维码要盖在同层其它东西上面,否则会被旁边的文字/分隔线切掉
      码.style.position = 码.style.position || 'relative';
      码.style.zIndex = '2147483647';
      码.style.imageRendering = 'pixelated';     // 放大的码保持硬边,比插值糊掉好扫
      return +K.toFixed(2);
    }

    // 码自己那一栏:往上爬,停在「还不到弹窗一半宽」的最外一层。栏里可盖、栏外不可。
    var 栏 = 码, p = 码.parentElement;
    while (p && p !== 弹窗) {
      var rp = p.getBoundingClientRect();
      if (rp.width >= 弹.width * 0.5) break;
      栏 = p; p = p.parentElement;
    }
    // ⚠️ 2%~4% 那两道夹子是给「爬不出栏」的那天留的(那时 栏 就是码本身,
    //    算出来的边距会大得离谱)。腾讯现版本 19px 落在夹子中间,夹子没参与。
    var 边距 = Math.min(Math.max(弹.right - 栏.getBoundingClientRect().right, 弹.width * 0.02),
                        弹.width * 0.04);
    var 右界 = 弹.right - 边距;

    var 全 = 弹窗.querySelectorAll('*'), 挡 = [];
    for (var k = 0; k < 全.length; k++) {
      var el = 全[k];
      if (el === 栏 || 栏.contains(el)) continue;
      var re = el.getBoundingClientRect();
      if (re.right > r2.left) continue;   // 不在码左边 —— 包着码的那些大容器也在这一句里滤掉
      if (!真看得见(el)) continue;
      挡.push(re);
    }

    // 码是方的:长多宽就长多高 → 「竖着撞上谁」和「能有多宽」互相决定。迭代到不动为止。
    function 左边界(宽) {
      var 上 = 心y - 宽 / 2, 下 = 心y + 宽 / 2, L = 弹.left;
      for (var j = 0; j < 挡.length; j++) {
        var q = 挡[j];
        if (q.bottom <= 上 || q.top >= 下) continue;    // 竖直方向压根碰不着
        if (q.right > L) L = q.right;
      }
      return L + 边距;
    }
    var 左界 = 弹.left + 边距, 宽 = 右界 - 左界;
    for (var 轮 = 0; 轮 < 6; 轮++) {
      var 新左 = 左边界(宽), 停 = Math.abs((右界 - 新左) - 宽) < 1;
      左界 = 新左; 宽 = 右界 - 新左;
      if (停) break;
    }
    var 收 = 左边界(宽);        // 收口:拿【最终】这一块再撞一次。只许缩 —— 缩了只会更空
    if (收 > 左界) { 左界 = 收; 宽 = 右界 - 左界; }

    // 🔴 保险。上面只扫左边,等于赌「码在右栏」。万一哪天腾讯把两栏对调,这一赌就是
    //    把三个登录钮全盖掉(四条路一条都走不了)。所以收尾比一次:挪过去之后
    //    【新】压上的大块(宽 ≥ 弹窗 25%)只要有一个,整段作废,退回老的对称算法 ——
    //    那个的毛病只是贴边,不会盖钮。
    // ⚠️⚠️ 判据必须是「【新】压上」,不能是「压上」。弹窗顶上那行副标题
    //    (「微信/QQ/手机号」独立账号的数据)横跨大半个弹窗,【老算法本来就压着它】——
    //    按「压上」判的话每次都退回去,这段重写等于白写。2026-10-30 在真页上撞到:
    //    sha 验过是本文件的函数,跑出来却还是老的 ×2.57、离边 4px,就是这一下。
    var 老宽 = 2 * Math.min(心x - 弹.left, 弹.right - 心x) * 0.98;
    var 老左 = 心x - 老宽 / 2, 老右 = 心x + 老宽 / 2;
    var 上 = 心y - 宽 / 2, 下 = 心y + 宽 / 2;
    function 压上了(rg, 左, 右, 上, 下) {
      return !(rg.right <= 左 || rg.left >= 右 || rg.bottom <= 上 || rg.top >= 下);
    }
    for (var m = 0; m < 全.length; m++) {
      var g = 全[m];
      if (g === 栏 || 栏.contains(g) || g.contains(码)) continue;   // 祖先不算挡路
      var rg = g.getBoundingClientRect();
      if (rg.width < 弹.width * 0.25) continue;
      if (!压上了(rg, 左界, 右界, 上, 下)) continue;
      if (压上了(rg, 老左, 老右, 心y - 老宽 / 2, 心y + 老宽 / 2)) continue;   // 老的也压着,不算新账
      if (!真看得见(g)) continue;
      return 贴上去(老左, 老右);
    }
    return 贴上去(左界, 右界);
  }

  /**
   * 找到登录弹窗那个白框。照插件 findLoginBox()。
   *
   * 两步:
   *   ① 先抓【含登录字样、且面积最小】的可见节点当种子 —— 最小的那个才是文字本身,
   *      不是包着半个页面的容器
   *   ② 从种子往上爬到「仍 < 95% 视口宽」的最外层盒子 —— 碰到全屏遮罩就停,
   *      停下来那个就是对话框本身(含二维码和三个按钮)
   *
   * ⚠️ 跨域 iframe 的登录浮层读不到里面,但整个 iframe 能缩放 —— 兜底走它。
   */
  function 找登录框() {
    var W = document.documentElement.clientWidth;
    var 看得见 = function (e) {
      var r = e.getBoundingClientRect(), s = window.getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    // ⚠️ 判据比插件严一点,而且是【必须】严:
    //    插件的 findLoginBox 只在【点完登录钮之后】调,弹窗一定在,不会认错。
    //    我们是从开窗就一直轮询(登录不脚本化,点钮的是用户),所以会撞上页面上
    //    别的含「登录」字样的东西 —— 2026-09-24 实测就放大错了一个 382px 的横幅。
    //    真弹窗里这几个词【同时】出现,横幅最多占一个 → 要求命中 ≥2 种。
    var 词 = ['账号登录', '扫码登录', '微信登录', 'QQ登录', '手机号登录', '打开腾讯视频', 'APP扫码'];
    var 中了几种 = function (文) {
      var n = 0;
      for (var k = 0; k < 词.length; k++) if (文.indexOf(词[k]) >= 0) n++;
      return n;
    };
    var 最少命中 = 2;
    var 最小宽 = 200, 最小高 = 150;   // 再小的不可能是那个对话框

    var 种子 = null, 最小 = Infinity;
    var 候选 = document.querySelectorAll('div,section,form,span,p,h1,h2,h3,a');
    for (var i = 0; i < 候选.length; i++) {
      var e = 候选[i];
      if (中了几种(e.textContent || '') < 最少命中) continue;
      if (!看得见(e)) continue;
      var rr = e.getBoundingClientRect();
      var 面积 = rr.width * rr.height;
      if (面积 > 0 && 面积 < 最小) { 种子 = e; 最小 = 面积; }
    }

    if (!种子) {
      var frames = document.querySelectorAll('iframe');
      for (var j = 0; j < frames.length; j++) {
        var f = frames[j];
        if (/login|ptlogin|passport|connect|graph\.qq|xui/i.test(f.src || '')
            && 看得见(f) && f.getBoundingClientRect().width > 150) return f;
      }
      return null;
    }

    var 盒 = 种子, p = 种子.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      var r2 = p.getBoundingClientRect();
      if (r2.width > 0 && r2.width <= W * 0.95) { 盒 = p; p = p.parentElement; }
      else break;
    }
    // 爬完了再量一次 —— 太小的不是那个对话框
    var r3 = 盒.getBoundingClientRect();
    if (r3.width < 最小宽 || r3.height < 最小高) return null;
    return 盒;
  }
})();
