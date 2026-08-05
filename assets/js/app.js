/**
 * 场景一：盛意旺 App（PRD 3.1）
 * 底导 5 Tab：首页、商城、助手（中间凸起）、消息、我的
 * 助手 → 诊断 → 结果 → 自助修复 → 反馈 / 转人工
 */
(function () {
  var screen = document.getElementById('screen');
  var scenarioId = 'qualification';
  var merchant = MSS.MERCHANTS.syw;
  var activeTab = 'home';

  UI.init(screen);
  UI.mountStatusBars(document);

  Assistant.init({
    root: screen,
    platform: 'app',
    homeView: 'asst-home',
    agentUrl: 'https://chat.keqihui.com/any800/echatManager.do?companyPk=2c908e0f63b5e1e60163b5e5b7940001&codeKey=28',
    getMerchant: function () { return merchant; },
    getScenarioId: function () { return scenarioId; }
  });

  SettleSettings.init({
    getMerchant: function () { return merchant; }
  });

  /* ------------------------------ 底导模板同步 ------------------------------ */

  var tabbarTemplate = screen.querySelector('[data-view="home"] [data-tabbar]');

  function syncTabbars() {
    if (!tabbarTemplate) return;
    var html = tabbarTemplate.innerHTML;
    screen.querySelectorAll('[data-tabbar]').forEach(function (bar) {
      if (bar === tabbarTemplate) return;
      bar.innerHTML = html;
    });
    bindTabbars();
    paintTabState();
  }

  function paintTabState() {
    screen.querySelectorAll('[data-tabbar] .tab[data-tab]').forEach(function (tab) {
      tab.classList.toggle('is-on', tab.dataset.tab === activeTab);
    });
  }

  function goTab(key) {
    activeTab = key;
    paintTabState();
    if (key === 'home') {
      UI.go('home', { reset: true });
      return;
    }
    if (key === 'assistant') {
      MSS.track('助手入口点击', 'App 底导中间凸起');
      Assistant.renderHome();
      UI.go('asst-home', { reset: true });
      return;
    }
    if (key === 'shop') {
      UI.go('shop', { reset: true });
      return;
    }
    if (key === 'msg') {
      UI.go('msg', { reset: true });
      return;
    }
    if (key === 'me') {
      SettleSettings.renderMe();
      UI.go('me', { reset: true });
      return;
    }
  }

  function bindTabbars() {
    screen.querySelectorAll('[data-tabbar] .tab[data-tab]').forEach(function (tab) {
      tab.onclick = function () { goTab(tab.dataset.tab); };
    });
  }

  syncTabbars();

  /* 助手导航：事件委托，避免被标注节点/重绘冲掉点击 */
  screen.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || !screen.contains(btn)) return;
    var act = btn.getAttribute('data-act');

    if (act === 'back-app') {
      e.preventDefault();
      goTab('home');
      return;
    }

    if (act === 'back-me') {
      e.preventDefault();
      goTab('me');
      return;
    }

    if (act === 'back-account') {
      e.preventDefault();
      SettleSettings.renderAccount();
      UI.go('account', { reset: true });
      return;
    }

    if (act === 'back-settle-settings') {
      e.preventDefault();
      SettleSettings.renderSettings();
      UI.go('settle-settings', { reset: true });
      return;
    }

    if (act === 'back-settle-diagnosis') {
      e.preventDefault();
      if (window.SettleSettings) SettleSettings.setContext({});
      UI.go('asst-result', { animate: false });
      return;
    }

    if (act === 'back-home') {
      e.preventDefault();
      activeTab = 'assistant';
      paintTabState();
      Assistant.renderHome();
      UI.go('asst-home', { reset: true });
      return;
    }

    if (act === 'to-agent-direct') {
      e.preventDefault();
      MSS.track('人工入口点击', '助手首页右上角');
      Assistant.clearDiagnosis();
      Assistant.toAgent({ mode: 'queue', reason: '助手首页人工入口' });
    }
  });

  /* ------------------------------ 演示控制台 ------------------------------ */

  document.getElementById('consoleMerchant').innerHTML =
    '商户名称：<b>' + merchant.name + '</b><br>' +
    '商户号：<b>' + merchant.mchId + '</b><br>' +
    '产品线：<b>' + merchant.line + '</b><br>' +
    '识别方式：登录 Token 静默获取';

  var list = document.getElementById('scenarioList');
  list.innerHTML = MSS.SCENARIOS.map(function (s) {
    return '<button class="scenario' + (s.id === scenarioId ? ' is-on' : '') + '" data-sc="' + s.id + '">' +
      '<span class="dot"></span><span><span class="s-name">' + s.name + '</span>' +
      '<span class="s-desc">' + s.desc + '</span></span></button>';
  }).join('');

  list.querySelectorAll('[data-sc]').forEach(function (btn) {
    btn.onclick = function () {
      scenarioId = btn.dataset.sc;
      list.querySelectorAll('[data-sc]').forEach(function (x) { x.classList.remove('is-on'); });
      btn.classList.add('is-on');
      UI.toast('已切换为：' + MSS.getScenario(scenarioId).name + '<br>请点击「资金未到账」重新诊断');
    };
  });

  var logBox = document.getElementById('trackLog');
  document.addEventListener('mss:track', function (e) {
    var log = e.detail;
    logBox.innerHTML = log.length
      ? log.map(function (r) { return '<div class="row"><i>' + r.time + '</i> <b>' + r.event + '</b> ' + r.detail + '</div>'; }).join('')
      : '<div class="empty">暂无事件，开始操作后记录…</div>';
  });

  document.getElementById('btnReset').onclick = function () {
    MSS.clearLog();
    Assistant.reset();
    document.querySelectorAll('.mask').forEach(function (m) { m.parentNode.removeChild(m); });
    activeTab = 'home';
    paintTabState();
    UI.go('home', { reset: true });
  };
})();
