// 发评论网络钩子 —— 纯观察,不改任何请求。
// 解析逻辑照搬 qq-unified/net-hook.js(已在 Chrome 上验证过),只是:
//   · WebView 只有一个 JS 世界 → 一个钩子同时抓到"页面原生发送"和"将来我们自己发的",不用分 MAIN/ISOLATED
//   · 不做 normalizeBody / injectHdrs —— 那两个是迁就打包引擎的,这里没有引擎
// 通过 `安卓.报(json)` 上报给安卓侧。⚠️ 别写成 qqBridge —— 那是 ../android-spike 的桥名,
//    这个 App 没有那个对象,写错了会被 catch 吞掉、一个月查不出来(见 say 的注释)。
(function () {
  if (window.__qqHookInstalled) return;
  window.__qqHookInstalled = true;

  var PUB = 'doPublishAction';

  function isPub(u) {
    var s = typeof u === 'string' ? u : (u && u.url) || '';
    return s.indexOf(PUB) !== -1;
  }

  /**
   * 「看着像发评论、但没匹配上」的请求,记一份。
   *
   * ⚠️ 2026-10-02 真发第一次失败的时候,这里什么都答不出来 ——
   *    日志只有「点了发布,等回执」然后 90 秒超时,
   *    **发送明细表 0 行**,连失败都没记上,页面也找不出我们那条
   *    (「腾讯网友」是腾讯给没设昵称的用户的默认名,本来就认不出是谁)。
   *    于是「是请求没发出去、还是端点换了名字、还是响应没回来」三者分不清。
   *
   * 记下来之后就分得清了:
   *   · 这里是空的 → 请求压根没发出去(点发布没真提交)
   *   · 这里有东西 → 端点换名字了,照着改 PUB 就行(推个 js,不用重装)
   */
  window.__qq近似请求 = window.__qq近似请求 || [];
  var 像发评论 = /publish|comment|feed|post/i;
  function 记近似(u, 怎么发的) {
    try {
      var str = typeof u === 'string' ? u : (u && u.url) || '';
      if (!str || isPub(str) || !像发评论.test(str)) return;
      if (window.__qq近似请求.length > 40) return;      // 别无限涨
      window.__qq近似请求.push(怎么发的 + ' ' + str.slice(0, 160));
    } catch (e) {}
  }
  function parseBody(b) {
    try { return typeof b === 'string' ? JSON.parse(b) : (b || {}); } catch (e) { return {}; }
  }
  function isComment(b) { return parseBody(b).publish_type === 2; }   // 2 = 评论
  function contentOf(b) {
    var o = parseBody(b);
    return (o.base_info && o.base_info.content) || '';
  }
  function nowStr() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  /**
   * 🔴🔴 2026-10-24:这个函数【整整一个月一个字都没送出去过】。
   *
   * 原来写的是 `qqBridge.postMessage(...)` —— 那是从 `../android-spike` 搬过来时
   * 留下的桥名。这个 App 的桥叫 **`安卓.报(…)`**,`qqBridge` 根本不存在。
   * 于是每一次上报都抛 ReferenceError,**而且被 `catch (e) {}` 干干净净地吞掉**。
   *
   * 症状有多阴:
   *   · 真发其实【一直是成功的】—— 评论真的发出去了、页面上看得见「审核中」
   *   · 但状态机永远收不到 feed_id → 卡在「等回执」→ 90 秒超时 → 自愈/换号
   *   · 发送明细表 0 行,连失败都没记上
   *   · 查了好几轮都以为是「请求没发出去」
   *
   * ⚠️ 教训:**桥这种东西不许静默失败**。下面保留 try(不能让上报异常打断页面),
   *    但失败要留痕:记进 `__qq报不出去` 给探针/冒烟查,再 console.error 一声。
   */
  window.__qq报不出去 = window.__qq报不出去 || [];
  function say(o) {
    o.时刻 = nowStr();
    var 文 = '';
    try { 文 = JSON.stringify(o); } catch (e) { 文 = '{}'; }
    try {
      if (window.安卓 && typeof 安卓.报 === 'function') { 安卓.报(文); return; }
      throw new Error('没有 安卓.报');
    } catch (e) {
      try {
        if (window.__qq报不出去.length < 20) window.__qq报不出去.push(String(e) + ' | ' + 文.slice(0, 120));
        console.error('[评论助手] 报不出去:', e, 文.slice(0, 200));
      } catch (e2) {}
    }
  }

  // 反刷头有哪些(只报名字和长度,不报值 —— 那是鉴权 token)
  function hdrInfo(h) {
    var want = ['uskey', 'h38', 'simple_kv', 'uniqaid'];
    var out = {};
    try {
      if (!h) return out;
      var put = function (k, v) {
        if (want.indexOf(String(k).toLowerCase()) >= 0) out[k] = String(v).length + '字符';
      };
      if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach(function (v, k) { put(k, v); });
      else if (Array.isArray(h)) h.forEach(function (p) { if (p) put(p[0], p[1]); });
      else Object.keys(h).forEach(function (k) { put(k, h[k]); });
    } catch (e) {}
    return out;
  }

  // 判定:三种结局。第三种就是"输入框清空了但服务器其实没收"。
  function emit(raw, reqContent, hdrs, via) {
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { say({ 结论: '响应不是JSON', 途径: via, 原文: String(raw).slice(0, 200) }); return; }

    var feed = data && data.data && (data.data.feed || data.data.comment_feed);
    var feedId = (feed && feed.base_info && feed.base_info.feed_id) || '';
    var ret = data && (data.ret != null ? data.ret : (data.data && data.data.ret));

    if (feedId) {
      say({ 结论: '✅真成功', feed_id: feedId, 内容: reqContent, 途径: via, 反刷头: hdrs });
    } else if (ret != null && ret !== 0) {
      say({ 结论: '❌服务器拒绝', ret: ret, msg: (data && data.msg) || '', 内容: reqContent, 途径: via });
    } else {
      say({
        结论: '⚠️影子软限流(ret=0 但没有 feed_id)',
        ret: ret, 内容: reqContent, 途径: via,
        响应原文: JSON.stringify(data).slice(0, 400)
      });
    }
  }

  // —— fetch ——
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    记近似(url, 'fetch');
    var watch = isPub(url) && opts && opts.body && isComment(opts.body);
    var rc = watch ? contentOf(opts.body) : '';
    var hi = watch ? hdrInfo(opts.headers) : null;
    if (watch) say({ 结论: '→ 发出(fetch)', 内容: rc, 反刷头: hi });
    var p = origFetch.apply(this, arguments);
    if (watch) {
      try {
        p.then(function (resp) {
          try { resp.clone().text().then(function (t) { emit(t, rc, hi, 'fetch'); }).catch(function () {}); } catch (e) {}
        }).catch(function (e) { say({ 结论: '❌请求本身失败', 错误: String(e), 内容: rc }); });
      } catch (e) {}
    }
    return p;
  };

  // —— XHR ——
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    记近似(url, 'XHR');
    this.__qqPub = isPub(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__qqPub && body && isComment(body)) {
      var rc = contentOf(body);
      say({ 结论: '→ 发出(XHR)', 内容: rc });
      this.addEventListener('load', function () {
        try { emit(this.responseText, rc, null, 'XHR'); } catch (e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  say({ 结论: '钩子已装好', 页面: location.href.slice(0, 80) });
})();
