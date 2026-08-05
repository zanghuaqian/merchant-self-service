/**
 * 商户自助服务助手 · 诊断引擎与场景数据（演示用 Mock）
 * 对应 PRD 4.1 身份识别 / 4.2 诊断引擎 / 4.3 解决方案配置 / 4.4 反馈与转人工 / 6 埋点
 */
window.MSS = (function () {
  /* ---------------------------- 商户档案（4.1） ---------------------------- */

  /** 商户号为 6-8 位数字，展示时保留前 3 后 2 */
  function maskMchId(id) {
    if (!id || id.length <= 4) return id || '';
    return id.slice(0, 3) + new Array(id.length - 4).join('*') + id.slice(-2);
  }

  var MERCHANTS = {
    syw: {
      key: 'syw',
      name: '夸父信息',
      mchId: '88800213',
      phone: '138****6621',
      phoneRaw: '13812346621',
      line: '盛意旺',
      lineCode: 'SYW',
      selfServiceEnabled: true,
      settlement: {
        cardType: '对公',
        accountName: '夸父信息科技****有限公司',
        accountNameFull: '夸父信息科技（北京）有限公司',
        cardNo: '6222 **** **** 8817',
        bank: '招商银行 北京分行营业部',
        cycle: 'T+1',
        cutoff: '23:00',
        autoWithdraw: true,
        autoWithdrawTime: '每日 10:00 自动出款',
        reserve: '500.00',
        payoutService: '随心提',
        payoutServiceDesc: '可随时发起提现，实时到账'
      }
    },
    syw2: {
      key: 'syw2',
      name: '云栖餐饮管理',
      mchId: '7712009',
      phone: '138****6621',
      phoneRaw: '13812346621',
      line: '盛意旺',
      lineCode: 'SYW',
      selfServiceEnabled: true,
      settlement: {
        cardType: '对公',
        accountName: '云栖餐饮管理****有限公司',
        accountNameFull: '云栖餐饮管理（杭州）有限公司',
        cardNo: '6225 **** **** 3306',
        bank: '中国工商银行 杭州西湖支行',
        cycle: 'T+0',
        cutoff: '22:00',
        autoWithdraw: true,
        autoWithdrawTime: '每日交班后自动出款（约 22:30）',
        reserve: '1,000.00',
        payoutService: '交班提',
        payoutServiceDesc: '每日交班后统一出款，适合多班次门店'
      }
    },
    offline: {
      key: 'offline',
      name: '张记便利店',
      mchId: '620188',
      phone: '137****4408',
      phoneRaw: '13712344408',
      line: '线下收单',
      lineCode: 'OFFLINE',
      selfServiceEnabled: false,
      settlement: {
        cardType: '对私',
        accountName: '张*明',
        accountNameFull: '张明',
        cardNo: '6217 **** **** 0426',
        bank: '中国建设银行 北京朝阳支行',
        cycle: 'T+1',
        cutoff: '00:00',
        autoWithdraw: true,
        autoWithdrawTime: '每日 09:30 自动出款',
        reserve: '0.00',
        payoutService: '安心提',
        payoutServiceDesc: '结算日次日统一出款，资金更稳妥'
      }
    }
  };

  function merchantList() {
    return Object.keys(MERCHANTS).map(function (k) { return MERCHANTS[k]; });
  }

  function findByMchId(mchId) {
    var list = merchantList(), i;
    for (i = 0; i < list.length; i++) {
      if (list[i].mchId === String(mchId).trim()) return list[i];
    }
    return null;
  }

  /** 按预留手机号查找关联商户（演示：13812346621 关联 2 个盛意旺商户） */
  function findByPhone(phone) {
    var raw = String(phone || '').replace(/\D/g, '');
    return merchantList().filter(function (m) { return m.phoneRaw === raw; });
  }

  function maskPhone(phone) {
    var raw = String(phone || '').replace(/\D/g, '');
    if (raw.length < 7) return phone || '';
    return raw.slice(0, 3) + '****' + raw.slice(-4);
  }

  /**
   * 结算信息与诊断场景联动：命中结算/卡异常时，展示与诊断结论一致的状态
   */
  function getSettlement(merchant, scenarioId) {
    var s = merchant && merchant.settlement;
    if (!s) return null;
    var out = {};
    Object.keys(s).forEach(function (k) { out[k] = s[k]; });

    if (scenarioId === 'settlement' || scenarioId === 'multi') {
      out.autoWithdraw = false;
      out.autoWithdrawTime = '未开启，需手动发起提现';
      out.ruleAlert = '未开启自动提现，结算资金需手动提现后才会出款';
    }
    if (scenarioId === 'card') {
      out.cardStatus = '异常';
      out.cardAlert = '收款账户名称与开户信息不一致，请更新结算卡后重新出款';
    }
    if (scenarioId === 'payout_fail') {
      out.payoutAlert = '最近出款批次失败，失败原因来自渠道/银行侧，需联系客服协助核实';
    }
    if (scenarioId === 'risk') {
      out.payoutAlert = '账户风控止出中，出款已暂停';
    }
    if (scenarioId === 'risk_order') {
      out.payoutAlert = '存在未处理风控调单，相关交易资金暂缓出款，请尽快补充材料';
    }
    if (scenarioId === 'risk_contract') {
      out.payoutAlert = '电子合同未签约，相关结算出款已暂停，请完成合同签署';
    }
    return out;
  }

  /* ---------------------------- 诊断项定义（4.2） ---------------------------- */

  var STEPS = [
    { key: 'risk', name: '风控状态', source: '风控系统 · 账户止出/冻结/调单/合同签约状态' },
    { key: 'qualification', name: '资质状态', source: '资质管理系统 · 证书到期日/缺失项' },
    { key: 'settlement', name: '结算配置', source: '结算系统 · 自动提现开关/结算周期' },
    { key: 'payout', name: '最新出款批次', source: '出款系统 · 最近 3 笔结算批次状态' },
    { key: 'split', name: '分账/退款', source: '分账核心 · 交易核心' }
  ];

  var OK = {
    risk: '正常，无止出/冻结/待处理调单/合同待签',
    qualification: '正常，营业执照有效期至 2029-08-12',
    settlement: '正常，自动提现已开启（T+1）',
    payout: '正常，最近 3 笔批次均出款成功',
    split: '正常，无分账/退款挂起明细'
  };

  /* -------------------- 解决方案配置（4.3 后台映射表） -------------------- */

  var SOLUTIONS = {
    qualification: {
      type: 'link',
      label: '立即更新资质',
      page: 'qualification',
      title: '资质信息更新',
      url: 'https://sass.shengpay.com/com-pages-web/profits/v1/profits?ticket=BC_766967498100416512'
    },
    settlement: {
      type: 'settle_settings',
      label: '去结算设置',
      page: 'settle_settings',
      title: '结算设置',
      mpPath: 'pages/settle/settings',
      question: '如何开启自动提现？',
      guide: [
        '打开盛意旺「我的 → 账户余额 → 我的账户 → 结算设置」。',
        '打开「是否自动结算」开关，并确认日切时间与留存金额。',
        '保存后次日生效；关闭自动结算时可在结算设置页发起自助结算。'
      ]
    },
    /** 结算卡异常：可自助，跳转结算卡信息变更申请页 */
    payout_card: {
      type: 'card_change',
      label: '修改结算卡',
      page: 'card',
      title: '结算卡信息变更申请',
      url: 'https://settlecard.shengpay.com/settle-card/apply?ticket=56941366eaf2444b87e3b95ff4d796e6'
    },
    /** 批次出款失败（渠道/银行原因）：不可自助，提示失败原因并转人工 */
    payout: {
      type: 'agent',
      label: '联系客服',
      note: '批次失败可能由银行系统维护、渠道风控等原因导致，需人工核实后重推出款。'
    },
    /** 兼容旧 solutionKey */
    card: {
      type: 'card_change',
      label: '修改结算卡',
      page: 'card',
      title: '结算卡信息变更申请',
      url: 'https://settlecard.shengpay.com/settle-card/apply?ticket=56941366eaf2444b87e3b95ff4d796e6'
    },
    /** 风控冻结：不可自助，转人工 */
    risk: { type: 'agent', label: '联系客服', note: '风控止出需人工核实材料后解除，预计 1 个工作日内反馈。' },
    /** 风控调单：系统存在未处理调单记录时允许自助，跳转调单详情 */
    risk_order: {
      type: 'link',
      label: '去处理调单',
      page: 'risk_order',
      title: '调单详情',
      url: 'https://risk.shengpay.com/order/detail'
    },
    /** 风控合同未签约：可自助，跳转电子合同签约页 */
    risk_contract: {
      type: 'link',
      label: '去签约合同',
      page: 'contract',
      title: '合同签约',
      url: 'https://sass.shengpay.com/esign/ca/8SqKW499T0XMv2740994'
    },
    split: { type: 'agent', label: '联系客服', note: '分账渠道异常需运营介入处理，请联系客服提供分账批次号。' }
  };

  /* ---------------------------- 演示场景（含异常样例） ---------------------------- */

  var SCENARIOS = [
    {
      id: 'qualification',
      name: '资质过期（可自助）',
      desc: '命中资质异常，跳转资质更新页后回填反馈',
      findings: {
        qualification: {
          summary: '商户资质证书已过期，影响结算出款',
          detail: '营业执照（证件号 9133****2178Q）已于 2026-07-15 到期，受益人信息未完善。资质失效期间结算出款会被自动挂起，补齐后次日恢复。',
          brief: '过期（营业执照 2026-07-15 到期）',
          selfService: true
        }
      }
    },
    {
      id: 'settlement',
      name: '未开自动提现（可自助）',
      desc: '结算配置为手动提现，返回知识库指引',
      findings: {
        settlement: {
          summary: '当前设置为手动提现，需前往操作提现',
          detail: '自动提现开关处于关闭状态，当前可提现余额 3,860.42 元。开启后资金将在结算日按当前结算周期自动出款。',
          brief: '手动提现（自动提现开关关闭）',
          selfService: true
        }
      }
    },
    {
      id: 'card',
      name: '卡异常（可自助）',
      desc: '结算卡信息异常，跳转结算卡变更页',
      findings: {
        payout: {
          summary: '结算卡信息异常，导致出款失败',
          detail: '出款系统校验结算卡失败：收款账户名称与开户信息不一致（错误码 CARD_INFO_INVALID），关联批次 PO20260730821，金额 5,280.00 元。请更新结算卡信息，提交后系统将于次日自动重新出款。',
          brief: '结算卡异常（账户名称不一致）',
          selfService: true,
          solutionKey: 'payout_card'
        }
      }
    },
    {
      id: 'payout_fail',
      name: '批次出款失败（不可自助）',
      desc: '渠道/银行侧失败，仅提示原因并转人工',
      findings: {
        payout: {
          summary: 'PO20260730866 批次出款失败，需人工协助核实',
          detail: '批次金额 8,650.00 元。渠道返回「收款银行系统维护中，暂无法入账」（错误码 BANK_MAINTAIN）。此类失败通常由银行系统维护、渠道风控拦截等原因引起，商户侧无法自助处理。请联系客服协助核实并重推出款。',
          brief: '批次失败（银行系统维护 BANK_MAINTAIN）',
          selfService: false,
          solutionKey: 'payout',
          batchNo: 'PO20260730866',
          failCode: 'BANK_MAINTAIN',
          failReason: '收款银行系统维护中，暂无法入账'
        }
      }
    },
    {
      id: 'risk',
      name: '风控冻结（不可自助）',
      desc: '账户止出冻结，直接引导转人工',
      findings: {
        risk: {
          summary: '账户存在风控止出，冻结金额 12,860.00 元',
          detail: '命中规则：单日交易金额突增 + 异地 IP 集中（风控工单 RC20260730017），冻结时间 2026-07-30 18:22。需人工核实经营材料后解除。',
          brief: '止出冻结（工单 RC20260730017，冻结 12,860.00 元）',
          selfService: false
        }
      }
    },
    {
      id: 'risk_contract',
      name: '合同未签约（可自助）',
      desc: '风控命中合同未签约，跳转电子合同签约页',
      findings: {
        risk: {
          summary: '电子合同未签约，结算出款已暂停',
          detail: '风控系统检出商户电子合同尚未完成签署（合同编号 CT20260731026）。未签约状态下相关结算资金暂缓出款。请前往合同签约页完成签署，签署成功后系统将自动恢复出款。',
          brief: '合同未签约（CT20260731026）',
          selfService: true,
          solutionKey: 'risk_contract',
          contractNo: 'CT20260731026'
        }
      }
    },
    {
      id: 'risk_order',
      name: '风控调单（可自助）',
      desc: '存在未处理调单记录，引导跳转调单详情处理',
      findings: {
        risk: {
          summary: '存在未处理的风控调单，需补充交易凭证',
          detail: '风控系统检出 1 笔待处理调单（事件编号 RG2026071200004），涉及 3 笔交易，需按审核员要求补充经营与交易真实性材料。提交后预计 1 个工作日内完成审核，通过后相关资金恢复出款。',
          brief: '待处理调单 RG2026071200004（待回复·已逾期）',
          selfService: true,
          solutionKey: 'risk_order',
          eventNo: 'RG2026071200004',
          status: '待回复',
          createdAt: '2026/07/12',
          deadline: '2026/07/17',
          overdue: true,
          auditor: '调单审核员',
          feedbackAt: '2026-07-12 12:10:05',
          requirements: [
            '说明实际经营地址与经营内容',
            '提供经营场所照片4张（包含门头名称、地址等）',
            '说明/提供交易真实性材料'
          ],
          orders: [
            { channel: 'ali', tradeNo: 'MR3320260710128236056', mchNo: '4500877312', time: '2026/07/10 15:23:05', amount: '1.00', status: '退款成功' },
            { channel: 'ali', tradeNo: 'MR3320260710128236055', mchNo: '4500877312', time: '2026/07/10 15:22:41', amount: '1.00', status: '退款成功' },
            { channel: 'ali', tradeNo: 'MR3320260710128236054', mchNo: '4500877312', time: '2026/07/10 15:21:18', amount: '1.00', status: '退款成功' }
          ]
        }
      }
    },
    {
      id: 'split',
      name: '分账失败（不可自助）',
      desc: '分账明细失败导致金额未释放',
      findings: {
        split: {
          summary: '存在分账失败明细，导致部分金额未释放',
          detail: '3 笔分账指令失败（分账接收方未完成签约），未释放金额 1,240.00 元，涉及订单 20260730-0087 等。需运营协助重推分账。',
          brief: '3 笔分账失败，未释放 1,240.00 元',
          selfService: false
        }
      }
    },
    {
      id: 'multi',
      name: '多个异常并存',
      desc: '按阻断优先级展示，其余可折叠查看',
      findings: {
        qualification: {
          summary: '商户资质证书已过期，影响结算出款',
          detail: '营业执照（证件号 9133****2178Q）已于 2026-07-15 到期，受益人信息未完善。',
          brief: '过期（营业执照 2026-07-15 到期）',
          selfService: true
        },
        settlement: {
          summary: '当前设置为手动提现，需前往操作提现',
          detail: '自动提现开关处于关闭状态，结算资金需手动提现后才会出款。',
          brief: '手动提现（自动提现开关关闭）',
          selfService: true
        },
        split: {
          summary: '存在分账失败明细，导致部分金额未释放',
          detail: '1 笔分账指令失败，未释放金额 320.00 元。',
          brief: '1 笔分账失败，未释放 320.00 元',
          selfService: false
        }
      }
    },
    {
      id: 'normal',
      name: '未发现异常',
      desc: '5 项排查全部正常，提示银行处理中',
      findings: {}
    },
    {
      id: 'timeout',
      name: '诊断超时（>5 秒）',
      desc: '触发「网络繁忙，是否转人工？」',
      findings: {},
      timeout: true
    }
  ];

  function getScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return SCENARIOS[0];
  }

  /* ---------------------------- 诊断执行 ---------------------------- */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatTime(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function traceId() {
    var s = 'abcdef0123456789', out = '';
    for (var i = 0; i < 8; i++) out += s[Math.floor(Math.random() * s.length)];
    return 'diag_' + out;
  }

  /**
   * 按 PRD 4.2 顺序排查：命中首个阻断异常即终止后续查询；
   * 并行查询已获取的其他异常在结果页折叠区展示。
   * opts.resolvedKeys：商户已自助处理完成的节点，本次视为已恢复，继续排查后续项。
   */
  function diagnose(scenarioId, currentMerchant, opts) {
    opts = opts || {};
    var resolvedKeys = opts.resolvedKeys || [];
    var sc = getScenario(scenarioId);
    var steps = [], primary = null, others = [];
    var st = currentMerchant && currentMerchant.settlement;
    /** 结算配置正常时的文案跟随当前商户的真实结算规则 */
    var okSettlement = st
      ? '正常，' + (st.autoWithdraw ? '自动提现已开启' : '手动提现') + '（' + st.cycle + '，日切 ' + st.cutoff + '）'
      : OK.settlement;

    function isResolved(key) {
      return resolvedKeys.indexOf(key) >= 0;
    }

    STEPS.forEach(function (def) {
      var hit = sc.findings[def.key];
      var step = { key: def.key, name: def.name, source: def.source };

      if (hit && isResolved(def.key)) {
        step.status = 'resolved';
        step.brief = '已自助处理，状态已恢复';
        step.selfService = !!hit.selfService;
      } else if (primary) {
        if (hit) {
          step.status = 'abnormal';
          step.summary = hit.summary;
          step.detail = hit.detail;
          step.brief = hit.brief;
          step.selfService = !!hit.selfService;
          step.solution = SOLUTIONS[hit.solutionKey || def.key];
          step.meta = hit;
          others.push(step);
        } else {
          step.status = 'skipped';
          step.brief = '已终止查询（前序命中阻断异常）';
        }
      } else if (hit) {
        step.status = 'abnormal';
        step.summary = hit.summary;
        step.detail = hit.detail;
        step.brief = hit.brief;
        step.selfService = !!hit.selfService;
        step.solution = SOLUTIONS[hit.solutionKey || def.key];
        step.meta = hit;
        primary = step;
      } else {
        step.status = 'normal';
        step.brief = def.key === 'settlement' ? okSettlement : OK[def.key];
      }
      steps.push(step);
    });

    // 超时场景：出款批次之后的节点未取到结果，快照需如实标记
    if (sc.timeout) {
      steps.forEach(function (s) {
        if (s.key === 'payout' || s.key === 'split') {
          s.status = 'skipped';
          s.brief = '查询超时，未返回结果';
        }
      });
    }

    return {
      scenarioId: sc.id,
      timeout: !!sc.timeout,
      steps: steps,
      primary: primary,
      others: others,
      traceId: traceId(),
      time: formatTime(new Date())
    };
  }

  /* ---------------------------- 诊断快照（4.4） ---------------------------- */

  function buildSnapshot(merchant, result, userAction) {
    var nodes = result.steps.map(function (s) {
      return {
        name: s.name,
        value: s.brief || '—',
        state: s.status === 'abnormal' ? 'bad'
          : s.status === 'skipped' ? 'skip'
          : s.status === 'resolved' ? 'ok'
          : 'ok'
      };
    });

    var lines = [
      '商户号：' + merchant.mchId + ' | 产品线：' + merchant.line,
      '诊断流水号：' + result.traceId,
      '诊断时间：' + result.time,
      '排查节点及结果：'
    ].concat(nodes.map(function (n) { return '  ' + n.name + '：' + n.value; }));

    if (userAction) lines.push('用户操作：' + userAction);

    return { merchant: merchant, result: result, nodes: nodes, userAction: userAction || '', text: lines.join('\n') };
  }

  /* -------- 诊断报告独立链接（模拟服务端存储 + 一次性令牌，4.4） -------- */

  var REPORT_KEY = 'mss_reports';
  var REPORT_TTL = 2 * 60 * 60 * 1000;

  var reportStore = {
    all: function () {
      try { return JSON.parse(window.localStorage.getItem(REPORT_KEY) || '{}'); } catch (e) { return {}; }
    },

    /**
     * 落库诊断报告并返回可分享给客服的链接。
     * 真实实现应写入服务端并由服务端签发 token；此处用 localStorage 模拟同源存储。
     */
    save: function (payload) {
      var id = 'rpt_' + Math.random().toString(36).slice(2, 10);
      var token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      var now = Date.now();
      var rec = {
        id: id,
        token: token,
        createdAt: formatTime(new Date(now)),
        expireAt: now + REPORT_TTL,
        expireText: formatTime(new Date(now + REPORT_TTL)),
        data: payload
      };
      var db = this.all();
      db[id] = rec;
      try { window.localStorage.setItem(REPORT_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
      return rec;
    },

    load: function (id, token) {
      var rec = this.all()[id];
      if (!rec) return { ok: false, msg: '报告不存在或已被清理' };
      if (rec.token !== token) return { ok: false, msg: '访问令牌无效，请让商户重新发起' };
      if (Date.now() > rec.expireAt) return { ok: false, msg: '报告链接已过期（有效期 2 小时）' };
      return { ok: true, record: rec };
    },

    url: function (rec) {
      var base = window.location.href.replace(/[^/]*$/, '');
      return base + 'report.html?id=' + rec.id + '&token=' + rec.token;
    }
  };

  /* -------------- 微信绑定关系（模拟服务端存储，4.1 / 4.5） -------------- */

  var BIND_KEY = 'mss_wechat_binding';
  var OPEN_ID = 'oR8kJ7bV3xQ2mX';
  var VERIFY_CODE = '123456';

  var bindStore = {
    openId: OPEN_ID,

    load: function () {
      try {
        var raw = window.localStorage.getItem(BIND_KEY);
        var data = raw ? JSON.parse(raw) : null;
        if (data && data.merchants && data.merchants.length) return data;
      } catch (e) { /* 演示环境忽略存储异常 */ }
      return { openId: OPEN_ID, merchants: [], lastMchId: '', boundAt: '' };
    },

    save: function (data) {
      try { window.localStorage.setItem(BIND_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return data;
    },

    /** 绑定：微信 OpenID ↔ 商户号，写入服务端并置为当前商户 */
    bind: function (mchId) {
      return this.bindMany([mchId], mchId);
    },

    /** 一次绑定多个商户号（手机号验证通过后多选） */
    bindMany: function (mchIds, lastMchId) {
      var data = this.load();
      (mchIds || []).forEach(function (id) {
        if (data.merchants.indexOf(id) === -1) data.merchants.push(id);
      });
      data.openId = OPEN_ID;
      data.lastMchId = lastMchId || mchIds[0] || data.lastMchId;
      data.boundAt = formatTime(new Date());
      return this.save(data);
    },

    /** 切换当前商户，服务端记录「上一次使用的商户号」 */
    setLast: function (mchId) {
      var data = this.load();
      if (data.merchants.indexOf(mchId) === -1) return data;
      data.lastMchId = mchId;
      return this.save(data);
    },

    /** 演示用：直接写入一组绑定关系 */
    seed: function (mchIds, lastMchId) {
      return this.save({
        openId: OPEN_ID,
        merchants: mchIds.slice(),
        lastMchId: lastMchId || mchIds[mchIds.length - 1] || '',
        boundAt: formatTime(new Date())
      });
    },

    clear: function () {
      try { window.localStorage.removeItem(BIND_KEY); } catch (e) { /* ignore */ }
      return { openId: OPEN_ID, merchants: [], lastMchId: '', boundAt: '' };
    },

    /** 当前生效商户：默认取上一次查询诊断的商户号 */
    current: function () {
      var data = this.load();
      return data.lastMchId ? findByMchId(data.lastMchId) : null;
    },

    boundMerchants: function () {
      return this.load().merchants.map(findByMchId).filter(Boolean);
    }
  };

  /** 商户号格式校验：6-8 位数字 */
  function validateMchId(input) {
    var v = String(input || '').trim();
    if (!/^\d{6,8}$/.test(v)) return { ok: false, msg: '商户号为 6-8 位数字，请检查后重新输入' };
    var m = findByMchId(v);
    if (!m) return { ok: false, msg: '未查询到该商户号，请确认后重试或联系客服' };
    return { ok: true, merchant: m };
  }

  /** 手机号校验：11 位，并查出关联商户列表 */
  function validatePhone(input) {
    var v = String(input || '').replace(/\D/g, '');
    if (!/^1\d{10}$/.test(v)) return { ok: false, msg: '请输入 11 位手机号' };
    var list = findByPhone(v);
    if (!list.length) return { ok: false, msg: '未查询到该手机号关联的商户，请确认预留手机号是否正确' };
    return { ok: true, phone: v, merchants: list, masked: maskPhone(v) };
  }

  function validateCode(code) {
    var v = String(code || '').trim();
    if (!/^\d{6}$/.test(v)) return { ok: false, msg: '请输入 6 位短信验证码' };
    if (v !== VERIFY_CODE) return { ok: false, msg: '验证码错误或已失效，请重新获取' };
    return { ok: true };
  }

  /* ---------------------------- 埋点（6） ---------------------------- */

  var log = [];

  function track(event, detail) {
    var d = new Date();
    log.unshift({
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
      event: event,
      detail: detail || ''
    });
    if (log.length > 40) log.pop();
    document.dispatchEvent(new CustomEvent('mss:track', { detail: log }));
  }

  function clearLog() {
    log = [];
    document.dispatchEvent(new CustomEvent('mss:track', { detail: log }));
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /** 页面基址（用于生成可发给商户的处理链接） */
  function pageBase() {
    return window.location.href.replace(/[^/]*$/, '');
  }

  /**
   * 将可自助解决方案转为商户可打开的处理链接（客服侧复制/短信下发）
   * - 外链型：直接用配置 URL
   * - 结算设置：小程序结算设置页（客服可转二维码分享）
   * - 指引型：落到 action.html 展示步骤
   * - 人工型：无链接
   */
  function buildActionLink(step, merchant) {
    var sol = (step && step.solution) || {};
    if (!step || !step.selfService) return '';
    if (sol.url) return sol.url;
    var mchId = (merchant && merchant.mchId) || '';
    if (sol.type === 'settle_settings' || sol.page === 'settle_settings' || step.key === 'settlement') {
      return pageBase() + 'mp-settle-settings.html?mchId=' + encodeURIComponent(mchId) +
        '&from=cs';
    }
    var page = sol.page || step.key || 'guide';
    return pageBase() + 'action.html?page=' + encodeURIComponent(page) +
      '&key=' + encodeURIComponent(step.key || '') +
      '&mchId=' + encodeURIComponent(mchId) +
      '&title=' + encodeURIComponent(sol.title || step.name || '自助处理');
  }

  function isSettleSettingsStep(step) {
    var sol = (step && step.solution) || {};
    return !!(step && (step.key === 'settlement' || sol.type === 'settle_settings' || sol.page === 'settle_settings'));
  }

  /** 客服侧：小程序结算设置页二维码图片地址（演示用在线 QR 服务） */
  function buildSettleQrImageUrl(link, size) {
    size = size || 200;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size +
      '&margin=8&data=' + encodeURIComponent(link || '');
  }

  /** 客服短信文案模板 */
  function buildSmsText(merchant, step, link) {
    var name = (merchant && merchant.name) || '商户';
    var label = (step && step.solution && step.solution.label) || (step && step.name) || '处理';
    if (isSettleSettingsStep(step)) {
      return '【盛意旺】' + name + '您好，检测到未开启自动结算。请微信扫码打开小程序「结算设置」开启自动结算，或点击：' +
        link + ' 。如已处理请忽略。';
    }
    return '【盛意旺】' + name + '您好，关于资金未到账（' + (step.summary || label) +
      '），请点击链接完成处理：' + link + ' 。如已处理请忽略。';
  }

  return {
    MERCHANTS: MERCHANTS,
    STEPS: STEPS,
    SCENARIOS: SCENARIOS,
    SOLUTIONS: SOLUTIONS,
    VERIFY_CODE: VERIFY_CODE,
    merchantList: merchantList,
    findByMchId: findByMchId,
    findByPhone: findByPhone,
    maskMchId: maskMchId,
    maskPhone: maskPhone,
    getSettlement: getSettlement,
    bindStore: bindStore,
    reportStore: reportStore,
    validateMchId: validateMchId,
    validatePhone: validatePhone,
    validateCode: validateCode,
    getScenario: getScenario,
    diagnose: diagnose,
    buildSnapshot: buildSnapshot,
    buildActionLink: buildActionLink,
    buildSmsText: buildSmsText,
    isSettleSettingsStep: isSettleSettingsStep,
    buildSettleQrImageUrl: buildSettleQrImageUrl,
    pageBase: pageBase,
    track: track,
    getLog: function () { return log; },
    clearLog: clearLog,
    formatTime: formatTime,
    greeting: greeting
  };
})();
