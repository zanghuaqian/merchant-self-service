/**
 * 盛意旺 App · 结算设置
 * 入口：我的 → 账户余额 → 我的账户 → 结算设置
 */
window.SettleSettings = (function () {
  var CUTOFFS = [
    { value: '00:00', label: '前一日00:00-当日00:00' },
    { value: '06:00', label: '前一日06:00-当日06:00' },
    { value: '08:00', label: '前一日08:00-当日08:00' },
    { value: '10:00', label: '前一日10:00-当日10:00' },
    { value: '18:00', label: '前一日18:00-当日18:00' },
    { value: '20:00', label: '前一日20:00-当日20:00' },
    { value: '22:00', label: '前一日22:00-当日22:00' }
  ];

  var HISTORY_KEY = 'mss_settle_history';
  var CFG_KEY = 'mss_settle_cfg';

  var cfg = null;
  var getMerchant = null;
  var balanceHidden = false;
  var selfStep = 1;
  var selfAmount = '';
  var selfCode = '';
  var codeSent = false;
  var codeLeft = 0;
  var codeTimer = null;
  var lastSelfResult = null;
  var context = { fromDiagnosis: false, onComplete: null, embed: false };

  function $(id) { return document.getElementById(id); }

  function setContext(ctx) {
    context = ctx || { fromDiagnosis: false, onComplete: null, embed: false };
    if (context.fromDiagnosis) context._forceOffOnce = true;
  }

  function syncSettingsBackAct() {
    var btn = document.querySelector('[data-view="settle-settings"] .nav-left button');
    if (!btn) return;
    btn.setAttribute('data-act', context.fromDiagnosis ? 'back-settle-diagnosis' : 'back-account');
  }

  function merchant() { return getMerchant(); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function nowText() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* ignore */ }
  }

  function pushHistory(item, before, after) {
    var list = loadHistory();
    list.unshift({
      item: item,
      before: before,
      after: after,
      time: nowText()
    });
    saveHistory(list);
  }

  function cutoffLabel(value) {
    for (var i = 0; i < CUTOFFS.length; i++) {
      if (CUTOFFS[i].value === value) return CUTOFFS[i].label;
    }
    return '前一日' + value + '-当日' + value;
  }

  function matchCutoff(raw) {
    var v = String(raw || '').replace(/^每日\s*/, '');
    for (var i = 0; i < CUTOFFS.length; i++) {
      if (CUTOFFS[i].value === v || CUTOFFS[i].label.indexOf(v) >= 0) return CUTOFFS[i].value;
    }
    if (v.indexOf('23') >= 0 || v.indexOf('22') >= 0) return '22:00';
    return '00:00';
  }

  function defaultCfg() {
    var m = merchant();
    var s = m.settlement || {};
    return {
      cycle: s.cycle || 'T+1',
      cutoff: matchCutoff(s.cutoff),
      autoSettle: s.autoWithdraw !== false,
      reserve: String(s.reserve || '0.00').replace(/,/g, ''),
      balance: { total: '55.47', available: '48.29', frozen: '0.00' },
      loginPhone: m.phoneRaw || '13812346621',
      loginPhoneMask: m.phone || MSS.maskPhone(m.phoneRaw || '13812346621')
    };
  }

  function loadCfg() {
    var base = defaultCfg();
    try {
      var saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if (saved) {
        base.cutoff = saved.cutoff || base.cutoff;
        base.autoSettle = !!saved.autoSettle;
        base.reserve = saved.reserve != null ? String(saved.reserve) : base.reserve;
        if (saved.balance) {
          base.balance = {
            total: saved.balance.total || base.balance.total,
            available: saved.balance.available || base.balance.available,
            frozen: saved.balance.frozen != null ? saved.balance.frozen : base.balance.frozen
          };
        }
      }
    } catch (e) { /* ignore */ }
    return base;
  }

  function persistCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        cutoff: cfg.cutoff,
        autoSettle: cfg.autoSettle,
        reserve: cfg.reserve,
        balance: cfg.balance
      }));
    } catch (e) { /* ignore */ }
  }

  function syncMerchantSettlement() {
    var m = merchant();
    if (!m.settlement) return;
    m.settlement.cycle = cfg.cycle;
    m.settlement.cutoff = cfg.cutoff;
    m.settlement.autoWithdraw = cfg.autoSettle;
    m.settlement.autoWithdrawTime = cfg.autoSettle
      ? ('每日 ' + cfg.cutoff + ' 自动出款')
      : '手动提现（自助结算）';
    m.settlement.reserve = cfg.reserve;
  }

  function displayName() {
    var m = merchant();
    return (m.settlement && m.settlement.accountNameFull) || m.name;
  }

  function bankShort() {
    var bank = (merchant().settlement && merchant().settlement.bank) || '招商银行';
    return bank.split(/\s|　/)[0];
  }

  function cardNoDisplay() {
    var no = (merchant().settlement && merchant().settlement.cardNo) || '121944*****0201';
    return no.replace(/\s/g, '');
  }

  function toast(msg) {
    if (window.UI && UI.toast) UI.toast(msg);
  }

  /* ------------------------------ 我的 ------------------------------ */

  function renderMe() {
    cfg = loadCfg();
    var m = merchant();
    var bal = balanceHidden ? '****' : ('¥ ' + cfg.balance.total);
    var html =
      '<div class="me-profile">' +
        '<div class="me-avatar" aria-hidden="true">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7">' +
            '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg></div>' +
        '<div class="me-info">' +
          '<div class="me-name">' + displayName() +
            '<span class="me-role">管理员</span></div>' +
          '<div class="me-line">商户号: ' + m.mchId +
            ' <button type="button" class="me-copy" data-act="copy-text" data-text="' + m.mchId + '">⧉</button></div>' +
          '<div class="me-line">登录账号: ' + m.mchId + '@sfb.mer' +
            ' <button type="button" class="me-copy" data-act="copy-text" data-text="' + m.mchId + '@sfb.mer">⧉</button></div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="me-balance" data-act="open-account">' +
        '<div class="mb-left">' +
          '<div class="mb-label">账户余额' +
            '<span class="mb-eye" data-act="toggle-balance" role="img" aria-label="显隐">◎</span>' +
            '<span class="tooltip-icon"><i class="bi bi-lightbulb-fill"></i></span>' +
            '<div class="product-tip"><div class="product-tip-content">点击账户余额进入「我的账户」，可查看结算卡、出款记录，并进入结算设置。</div></div>' +
          '</div>' +
          '<div class="mb-num">' + bal + '</div>' +
        '</div>' +
        '<span class="mb-arrow">›</span>' +
      '</button>' +
      '<div class="me-shortcuts">' +
        shortcut('收款码', '#ff6b6b') +
        shortcut('收银外设', '#2ec4a4') +
        shortcut('门店管理', '#ff9f43') +
        shortcut('花呗分期', '#4c8dff', true) +
      '</div>' +
      '<div class="me-menu">' +
        menuRow('商户信息') +
        menuRow('商户认证') +
        menuRow('我的权益') +
        menuRow('电子发票管理') +
        menuRow('联系客服') +
        menuRow('设置') +
        menuRow('关于盛意旺', true) +
      '</div>';

    $('meBody').innerHTML = html;
    bindCommon($('meBody'));
  }

  function shortcut(name, color, badge) {
    return '<button type="button" class="me-sc" data-act="stub">' +
      '<span class="sc-ico" style="background:' + color + '">' + name.slice(0, 1) + '</span>' +
      (badge ? '<em class="sc-badge">花呗</em>' : '') +
      '<span class="sc-txt">' + name + '</span></button>';
  }

  function menuRow(name, last) {
    return '<button type="button" class="me-menu-row' + (last ? ' is-last' : '') + '" data-act="stub">' +
      '<span class="mm-ico">◇</span><span class="mm-txt">' + name + '</span><span class="mm-arrow">›</span></button>';
  }

  /* ------------------------------ 我的账户 ------------------------------ */

  function renderAccount() {
    cfg = loadCfg();
    var m = merchant();
    var total = balanceHidden ? '****' : cfg.balance.total;
    var avail = balanceHidden ? '****' : ('¥' + cfg.balance.available);
    var frozen = balanceHidden ? '****' : ('¥' + cfg.balance.frozen);
    $('accountBody').innerHTML =
      '<div class="acct-bal-card">' +
        '<div class="abc-label">账户余额(元) <span data-act="toggle-balance" class="mb-eye">◎</span></div>' +
        '<div class="abc-num">' + total + '</div>' +
        '<div class="abc-sub"><span>可用余额 ' + avail + '</span><span>冻结余额 ' + frozen + '</span></div>' +
      '</div>' +
      '<div class="acct-card">' +
        '<div class="ac-head"><span>结算卡</span>' +
          '<button type="button" class="ac-link" data-act="stub">变更</button></div>' +
        '<div class="ac-no">' + cardNoDisplay() + '</div>' +
        '<div class="ac-bank">' + bankShort() + ' | ' +
          ((m.settlement && m.settlement.cardType === '对公') ? '对公账户' : '借记卡') + '</div>' +
      '</div>' +
      '<div class="acct-list">' +
        '<button type="button" class="acct-row" data-act="stub">账户出款记录<span>›</span></button>' +
        '<button type="button" class="acct-row" data-act="open-settle-settings">结算设置' +
          '<span class="tooltip-icon"><i class="bi bi-lightbulb-fill"></i></span>' +
          '<div class="product-tip"><div class="product-tip-content">结算设置支持查看结算周期，修改日切时间、自动结算与留存金额；关闭自动结算后可发起自助结算。</div></div>' +
          '<span>›</span></button>' +
      '</div>';
    bindCommon($('accountBody'));
  }

  function cardNoCompact() {
    var raw = String((merchant().settlement && merchant().settlement.cardNo) || '121909*****0901');
    var digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 10) {
      return digits.slice(0, 6) + '*****' + digits.slice(-4);
    }
    return raw.replace(/\s/g, '').replace(/\*{2,}/g, '*****');
  }

  function bankLogoMark() {
    var name = bankShort();
    var color = '#e60012';
    if (name.indexOf('工商') >= 0) color = '#c4161c';
    else if (name.indexOf('建设') >= 0) color = '#003b8f';
    else if (name.indexOf('农业') >= 0) color = '#019c54';
    else if (name.indexOf('中国银行') >= 0 || name === '中行') color = '#a71e32';
    return '<span class="ssc-logo" style="background:' + color + '" aria-hidden="true">' +
      name.slice(0, 1) + '</span>';
  }

  /* ------------------------------ 结算设置 ------------------------------ */

  function renderSettings(mountId) {
    cfg = loadCfg();
    if (context.fromDiagnosis && context._forceOffOnce) {
      cfg.autoSettle = false;
      context._forceOffOnce = false;
    }
    syncSettingsBackAct();
    var mount = $(mountId || 'settleSettingsBody');
    if (!mount) return;

    var m = merchant();
    var s = m.settlement || {};
    var cardType = s.cardType || '对公';
    var acctName = s.accountNameFull || s.accountName || displayName();

    var options = CUTOFFS.map(function (c) {
      return '<option value="' + c.value + '"' + (c.value === cfg.cutoff ? ' selected' : '') + '>' +
        c.label + '</option>';
    }).join('');

    var tipBanner = context.fromDiagnosis
      ? '<div class="ss-diag-tip">诊断发现未开启自动结算，请在本页开启「是否自动结算」并保存；也可核对结算卡信息。</div>'
      : '';

    mount.innerHTML =
      tipBanner +
      '<div class="ss-card ss-settle-card">' +
        '<div class="ssc-title">当前结算卡</div>' +
        '<div class="ssc-box">' +
          '<span class="ssc-type">' + cardType + '</span>' +
          '<div class="ssc-bank">' + bankLogoMark() +
            '<span>' + bankShort() + '</span></div>' +
          '<div class="ssc-no">' + cardNoCompact() + '</div>' +
          '<div class="ssc-name">' + acctName + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary ssc-change" data-act="change-settle-card">变更结算卡</button>' +
      '</div>' +
      '<div class="ss-card">' +
        '<div class="ss-row is-readonly">' +
          '<span class="ss-label">结算周期</span>' +
          '<span class="ss-value">' + cfg.cycle +
            '<em class="ss-tag">仅查看</em></span></div>' +
        '<div class="ss-row">' +
          '<span class="ss-label">日切时间</span>' +
          '<select class="ss-select" id="ssCutoff">' + options + '</select></div>' +
        '<div class="ss-row">' +
          '<span class="ss-label">是否自动结算</span>' +
          '<button type="button" class="ss-switch' + (cfg.autoSettle ? ' is-on' : '') +
            '" id="ssAuto" aria-label="自动结算"></button></div>' +
        (cfg.autoSettle ? '' :
          '<div class="ss-self-wrap">' +
            (context.fromDiagnosis || context.embed
              ? '<p class="ss-hint">自动结算已关闭。可开启开关并保存以恢复自动出款；也可发起自助结算。</p>' +
                '<button type="button" class="btn btn-primary" data-act="open-self-settle">自助结算</button>'
              : '<button type="button" class="btn btn-primary" data-act="open-self-settle">自助结算</button>' +
                '<p class="ss-hint">自动结算已关闭，可主动发起自助结算将可用余额出款至结算卡。</p>') +
          '</div>') +
        '<div class="ss-row">' +
          '<span class="ss-label">留存金额（元）</span>' +
          '<input class="ss-input" id="ssReserve" inputmode="decimal" placeholder="0.00" value="' +
            cfg.reserve + '"></div>' +
      '</div>' +
      '<div class="ss-actions">' +
        '<button type="button" class="btn btn-primary" data-act="save-settle">保存修改</button>' +
        (context.embed ? '' : '<button type="button" class="btn btn-ghost" data-act="open-settle-history">查看修改记录</button>') +
      '</div>' +
      '<div class="ss-foot">结算周期由签约配置决定，不支持商户侧修改；日切与留存金额保存后次日生效。</div>';

    bindCommon(mount);

    var autoBtn = mount.querySelector('#ssAuto') || $('ssAuto');
    if (autoBtn) {
      autoBtn.onclick = function () {
        var next = !cfg.autoSettle;
        pushHistory('是否自动结算', cfg.autoSettle ? '开启' : '关闭', next ? '开启' : '关闭');
        cfg.autoSettle = next;
        persistCfg();
        syncMerchantSettlement();
        MSS.track('结算设置·自动结算', cfg.autoSettle ? '开启' : '关闭');
        renderSettings(mountId);
        toast(cfg.autoSettle ? '已开启自动结算' : '已关闭自动结算');
      };
    }
  }

  function saveSettings() {
    var cutoffEl = document.getElementById('ssCutoff');
    var reserveEl = document.getElementById('ssReserve');
    if (!cutoffEl || !reserveEl) return;

    var nextCutoff = cutoffEl.value;
    var raw = String(reserveEl.value || '').trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      toast('留存金额最多两位小数');
      return;
    }
    var nextReserve = Number(raw).toFixed(2);
    var changed = false;

    if (nextCutoff !== cfg.cutoff) {
      pushHistory('日切时间', cutoffLabel(cfg.cutoff), cutoffLabel(nextCutoff));
      cfg.cutoff = nextCutoff;
      changed = true;
    }
    if (nextReserve !== Number(cfg.reserve).toFixed(2)) {
      pushHistory('留存金额', Number(cfg.reserve).toFixed(2) + ' 元', nextReserve + ' 元');
      cfg.reserve = nextReserve;
      changed = true;
    }

    persistCfg();
    syncMerchantSettlement();
    MSS.track('结算设置·保存', '日切 ' + cfg.cutoff + ' · 留存 ' + cfg.reserve +
      (cfg.autoSettle ? ' · 自动开' : ' · 自动关'));

    if (context.fromDiagnosis && cfg.autoSettle && context.onComplete) {
      var cb = context.onComplete;
      setContext({});
      toast('已保存并开启自动结算');
      cb('已在结算设置中开启自动结算');
      return;
    }

    toast(changed || true ? '已保存' : '已保存');
    var mount = cutoffEl.closest('.settle-body') || cutoffEl.closest('[id]') || $('settleSettingsBody');
    renderSettings(mount && mount.id ? mount.id : 'settleSettingsBody');
  }

  /* ------------------------------ 修改记录 ------------------------------ */

  function renderHistory() {
    var list = loadHistory();
    var body = list.length
      ? list.map(function (h) {
          return '<div class="sh-item">' +
            '<div class="sh-top"><b>' + h.item + '</b><span>' + h.time + '</span></div>' +
            '<div class="sh-chg"><span class="before">' + h.before + '</span>' +
              '<span class="arrow">→</span><span class="after">' + h.after + '</span></div></div>';
        }).join('')
      : '<div class="cs-empty" style="padding:40px 12px;text-align:center;color:var(--text-3)">暂无修改记录</div>';

    $('settleHistoryBody').innerHTML =
      '<div class="ss-card" style="padding:4px 14px">' + body + '</div>';
  }

  /* ------------------------------ 自助结算三步 ------------------------------ */

  function renderSelf() {
    cfg = loadCfg();
    var mount = context.embed
      ? (document.getElementById('mpSettleMount') || document.getElementById('settleSelfBody'))
      : document.getElementById('settleSelfBody');
    if (!mount) {
      toast('当前环境暂不支持自助结算');
      return;
    }
    if (cfg.autoSettle && !context.fromDiagnosis) {
      toast('请先关闭自动结算');
      UI.go('settle-settings');
      return;
    }
    var steps =
      '<div class="sf-steps">' +
        [1, 2, 3].map(function (n) {
          var label = n === 1 ? '填写金额' : n === 2 ? '身份认证' : '结算结果';
          var cls = n < selfStep ? 'done' : n === selfStep ? 'on' : '';
          return '<div class="sf-step ' + cls + '"><i>' + n + '</i><span>' + label + '</span></div>';
        }).join('<div class="sf-line"></div>') +
      '</div>';

    var content = '';
    if (selfStep === 1) content = selfStep1();
    else if (selfStep === 2) content = selfStep2();
    else content = selfStep3();

    mount.innerHTML = steps + content;
    bindCommon(mount);
    bindSelfEvents();
  }

  function selfStep1() {
    var m = merchant();
    var s = m.settlement || {};
    return '<div class="ss-card">' +
      '<div class="sf-avail">可结算金额（元）<b>' + cfg.balance.available + '</b></div>' +
      '<div class="form-row" style="border:0;padding:8px 0">' +
        '<span class="f-label">本次结算金额</span>' +
        '<input id="sfAmount" inputmode="decimal" placeholder="请输入结算金额" value="' +
          (selfAmount || '') + '" style="text-align:right;flex:1;border:0;outline:none;font-size:15px;font-weight:700"></div>' +
      '<div class="kv"><span class="k">结算账户名</span><span class="v">' + (s.accountName || displayName()) + '</span></div>' +
      '<div class="kv"><span class="k">结算账户</span><span class="v">' + cardNoDisplay() + '</span></div>' +
      '<div class="kv"><span class="k">结算银行</span><span class="v">' + (s.bank || bankShort()) + '</span></div>' +
    '</div>' +
    '<div class="ss-actions"><button type="button" class="btn btn-primary" data-act="self-next1">下一步</button></div>';
  }

  function selfStep2() {
    return '<div class="ss-card">' +
      '<div class="kv"><span class="k">绑定手机号</span><span class="v">' + cfg.loginPhoneMask + '</span></div>' +
      '<div class="form-row" style="margin-top:8px">' +
        '<span class="f-label">验证码</span>' +
        '<input id="sfCode" inputmode="numeric" maxlength="6" placeholder="6 位验证码" value="' +
          (selfCode || '') + '" style="flex:1;border:0;outline:none;text-align:right">' +
        '<button type="button" class="code-btn" id="sfGetCode">' +
          (codeLeft > 0 ? (codeLeft + 's') : '获取验证码') + '</button></div>' +
      '<p class="ss-hint" style="margin-top:10px">演示验证码固定为 123456</p>' +
    '</div>' +
    '<div class="ss-actions">' +
      '<button type="button" class="btn btn-primary" data-act="self-submit">提交结算</button>' +
      '<button type="button" class="btn btn-ghost" data-act="self-back1">上一步</button></div>';
  }

  function selfStep3() {
    var r = lastSelfResult || {};
    return '<div class="sf-result">' +
      '<div class="sf-ok">✓</div>' +
      '<h2>自助结算已提交</h2>' +
      '<p>金额 ¥' + (r.amount || selfAmount) + ' 将出款至结算卡，预计 2 小时内到账（以银行为准）。</p>' +
      '<div class="ss-card" style="text-align:left;margin-top:16px">' +
        '<div class="kv"><span class="k">结算单号</span><span class="v">' + (r.orderNo || '—') + '</span></div>' +
        '<div class="kv"><span class="k">提交时间</span><span class="v">' + (r.time || nowText()) + '</span></div>' +
        '<div class="kv"><span class="k">结算账户</span><span class="v">' + cardNoDisplay() + '</span></div>' +
      '</div></div>' +
      '<div class="ss-actions">' +
        '<button type="button" class="btn btn-primary" data-act="self-done">完成</button></div>';
  }

  function bindSelfEvents() {
    var next1 = document.querySelector('[data-act="self-next1"]');
    if (next1) next1.onclick = function () {
      var el = $('sfAmount');
      var v = String(el && el.value || '').trim();
      if (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) <= 0) {
        toast('请输入有效结算金额（最多两位小数）');
        return;
      }
      if (Number(v) > Number(cfg.balance.available)) {
        toast('不能超过可结算金额 ¥' + cfg.balance.available);
        return;
      }
      selfAmount = Number(v).toFixed(2);
      selfStep = 2;
      MSS.track('自助结算·填写金额', selfAmount);
      renderSelf();
    };

    var back1 = document.querySelector('[data-act="self-back1"]');
    if (back1) back1.onclick = function () {
      var codeEl = $('sfCode');
      if (codeEl) selfCode = codeEl.value;
      selfStep = 1;
      renderSelf();
    };

    var getCode = $('sfGetCode');
    if (getCode) {
      getCode.disabled = codeLeft > 0;
      getCode.onclick = function () {
        if (codeLeft > 0) return;
        codeSent = true;
        codeLeft = 60;
        MSS.track('自助结算·获取验证码', cfg.loginPhoneMask);
        toast('验证码已发送至 ' + cfg.loginPhoneMask);
        clearInterval(codeTimer);
        codeTimer = setInterval(function () {
          codeLeft -= 1;
          if (codeLeft <= 0) {
            clearInterval(codeTimer);
            codeLeft = 0;
          }
          var btn = $('sfGetCode');
          if (btn) {
            btn.textContent = codeLeft > 0 ? (codeLeft + 's') : '获取验证码';
            btn.disabled = codeLeft > 0;
          }
        }, 1000);
        getCode.textContent = codeLeft + 's';
        getCode.disabled = true;
      };
    }

    var submit = document.querySelector('[data-act="self-submit"]');
    if (submit) submit.onclick = function () {
      var codeEl = $('sfCode');
      selfCode = codeEl ? codeEl.value : '';
      if (!codeSent && !selfCode) {
        toast('请先获取验证码');
        return;
      }
      var check = MSS.validateCode(selfCode);
      if (!check.ok) {
        toast(check.msg);
        return;
      }
      lastSelfResult = {
        amount: selfAmount,
        orderNo: 'SS' + Date.now().toString().slice(-10),
        time: nowText()
      };
      // 演示：扣减可结算金额（不低于 0）
      var left = Math.max(0, Number(cfg.balance.available) - Number(selfAmount));
      cfg.balance.available = left.toFixed(2);
      cfg.balance.total = (Number(cfg.balance.frozen) + left).toFixed(2);
      persistCfg();
      selfStep = 3;
      MSS.track('自助结算·提交成功', lastSelfResult.orderNo + ' · ¥' + selfAmount);
      renderSelf();
    };

    var done = document.querySelector('[data-act="self-done"]');
    if (done) done.onclick = function () {
      selfStep = 1;
      selfAmount = '';
      selfCode = '';
      codeSent = false;
      if (context.fromDiagnosis && context.onComplete) {
        var cb = context.onComplete;
        setContext({});
        cb('已完成自助结算');
        return;
      }
      UI.go('settle-settings', { reset: true });
      renderSettings();
    };
  }

  /* ------------------------------ 通用绑定 ------------------------------ */

  function bindCommon(root) {
    if (!root) return;
    root.querySelectorAll('[data-act="copy-text"]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var t = b.getAttribute('data-text') || '';
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        toast('已复制');
      };
    });
    root.querySelectorAll('[data-act="toggle-balance"]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        balanceHidden = !balanceHidden;
        var view = document.querySelector('.view.is-active');
        if (view && view.getAttribute('data-view') === 'account') renderAccount();
        else renderMe();
      };
    });
    root.querySelectorAll('[data-act="stub"]').forEach(function (b) {
      b.onclick = function () { toast('演示环境暂未实现该入口'); };
    });
    root.querySelectorAll('[data-act="open-account"]').forEach(function (b) {
      b.onclick = function () {
        MSS.track('进入我的账户', '我的 · 账户余额');
        renderAccount();
        UI.go('account', { reset: true });
      };
    });
    root.querySelectorAll('[data-act="open-settle-settings"]').forEach(function (b) {
      b.onclick = function () {
        MSS.track('进入结算设置', '我的账户');
        renderSettings();
        UI.go('settle-settings', { reset: true });
      };
    });
    root.querySelectorAll('[data-act="change-settle-card"]').forEach(function (b) {
      b.onclick = function () {
        MSS.track('结算设置·变更结算卡', '');
        if (typeof context.onChangeCard === 'function') {
          context.onChangeCard();
          return;
        }
        toast('演示：跳转结算卡变更页');
      };
    });
    root.querySelectorAll('[data-act="open-self-settle"]').forEach(function (b) {
      b.onclick = function () {
        selfStep = 1;
        selfAmount = '';
        selfCode = '';
        codeSent = false;
        MSS.track('进入自助结算', context.embed ? '小程序嵌入' : '');
        if (!context.embed) {
          renderSelf();
          UI.go('settle-self', { reset: true });
        } else {
          renderSelf();
        }
      };
    });
    root.querySelectorAll('[data-act="open-settle-history"]').forEach(function (b) {
      b.onclick = function () {
        MSS.track('查看结算修改记录', '');
        renderHistory();
        UI.go('settle-history', { reset: true });
      };
    });
    root.querySelectorAll('[data-act="save-settle"]').forEach(function (b) {
      b.onclick = saveSettings;
    });
  }

  function init(options) {
    getMerchant = options.getMerchant;
    cfg = loadCfg();
    syncMerchantSettlement();
  }

  return {
    init: init,
    setContext: setContext,
    renderMe: renderMe,
    renderAccount: renderAccount,
    renderSettings: renderSettings,
    renderSelf: renderSelf,
    renderHistory: renderHistory,
    CUTOFFS: CUTOFFS
  };
})();
