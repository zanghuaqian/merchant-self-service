/**
 * 场景二：盛意旺公众号（PRD 3.2）
 * 绑定：预留手机号 + 短信验证码；多商户多选；线下仅引导登录 App；游客无人工入口
 */
(function () {
  var screen = document.getElementById('screen');
  var scenarioId = 'qualification';

  var GUEST = { name: '微信用户', mchId: '未绑定', line: '未识别', lineCode: 'GUEST', selfServiceEnabled: false };

  var BIND_PRESETS = [
    { id: 'guest', name: '未绑定 / 游客', desc: '受限首页，无人工客服入口', seed: [] },
    { id: 'single', name: '已绑定 · 单个盛意旺商户', desc: '与 App 一致的诊断与自助修复', seed: ['88800213'] },
    { id: 'multi', name: '已绑定 · 多个盛意旺商户', desc: '同时诊断多个商户，转人工合并报告', seed: ['88800213', '7712009'], last: '88800213' },
    { id: 'offline', name: '线下商户访问', desc: '仅引导登录 App，不绑定、不转人工', seed: [], offline: true }
  ];

  var presetId = 'guest';
  var pendingPhoneMerchants = [];
  var offlineOnlyMode = false;

  function boundMerchants() { return MSS.bindStore.boundMerchants(); }

  function sywMerchants() {
    return boundMerchants().filter(function (m) { return m.selfServiceEnabled; });
  }

  function merchant() { return MSS.bindStore.current() || GUEST; }

  function isBound() { return sywMerchants().length > 0; }

  UI.mountStatusBars(document);
  MSS.bindStore.clear();

  Assistant.init({
    root: screen,
    platform: 'h5',
    homeView: 'asst-home',
    getMerchant: merchant,
    getMerchantList: sywMerchants,
    getDiagnoseMerchants: sywMerchants,
    agentUrl: 'https://chat.keqihui.com/any800/echatManager.do?companyPk=2c908e0f63b5e1e60163b5e5b7940001&codeKey=33',
    getScenarioId: function () { return scenarioId; },
    onSwitchMerchant: switchMerchant,
    onAddMerchant: function () { openBind(); }
  });

  if (window.SettleSettings) {
    SettleSettings.init({ getMerchant: merchant });
  }

  function switchMerchant(m) {
    if (!m.selfServiceEnabled) {
      MSS.track('线下商户拦截', m.mchId + ' · 引导登录 App');
      showOffline(m);
      return;
    }
    MSS.bindStore.setLast(m.mchId);
    syncConsole();
    Assistant.clearDiagnosis();
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

  function openSelfService() {
    closeMenu();
    MSS.track('助手入口点击', '公众号菜单：商户服务 → 自助客服');

    if (offlineOnlyMode) {
      showOffline();
      return;
    }

    if (!isBound()) {
      MSS.track('绑定状态判断', '未绑定 → 受限首页（无人工入口）');
      UI.go('h5-limited', { reset: true });
      return;
    }

    var list = sywMerchants();
    MSS.track('绑定状态判断', '已绑定 ' + list.length + ' 个盛意旺商户');
    Assistant.renderHome();
    UI.go('asst-home', { reset: true });
    if (list.length > 1) {
      UI.toast('已绑定 ' + list.length + ' 个商户<br>诊断将对所选商户同时执行');
    }
  }

  document.querySelectorAll('[data-act="open-self-service"]').forEach(function (b) {
    b.onclick = openSelfService;
  });

  document.querySelectorAll('[data-act="to-chat"]').forEach(function (b) {
    b.onclick = function () { UI.go('home', { reset: true }); };
  });

  document.querySelectorAll('[data-act="back-asst"]').forEach(function (b) {
    b.onclick = function () {
      if (!isBound()) { UI.go('h5-limited', { reset: true }); return; }
      var goHome = function () { UI.go('asst-home', { reset: true }); };
      if (Assistant.isOnDiagnosisReport && Assistant.isOnDiagnosisReport()) {
        Assistant.exitDiagnosisReport(goHome);
      } else {
        goHome();
      }
    };
  });

  /* 游客不提供人工客服；已绑定盛意旺才可转人工 */
  document.querySelectorAll('[data-act="open-agent"]').forEach(function (b) {
    b.onclick = function () {
      closeMenu();
      if (!isBound()) {
        UI.toast('请先绑定手机号后再使用人工客服');
        return;
      }
      Assistant.toAgent({
        mode: 'queue',
        reason: '公众号人工客服入口'
      });
    };
  });

  /* ------------------------------ 线下商户：仅引导登录 App ------------------------------ */

  function showOffline(m) {
    m = m || { mchId: '线下商户', name: '线下收单商户' };
    var el = document.getElementById('offlineMch');
    if (el) el.textContent = MSS.maskMchId(m.mchId);
    MSS.track('线下商户引导', '仅引导登录 App，不绑定、不转人工');
    UI.go('offline', { reset: true });
  }

  /* ------------------------------ 游客受限首页 ------------------------------ */

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

  document.querySelector('[data-act="need-bind"]').onclick = function () {
    MSS.track('未绑定拦截', '点击资金未到账 → 引导手机号绑定');
    pushBindArticle();
    var mk = UI.mask(
      '<div class="sheet">' +
        '<div class="sheet-head"><div><h3>需要先绑定手机号</h3>' +
          '<p>验证商户预留手机号后即可使用自助诊断</p></div>' +
          '<button class="sheet-close">✕</button></div>' +
        '<div class="btn-row"><button class="btn btn-primary" data-act="go-bind">立即绑定</button>' +
          '<button class="btn btn-ghost" data-act="close">稍后再说</button></div>' +
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
          '<div class="wa-title">【绑定提醒】验证手机号，解锁资金未到账自助诊断</div>' +
          '<div class="wa-desc">使用商户预留手机号完成短信验证即可绑定，支持一次绑定多个商户号。</div>' +
        '</div>' +
        '<button class="wa-more" data-act="open-bind">点击此处立即绑定 <span>›</span></button>' +
      '</div>';
    while (wrap.firstChild) chat.appendChild(wrap.firstChild);
    chat.querySelector('[data-bind-msg] [data-act="open-bind"]').onclick = openBind;
  }

  /* ------------------ 绑定：手机号 + 验证码 + 多选 ------------------ */

  var phoneInput = document.getElementById('phoneInput');
  var codeInput = document.getElementById('codeInput');
  var btnCode = document.getElementById('btnCode');
  var btnBind = document.getElementById('btnBind');
  var bindErr = document.getElementById('bindErr');
  var codeTimer = null;
  var codeSent = false;

  function openBind() {
    closeMenu();
    offlineOnlyMode = false;
    resetBindForm();
    MSS.track('进入绑定引导', isBound() ? '追加绑定' : '首次绑定');
    UI.go('bind', { reset: true });
  }

  document.querySelectorAll('[data-act="open-bind"]').forEach(function (b) { b.onclick = openBind; });

  function resetBindForm() {
    clearInterval(codeTimer);
    codeSent = false;
    pendingPhoneMerchants = [];
    if (phoneInput) phoneInput.value = '';
    if (codeInput) codeInput.value = '';
    if (btnCode) { btnCode.disabled = false; btnCode.textContent = '获取验证码'; }
    showErr('');
    var pe = document.getElementById('pickErr');
    if (pe) { pe.textContent = ''; pe.classList.remove('is-show'); }
  }

  function showErr(msg) {
    bindErr.textContent = msg || '';
    bindErr.classList.toggle('is-show', !!msg);
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      showErr('');
    });
  }

  if (codeInput) {
    codeInput.addEventListener('input', function () {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      showErr('');
    });
  }

  if (btnCode) {
    btnCode.onclick = function () {
      var check = MSS.validatePhone(phoneInput.value);
      if (!check.ok) { showErr(check.msg); return; }

      codeSent = true;
      btnCode.disabled = true;
      MSS.track('发送验证码', '手机号 ' + check.masked + ' · 关联 ' + check.merchants.length + ' 个商户');
      UI.toast('验证码已发送至 ' + check.masked + '<br>演示环境固定为 123456');

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
  }

  if (btnBind) {
    btnBind.onclick = function () {
      var phoneCheck = MSS.validatePhone(phoneInput.value);
      if (!phoneCheck.ok) { showErr(phoneCheck.msg); return; }
      if (!codeSent && !codeInput.value) { showErr('请先获取并输入短信验证码'); return; }

      var codeCheck = MSS.validateCode(codeInput.value);
      if (!codeCheck.ok) {
        showErr(codeCheck.msg);
        MSS.track('绑定校验失败', '验证码错误');
        return;
      }

      clearInterval(codeTimer);
      pendingPhoneMerchants = phoneCheck.merchants.slice();
      var syw = pendingPhoneMerchants.filter(function (m) { return m.selfServiceEnabled; });
      var offline = pendingPhoneMerchants.filter(function (m) { return !m.selfServiceEnabled; });

      MSS.track('手机号验证通过', phoneCheck.masked + ' · 盛意旺 ' + syw.length + ' · 线下 ' + offline.length);

      /* 仅线下：不绑定，引导登录 App */
      if (!syw.length) {
        offlineOnlyMode = true;
        showOffline(offline[0]);
        return;
      }

      /* 单个盛意旺：直接绑定（若同时有线下则忽略线下） */
      if (syw.length === 1) {
        finishBind(syw.map(function (m) { return m.mchId; }));
        return;
      }

      /* 多个盛意旺：进入多选 */
      renderMchPick(syw);
      UI.go('bind-select', { reset: true });
    };
  }

  function renderMchPick(list) {
    var box = document.getElementById('mchPickList');
    box.innerHTML = list.map(function (m) {
      return '<label class="mch-pick">' +
        '<input type="checkbox" data-pick="' + m.mchId + '" checked>' +
        '<span class="mp-body"><span class="mp-name">' + m.name + '</span>' +
        '<span class="mp-meta">商户号 ' + m.mchId + ' · ' + m.line + '</span></span></label>';
    }).join('');
  }

  function finishBind(mchIds) {
    if (!mchIds.length) {
      UI.toast('请至少选择一个商户号');
      return;
    }
    var data = MSS.bindStore.bindMany(mchIds, mchIds[0]);
    offlineOnlyMode = false;
    presetId = '';
    syncConsole();
    MSS.track('绑定成功', 'OpenID ↔ ' + mchIds.join(',') + '（共 ' + mchIds.length + ' 个）');
    UI.toast('绑定成功，正在进入自助服务…');
    setTimeout(function () {
      Assistant.renderHome();
      UI.go('asst-home', { reset: true });
      if (mchIds.length > 1) {
        UI.toast('已绑定 ' + mchIds.length + ' 个商户<br>诊断将对全部绑定商户执行');
      }
    }, 900);
  }

  var btnConfirmPick = document.getElementById('btnConfirmPick');
  if (btnConfirmPick) {
    btnConfirmPick.onclick = function () {
      var picked = [];
      document.querySelectorAll('#mchPickList [data-pick]:checked').forEach(function (el) {
        picked.push(el.getAttribute('data-pick'));
      });
      var pe = document.getElementById('pickErr');
      if (!picked.length) {
        pe.textContent = '请至少勾选一个商户号';
        pe.classList.add('is-show');
        return;
      }
      pe.classList.remove('is-show');
      finishBind(picked);
    };
  }

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
      offlineOnlyMode = !!preset.offline;
      if (preset.seed && preset.seed.length) MSS.bindStore.seed(preset.seed, preset.last);
      else MSS.bindStore.clear();
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
    var list = sywMerchants();

    if (offlineOnlyMode) {
      mchBox.innerHTML = '演示状态：<b>线下商户访问</b><br>能力：仅引导登录盛意旺 App<br>不绑定商户号 · 不引导人工客服';
      return;
    }

    if (!list.length) {
      mchBox.innerHTML = '服务端绑定关系：<b>无</b><br>微信身份：<b>OpenID ' + data.openId + '</b><br>' +
        '可用能力：常见问题、手机号绑定<br>游客不展示人工客服入口';
      return;
    }

    var cur = merchant();
    mchBox.innerHTML = '微信 OpenID：<b>' + data.openId + '</b><br>' +
      '已绑定盛意旺商户（' + list.length + '）：<br>' +
      list.map(function (m) {
        return '&nbsp;· <b>' + m.mchId + '</b> ' + m.name +
          (m.mchId === cur.mchId ? ' <b style="color:#1677ff">← 当前</b>' : '');
      }).join('<br>') +
      '<br>诊断范围：全部绑定商户 · 转人工合并报告';
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
    MSS.bindStore.clear();
    presetId = 'guest';
    offlineOnlyMode = false;
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
