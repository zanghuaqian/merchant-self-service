/**
 * 自助服务助手 · 共享交互层
 * App 场景与公众号 H5 场景复用同一套诊断链路（PRD 3.2：诊断流程与 App 一致）
 * 页面只负责各自的外壳（底部导航 / 微信 H5 头部）与功能页跳转方式。
 */

/* ============================ 视图与弹层工具 ============================ */
window.UI = (function () {
  var root = null;
  var stack = [];

  function views() { return root.querySelectorAll('[data-view]'); }

  function init(el) { root = el; }

  function go(name, opts) {
    opts = opts || {};
    var target = root.querySelector('[data-view="' + name + '"]');
    if (!target) return;
    views().forEach(function (v) { v.classList.remove('is-active'); });
    target.classList.add('is-active');
    target.classList.remove('slide-in');
    if (opts.animate !== false) {
      void target.offsetWidth;
      target.classList.add('slide-in');
    }
    var body = target.querySelector('.view-body');
    if (body) body.scrollTop = 0;
    if (opts.push !== false) stack.push(name);
    if (opts.reset) stack = [name];
    if (window.updateTooltipPosition) requestAnimationFrame(window.updateTooltipPosition);
  }

  function back(fallback) {
    stack.pop();
    var prev = stack[stack.length - 1] || fallback;
    if (prev) {
      stack.pop();
      go(prev);
    }
  }

  function toast(msg, ms) {
    var el = root.querySelector('.toast');
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add('is-active');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('is-active'); }, ms || 1900);
  }

  function mask(html, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'mask' + (opts.center ? ' center' : '');
    el.innerHTML = html;
    el.addEventListener('click', function (e) {
      if (e.target === el && opts.dismissible !== false) close(el);
    });
    root.appendChild(el);
    void el.offsetWidth;
    el.classList.add('is-active');
    if (window.updateTooltipPosition) requestAnimationFrame(window.updateTooltipPosition);
    return el;
  }

  function close(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function dialog(opts) {
    var el = mask(
      '<div class="dialog">' +
      '<h3>' + opts.title + '</h3>' +
      '<p>' + opts.text + '</p>' +
      '<div class="dlg-btns"><button data-act="cancel">' + (opts.cancel || '取消') + '</button>' +
      '<button data-act="ok">' + (opts.ok || '确定') + '</button></div></div>',
      { center: true, dismissible: false }
    );
    el.querySelector('[data-act="cancel"]').onclick = function () {
      close(el);
      if (opts.onCancel) opts.onCancel();
    };
    el.querySelector('[data-act="ok"]').onclick = function () {
      close(el);
      if (opts.onOk) opts.onOk();
    };
    return el;
  }

  /* 系统状态栏（复刻真机截图：14:51 / 静音 / 5G / 89%） */
  function statusBarHTML(theme) {
    var signal = '<svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">' +
      '<rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.6" y="5" width="3" height="6" rx="1"/>' +
      '<rect x="9.2" y="2.6" width="3" height="8.4" rx="1"/><rect x="13.8" y="0" width="3" height="11" rx="1"/></svg>';
    var mute = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
      '<path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 19a2 2 0 0 0 3 0"/><path d="M3 3l18 18"/></svg>';
    return '<div class="status-bar ' + (theme === 'blue' ? 'on-blue' : 'on-light') + '">' +
      '<div class="sb-left"><span>14:51</span>' + mute + '</div>' +
      '<div class="sb-right">' + signal + '<span style="font-size:12px;font-weight:700">5G</span>' +
      '<span class="sb-battery">89</span></div></div>';
  }

  function mountStatusBars(scope) {
    (scope || document).querySelectorAll('[data-statusbar]').forEach(function (el) {
      el.outerHTML = statusBarHTML(el.getAttribute('data-statusbar'));
    });
  }

  return {
    init: init, go: go, back: back, toast: toast, mask: mask, close: close, dialog: dialog,
    statusBarHTML: statusBarHTML, mountStatusBars: mountStatusBars
  };
})();

/* ============================ 助手主流程 ============================ */
window.Assistant = (function () {
  var cfg = null;
  var state = {
    result: null,
    userAction: '',
    solution: null,
    feedback: '',
    feedbackDone: false,
    feedbackReportUrl: '',
    resolvedKeys: [],
    processLog: [],
    activeStepKey: '',
    multiBundle: null
  };

  function emptyState(keepResolved) {
    return {
      result: null,
      userAction: '',
      solution: null,
      feedback: '',
      feedbackDone: false,
      feedbackReportUrl: '',
      resolvedKeys: keepResolved ? (state.resolvedKeys || []).slice() : [],
      processLog: keepResolved ? (state.processLog || []).slice() : [],
      activeStepKey: '',
      multiBundle: keepResolved ? state.multiBundle : null
    };
  }

  function resolveId(stepKey, mch) {
    mch = mch || merchant();
    return (mch.mchId || '') + ':' + stepKey;
  }

  function isStepResolved(stepKey, mch) {
    var id = resolveId(stepKey, mch);
    return state.resolvedKeys.indexOf(id) >= 0 || state.resolvedKeys.indexOf(stepKey) >= 0;
  }

  function resolvedKeysForMerchant(m) {
    var prefix = (m.mchId || '') + ':';
    var out = [];
    (state.resolvedKeys || []).forEach(function (k) {
      if (k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
      else if (k.indexOf(':') < 0) out.push(k);
    });
    return out;
  }

  function resultBundles() {
    if (state.multiBundle && state.multiBundle.length) return state.multiBundle;
    if (state.result) return [{ merchant: merchant(), result: state.result }];
    return [];
  }

  /** 当前结果中的全部异常项（含并行发现的 others） */
  function allAbnormals(result) {
    result = result || state.result;
    if (!result) return [];
    var list = [];
    if (result.primary) list.push(result.primary);
    (result.others || []).forEach(function (o) { list.push(o); });
    return list;
  }

  function selfServiceAbnormals(result) {
    return allAbnormals(result).filter(function (s) { return s.selfService; });
  }

  function unfinishedAbnormals(result, mch) {
    return allAbnormals(result).filter(function (s) {
      return !isStepResolved(s.key, mch);
    });
  }

  function allSelfServiceDone(result, mch) {
    var list = selfServiceAbnormals(result);
    if (!list.length) return false;
    return list.every(function (s) { return isStepResolved(s.key, mch); });
  }

  function allSelfServiceDoneAcross() {
    var bundles = resultBundles();
    var any = false;
    for (var i = 0; i < bundles.length; i++) {
      var list = selfServiceAbnormals(bundles[i].result);
      if (!list.length) continue;
      any = true;
      if (!list.every(function (s) { return isStepResolved(s.key, bundles[i].merchant); })) return false;
    }
    return any;
  }

  function markSelfServiceDone(actionText) {
    var m = merchant();
    var rawKey = state.activeStepKey || (state.result && state.result.primary && state.result.primary.key) || '';
    if (rawKey.indexOf(':') >= 0) {
      var parts = rawKey.split(':');
      rawKey = parts.slice(1).join(':');
    }
    var id = rawKey ? resolveId(rawKey, m) : '';
    if (id && state.resolvedKeys.indexOf(id) < 0) state.resolvedKeys.push(id);

    var step = null;
    resultBundles().forEach(function (b) {
      if (step) return;
      allAbnormals(b.result).forEach(function (s) {
        if (s.key === rawKey) step = s;
      });
    });
    state.processLog.push({
      key: rawKey || '',
      name: step ? step.name : '自助处理',
      action: actionText || '已完成自助处理',
      time: MSS.formatTime(new Date()),
      mchId: m.mchId,
      mchName: m.name
    });
    if (actionText) state.userAction = actionText;
  }

  /** 自助提交成功后：刷新结果页（反馈在退出诊断报告时再收集） */
  function afterSelfServiceSuccess(actionText, toastMsg) {
    markSelfServiceDone(actionText);
    MSS.track('自助操作完成', actionText || '');
    if (toastMsg) UI.toast(toastMsg);
    setTimeout(function () {
      if (state.result) showResult(state.result);
      else UI.go('asst-result', { animate: false });
    }, 900);
  }

  function diagnoseTargets() {
    if (cfg.getDiagnoseMerchants) {
      var list = cfg.getDiagnoseMerchants() || [];
      if (list.length) return list;
    }
    return [merchant()];
  }

  var FAQS = [
    { q: '资金什么时候到账？', a: 'T+1 结算的资金在结算日 10:00 前完成出款，银行入账通常在 2 小时内；节假日以银行处理时效为准。' },
    { q: '如何开启自动提现？', a: '进入「我的 → 账户余额 → 我的账户 → 结算设置」，打开「是否自动结算」开关并选择日切时间，保存后次日生效。关闭自动结算时可发起自助结算。' },
    { q: '结算卡可以换成对公账户吗？', a: '可以。个体工商户支持法人同名对私卡或对公账户；企业商户仅支持对公账户，变更需重新提交开户证明。' },
    { q: '退款为什么迟迟没有退回？', a: '退款由原支付渠道退回，微信/支付宝一般 1-3 个工作日，银行卡最长 7 个工作日；可在交易查询中查看退款状态。' }
  ];

  function icon(name) {
    var svg = {
      wallet: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 9V7a2 2 0 0 1 2-2h9"/><circle cx="16.5" cy="12.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
      chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.5A8 8 0 0 1 13 4a8 8 0 0 1 8 8z"/><path d="M9 11h8M9 15h5"/></svg>',
      shield: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
      arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
      headset: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h2.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM20 14h-2.5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z"/></svg>'
    };
    return svg[name] || '';
  }

  function tip(text) {
    return '<span class="tooltip-icon"><i class="bi bi-lightbulb-fill"></i></span>' +
      '<div class="product-tip"><div class="product-tip-content">' + text + '</div></div>';
  }

  function slot(name) { return cfg.root.querySelector('[data-slot="' + name + '"]'); }

  function init(options) {
    cfg = options;
    UI.init(options.root);
    renderHome();
  }

  function merchant() { return cfg.getMerchant(); }

  /* ------------------------------ 助手首页（5.1） ------------------------------ */

  function merchantOptions() {
    return cfg.getMerchantList ? cfg.getMerchantList() : [];
  }

  function renderHome() {
    var m = merchant();
    var multi = merchantOptions().length > 1;
    var html =
      '<div class="asst-hero">' +
        '<div class="hero-top">' +
          '<div class="greet">' + MSS.greeting() + '，' + m.name +
            '<small>我是自助服务助手，可自动排查资金未到账原因</small></div>' +
          (multi
            ? '<div class="mch-switch-wrap">' +
                tip('微信绑定多个商户号时，默认对上一次查询诊断的商户号发起排查，可在此切换；列表标注每个商户所属业务线（盛意旺 / 线下收单）。') +
                '<button class="mch-switch" data-act="switch-mch" type="button">切换商户<span class="ms-ico">⇄</span></button>' +
              '</div>'
            : '') +
        '</div>' +
        '<div class="id-row"><span class="chip">商户号 ' + MSS.maskMchId(m.mchId) + '</span>' +
          '<span class="chip">' + m.line + '</span>' +
          '<span class="chip">' + (cfg.platform === 'app' ? '登录态识别' : '微信绑定识别') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="asst-cards">' +
        '<button class="entry-card primary" data-act="fund">' +
          '<span class="ec-icon">' + icon('wallet') + '</span>' +
          '<span><span class="ec-title">资金未到账 <em class="hot">高频</em></span>' +
          '<span class="ec-desc">一键排查风控、资质、结算配置、出款批次、分账</span></span>' +
          '<span class="ec-arrow">' + icon('arrow') + '</span>' +
        '</button>' +
        '<button class="entry-card secondary" data-act="other">' +
          '<span class="ec-icon">' + icon('chat') + '</span>' +
          '<span><span class="ec-title">其他问题</span>' +
          '<span class="ec-desc">直接转接人工客服，自动同步商户信息</span></span>' +
          '<span class="ec-arrow">' + icon('arrow') + '</span>' +
        '</button>' +
      '</div>' +
      settleSummaryCard(m) +
      '<div class="faq-block">' +
        '<h3>常见问题' + tip('常见问题列表由后台配置，按产品线与近 7 天咨询热度排序，可随时增删，无需发版。') + '</h3>' +
        '<div class="faq-list">' +
          FAQS.map(function (f, i) {
            return '<button class="faq-item" data-faq="' + i + '"><span class="q-badge">Q</span>' + f.q +
              '<span class="ec-arrow">' + icon('arrow') + '</span></button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="asst-foot">由盛意旺自助服务助手提供 · 诊断结论基于实时系统数据<br>如未解决可随时转接人工客服</div>';

    var el = slot('asst-home');
    el.innerHTML = html;

    el.querySelector('[data-act="fund"]').onclick = function () {
      MSS.track('资金未到账点击', '入口：' + (cfg.platform === 'app' ? 'App 助手首页' : '公众号 H5'));
      startDiagnose();
    };
    el.querySelector('[data-act="other"]').onclick = function () {
      MSS.track('其他问题点击', '直接转人工');
      clearDiagnosis();
      toAgent({ mode: 'queue', reason: '其他问题（未诊断）' });
    };
    var switchBtn = el.querySelector('[data-act="switch-mch"]');
    if (switchBtn) switchBtn.onclick = openMerchantSwitch;

    var settleBtn = el.querySelector('[data-act="settle"]');
    if (settleBtn) settleBtn.onclick = function () {
      MSS.track('结算信息查看', '入口：助手首页');
      renderSettlement();
    };

    el.querySelectorAll('[data-faq]').forEach(function (btn) {
      btn.onclick = function () {
        var f = FAQS[+btn.dataset.faq];
        MSS.track('常见问题点击', f.q);
        var mk = UI.mask('<div class="sheet"><div class="sheet-head"><div><h3>' + f.q +
          '</h3><p>来自知识库 · 最近更新 2026-07-28</p></div><button class="sheet-close">✕</button></div>' +
          '<div class="rc-text" style="margin-top:12px">' + f.a + '</div>' +
          '<div class="btn-row"><button class="btn btn-ghost" data-act="close">知道了</button></div></div>');
        mk.querySelector('.sheet-close').onclick = function () { UI.close(mk); };
        mk.querySelector('[data-act="close"]').onclick = function () { UI.close(mk); };
      };
    });
  }

  /* ------------------------ 商户切换（多商户绑定） ------------------------ */

  function openMerchantSwitch() {
    var list = merchantOptions();
    var cur = merchant();
    MSS.track('打开商户切换', '已绑定 ' + list.length + ' 个商户号');

    var mk = UI.mask(
      '<div class="sheet">' +
        '<div class="sheet-head"><div><h3>切换商户</h3>' +
          '<p>微信号已绑定 ' + list.length + ' 个商户号，默认使用上一次查询的商户</p></div>' +
          '<button class="sheet-close">✕</button></div>' +
        '<div class="mch-list">' +
          list.map(function (m) {
            return '<button class="mch-item' + (m.mchId === cur.mchId ? ' is-on' : '') + '" data-mch="' + m.mchId + '">' +
              '<span class="mi-main"><span class="mi-name">' + m.name +
                '<em class="line-tag ' + (m.lineCode === 'SYW' ? 'syw' : 'offline') + '">' + m.line + '</em></span>' +
                '<span class="mi-id">商户号 ' + m.mchId + '</span></span>' +
              '<span class="mi-state">' + (m.mchId === cur.mchId ? '当前' : (m.selfServiceEnabled ? '可诊断' : '暂未开通')) + '</span>' +
              '</button>';
          }).join('') +
        '</div>' +
        (cfg.onAddMerchant ? '<button class="btn btn-ghost" data-act="add-bind" style="margin-top:12px">+ 绑定新的商户号</button>' : '') +
        '<div class="asst-foot" style="padding:14px 4px 0">线下收单商户一期暂不支持自助诊断，切换后将引导转人工</div>' +
      '</div>');

    mk.querySelector('.sheet-close').onclick = function () { UI.close(mk); };

    var addBtn = mk.querySelector('[data-act="add-bind"]');
    if (addBtn) addBtn.onclick = function () {
      UI.close(mk);
      MSS.track('追加绑定入口点击', '已绑定 ' + list.length + ' 个商户号');
      cfg.onAddMerchant();
    };
    mk.querySelectorAll('[data-mch]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.mch;
        UI.close(mk);
        if (id === cur.mchId) return;
        MSS.track('切换商户', '商户号 ' + id);
        cfg.onSwitchMerchant(MSS.findByMchId(id));
      };
    });
  }

  /* ------------------------ 结算信息与结算规则 ------------------------ */

  function settleSummaryCard(m) {
    var s = MSS.getSettlement(m, cfg.getScenarioId());
    if (!s) return '';
    return '<div class="settle-card" data-act="settle">' +
        '<div class="sc-head"><span class="sc-title">结算信息与结算规则</span>' +
          '<span class="sc-more">查看详情 ›</span></div>' +
        '<div class="sc-body">' +
          '<div class="sc-line"><span class="sc-k">结算卡</span>' +
            '<span class="sc-v">' + s.cardType + ' · ' + s.cardNo.slice(-9) + ' · ' + s.bank.split(' ')[0] +
            (s.cardStatus === '异常' ? '<em class="f-tag bad" style="margin-left:6px">异常</em>' : '') + '</span></div>' +
          '<div class="sc-line"><span class="sc-k">结算规则</span>' +
            '<span class="sc-v">' + s.cycle + ' · 日切 ' + s.cutoff + ' · ' +
            (s.autoWithdraw ? '自动提现已开启' : '<em class="warn-text">未开自动提现</em>') + ' · ' + s.payoutService + '</span></div>' +
        '</div>' +
      '</div>';
  }

  function settleDetailHtml(m) {
    var s = MSS.getSettlement(m, cfg.getScenarioId());
    return (s.cardAlert ? '<div class="alert-bar bad">' + s.cardAlert + '</div>' : '') +
      (s.ruleAlert ? '<div class="alert-bar warn">' + s.ruleAlert + '</div>' : '') +
      (s.payoutAlert ? '<div class="alert-bar bad">' + s.payoutAlert + '</div>' : '') +
      '<div class="form-card"><h3>结算信息' +
        tip('结算卡信息来自结算系统，账户名与卡号按脱敏规则展示；卡状态异常时会与「资金未到账」诊断结论联动提示。') +
        '</h3>' +
        '<div class="form-row"><span class="f-label">结算卡类型</span><span class="f-value" style="text-align:right">' + s.cardType + '账户</span></div>' +
        '<div class="form-row"><span class="f-label">结算卡账户名</span><span class="f-value" style="text-align:right">' + s.accountName + '</span></div>' +
        '<div class="form-row"><span class="f-label">结算卡号</span><span class="f-value" style="text-align:right">' + s.cardNo + '</span>' +
          (s.cardStatus === '异常' ? '<span class="f-tag bad">异常</span>' : '<span class="f-tag ok">正常</span>') + '</div>' +
        '<div class="form-row"><span class="f-label">归属银行</span><span class="f-value" style="text-align:right">' + s.bank + '</span></div>' +
      '</div>' +
      '<div class="form-card"><h3>结算规则' +
        tip('结算规则决定资金何时出款：结算周期与日切时间决定入账批次，未开自动提现需商户手动提现，预留金额不参与出款。') +
        '</h3>' +
        '<div class="form-row"><span class="f-label">结算周期</span><span class="f-value" style="text-align:right">' + s.cycle + '</span></div>' +
        '<div class="form-row"><span class="f-label">日切时间</span><span class="f-value" style="text-align:right">每日 ' + s.cutoff + '</span></div>' +
        '<div class="form-row"><span class="f-label">自动提现</span><span class="f-value" style="text-align:right">' + s.autoWithdrawTime + '</span>' +
          (s.autoWithdraw ? '<span class="f-tag ok">已开启</span>' : '<span class="f-tag warn">未开启</span>') + '</div>' +
        '<div class="form-row"><span class="f-label">预留金额</span><span class="f-value" style="text-align:right">' + s.reserve + ' 元</span></div>' +
        '<div class="form-row"><span class="f-label">出款服务类型</span><span class="f-value" style="text-align:right">' + s.payoutService + '</span></div>' +
        '<div class="form-row"><span class="f-label"></span><span class="f-value" style="text-align:right;color:var(--text-3);font-size:12px">' + s.payoutServiceDesc + '</span></div>' +
      '</div>' +
      '<div class="asst-foot">结算信息与规则由结算系统实时同步<br>如需修改结算卡或提现方式，请前往结算设置</div>';
  }

  function renderSettlement() {
    var m = merchant();
    slot('asst-settle').innerHTML =
      '<div class="notice">当前商户：' + m.name + '（商户号 ' + m.mchId + '，' + m.line + '）</div>' +
      settleDetailHtml(m);
    UI.go('asst-settle');
  }

  /* ------------------------------ 诊断中（4.2 / 5.1） ------------------------------ */

  function startDiagnose(opts) {
    opts = opts || {};
    var resolved = opts.redeploy ? (state.resolvedKeys || []).slice() : [];
    var keptLog = opts.redeploy ? (state.processLog || []).slice() : [];
    var targets = diagnoseTargets();
    var isRedeploy = !!opts.redeploy;
    var isMulti = targets.length > 1;

    state.resolvedKeys = resolved;
    var bundle = targets.map(function (m) {
      return {
        merchant: m,
        result: MSS.diagnose(cfg.getScenarioId(), m, { resolvedKeys: resolvedKeysForMerchant(m) })
      };
    });
    var result = bundle[0].result;

    state = emptyState(false);
    state.result = result;
    state.resolvedKeys = resolved;
    state.processLog = keptLog;
    state.multiBundle = isMulti ? bundle : null;
    state.feedbackDone = false;
    state.feedbackReportUrl = '';
    state.feedback = '';

    var subText = isMulti
      ? '同时诊断 ' + targets.length + ' 个商户：' + targets.map(function (m) { return m.name; }).join('、')
      : (isRedeploy
        ? '已跳过 ' + resolved.length + ' 项已自助处理的异常，继续排查后续项'
        : '已自动获取商户号 ' + MSS.maskMchId(merchant().mchId) + ' · 无需上传凭证');

    slot('asst-diag').innerHTML =
      '<div class="diagnosing">' +
        '<div class="radar"><span></span><span></span><span></span><div class="core">' + icon('shield') + '</div></div>' +
        '<div class="d-title">' + (isRedeploy ? '正在重新诊断…' : (isMulti ? '正在批量诊断…' : '正在诊断，预计 5 秒…')) + '</div>' +
        '<div class="d-sub">' + subText + '</div>' +
        '<div class="progress"><i></i></div>' +
        '<div class="step-list">' +
          MSS.STEPS.map(function (s) {
            return '<div class="step" data-step="' + s.key + '">' +
              '<span class="st-icon">◌</span>' +
              '<span><span class="st-name">' + s.name + '</span><span class="st-source">' + s.source + '</span></span>' +
              '<span class="st-state">排队中</span></div>';
          }).join('') +
        '</div>' +
        '<div class="trace-foot">主流水号 ' + result.traceId +
          (isMulti ? ' · 另含 ' + (targets.length - 1) + ' 份商户报告' : '') + '</div>' +
      '</div>';

    UI.go('asst-diag');
    MSS.track(isRedeploy ? '重新诊断' : '发起诊断',
      (isMulti ? '多商户×' + targets.length + ' · ' : '') +
      '流水号 ' + result.traceId +
      (resolved.length ? ' · 已恢复 ' + resolved.join(',') : ''));

    var box = slot('asst-diag');
    var bar = box.querySelector('.progress i');
    var idx = 0;

    function setStep(step, cls, text) {
      var row = box.querySelector('[data-step="' + step.key + '"]');
      row.className = 'step ' + cls;
      row.querySelector('.st-icon').textContent =
        cls === 'done' || cls === 'resolved' ? '✓'
          : cls === 'bad' ? '!'
          : cls === 'skip' ? '–'
          : '◍';
      row.querySelector('.st-state').textContent = text;
    }

    function tick() {
      if (result.timeout && idx === 3) {
        bar.style.width = '72%';
        setStep(result.steps[3], 'running', '查询中');
        box.querySelector('.d-title').textContent = '诊断耗时较长…';
        setTimeout(onTimeout, 1500);
        return;
      }
      if (idx >= result.steps.length) {
        bar.style.width = '100%';
        setTimeout(function () { showResult(result); }, 320);
        return;
      }
      var step = result.steps[idx];
      setStep(step, 'running', '查询中');
      bar.style.width = Math.round(((idx + 1) / result.steps.length) * 100) + '%';
      setTimeout(function () {
        if (step.status === 'abnormal') setStep(step, 'bad', '发现异常');
        else if (step.status === 'skipped') setStep(step, 'skip', '已终止');
        else if (step.status === 'resolved') setStep(step, 'resolved', '已恢复');
        else setStep(step, 'done', '正常');
        idx++;
        tick();
      }, step.status === 'skipped' ? 90 : 460);
    }

    setTimeout(tick, 260);
  }

  function onTimeout() {
    MSS.track('诊断超时', '>5 秒，弹出转人工确认');
    UI.dialog({
      title: '网络繁忙',
      text: '出款系统查询超时（已重试 1 次），是否转接人工客服为您查询？',
      cancel: '重新诊断',
      ok: '转人工',
      onCancel: function () { startDiagnose(); },
      onOk: function () { toAgent({ mode: 'chat', reason: '诊断超时转人工' }); }
    });
  }

  /* ------------------------------ 诊断结果（5.1） ------------------------------ */

  function detailRows(result, mch) {
    return result.steps.map(function (s) {
      var done = isStepResolved(s.key, mch) && (s.status === 'abnormal' || s.status === 'resolved');
      var status = done ? 'resolved' : s.status;
      var cls = status === 'abnormal' ? 'bad'
        : status === 'skipped' ? 'skip'
        : status === 'resolved' ? 'resolved'
        : 'done';
      var label = status === 'abnormal' ? '异常'
        : status === 'skipped' ? '未执行'
        : status === 'resolved' ? '已自助'
        : '正常';
      var brief = done ? '商户已完成自助处理' : s.brief;
      return '<div class="step ' + cls + '">' +
        '<span class="st-icon">' + (cls === 'bad' ? '!' : cls === 'skip' ? '–' : '✓') + '</span>' +
        '<span><span class="st-name">' + s.name + '</span><span class="st-source">' + brief + '</span></span>' +
        '<span class="st-state">' + label + '</span></div>';
    }).join('');
  }

  function abnormalCards(result, mch) {
    var items = allAbnormals(result);
    if (!items.length) {
      return '<div class="abn-empty">该商户本次未发现异常项</div>';
    }
    return '<div class="abn-list">' +
      '<div class="abn-title">异常诊断项（' + items.length + '）' +
        tip('所有异常项置顶展示。可点击展开查看详情并按指引处理；存在多个可自助异常时，需分别完成后再重新诊断。') +
      '</div>' +
      items.map(function (s, i) {
        var done = isStepResolved(s.key, mch);
        var sol = s.solution || {};
        return '<details class="abn-card' + (done ? ' is-done' : '') + '"' + (i === 0 ? ' open' : '') + '>' +
          '<summary>' +
            '<span class="abn-badge">' + (done ? '已自助' : (s.selfService ? '可自助' : '需人工')) + '</span>' +
            '<span class="abn-name">' + s.name + '</span>' +
            '<span class="abn-sum">' + s.summary + '</span>' +
            '<span class="caret">▾</span>' +
          '</summary>' +
          '<div class="abn-body">' +
            '<div class="abn-detail">' + s.detail + '</div>' +
            '<div class="kv"><span class="k">处理方式</span><span class="v">' +
              (s.selfService ? '商户自助处理' : '转人工处理') + '</span></div>' +
            (done
              ? '<div class="abn-done-tip">该项已完成自助处理</div>'
              : (s.selfService
                ? '<button class="btn btn-primary" data-act="solve-one" data-key="' + s.key +
                    '" data-mch="' + mch.mchId + '" type="button">' +
                    (sol.label || '去处理') + '</button>'
                : '<button class="btn btn-primary" data-act="agent-main" type="button">' + icon('headset') + ' 联系客服</button>')) +
          '</div></details>';
      }).join('') +
    '</div>';
  }

  function rediagBox() {
    var unfinished = [];
    resultBundles().forEach(function (b) {
      unfinishedAbnormals(b.result, b.merchant).forEach(function (s) {
        if (s.selfService) unfinished.push(s);
      });
    });
    var hasSelf = unfinished.length > 0 || resultBundles().some(function (b) {
      return selfServiceAbnormals(b.result).length > 0;
    });
    var hasSkip = resultBundles().some(function (b) {
      return b.result.steps.some(function (s) { return s.status === 'skipped'; });
    });
    if (!hasSelf && !hasSkip) return '';
    var canRedeploy = allSelfServiceDoneAcross();
    return '<div class="rediag-box' + (canRedeploy ? ' is-ready' : '') + '">' +
      '<div class="rediag-text">' +
        (canRedeploy
          ? '全部可自助异常项已处理完成。可重新诊断，继续排查此前未执行的后续项。'
          : '请分别完成全部可自助异常项（剩余 ' + unfinished.length + ' 项）后，再重新诊断。') +
      '</div>' +
      '<button class="btn ' + (canRedeploy ? 'btn-primary' : 'btn-ghost') +
        ' rediag-btn" data-act="rediag" type="button"' +
        (canRedeploy ? '' : ' disabled') + '>' +
        (canRedeploy ? '重新诊断' : '完成全部可自助项后再诊断') +
      '</button></div>';
  }

  function detailCollapse(result, mch) {
    return '<details class="collapse">' +
      '<summary>完整排查明细（' + MSS.STEPS.length + ' 项）' +
        tip('诊断引擎按风控→资质→结算配置→出款批次→分账顺序排查。异常项已置顶；完成后可重新诊断未执行项。') +
        '<span class="caret">▾</span></summary>' +
      '<div class="cp-body">' + detailRows(result, mch) + '</div></details>';
  }

  function multiBundleBanner() {
    if (!state.multiBundle || state.multiBundle.length < 2) return '';
    return '<div class="multi-banner">本次同时诊断 <b>' + state.multiBundle.length +
      '</b> 个商户。每位商户独立一张诊断卡片（含基本信息、异常项、完整排查、结算规则）；默认展开第一户，其余收起仅显示诊断结果，点击可展开。转人工时合并为一份报告。</div>';
  }

  function processLogBlock() {
    if (!state.processLog.length) return '';
    return '<div class="plog">' +
      '<div class="plog-title">自助处理过程记录（' + state.processLog.length + '）</div>' +
      state.processLog.map(function (p) {
        return '<div class="plog-item">' +
          '<div class="plog-main">' + p.name + ' · ' + p.action + '</div>' +
          '<div class="plog-sub">' + (p.mchName || p.mchId || '') + ' · ' + p.time + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  /** 结果页折叠区：当前结算信息与规则，便于商户核对到账口径 */
  function settleCollapse(mch) {
    mch = mch || merchant();
    var s = MSS.getSettlement(mch, cfg.getScenarioId());
    if (!s) return '';
    var rows = [
      ['结算卡', s.cardType + ' · ' + s.accountName],
      ['卡号 / 银行', s.cardNo + '（' + s.bank + '）'],
      ['结算周期 / 日切', s.cycle + ' · 每日 ' + s.cutoff],
      ['自动提现', s.autoWithdrawTime],
      ['预留金额', s.reserve + ' 元'],
      ['出款服务类型', s.payoutService + '（' + s.payoutServiceDesc + '）']
    ];
    return '<details class="collapse"><summary>当前结算信息与规则' +
      tip('结果页同屏展示结算卡与结算规则，商户可自行核对到账口径（周期、日切、自动提现、预留金额、出款服务类型），减少「其实是规则问题」的重复咨询。') +
      '<span class="caret">▾</span></summary><div class="cp-body" style="padding-bottom:14px">' +
      rows.map(function (r) {
        return '<div class="kv" style="padding:7px 0"><span class="k" style="flex:0 0 96px">' + r[0] +
          '</span><span class="v">' + r[1] + '</span></div>';
      }).join('') +
      '<button class="btn btn-ghost" data-act="settle-detail" data-mch="' + mch.mchId +
        '" style="margin-top:8px">查看结算信息详情</button>' +
      '</div></details>';
  }

  function merchantResultBrief(result) {
    var abns = allAbnormals(result);
    if (!abns.length) return MSS.STEPS.length + ' 项排查均正常，暂未发现异常';
    if (abns.length === 1) return abns[0].summary;
    return '发现 ' + abns.length + ' 项异常：' + abns.map(function (s) { return s.name; }).join('、');
  }

  /** 单个商户诊断卡片：基本信息 + 异常项 + 完整排查 + 结算信息 */
  function merchantDiagCard(bundle, idx, isMulti) {
    var m = bundle.merchant;
    var r = bundle.result;
    var abns = allAbnormals(r);
    var brief = merchantResultBrief(r);
    var basic =
      '<div class="res-card">' +
        '<div class="rc-label"><span class="bar" style="background:var(--brand)"></span>基本信息</div>' +
        '<div class="kv"><span class="k">商户名称</span><span class="v">' + m.name + '</span></div>' +
        '<div class="kv"><span class="k">商户号</span><span class="v">' + m.mchId + '</span></div>' +
        '<div class="kv"><span class="k">产品线</span><span class="v">' + m.line + '</span></div>' +
        '<div class="kv"><span class="k">诊断流水号</span><span class="v">' + r.traceId + '</span></div>' +
        '<div class="kv"><span class="k">诊断时间</span><span class="v">' + r.time + '</span></div>' +
      '</div>';
    var body = basic + abnormalCards(r, m) + detailCollapse(r, m) + settleCollapse(m);

    if (!isMulti) {
      return '<div class="mch-sec" data-mch-sec="' + m.mchId + '">' + body + '</div>';
    }

    var open = idx === 0;
    return '<details class="mch-diag-card' + (abns.length ? ' has-abn' : ' is-ok') + '"' +
      (open ? ' open' : '') + ' data-mch-sec="' + m.mchId + '">' +
      '<summary class="mch-diag-summary">' +
        '<div class="mds-top">' +
          '<span class="mds-name">' + m.name + '</span>' +
          '<span class="mds-badge">' + (abns.length ? (abns.length + ' 项异常') : '正常') + '</span>' +
          '<span class="caret">▾</span>' +
        '</div>' +
        '<div class="mds-meta">商户号 ' + m.mchId + ' · ' + m.line + '</div>' +
        '<div class="mds-result">' + brief + '</div>' +
      '</summary>' +
      '<div class="mch-diag-body">' + body + '</div>' +
    '</details>';
  }

  function showResult(result) {
    var bundles = resultBundles();
    if (!bundles.length && result) bundles = [{ merchant: merchant(), result: result }];
    var isMulti = bundles.length > 1;

    var totalAbn = 0;
    var unfinishedSelf = 0;
    bundles.forEach(function (b) {
      allAbnormals(b.result).forEach(function (s) {
        totalAbn += 1;
        if (s.selfService && !isStepResolved(s.key, b.merchant)) unfinishedSelf += 1;
      });
    });

    var headHtml;
    if (totalAbn > 0) {
      headHtml =
        '<div class="result-head">' +
          '<div class="result-icon bad">!</div>' +
          '<h2>' + (isMulti
            ? ('共 ' + bundles.length + ' 个商户 · 发现 ' + totalAbn + ' 项异常')
            : ('发现 ' + totalAbn + ' 项异常')) + '</h2>' +
          '<p>' + (isMulti
            ? '每个商户一份诊断卡片。默认展开第一个商户，其余仅显示诊断结果，点击可展开详情。'
            : '异常项已置顶，请逐项展开查看详情并处理。') +
            (unfinishedSelf > 0
              ? '尚有 <b>' + unfinishedSelf + '</b> 项可自助异常待处理，全部完成后再重新诊断。'
              : '可自助项已全部处理，可重新诊断或联系客服。') +
          '</p>' +
        '</div>';
    } else {
      headHtml =
        '<div class="result-head">' +
          '<div class="result-icon ok">✓</div>' +
          '<h2>暂未发现异常</h2>' +
          '<p>' + MSS.STEPS.length + ' 项排查均正常' +
            (state.resolvedKeys.length ? '（含已自助恢复项）' : '') +
            '，资金可能仍在银行处理中。<br>建议 2 小时后再次查看账户余额与结算记录。</p>' +
        '</div>';
    }

    var sections = bundles.map(function (b, idx) {
      return merchantDiagCard(b, idx, isMulti);
    }).join('');

    var footerBtns = totalAbn === 0
      ? '<div class="btn-row"><button class="btn btn-primary" data-act="later">稍后查看</button>' +
          '<button class="btn btn-ghost" data-act="agent">联系客服</button></div>'
      : '<div class="btn-row">' +
          '<button class="btn btn-ghost" data-act="agent">' + icon('headset') + ' 联系客服</button></div>';

    var html =
      '<div class="result">' +
        multiBundleBanner() +
        headHtml +
        (isMulti ? '<div class="mch-diag-list">' + sections + '</div>' : sections) +
        processLogBlock() +
        rediagBox() +
        footerBtns +
        '<div class="trace-foot">诊断时间 ' + (result.time || '') +
          '<br>结论基于实时系统数据，如与实际不符请联系客服</div>' +
      '</div>';

    var el = slot('asst-result');
    el.innerHTML = html;
    UI.go('asst-result');
    MSS.track('诊断完成', totalAbn ? ('异常 ' + totalAbn + ' 项' + (isMulti ? ' · 多商户' : '')) : '未发现异常');

    el.querySelectorAll('[data-act="settle-detail"]').forEach(function (settleLink) {
      settleLink.onclick = function () {
        var mchId = settleLink.getAttribute('data-mch');
        if (mchId && MSS.bindStore && MSS.bindStore.setLast) {
          try { MSS.bindStore.setLast(mchId); } catch (e) { /* ignore */ }
        }
        MSS.track('结算信息查看', '入口：诊断报告 · ' + (mchId || ''));
        renderSettlement();
      };
    });

    el.querySelectorAll('[data-act="solve-one"]').forEach(function (b) {
      b.onclick = function () {
        var key = b.getAttribute('data-key');
        var mchId = b.getAttribute('data-mch');
        var target = null;
        var step = null;
        resultBundles().forEach(function (bundle) {
          if (String(bundle.merchant.mchId) !== String(mchId)) return;
          target = bundle.merchant;
          allAbnormals(bundle.result).forEach(function (s) {
            if (s.key === key) step = s;
          });
        });
        if (!step) return;
        if (target && MSS.bindStore && MSS.bindStore.setLast) {
          try { MSS.bindStore.setLast(target.mchId); } catch (e) { /* ignore */ }
        }
        state.activeStepKey = resolveId(step.key, target || merchant());
        openSolution(step);
      };
    });

    el.querySelectorAll('[data-act="agent"],[data-act="agent-main"]').forEach(function (b) {
      b.onclick = function () {
        var first = allAbnormals(result)[0];
        toAgent({
          mode: 'chat',
          reason: first ? ('诊断结论：' + first.summary) : '未发现异常仍未到账'
        });
      };
    });

    var later = el.querySelector('[data-act="later"]');
    if (later) later.onclick = function () {
      MSS.track('点击稍后查看', '诊断结论：未发现异常');
      exitDiagnosisReport(function () {
        UI.toast('已记录，稍后可在助手首页再次诊断');
        setTimeout(function () { UI.go(cfg.homeView, { reset: true }); }, 400);
      });
    };

    var rediag = el.querySelector('[data-act="rediag"]');
    if (rediag && !rediag.disabled) {
      rediag.onclick = function () {
        MSS.track('排查明细重新诊断', '已恢复：' + ((state.resolvedKeys || []).join(',') || '无'));
        startDiagnose({ redeploy: true });
      };
    }

    if (isMulti) {
      el.querySelectorAll('.mch-diag-card').forEach(function (card) {
        card.addEventListener('toggle', function () {
          if (card.open) {
            MSS.track('展开商户诊断卡片', card.getAttribute('data-mch-sec') || '');
          }
        });
      });
    }
  }

  /* ------------------------------ 解决方案页（4.3） ------------------------------ */

  function openSolution(step) {
    var sol = step.solution;
    state.solution = sol;
    if (!state.activeStepKey || state.activeStepKey.indexOf(step.key) < 0) {
      state.activeStepKey = resolveId(step.key, merchant());
    }
    MSS.track('点击自助操作', sol.label + ' · ' + step.name);

    if (sol.type === 'settle_settings' || sol.page === 'settle_settings') {
      openSettleSettings(step, sol);
      return;
    }

    if (sol.type === 'card_change' || sol.page === 'card') {
      renderCardChangePage(step, sol);
      UI.go('asst-page');
      return;
    }

    if (sol.page === 'risk_order') renderRiskOrderPage(step, sol);
    else if (sol.type === 'guide') renderGuidePage(sol);
    else if (sol.url) renderExternalPage(sol);
    else renderFormPage(step, sol);

    UI.go('asst-page');
  }

  /** App 直达结算设置页；公众号打开小程序结算设置页 */
  function openSettleSettings(step, sol) {
    if (cfg.platform === 'app' && window.SettleSettings) {
      SettleSettings.setContext({
        fromDiagnosis: true,
        onComplete: function (msg) {
          afterSelfServiceSuccess(msg || '已完成结算设置', '设置已生效，可返回查看诊断结果');
        }
      });
      SettleSettings.renderSettings();
      UI.go('settle-settings', { reset: true });
      return;
    }
    renderMpSettleSettings(sol);
    UI.go('asst-page');
  }

  function renderMpSettleSettings(sol) {
    var el = cfg.root.querySelector('[data-view="asst-page"]');
    var mountId = 'mpSettleMount';
    el.innerHTML = nativePageChrome('结算设置', { backAct: 'page-back' }) +
      '<div class="mp-settle-banner">小程序 · 结算设置' +
        tip('公众号诊断命中「未开自动提现」时，引导打开微信小程序结算设置页，商户可开启自动结算或发起自助结算。') +
      '</div>' +
      '<div class="settle-body" id="' + mountId + '"></div>';

    if (window.SettleSettings) {
      if (!SettleSettings._initedForWx) {
        SettleSettings.init({ getMerchant: merchant });
        SettleSettings._initedForWx = true;
      }
      SettleSettings.setContext({
        fromDiagnosis: true,
        embed: true,
        onComplete: function (msg) {
          afterSelfServiceSuccess(msg || '已在小程序结算设置中完成处理', '设置已保存');
        }
      });
      SettleSettings.renderSettings(mountId);
    } else {
      el.querySelector('#' + mountId).innerHTML =
        '<div class="ss-card" style="padding:16px;line-height:1.7">请前往盛意旺小程序「结算设置」开启自动结算。</div>';
    }

    var back = el.querySelector('[data-act="page-back"]');
    if (back) {
      back.onclick = function () {
        if (window.SettleSettings) SettleSettings.setContext({});
        UI.go('asst-result', { animate: false });
      };
    }
  }

  /** App = H5 WebView 顶栏；公众号 = 小程序顶栏 */
  function nativePageChrome(title, opts) {
    opts = opts || {};
    var isApp = cfg.platform === 'app';
    var backAct = opts.backAct || 'page-back';
    if (isApp) {
      return UI.statusBarHTML('light') +
        '<div class="webview-bar">' +
          '<button data-act="' + backAct + '" type="button" aria-label="返回">‹</button>' +
          '<span class="wv-title">' + title +
            (opts.url ? '<span class="wv-url">🔒 ' + opts.url.replace(/^https?:\/\//, '').split('/')[0] + '</span>' : '') +
          '</span>' +
          '<span style="width:18px"></span>' +
        '</div>';
    }
    return UI.statusBarHTML('light') +
      '<div class="mp-nav">' +
        '<button class="mp-back" data-act="' + backAct + '" type="button" aria-label="返回">‹</button>' +
        '<span class="mp-title">' + title + '</span>' +
        '<span class="mp-capsule" aria-hidden="true"><i class="mp-dots"></i><i class="mp-close"></i></span>' +
      '</div>';
  }

  function riskOrderMeta(step) {
    var m = (step && step.meta) || {};
    return {
      eventNo: m.eventNo || m.orderNo || 'RG2026071200004',
      status: m.status || '待回复',
      createdAt: m.createdAt || '2026/07/12',
      deadline: m.deadline || '2026/07/17',
      overdue: m.overdue !== false,
      auditor: m.auditor || '调单审核员',
      feedbackAt: m.feedbackAt || '2026-07-12 12:10:05',
      requirements: m.requirements || [
        '说明实际经营地址与经营内容',
        '提供经营场所照片4张（包含门头名称、地址等）',
        '说明/提供交易真实性材料'
      ],
      orders: m.orders || []
    };
  }

  function renderRiskOrderPage(step, sol) {
    var meta = riskOrderMeta(step);
    var el = cfg.root.querySelector('[data-view="asst-page"]');
    var tab = 'feedback';
    var uploadCount = 0;

    function shell(title, body, footer, backAct) {
      var channel = '<div class="ro-channel-tag">' +
        (cfg.platform === 'app' ? 'App 内 H5' : '微信小程序') +
        '</div>';
      return nativePageChrome(title, { url: sol.url, backAct: backAct || 'page-back' }) +
        '<div class="view-body ro-page' + (footer ? ' has-ro-foot' : '') + '">' +
          channel + body +
        '</div>' +
        (footer || '');
    }

    function summaryCard() {
      return '<div class="ro-summary">' +
        '<div class="ro-sum-head">' +
          '<div class="ro-event">事件编号 ' + meta.eventNo +
            tip('诊断命中风控节点且检出未处理调单时，允许商户自助处理；App 内打开 H5 调单详情，公众号内打开小程序调单页。账户止出冻结不可自助，需转人工。') +
          '</div>' +
          '<span class="ro-status">' + meta.status + '</span>' +
        '</div>' +
        '<div class="ro-sum-row">创建时间：' + meta.createdAt + '</div>' +
        '<div class="ro-sum-row">截止时间：' + meta.deadline + '</div>' +
        '<div class="ro-sum-row">是否逾期：' +
          (meta.overdue ? '<em class="ro-danger">逾期</em>' : '<em class="ro-ok">未逾期</em>') +
        '</div>' +
      '</div>';
    }

    function tabsHtml() {
      return '<div class="ro-tabs" role="tablist">' +
        '<button type="button" class="ro-tab' + (tab === 'feedback' ? ' is-on' : '') + '" data-ro-tab="feedback">处理反馈</button>' +
        '<button type="button" class="ro-tab' + (tab === 'orders' ? ' is-on' : '') + '" data-ro-tab="orders">订单信息</button>' +
      '</div>';
    }

    function feedbackPane() {
      var reqs = meta.requirements.map(function (t, i) {
        return '<li><span class="ro-num">' + (i + 1) + '.</span>' + t + '</li>';
      }).join('');
      return '<div class="ro-card ro-feedback">' +
        '<div class="ro-fb-head">' +
          '<span class="ro-dot"></span>' +
          '<span class="ro-fb-title">创建调单事件</span>' +
          '<span class="ro-fb-role">' + meta.auditor + '</span>' +
        '</div>' +
        '<ol class="ro-req">' + reqs + '</ol>' +
        '<div class="ro-fb-time">' + meta.feedbackAt + '</div>' +
      '</div>';
    }

    function ordersPane() {
      if (!meta.orders.length) {
        return '<div class="ro-card ro-empty">暂无关联订单</div>';
      }
      var rows = meta.orders.map(function (o) {
        var ico = o.channel === 'wx'
          ? '<span class="ro-pay wx">微</span>'
          : '<span class="ro-pay ali">支</span>';
        return '<div class="ro-order">' +
          ico +
          '<div class="ro-od-main">' +
            '<div class="ro-od-no">' + o.tradeNo + '</div>' +
            '<div class="ro-od-sub">' + o.mchNo + '</div>' +
            '<div class="ro-od-time">' + o.time + '</div>' +
          '</div>' +
          '<div class="ro-od-right">' +
            '<div class="ro-od-amt">' + o.amount + '</div>' +
            '<div class="ro-od-st">' + o.status + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<div class="ro-card ro-orders">' + rows + '</div>';
    }

    function paintDetail() {
      var body = summaryCard() + tabsHtml() +
        (tab === 'feedback' ? feedbackPane() : ordersPane());
      var footer = tab === 'feedback'
        ? '<div class="ro-foot"><button class="btn btn-primary ro-cta" data-act="ro-upload" type="button">上传凭证处理</button></div>'
        : '';
      el.innerHTML = shell(sol.title || '调单详情', body, footer, 'page-back');
      bindDetail();
      if (window.updateTooltipPosition) requestAnimationFrame(window.updateTooltipPosition);
    }

    function paintUpload() {
      var body =
        '<div class="ro-card ro-upload-card">' +
          '<div class="ro-field-title">上传凭证<em>*</em></div>' +
          '<p class="ro-hint">支持上传图片、视频、zip压缩包、pdf、doc、docx文件，单个文件最大200M以内，所有文件限制300M以内</p>' +
          '<button class="ro-add-file" data-act="ro-add-file" type="button">' +
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.2-1.8A1.5 1.5 0 0 1 11.4 3.5h1.2a1.5 1.5 0 0 1 1.2.7L15 6h2.5A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/></svg>' +
            '<span>添加文件</span>' +
          '</button>' +
          '<div class="ro-upload-count" data-role="upload-count">已上传 ' + uploadCount + '/9 个</div>' +
        '</div>' +
        '<div class="ro-card ro-upload-card">' +
          '<div class="ro-field-title">处理说明<em>*</em></div>' +
          '<div class="ro-textarea-wrap">' +
            '<textarea data-role="ro-desc" maxlength="500" placeholder="请描述处理过程，如需要特殊说明的信息请填写在这里"></textarea>' +
            '<span class="ro-counter" data-role="ro-counter">0/500</span>' +
          '</div>' +
        '</div>';
      var footer = '<div class="ro-foot"><button class="btn btn-primary ro-cta" data-act="ro-submit" type="button">提交</button></div>';
      el.innerHTML = shell('上传凭证处理', body, footer, 'ro-back-detail');
      bindUpload();
    }

    function bindDetail() {
      el.querySelector('[data-act="page-back"]').onclick = function () {
        state.userAction = '已打开「调单详情」后返回';
        MSS.track('自助页面返回', '调单详情');
        UI.go('asst-result', { animate: false });
      };
      el.querySelectorAll('[data-ro-tab]').forEach(function (b) {
        b.onclick = function () {
          tab = b.getAttribute('data-ro-tab');
          paintDetail();
        };
      });
      var up = el.querySelector('[data-act="ro-upload"]');
      if (up) up.onclick = function () {
        MSS.track('进入上传凭证', meta.eventNo);
        paintUpload();
      };
    }

    function bindUpload() {
      el.querySelector('[data-act="ro-back-detail"]').onclick = function () {
        paintDetail();
      };
      var ta = el.querySelector('[data-role="ro-desc"]');
      var counter = el.querySelector('[data-role="ro-counter"]');
      ta.oninput = function () {
        counter.textContent = ta.value.length + '/500';
      };
      el.querySelector('[data-act="ro-add-file"]').onclick = function () {
        if (uploadCount >= 9) {
          UI.toast('最多上传 9 个文件');
          return;
        }
        uploadCount += 1;
        el.querySelector('[data-role="upload-count"]').textContent = '已上传 ' + uploadCount + '/9 个';
        UI.toast('已添加演示文件 ' + uploadCount);
      };
      el.querySelector('[data-act="ro-submit"]').onclick = function () {
        var desc = (ta.value || '').trim();
        if (!uploadCount) {
          UI.toast('请先上传凭证文件');
          return;
        }
        if (!desc) {
          UI.toast('请填写处理说明');
          return;
        }
        afterSelfServiceSuccess(
          '已提交调单凭证（' + uploadCount + ' 个文件）',
          '材料已提交，审核通过后恢复出款'
        );
      };
    }

    paintDetail();
  }

  function pageChrome(title, url, bodyHtml) {
    var host = url ? url.replace(/^https?:\/\//, '').split('/')[0] : '';
    return UI.statusBarHTML('light') +
      '<div class="webview-bar">' +
        '<button data-act="page-back" style="font-size:18px;color:#333">‹</button>' +
        '<span class="wv-title">' + title +
          (host ? '<span class="wv-url">🔒 ' + host + '</span>' : '') + '</span>' +
        '<span style="width:18px"></span>' +
      '</div>' +
      '<div class="view-body">' + bodyHtml +
        '<div class="asst-foot">' + (cfg.platform === 'app' ? 'App 内嵌页面（WebView）' : '微信内 H5 页面，不跳转外部浏览器') +
        '<br>' + (url || '') + '</div></div>';
  }

  /** 跳转真实业务页（资质更新 / 结算卡变更），内嵌 iframe + 完成操作后回填反馈 */
  function renderExternalPage(sol) {
    var host = sol.url.replace(/^https?:\/\//, '').split('/')[0];
    var el = cfg.root.querySelector('[data-view="asst-page"]');
    el.innerHTML =
      UI.statusBarHTML('light') +
      '<div class="webview-bar">' +
        '<button data-act="page-back" style="font-size:18px;color:#333">‹</button>' +
        '<span class="wv-title">' + sol.title +
          '<span class="wv-url">🔒 ' + host + '</span></span>' +
        '<span style="width:18px"></span>' +
      '</div>' +
      '<div class="view-body wv-embed">' +
        '<iframe class="wv-frame" src="' + sol.url + '" title="' + sol.title + '" allow="camera; microphone; clipboard-write"></iframe>' +
        '<div class="wv-actions">' +
          '<button class="btn btn-ghost" data-act="open-ext">新窗口打开</button>' +
          '<button class="btn btn-primary" data-act="submit">我已完成操作</button>' +
        '</div>' +
      '</div>';

    el.querySelector('[data-act="page-back"]').onclick = function () {
      state.userAction = '已打开「' + sol.title + '」后返回';
      MSS.track('自助页面返回', sol.title);
      UI.go('asst-result', { animate: false });
    };
    el.querySelector('[data-act="open-ext"]').onclick = function () {
      MSS.track('新窗口打开业务页', sol.url);
      window.open(sol.url, '_blank', 'noopener');
    };
    el.querySelector('[data-act="submit"]').onclick = function () {
      afterSelfServiceSuccess(
        '已在「' + sol.title + '」完成自助操作',
        '已记录操作，请确认问题是否解决'
      );
    };
  }

  /**
   * 结算卡信息变更申请
   * App（图1）：原生导航顶栏；公众号（图2）：小程序顶栏 + 胶囊
   */
  function renderCardChangePage(step, sol) {
    var m = merchant();
    var st = MSS.getSettlement(m, cfg.getScenarioId()) || m.settlement || {};
    var acctName = st.accountNameFull || st.accountName || m.name;
    var defaultType = st.cardType === '对私' ? 'legal' : 'corp';
    var title = sol.title || '结算卡信息变更申请';

    var types = [
      { id: 'corp', name: '对公账户' },
      { id: 'legal', name: '法人个人储蓄账户' },
      { id: 'other', name: '其他个人储蓄账户' }
    ];

    var typeHtml = types.map(function (t) {
      return '<button type="button" class="scc-type' + (t.id === defaultType ? ' is-on' : '') +
        '" data-type="' + t.id + '">' + t.name + '<i class="scc-check"></i></button>';
    }).join('');

    var body =
      '<div class="scc-page">' +
        (step && step.detail
          ? '<div class="scc-alert">当前结算卡异常：' + step.summary + '。请更新结算卡信息，提交后系统将于次日自动重新出款。</div>'
          : '') +
        '<div class="scc-section">' +
          '<div class="scc-sec-title">请填写结算类型</div>' +
          '<div class="scc-label">结算账户类型</div>' +
          '<div class="scc-types">' + typeHtml + '</div>' +
        '</div>' +
        '<div class="scc-form">' +
          '<div class="scc-row">' +
            '<span class="scc-k">账户名称</span>' +
            '<span class="scc-v is-ro" id="sccAcctName">' + acctName + '</span></div>' +
          '<div class="scc-row">' +
            '<span class="scc-k">银行账号</span>' +
            '<input class="scc-input" id="sccAcctNo" inputmode="numeric" placeholder="请输入对公银行账号"></div>' +
          '<div class="scc-row">' +
            '<span class="scc-k">确认银行账号</span>' +
            '<input class="scc-input" id="sccAcctNo2" inputmode="numeric" placeholder="请再次输入对公银行账号"></div>' +
          '<div class="scc-row is-link" data-act="pick-bank">' +
            '<span class="scc-k">开户银行</span>' +
            '<span class="scc-v placeholder" id="sccBank">请输入开户银行</span>' +
            '<span class="scc-arrow">›</span></div>' +
        '</div>' +
        '<div class="scc-submit-wrap">' +
          '<button type="button" class="btn btn-primary" data-act="submit">提交</button></div>' +
        '<div class="scc-foot">' +
          (cfg.platform === 'app' ? '盛意旺 App · 结算卡变更' : '盛意旺小程序 · 结算卡变更') +
        '</div>' +
      '</div>';

    var el = cfg.root.querySelector('[data-view="asst-page"]');
    if (cfg.platform === 'app') {
      el.innerHTML =
        UI.statusBarHTML('light') +
        '<div class="scc-nav">' +
          '<button data-act="page-back" type="button" aria-label="返回">‹</button>' +
          '<span class="scc-nav-title">' + title +
            tip('诊断命中结算卡异常时，App 内打开结算卡信息变更申请页；公众号打开小程序同款表单。') +
          '</span>' +
        '</div>' +
        '<div class="view-body scc-body">' + body + '</div>';
    } else {
      el.innerHTML = nativePageChrome(title, { backAct: 'page-back' }) +
        '<div class="view-body scc-body">' + body + '</div>';
    }

    var placeholders = {
      corp: ['请输入对公银行账号', '请再次输入对公银行账号'],
      legal: ['请输入法人个人银行账号', '请再次输入法人个人银行账号'],
      other: ['请输入个人银行账号', '请再次输入个人银行账号']
    };

    function setType(id) {
      el.querySelectorAll('.scc-type').forEach(function (b) {
        b.classList.toggle('is-on', b.getAttribute('data-type') === id);
      });
      var ph = placeholders[id] || placeholders.corp;
      var a1 = el.querySelector('#sccAcctNo');
      var a2 = el.querySelector('#sccAcctNo2');
      if (a1) a1.placeholder = ph[0];
      if (a2) a2.placeholder = ph[1];
      if (id === 'corp') {
        el.querySelector('#sccAcctName').textContent = acctName;
      } else if (id === 'legal') {
        el.querySelector('#sccAcctName').textContent = '张*明（法人）';
      } else {
        el.querySelector('#sccAcctName').textContent = '请与开户名保持一致';
      }
    }

    el.querySelectorAll('.scc-type').forEach(function (b) {
      b.onclick = function () {
        setType(b.getAttribute('data-type'));
      };
    });

    var bankVal = '';
    var bankBtn = el.querySelector('[data-act="pick-bank"]');
    if (bankBtn) {
      bankBtn.onclick = function () {
        var banks = ['招商银行', '中国工商银行', '中国建设银行', '中国农业银行', '中国银行', '交通银行'];
        var mk = UI.mask(
          '<div class="sheet"><div class="sheet-head"><div><h3>选择开户银行</h3><p>演示环境提供常用银行</p></div>' +
            '<button class="sheet-close">✕</button></div>' +
            '<div class="scc-bank-list">' +
            banks.map(function (name) {
              return '<button type="button" class="scc-bank-item" data-bank="' + name + '">' + name + '</button>';
            }).join('') +
            '</div></div>');
        mk.querySelector('.sheet-close').onclick = function () { UI.close(mk); };
        mk.querySelectorAll('[data-bank]').forEach(function (item) {
          item.onclick = function () {
            bankVal = item.getAttribute('data-bank');
            var v = el.querySelector('#sccBank');
            v.textContent = bankVal;
            v.classList.remove('placeholder');
            UI.close(mk);
          };
        });
      };
    }

    el.querySelector('[data-act="page-back"]').onclick = function () {
      state.userAction = '已打开「' + title + '」后返回';
      MSS.track('自助页面返回', title);
      UI.go('asst-result', { animate: false });
    };

    el.querySelector('[data-act="submit"]').onclick = function () {
      var no1 = (el.querySelector('#sccAcctNo').value || '').replace(/\s/g, '');
      var no2 = (el.querySelector('#sccAcctNo2').value || '').replace(/\s/g, '');
      if (!/^\d{8,32}$/.test(no1)) {
        UI.toast('请输入有效银行账号');
        return;
      }
      if (no1 !== no2) {
        UI.toast('两次输入的银行账号不一致');
        return;
      }
      if (!bankVal) {
        UI.toast('请选择开户银行');
        return;
      }
      afterSelfServiceSuccess(
        '已提交结算卡信息变更申请（' + bankVal + '）',
        '提交成功，审核通过后次日自动重新出款'
      );
    };
  }

  function renderFormPage(step, sol) {
    var body;
    if (sol.page === 'qualification') {
      body =
        '<div class="notice">检测到营业执照已过期，请上传最新证照并完善受益人信息，提交后 1 个工作日内审核完成。</div>' +
        '<div class="form-card"><h3>主体资质</h3>' +
          '<div class="form-row"><span class="f-label">商户名称</span><span class="f-value">' + merchant().name + '</span></div>' +
          '<div class="form-row"><span class="f-label">营业执照</span><span class="f-value">9133****2178Q</span><span class="f-tag bad">已过期</span></div>' +
          '<div class="form-row"><span class="f-label">有效期至</span><input value="2029-08-12"></div>' +
          '<div class="form-row"><span class="f-label">执照照片</span><span class="f-value" style="text-align:right;color:var(--brand)">重新上传</span></div>' +
        '</div>' +
        '<div class="form-card"><h3>受益人信息</h3>' +
          '<div class="form-row"><span class="f-label">受益人姓名</span><input placeholder="请输入" value="张*明"></div>' +
          '<div class="form-row"><span class="f-label">证件号码</span><input placeholder="请输入" value="1101**********0031"></div>' +
          '<div class="form-row"><span class="f-label">证件有效期</span><input value="2031-05-20"></div>' +
        '</div>' +
        '<div class="page-actions"><button class="btn btn-primary" data-act="submit">提交审核</button></div>';
    } else {
      body =
        '<div class="notice">请按页面提示完成自助处理。</div>' +
        '<div class="page-actions"><button class="btn btn-primary" data-act="submit">提交</button></div>';
    }

    var el = cfg.root.querySelector('[data-view="asst-page"]');
    el.innerHTML = pageChrome(sol.title, sol.url, body);
    bindPage(el, function () {
      afterSelfServiceSuccess(
        '已尝试自助' + sol.label + '（' + sol.title + '提交成功）',
        '提交成功，审核通过后自动恢复出款'
      );
    });
  }

  function renderGuidePage(sol) {
    var body =
      '<div class="guide-card">' +
        '<h3>' + sol.question + '</h3>' +
        '<div class="g-from">知识库解答 · 由诊断结论「未开自动提现」自动匹配</div>' +
        '<ol class="guide-steps">' + sol.guide.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '</div>' +
      '<div class="form-card"><h3>结算设置</h3>' +
        '<div class="form-row"><span class="f-label">自动提现</span><span class="f-value" style="text-align:right;color:var(--text-3);font-size:12px" data-role="switch-text">未开启</span>' +
          '<span class="switch" data-act="toggle"></span></div>' +
        '<div class="form-row"><span class="f-label">结算周期</span><span class="f-value" style="text-align:right">T+1</span></div>' +
        '<div class="form-row"><span class="f-label">可提现余额</span><span class="f-value" style="text-align:right">3,860.42 元</span></div>' +
      '</div>' +
      '<div class="page-actions"><button class="btn btn-primary" data-act="submit">保存设置</button></div>';

    var el = cfg.root.querySelector('[data-view="asst-page"]');
    el.innerHTML = pageChrome('结算设置指引', '', body);

    var sw = el.querySelector('[data-act="toggle"]');
    var txt = el.querySelector('[data-role="switch-text"]');
    sw.onclick = function () {
      sw.classList.toggle('is-on');
      var on = sw.classList.contains('is-on');
      txt.textContent = on ? '已开启（每日 10:00 自动出款）' : '未开启';
      txt.style.color = on ? 'var(--success)' : 'var(--text-3)';
    };

    bindPage(el, function () {
      var on = sw.classList.contains('is-on');
      if (on) {
        afterSelfServiceSuccess('已按指引开启自动提现', '已开启自动提现，次日生效');
      } else {
        state.userAction = '查看了自动提现指引，未开启开关';
        MSS.track('自助操作完成', state.userAction);
        UI.toast('设置未修改');
        setTimeout(function () {
          UI.go('asst-result', { animate: false });
        }, 900);
      }
    });
  }

  function bindPage(el, onSubmit) {
    el.querySelector('[data-act="page-back"]').onclick = function () {
      UI.go('asst-result', { animate: false });
    };
    el.querySelector('[data-act="submit"]').onclick = onSubmit;
  }

  /* ------------------------------ 反馈弹窗（4.4） ------------------------------ */

  var REASONS = ['操作后仍未到账', '页面无法提交', '看不懂指引', '不是我遇到的问题', '其他'];

  /** 生成/复用本次退出反馈对应的诊断报告链接 */
  function ensureFeedbackReport(reason) {
    if (state.feedbackReportUrl) return state.feedbackReportUrl;
    if (!state.result) return '';
    var snap = MSS.buildSnapshot(merchant(), state.result, state.userAction);
    var rec = buildReport({ reason: reason || '商户退出诊断报告' }, snap);
    state.feedbackReportUrl = MSS.reportStore.url(rec);
    return state.feedbackReportUrl;
  }

  function feedbackTrackDetail(resultLabel, extra) {
    var m = merchant();
    var bundles = resultBundles();
    var mchIds = bundles.length > 1
      ? bundles.map(function (b) { return b.merchant.mchId; }).join(',')
      : (m.mchId || '');
    var traceId = (state.result && state.result.traceId) || '';
    var reportUrl = state.feedbackReportUrl || '';
    var parts = [
      '商户号:' + mchIds,
      '流水号:' + traceId,
      '报告:' + reportUrl,
      '反馈结果:' + resultLabel
    ];
    if (extra) parts.push(extra);
    return parts.join(' · ');
  }

  /**
   * 退出诊断报告时收集反馈。已反馈过则直接继续离开。
   * @param {Function} onContinue 反馈完成（或跳过）后的回调，通常返回助手首页
   */
  function exitDiagnosisReport(onContinue) {
    onContinue = onContinue || function () {};
    if (!state.result || state.feedbackDone) {
      onContinue();
      return;
    }
    openFeedback({
      trigger: 'exit',
      onDone: function (ctx) {
        state.feedbackDone = true;
        if (ctx && ctx.stayInFlow) return;
        onContinue();
      }
    });
  }

  function isOnDiagnosisReport() {
    var view = document.querySelector('[data-view="asst-result"]');
    return !!(view && view.classList.contains('is-active') && state.result && !state.feedbackDone);
  }

  function openFeedback(opts) {
    opts = opts || {};
    var mk = UI.mask(
      '<div class="sheet">' +
        '<div class="sheet-head"><div><h3>问题解决了吗？' +
          tip('退出诊断报告时收集轻量反馈；埋点记录商户号、诊断流水号、报告链接与已解决/未解决结果，用于计算自助解决率。选择「未解决」可一键转人工。') +
          '</h3><p>' + (state.userAction
            ? state.userAction
            : '你即将离开本次诊断报告，请告诉我们问题是否已解决') + '</p></div>' +
          '<button class="sheet-close">✕</button></div>' +
        '<div class="fb-options">' +
          '<button class="fb-opt solved" data-fb="solved"><span class="em">😀</span>已解决</button>' +
          '<button class="fb-opt unsolved" data-fb="unsolved"><span class="em">😕</span>未解决</button>' +
        '</div>' +
        '<div class="fb-reason"><div class="r-label">可选：告诉我们原因（选填）</div>' +
          '<div class="fb-chips">' + REASONS.map(function (r) {
            return '<button class="fb-chip" data-reason="' + r + '">' + r + '</button>';
          }).join('') + '</div></div>' +
        '<div class="btn-row"><button class="btn btn-primary" data-act="submit-fb">提交反馈</button></div>' +
      '</div>');

    var picked = '', reason = '';

    function finish(ctx) {
      UI.close(mk);
      if (opts.onDone) opts.onDone(ctx || {});
    }

    mk.querySelector('.sheet-close').onclick = function () {
      state.feedbackReportUrl = '';
      ensureFeedbackReport('商户退出诊断报告·未选择');
      MSS.track('反馈弹窗关闭', feedbackTrackDetail('未选择'));
      state.feedbackDone = true;
      finish({ dismissed: true });
    };

    mk.querySelectorAll('[data-fb]').forEach(function (b) {
      b.onclick = function () {
        picked = b.dataset.fb;
        mk.querySelectorAll('[data-fb]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        mk.querySelector('.fb-reason').classList.toggle('is-show', picked === 'unsolved');
      };
    });

    mk.querySelectorAll('[data-reason]').forEach(function (b) {
      b.onclick = function () {
        reason = b.dataset.reason;
        mk.querySelectorAll('[data-reason]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
      };
    });

    mk.querySelector('[data-act="submit-fb"]').onclick = function () {
      if (!picked) { UI.toast('请先选择已解决 / 未解决'); return; }
      state.feedback = picked === 'solved' ? '已解决' : '未解决';
      state.userAction = (state.userAction || '已查看诊断报告') + '，反馈「' + state.feedback + '」' +
        (reason ? '（' + reason + '）' : '');
      state.feedbackReportUrl = '';
      ensureFeedbackReport('商户反馈·' + state.feedback);
      MSS.track(
        picked === 'solved' ? '反馈已解决' : '反馈未解决',
        feedbackTrackDetail(state.feedback, reason ? ('原因:' + reason) : '')
      );
      state.feedbackDone = true;
      UI.close(mk);

      if (picked === 'solved') {
        var canContinue = !!(state.processLog && state.processLog.length) && state.result &&
          state.result.steps.some(function (s) { return s.status === 'skipped'; });
        if (canContinue) {
          UI.dialog({
            title: '是否继续排查？',
            text: '前置异常已自助处理。重新诊断可继续排查此前未执行的后续项，确认是否还有其他导致未到账的原因。',
            cancel: '返回首页',
            ok: '重新诊断',
            onCancel: function () { if (opts.onDone) opts.onDone({}); },
            onOk: function () {
              if (opts.onDone) opts.onDone({ stayInFlow: true });
              startDiagnose({ redeploy: true });
            }
          });
        } else {
          UI.toast('感谢反馈，问题已记录为自助解决');
          if (opts.onDone) setTimeout(function () { opts.onDone({}); }, 400);
        }
      } else {
        UI.dialog({
          title: '需要人工协助吗？',
          text: '将为你转接人工客服，并同步本次诊断结论与操作记录，无需重复描述问题。',
          cancel: (state.processLog && state.processLog.length) ? '去重新诊断' : '暂不需要',
          ok: '联系客服',
          onCancel: function () {
            if (state.processLog && state.processLog.length) {
              if (opts.onDone) opts.onDone({ stayInFlow: true });
              startDiagnose({ redeploy: true });
            } else if (opts.onDone) {
              opts.onDone({});
            }
          },
          onOk: function () {
            if (opts.onDone) opts.onDone({ stayInFlow: true });
            toAgent({ mode: 'chat', reason: '退出诊断报告反馈未解决' });
          }
        });
      }
    };
  }

  /* ------------------------------ 转人工与诊断快照（4.4） ------------------------------ */

  function snapshotCard(snap) {
    return '<div class="snapshot">' +
        '<div class="sn-head">诊断快照（客服工作台同步）' +
          '<span class="badge">已同步</span>' +
          tip('点击联系客服时自动生成结构化快照：商户号、产品线、诊断流水号、' + MSS.STEPS.length + ' 项排查结果与用户操作，客服工作台同屏展示，避免重复询问。') +
        '</div>' +
        '<div class="sn-body">' +
          '<div class="kv"><span class="k">商户号</span><span class="v">' + snap.merchant.mchId + '</span></div>' +
          '<div class="kv"><span class="k">产品线</span><span class="v">' + snap.merchant.line + '</span></div>' +
          '<div class="kv"><span class="k">诊断流水号</span><span class="v">' + snap.result.traceId + '</span></div>' +
          '<div class="kv"><span class="k">诊断时间</span><span class="v">' + snap.result.time + '</span></div>' +
          '<div class="sn-nodes">' +
            snap.nodes.map(function (n) {
              return '<div class="sn-node"><span class="n-name">' + n.name + '</span>' +
                '<span class="n-val ' + n.state + '">' + n.value + '</span></div>';
            }).join('') +
          '</div>' +
          (snap.userAction ? '<div class="sn-node" style="margin-top:8px;border-top:1px dashed var(--line);padding-top:8px">' +
            '<span class="n-name">用户操作</span><span class="n-val">' + snap.userAction + '</span></div>' : '') +
        '</div>' +
      '</div>';
  }

  /**
   * 生成诊断报告独立链接：报告数据落库（演示用同源存储模拟服务端），
   * 链接带一次性令牌与有效期，仅供客服在工作台打开。
   */
  function buildMergedDiagnosisPayload() {
    var bundles = resultBundles();
    var unfinished = [];
    var reports = bundles.map(function (b) {
      var snap = MSS.buildSnapshot(b.merchant, b.result, state.userAction);
      unfinishedAbnormals(b.result, b.merchant).forEach(function (s) {
        unfinished.push({
          mchId: b.merchant.mchId,
          mchName: b.merchant.name,
          key: s.key,
          name: s.name,
          summary: s.summary,
          detail: s.detail,
          selfService: !!s.selfService
        });
      });
      return {
        merchant: { mchId: b.merchant.mchId, name: b.merchant.name, line: b.merchant.line },
        settlement: MSS.getSettlement(b.merchant, cfg.getScenarioId()),
        diagnosis: {
          traceId: snap.result.traceId,
          time: snap.result.time,
          primary: snap.result.primary
            ? { summary: snap.result.primary.summary, detail: snap.result.primary.detail, name: snap.result.primary.name }
            : null,
          abnormals: allAbnormals(b.result).map(function (s) {
            return {
              key: s.key,
              name: s.name,
              summary: s.summary,
              detail: s.detail,
              selfService: !!s.selfService,
              resolved: isStepResolved(s.key, b.merchant)
            };
          }),
          nodes: snap.nodes,
          userAction: snap.userAction
        }
      };
    });
    return {
      reports: reports,
      processLog: (state.processLog || []).slice(),
      unfinished: unfinished,
      feedback: state.feedback || ''
    };
  }

  function buildReport(ctx, snap) {
    var m = merchant();
    var merged = state.result ? buildMergedDiagnosisPayload() : null;
    var primaryDiag = snap ? {
      traceId: snap.result.traceId,
      time: snap.result.time,
      primary: snap.result.primary
        ? { summary: snap.result.primary.summary, detail: snap.result.primary.detail }
        : null,
      nodes: snap.nodes,
      userAction: snap.userAction,
      feedback: state.feedback || ''
    } : null;

    return MSS.reportStore.save({
      source: cfg.platform,
      reason: ctx.reason,
      merchant: { mchId: m.mchId, name: m.name, line: m.line },
      merchants: merged
        ? merged.reports.map(function (r) { return r.merchant; })
        : [{ mchId: m.mchId, name: m.name, line: m.line }],
      settlement: MSS.getSettlement(m, cfg.getScenarioId()),
      diagnosis: primaryDiag,
      multi: merged,
      processLog: merged ? merged.processLog : [],
      unfinished: merged ? merged.unfinished : []
    });
  }

  /**
   * 按客企汇《盛付通在线客服系统用户信息接口 V1.1》拼接 hjUserData：
   * 姓名|性别|固定电话|手机|邮箱|地址|公司名称|用户区域|QQ|会员ID|会员类型|扩展信息
   * 每一段单独 UTF-8 urlencode，再用 | 拼接后挂到对话接入地址。
   * 姓名 / 公司名称 = 商户名称；会员ID = 商户号；
   * 地址 = 诊断结论；扩展信息 = 诊断报告链接。
   */
  function buildHjUserData(ctx, snap, reportUrl) {
    var m = merchant();
    var bundles = resultBundles();
    var multi = bundles.length > 1;
    var summary;
    if (multi) {
      var abnCount = 0;
      bundles.forEach(function (b) { abnCount += allAbnormals(b.result).length; });
      summary = '多商户合并诊断·异常' + abnCount + '项·商户' + bundles.length + '个';
    } else if (snap) {
      summary = snap.result.primary
        ? snap.result.primary.summary
        : (MSS.STEPS.length + '项排查均正常');
    } else {
      summary = ctx.reason || '其他问题';
    }
    var mchIds = multi
      ? bundles.map(function (b) { return b.merchant.mchId; }).join(',')
      : (m.mchId || '');
    var companyName = multi
      ? (m.name + '等' + bundles.length + '户')
      : (m.name || '');

    // 会员类型：文档约定 1=普通会员，2=代理商；自助服务侧均按普通会员传
    var fields = [
      companyName,
      '0',
      '',
      m.phone || '',
      '',
      summary,
      companyName,
      '',
      '',
      mchIds,
      '1',
      reportUrl || ''
    ];
    return fields.map(function (f) { return encodeURIComponent(f); }).join('|');
  }

  function buildAgentUrl(ctx, snap, reportUrl) {
    var hjUserData = buildHjUserData(ctx, snap, reportUrl);
    var labels = ['姓名', '性别', '固话', '手机', '邮箱', '地址', '公司名称', '用户区域', 'QQ', '会员ID', '会员类型', '扩展信息'];
    var preview = hjUserData.split('|').map(function (part, i) {
      try { part = decodeURIComponent(part); } catch (e) { /* keep raw */ }
      return { label: labels[i] || ('字段' + (i + 1)), value: part || '（空）' };
    });

    return {
      hjUserData: hjUserData,
      preview: preview,
      url: cfg.agentUrl + '&hjUserData=' + hjUserData
    };
  }

  function toAgent(ctx) {
    var m = merchant();
    var hasDiag = !!state.result;
    var snap = hasDiag ? MSS.buildSnapshot(m, state.result, state.userAction) : null;
    var rec = buildReport(ctx, snap);
    var reportUrl = MSS.reportStore.url(rec);
    var built = buildAgentUrl(ctx, snap, reportUrl);
    var agentUrl = built.url;
    var codeKey = (cfg.agentUrl.match(/codeKey=(\w+)/) || [])[1] || '';

    MSS.track('转人工', ctx.reason);
    MSS.track('生成诊断报告链接', rec.id + ' · 有效期至 ' + rec.expireText);
    MSS.track('转人工携带快照', hasDiag ? snap.result.traceId : '无诊断快照（其他问题直接转接）');
    MSS.track('拼接 hjUserData', '会员ID ' + m.mchId + ' · 报告 ' + rec.id);

    var bundles = resultBundles();
    var chatText;
    if (bundles.length > 1) {
      chatText = '【自助诊断·合并报告】共 ' + bundles.length + ' 个商户：' +
        bundles.map(function (b) {
          return b.merchant.name + '(' + b.merchant.mchId + ')';
        }).join('、') +
        '，自助处理 ' + (state.processLog || []).length + ' 条，未完成异常 ' +
        (rec.data.unfinished ? rec.data.unfinished.length : 0) + ' 项。完整报告：' + reportUrl;
    } else {
      chatText = '【自助诊断】' + m.name + '（商户号 ' + m.mchId + '，' + m.line + '）' +
        (snap
          ? '，诊断流水号 ' + snap.result.traceId +
            (snap.result.primary ? '，结论：' + snap.result.primary.summary : '，' + MSS.STEPS.length + ' 项排查均正常')
          : '，未执行自助诊断') +
        '。完整报告：' + reportUrl;
    }

    var hjRows = built.preview.map(function (row) {
      return '<div><b>' + row.label + '</b>' + row.value + '</div>';
    }).join('');

    var body =
      '<div class="sys-tip">正在跳转' + (cfg.platform === 'app' ? '盛意旺 App' : '微信公众号') +
        '在线客服（codeKey ' + codeKey + '）· 商户信息已通过 hjUserData 同步，报告链接已复制</div>' +
      '<div class="agent-link">' +
        '<div class="al-head">人工客服会话地址' +
          tip('按客企汇《用户信息接口 V1.1》，将 hjUserData 拼接到对话接入地址。字段顺序：姓名|性别|固话|手机|邮箱|地址|公司名称|用户区域|QQ|会员ID|会员类型|扩展信息；每项单独 UTF-8 urlencode。姓名/公司名称取商户名称；商户号写入会员ID；地址写入诊断结论；扩展信息仅写入诊断报告链接。') +
          '<span class="al-key">codeKey ' + codeKey + '</span></div>' +
        '<div class="al-base">' + cfg.agentUrl.split('?')[0] + '</div>' +
        '<div class="al-params">' +
          '<div><b>接口</b>hjUserData（客企汇官方）</div>' +
          '<div><b>会员ID</b>' + m.mchId + '</div>' +
          '<div><b>姓名 / 公司名称</b>' + m.name + '</div>' +
          '<div><b>地址</b>诊断结论</div>' +
          '<div><b>扩展信息</b>诊断报告链接</div>' +
        '</div>' +
        '<details class="al-raw"><summary>查看 hjUserData 字段明细</summary>' +
          '<div class="al-params" style="margin-top:8px">' + hjRows + '</div>' +
          '<div class="al-url" style="margin-top:8px">' + agentUrl + '</div></details>' +
        '<button class="btn btn-primary" data-act="open-agent-url">打开人工客服会话</button>' +
      '</div>' +
      '<div class="auto-msg">' +
        '<div class="am-head">诊断报告独立链接（扩展信息 + 剪贴板兜底）' +
          tip('完整诊断明细放在独立报告页，链接写入 hjUserData 扩展信息字段供客服在工作台查看；同时复制到剪贴板，若客服端未展示该字段，商户可粘贴发送。') +
          '<span class="am-tag">已复制</span></div>' +
        '<div class="am-card">' +
          '<div class="am-title">' + (bundles.length > 1
            ? '【合并诊断报告】' + bundles.length + ' 个商户'
            : (snap
              ? '【自助诊断报告】' + (snap.result.primary ? snap.result.primary.summary : MSS.STEPS.length + ' 项排查均正常')
              : '【商户档案】' + m.name + '（' + m.line + '）')) + '</div>' +
          '<div class="am-desc">' + (bundles.length > 1
            ? '含自助过程记录与未完成异常 · 点击查看完整合并报告'
            : ('商户号 ' + m.mchId + ' · ' + m.line +
              (snap ? ' · 流水号 ' + snap.result.traceId : '') + '，点击查看完整报告与结算信息')) + '</div>' +
          '<div class="am-url">' + reportUrl + '</div>' +
          '<div class="am-btns">' +
            '<button class="btn btn-ghost" data-act="copy-msg">复制会话消息</button>' +
            '<button class="btn btn-ghost" data-act="open-report">预览客服视图</button>' +
          '</div>' +
        '</div>' +
        '<div class="am-foot">报告编号 ' + rec.id + ' · 一次性令牌 · 有效期至 ' + rec.expireText + '</div>' +
      '</div>' +
      (snap ? snapshotCard(snap) : '<div class="snapshot"><div class="sn-head">商户信息（已同步）</div>' +
        '<div class="sn-body"><div class="kv"><span class="k">商户号</span><span class="v">' + m.mchId + '</span></div>' +
        '<div class="kv"><span class="k">商户名称</span><span class="v">' + m.name + '</span></div>' +
        '<div class="kv"><span class="k">产品线</span><span class="v">' + m.line + '</span></div>' +
        '<div class="kv"><span class="k">来源</span><span class="v">自助服务助手 · ' + ctx.reason + '</span></div></div></div>');

    var el = cfg.root.querySelector('[data-view="asst-agent"]');
    var slotEl = el.querySelector('[data-slot="asst-agent"]');
    slotEl.innerHTML = body;

    function copyChatText(silent) {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(chatText).then(function () {
        MSS.track('复制会话消息', '报告 ' + rec.id);
        if (!silent) UI.toast('已复制，在客服会话中粘贴发送即可');
      }, function () { /* 无剪贴板权限时依赖页面上的链接手动复制 */ });
    }

    function openAgent() {
      copyChatText(true);
      MSS.track('打开人工客服', 'codeKey ' + codeKey + ' · 携带报告 ' + rec.id);
      if (!window.open(agentUrl, '_blank', 'noopener')) {
        UI.toast('浏览器拦截了新窗口<br>请点击「打开人工客服会话」');
      }
    }

    slotEl.querySelector('[data-act="open-agent-url"]').onclick = openAgent;
    slotEl.querySelector('[data-act="copy-msg"]').onclick = function () { copyChatText(false); };
    slotEl.querySelector('[data-act="open-report"]').onclick = function () {
      MSS.track('预览诊断报告页', reportUrl);
      window.open(reportUrl, '_blank', 'noopener');
    };

    UI.go('asst-agent');

    // 由用户点击直接触发时立即跳转客服；系统自动转接（如线下商户倒计时）留给用户手动点击
    if (ctx.autoOpen !== false) openAgent();
  }

  function clearDiagnosis() {
    state = emptyState(false);
  }

  function reset() {
    clearDiagnosis();
    renderHome();
  }

  return {
    FAQS: FAQS,
    init: init,
    clearDiagnosis: clearDiagnosis,
    renderHome: renderHome,
    renderSettlement: renderSettlement,
    openMerchantSwitch: openMerchantSwitch,
    startDiagnose: startDiagnose,
    toAgent: toAgent,
    exitDiagnosisReport: exitDiagnosisReport,
    isOnDiagnosisReport: isOnDiagnosisReport,
    reset: reset,
    tip: tip,
    icon: icon,
    getState: function () { return state; }
  };
})();
