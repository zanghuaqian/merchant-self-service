/**
 * 场景二：盛意旺公众号（PRD 3.2）
 * 会话底部菜单 → 自助客服 H5 → 绑定态判断（游客 / 盛意旺 / 线下）→ 诊断链路
 * 绑定方式：完整商户号（6-8 位）+ 预留手机号短信验证码，服务端保存 OpenID ↔ 商户号关联
 */
(function () {
  var screen = document.getElementById('screen');
  var scenarioId = 'qualification';

  var GUEST = { name: '微信用户', mchId: '未绑定', line: '未识别', lineCode: 'GUEST', selfServiceEnabled: false };

  var BIND_PRESETS = [
    { id: 'guest', name: '未绑定 / 游客', desc: '进入受限首页，点击诊断触发绑定引导', seed: [] },
    { id: 'single', name: '已绑定 · 单个盛意旺商户', desc: '与 App 完全一致的诊断与自助修复链路', seed: ['88800213'] },
    { id: 'multi', name: '已绑定 · 多个商户号', desc: '默认上次商户，可切换（含线下商户）', seed: ['88800213', '7712009', '620188'], last: '7712009' },
    { id: 'offline', name: '已绑定 · 仅线下商户', desc: '提示暂未开通自助服务并自动转人工', seed: ['620188'] }
  ];

  var presetId = 'guest';

  function boundMerchants() { return MSS.bindStore.boundMerchants(); }

  function merchant() { return MSS.bindStore.current() || GUEST; }

  function isBound() { return boundMerchants().length > 0; }

  UI.mountStatusBars(document);

  MSS.bindStore.clear();

  Assistant.init({
    root: screen,
    platform: 'h5',
    homeView: 'asst-home',
    getMerchant: merchant,
    getMerchantList: boundMerchants,
    agentUrl: 'https://chat.keqihui.com/any800/echatManager.do?companyPk=2c908e0f63b5e1e60163b5e5b7940001&codeKey=33',
    getScenarioId: function () { return scenarioId; },
    onSwitchMerchant: switchMerchant,
    onAddMerchant: function () { openBind(); }
  });

  /* ------------------------------ 商户切换 ------------------------------ */

  function switchMerchant(m) {
    MSS.bindStore.setLast(m.mchId);
    syncConsole();
    Assistant.clearDiagnosis();
    if (!m.selfServiceEnabled) {
      MSS.track('切换到线下商户', m.mchId + ' · 暂未开通自助服务');
      showOffline();
      return;
    }
    Assistant.renderHome();
    UI.go('asst-home', { reset: true });
    UI.toast('已切换至「' + m.name + '」<br>商户号 ' + m.mchId);
  }

  /* ------------------------------ 公众号底部菜单 ------------------------------ */

  var submenu = document.getElementById('wxSubmenu');
  var menuBtn = document.getElementById('menuMerchant');

  menuBtn.onclick = function () {
    submenu.classList.toggle('is-open');
    menuBtn.classList.toggle('is-open');
    if (submenu.classList.contains('is-open')) MSS.track('公众号菜单点击', '商户服务');
  };

  document.querySelectorAll('.wx-menu-item:not(#menuMerchant)').forEach(function (b) {
    b.onclick = function () {
      closeMenu();
      UI.toast('演示环境仅实现「商户服务 → 自助客服」链路');
    };
  });

  function closeMenu() {
    submenu.classList.remove('is-open');
    menuBtn.classList.remove('is-open');
  }

  /* ------------------------------ 进入自助客服 H5 ------------------------------ */

  function openSelfService() {
    closeMenu();
    MSS.track('助手入口点击', '公众号菜单：商户服务 → 自助客服');

    if (!isBound()) {
      MSS.track('绑定状态判断', '未绑定 → 受限首页');
      UI.go('h5-limited', { reset: true });
      return;
    }

    var m = merchant();
    var total = boundMerchants().length;
    if (!m.selfServiceEnabled) {
      MSS.track('绑定状态判断', '线下商户 ' + m.mchId + ' → 暂未开通自助服务');
      showOffline();
      return;
    }
    MSS.track('绑定状态判断', '已绑定 ' + total + ' 个商户，默认使用上次商户 ' + m.mchId);
    Assistant.renderHome();
    UI.go('asst-home', { reset: true });
    if (total > 1) UI.toast('默认使用上次查询的商户「' + m.name + '」<br>可点右上角切换商户');
  }

  document.querySelectorAll('[data-act="open-self-service"]').forEach(function (b) {
    b.onclick = openSelfService;
  });

  document.querySelectorAll('[data-act="to-chat"]').forEach(function (b) {
    b.onclick = function () { clearTimeout(offlineTimer); UI.go('home', { reset: true }); };
  });

  document.querySelectorAll('[data-act="back-asst"]').forEach(function (b) {
    b.onclick = function () { UI.go('asst-home', { reset: true }); };
  });

  document.querySelectorAll('[data-act="open-agent"]').forEach(function (b) {
    b.onclick = function () {
      closeMenu();
      clearTimeout(offlineTimer);
      Assistant.clearDiagnosis();
      Assistant.toAgent({
        mode: 'queue',
        reason: !isBound() ? '公众号人工客服入口（未绑定商户号）'
          : merchant().selfServiceEnabled ? '公众号人工客服入口' : '线下商户暂未开通自助服务'
      });
    };
  });

  /* ------------------------------ 线下商户自动转人工 ------------------------------ */

  var offlineTimer = null;

  function showOffline() {
    var m = merchant();
    document.getElementById('offlineMch').textContent = MSS.maskMchId(m.mchId);
    UI.go('offline', { reset: true });
    var n = 3;
    var el = document.getElementById('offlineCount');
    el.textContent = n;
    clearTimeout(offlineTimer);
    (function tick() {
      offlineTimer = setTimeout(function () {
        n--;
        el.textContent = n;
        if (n <= 0) {
          Assistant.toAgent({ mode: 'queue', reason: '线下商户暂未开通自助服务（自动转接）', autoOpen: false });
        } else tick();
      }, 1000);
    })();
  }

  /* ------------------------------ 游客受限首页（4.5） ------------------------------ */

  document.getElementById('guestFaq').innerHTML = Assistant.FAQS.map(function (f, i) {
    return '<button class="faq-item" data-gfaq="' + i + '"><span class="q-badge">Q</span>' + f.q +
      '<span class="ec-arrow">' + Assistant.icon('arrow') + '</span></button>';
  }).join('');

  document.querySelectorAll('[data-gfaq]').forEach(function (b) {
    b.onclick = function () {
      var f = Assistant.FAQS[+b.dataset.gfaq];
      MSS.track('常见问题点击', f.q + '（未绑定）');
      var mk = UI.mask('<div class="sheet"><div class="sheet-head"><div><h3>' + f.q +
        '</h3><p>来自知识库 · 无需绑定即可查看</p></div><button class="sheet-close">✕</button></div>' +
        '<div class="rc-text" style="margin-top:12px">' + f.a + '</div>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-act="close">知道了</button></div></div>');
      mk.querySelector('.sheet-close').onclick = function () { UI.close(mk); };
      mk.querySelector('[data-act="close"]').onclick = function () { UI.close(mk); };
    };
  });

  /* 未绑定用户点击诊断类按钮 → 返回图文消息引导绑定 */
  document.querySelector('[data-act="need-bind"]').onclick = function () {
    MSS.track('未绑定拦截', '点击资金未到账 → 下发绑定引导图文消息');
    pushBindArticle();

    var mk = UI.mask(
      '<div class="sheet">' +
        '<div class="sheet-head"><div><h3>需要先绑定商户号</h3>' +
          '<p>诊断需读取你的商户后台数据，已向会话下发绑定引导消息</p></div>' +
          '<button class="sheet-close">✕</button></div>' +
        '<div class="tpl-msg">' +
          '<div class="t-head"><h4>【绑定提醒】完成绑定即可自助排查未到账</h4>' +
            '<p>你好！绑定商户号后可一键排查风控、资质、结算、出款与分账 5 类未到账原因，平均 10 秒出结论。</p></div>' +
          '<div class="t-row"><span class="k">适用产品线</span><span>盛意旺</span></div>' +
          '<div class="t-row"><span class="k">绑定方式</span><span>完整商户号 + 预留手机号验证码</span></div>' +
          '<button class="t-link" data-act="go-bind">点击此处立即绑定 <span>›</span></button>' +
        '</div>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-act="close">稍后再说</button></div>' +
      '</div>');

    mk.querySelector('.sheet-close').onclick = function () { UI.close(mk); };
    mk.querySelector('[data-act="close"]').onclick = function () { UI.close(mk); };
    mk.querySelector('[data-act="go-bind"]').onclick = function () {
      UI.close(mk);
      openBind();
    };
  };

  function pushBindArticle() {
    var chat = document.getElementById('wxChat');
    if (chat.querySelector('[data-bind-msg]')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="wx-date">' + MSS.formatTime(new Date()).slice(5, 16) + '</div>' +
      '<div class="wx-article" data-bind-msg>' +
        '<div class="wa-body">' +
          '<div class="wa-title">【绑定提醒】绑定商户号，解锁资金未到账自助诊断</div>' +
          '<div class="wa-desc">检测到你尚未绑定商户号，输入商户号并通过预留手机号验证码校验即可完成绑定。</div>' +
        '</div>' +
        '<button class="wa-more" data-act="open-bind">点击此处立即绑定 <span>›</span></button>' +
      '</div>';
    while (wrap.firstChild) chat.appendChild(wrap.firstChild);
    chat.querySelector('[data-bind-msg] [data-act="open-bind"]').onclick = openBind;
  }

  /* ------------------ 绑定：完整商户号 + 手机验证码（4.1） ------------------ */

  var mchIdInput = document.getElementById('mchIdInput');
  var codeInput = document.getElementById('codeInput');
  var btnCode = document.getElementById('btnCode');
  var btnBind = document.getElementById('btnBind');
  var mchFound = document.getElementById('mchFound');
  var mchPhone = document.getElementById('mchPhone');
  var bindErr = document.getElementById('bindErr');
  var codeTimer = null;
  var codeSent = false;

  function openBind() {
    closeMenu();
    resetBindForm();
    MSS.track('进入绑定引导', isBound() ? '追加绑定商户号' : '首次绑定');
    UI.go('bind', { reset: true });
  }

  document.querySelectorAll('[data-act="open-bind"]').forEach(function (b) { b.onclick = openBind; });

  function resetBindForm() {
    clearInterval(codeTimer);
    codeSent = false;
    mchIdInput.value = '';
    codeInput.value = '';
    mchFound.innerHTML = '';
    mchFound.className = 'mch-found';
    mchPhone.textContent = '输入商户号后自动带出';
    btnCode.disabled = true;
    btnCode.textContent = '获取验证码';
    showErr('');
  }

  function showErr(msg) {
    bindErr.textContent = msg || '';
    bindErr.classList.toggle('is-show', !!msg);
  }

  /** 输入商户号即校验格式并带出商户信息与预留手机号 */
  mchIdInput.addEventListener('input', function () {
    mchIdInput.value = mchIdInput.value.replace(/\D/g, '').slice(0, 8);
    showErr('');
    var v = mchIdInput.value;

    if (v.length < 6) {
      mchFound.innerHTML = v.length ? '<span class="mf-tip">商户号为 6-8 位数字</span>' : '';
      mchFound.className = 'mch-found';
      mchPhone.textContent = '输入商户号后自动带出';
      btnCode.disabled = true;
      return;
    }

    var m = MSS.findByMchId(v);
    if (!m) {
      mchFound.className = 'mch-found bad';
      mchFound.innerHTML = '未查询到该商户号，请确认后重试';
      mchPhone.textContent = '—';
      btnCode.disabled = true;
      return;
    }

    if (MSS.bindStore.load().merchants.indexOf(v) > -1) {
      mchFound.className = 'mch-found bad';
      mchFound.innerHTML = '该商户号已绑定当前微信，可直接在助手内切换使用';
      btnCode.disabled = true;
      return;
    }

    mchFound.className = 'mch-found ok';
    mchFound.innerHTML = '<b>' + m.name + '</b><em class="line-tag ' + (m.lineCode === 'SYW' ? 'syw' : 'offline') + '">' +
      m.line + '</em>' + (m.selfServiceEnabled ? '' : '<span class="mf-tip">该业务线暂未开通自助诊断</span>');
    mchPhone.textContent = m.phone;
    btnCode.disabled = codeSent;
  });

  codeInput.addEventListener('input', function () {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    showErr('');
  });

  btnCode.onclick = function () {
    var check = MSS.validateMchId(mchIdInput.value);
    if (!check.ok) { showErr(check.msg); return; }

    codeSent = true;
    btnCode.disabled = true;
    MSS.track('发送验证码', '商户 ' + check.merchant.mchId + ' 预留手机号 ' + check.merchant.phone);
    UI.toast('验证码已发送至 ' + check.merchant.phone + '<br>演示环境固定为 123456');

    var left = 60;
    btnCode.textContent = left + 's 后重发';
    codeTimer = setInterval(function () {
      left--;
      btnCode.textContent = left + 's 后重发';
      if (left <= 0) {
        clearInterval(codeTimer);
        codeSent = false;
        btnCode.textContent = '重新获取';
        btnCode.disabled = false;
      }
    }, 1000);
  };

  btnBind.onclick = function () {
    var check = MSS.validateMchId(mchIdInput.value);
    if (!check.ok) { showErr(check.msg); return; }
    if (!codeSent && !codeInput.value) { showErr('请先获取并输入短信验证码'); return; }

    var codeCheck = MSS.validateCode(codeInput.value);
    if (!codeCheck.ok) {
      showErr(codeCheck.msg);
      MSS.track('绑定校验失败', '验证码错误（商户 ' + mchIdInput.value + '）');
      return;
    }

    clearInterval(codeTimer);
    var m = check.merchant;
    var data = MSS.bindStore.bind(m.mchId);
    presetId = '';
    syncConsole();
    MSS.track('绑定成功', 'OpenID ' + data.openId + ' ↔ 商户号 ' + m.mchId + '（' + m.line + '）');
    MSS.track('绑定关系已保存', '服务端当前绑定 ' + data.merchants.length + ' 个商户号');
    UI.toast('绑定成功，正在进入自助服务…');

    setTimeout(function () {
      if (!m.selfServiceEnabled) { showOffline(); return; }
      Assistant.renderHome();
      UI.go('asst-home', { reset: true });
    }, 1100);
  };

  /* ------------------------------ 演示控制台 ------------------------------ */

  var bindList = document.getElementById('bindList');
  var scList = document.getElementById('scenarioList');
  var mchBox = document.getElementById('consoleMerchant');

  bindList.innerHTML = BIND_PRESETS.map(function (s) {
    return '<button class="scenario' + (s.id === presetId ? ' is-on' : '') + '" data-bs="' + s.id + '">' +
      '<span class="dot"></span><span><span class="s-name">' + s.name + '</span>' +
      '<span class="s-desc">' + s.desc + '</span></span></button>';
  }).join('');

  bindList.querySelectorAll('[data-bs]').forEach(function (btn) {
    btn.onclick = function () {
      var preset = BIND_PRESETS.filter(function (p) { return p.id === btn.dataset.bs; })[0];
      presetId = preset.id;
      if (preset.seed.length) MSS.bindStore.seed(preset.seed, preset.last);
      else MSS.bindStore.clear();
      clearTimeout(offlineTimer);
      syncConsole();
      Assistant.clearDiagnosis();
      UI.go('home', { reset: true });
      UI.toast('已切换绑定状态：' + preset.name + '<br>请从底部菜单「商户服务」重新进入');
    };
  });

  scList.innerHTML = MSS.SCENARIOS.map(function (s) {
    return '<button class="scenario' + (s.id === scenarioId ? ' is-on' : '') + '" data-sc="' + s.id + '">' +
      '<span class="dot"></span><span><span class="s-name">' + s.name + '</span>' +
      '<span class="s-desc">' + s.desc + '</span></span></button>';
  }).join('');

  scList.querySelectorAll('[data-sc]').forEach(function (btn) {
    btn.onclick = function () {
      scenarioId = btn.dataset.sc;
      scList.querySelectorAll('[data-sc]').forEach(function (x) { x.classList.remove('is-on'); });
      btn.classList.add('is-on');
      UI.toast('已切换为：' + MSS.getScenario(scenarioId).name + '<br>请重新点击「资金未到账」');
    };
  });

  function syncConsole() {
    bindList.querySelectorAll('[data-bs]').forEach(function (x) {
      x.classList.toggle('is-on', x.dataset.bs === presetId);
    });

    var data = MSS.bindStore.load();
    var list = boundMerchants();

    if (!list.length) {
      mchBox.innerHTML = '服务端绑定关系：<b>无</b><br>微信身份：<b>OpenID ' + data.openId + '</b><br>' +
        '可用能力：常见问题、人工客服<br>绑定方式：完整商户号 + 预留手机号验证码';
      return;
    }

    var cur = merchant();
    mchBox.innerHTML = '微信 OpenID：<b>' + data.openId + '</b><br>' +
      '已绑定商户（' + list.length + '）：<br>' +
      list.map(function (m) {
        return '&nbsp;· <b>' + m.mchId + '</b> ' + m.name + '（' + m.line + '）' +
          (m.mchId === cur.mchId ? ' <b style="color:#1677ff">← 当前</b>' : '');
      }).join('<br>') +
      '<br>上次使用：<b>' + (data.lastMchId || '—') + '</b><br>绑定时间：' + (data.boundAt || '—');
  }

  syncConsole();

  var logBox = document.getElementById('trackLog');
  document.addEventListener('mss:track', function (e) {
    var log = e.detail;
    logBox.innerHTML = log.length
      ? log.map(function (r) { return '<div class="row"><i>' + r.time + '</i> <b>' + r.event + '</b> ' + r.detail + '</div>'; }).join('')
      : '<div class="empty">暂无事件，开始操作后记录…</div>';
  });

  document.getElementById('btnReset').onclick = function () {
    MSS.clearLog();
    clearTimeout(offlineTimer);
    MSS.bindStore.clear();
    presetId = 'guest';
    scenarioId = 'qualification';
    resetBindForm();
    syncConsole();
    scList.querySelectorAll('[data-sc]').forEach(function (x) {
      x.classList.toggle('is-on', x.dataset.sc === 'qualification');
    });
    Assistant.clearDiagnosis();
    document.querySelectorAll('.mask').forEach(function (m) { m.parentNode.removeChild(m); });
    var msg = document.querySelector('[data-bind-msg]');
    if (msg) {
      var prev = msg.previousElementSibling;
      if (prev && prev.classList.contains('wx-date')) prev.remove();
      msg.remove();
    }
    UI.go('home', { reset: true });
  };
})();
