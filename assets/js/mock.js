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

    var settleOff = {
      settlement: 1, multi: 1, low_settle_card: 1, low_settle_refund: 1, low_all: 1
    };
    var cardBad = {
      card: 1, payout_card: 1, low_settle_card: 1, low_card_split: 1, low_all: 1
    };
    var riskFreeze = { risk: 1, risk_freeze: 1, high_risk_contract: 1, high_all: 1, block_demo: 1 };
    var riskOrder = { risk_order: 1, high_order_qual: 1 };
    var contractBad = {
      contract: 1, risk_contract: 1, high_risk_contract: 1, high_contract_qual: 1, high_all: 1
    };
    var qualBad = { qualification: 1, beneficiary: 1, high_order_qual: 1, high_contract_qual: 1, high_all: 1 };

    if (settleOff[scenarioId]) {
      out.autoWithdraw = false;
      out.autoWithdrawTime = '未开启，需手动发起提现';
      out.ruleAlert = '未开启自动提现，结算资金需手动提现后才会出款';
    }
    if (cardBad[scenarioId]) {
      out.cardStatus = '异常';
      out.cardAlert = '收款账户名称与开户信息不一致，请更新结算卡后重新出款';
    }
    if (scenarioId === 'payout_fail') {
      out.payoutAlert = '最近出款批次失败，失败原因来自渠道/银行侧，需联系客服协助核实';
    }
    if (riskFreeze[scenarioId]) {
      out.payoutAlert = '账户风控止出中，出款已暂停';
    }
    if (riskOrder[scenarioId]) {
      out.payoutAlert = '存在未处理风控调单，相关交易资金暂缓出款，请尽快补充材料';
    }
    if (contractBad[scenarioId]) {
      out.payoutAlert = '电子合同未签约，相关结算出款已暂停，请完成合同签署';
    }
    if (qualBad[scenarioId] && !out.payoutAlert) {
      out.payoutAlert = '资质/受益人信息不完整，相关结算出款已限制，请尽快补齐';
    }
    return out;
  }

  /* ---------------------------- 诊断项定义（按客服提效项目优先级） ---------------------------- */

  /**
   * tier=high：P0+P1，同时诊断；任一异常则阻断后续
   * tier=low：P2+P3，仅当 P0/P1 全部正常时才诊断
   */
  var STEPS = [
    { key: 'risk', name: '风控状态', priority: 'P0', tier: 'high', source: '风控系统 · 账户止出/冻结/调单' },
    { key: 'contract', name: '合同状态', priority: 'P1', tier: 'high', source: '签约系统 · 电子合同签署状态' },
    { key: 'qualification', name: '资质状态', priority: 'P1', tier: 'high', source: '资质管理系统 · 证书到期/受益人' },
    { key: 'settlement', name: '结算配置', priority: 'P2', tier: 'low', source: '结算系统 · 自动提现/结算周期' },
    { key: 'payout', name: '最新出款批次', priority: 'P2', tier: 'low', source: '出款系统 · 最近结算批次状态' },
    { key: 'split', name: '分账', priority: 'P3', tier: 'low', source: '分账核心 · 分账失败明细' },
    { key: 'refund', name: '退款', priority: 'P3', tier: 'low', source: '交易核心 · 退款单状态' }
  ];

  var OK = {
    risk: '正常，无止出/冻结/待处理调单',
    contract: '正常，电子合同已签约',
    qualification: '正常，营业执照有效且受益人信息完整',
    settlement: '正常，自动提现已开启（T+1）',
    payout: '正常，最近批次均出款成功',
    split: '正常，无分账失败挂起明细',
    refund: '正常，无异常退款单'
  };

  /* -------------------- 解决方案配置（4.3 后台映射表） -------------------- */

  var SOLUTIONS = {
    risk: { type: 'agent', label: '联系客服', note: '风控止出需人工核实材料后解除，预计 1 个工作日内反馈。' },
    risk_order: {
      type: 'link',
      label: '去处理调单',
      page: 'risk_order',
      title: '调单详情',
      url: 'https://risk.shengpay.com/order/detail'
    },
    risk_contract: {
      type: 'link',
      label: '去签约合同',
      page: 'contract',
      title: '合同签约',
      url: 'https://sass.shengpay.com/esign/ca/8SqKW499T0XMv2740994'
    },
    contract: {
      type: 'link',
      label: '去签约合同',
      page: 'contract',
      title: '合同签约',
      url: 'https://sass.shengpay.com/esign/ca/8SqKW499T0XMv2740994'
    },
    qualification: {
      type: 'link',
      label: '立即更新资质',
      page: 'qualification',
      title: '资质信息更新',
      url: 'https://sass.shengpay.com/com-pages-web/profits/v1/profits?ticket=BC_766967498100416512'
    },
    beneficiary: {
      type: 'link',
      label: '补充受益人',
      page: 'qualification',
      title: '受益人信息补充',
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
    payout_card: {
      type: 'card_change',
      label: '修改结算卡',
      page: 'card',
      title: '结算卡信息变更申请',
      url: 'https://settlecard.shengpay.com/settle-card/apply?ticket=56941366eaf2444b87e3b95ff4d796e6'
    },
    card: {
      type: 'card_change',
      label: '修改结算卡',
      page: 'card',
      title: '结算卡信息变更申请',
      url: 'https://settlecard.shengpay.com/settle-card/apply?ticket=56941366eaf2444b87e3b95ff4d796e6'
    },
    payout: {
      type: 'agent',
      label: '联系客服',
      note: '批次失败可能由银行系统维护、渠道风控等原因导致，需人工核实后重推出款。'
    },
    split: { type: 'agent', label: '联系客服', note: '分账渠道异常需运营介入处理，请联系客服提供分账批次号。' },
    refund_pending: {
      type: 'guide',
      label: '查看退款进度',
      page: 'guide',
      title: '退款进度说明',
      question: '退款什么时候到账？',
      guide: [
        '退款由原支付渠道退回，一般 1-3 个工作日，银行卡最长 7 个工作日。',
        '可在交易查询中查看退款状态与预计到账时间。',
        '若超过预计时间仍未到账，可联系客服协助核查。'
      ]
    },
    refund_fail: { type: 'agent', label: '联系客服', note: '退款失败需人工核查退款链路，请携带退款单号转人工。' }
  };

  /* ---------------------------- 演示场景（按 P0/P1 阻断逻辑细分） ---------------------------- */

  var SCENARIOS = [
    { id: 'risk_freeze', name: 'P0·风控止出（不可自助）', desc: '账户止出冻结，阻断后续诊断，引导转人工',
      findings: { risk: { summary: '您的账户存在风控止出，冻结金额 12,860.00 元，暂无法结算。', detail: '命中规则：单日交易金额突增 + 异地 IP 集中（风控工单 RC20260730017），冻结时间 2026-07-30 18:22。需人工核实经营材料后解除。', brief: '止出冻结（工单 RC20260730017，冻结 12,860.00 元）', selfService: false, solutionKey: 'risk' } } },
    { id: 'risk_order', name: 'P0·风控调单（可自助）', desc: '调单未完成导致止出，可跳转调单页；阻断后续',
      findings: { risk: { summary: '您的账户因风控调单未完成导致止出，请完成调单后恢复结算。', detail: '风控系统检出 1 笔待处理调单（事件编号 RG2026071200004），涉及 3 笔交易。提交后预计 1 个工作日内完成审核。', brief: '待处理调单 RG2026071200004（待回复·已逾期）', selfService: true, solutionKey: 'risk_order', eventNo: 'RG2026071200004', status: '待回复', createdAt: '2026/07/12', deadline: '2026/07/17', overdue: true, auditor: '调单审核员', feedbackAt: '2026-07-12 12:10:05', requirements: ['说明实际经营地址与经营内容', '提供经营场所照片4张（包含门头名称、地址等）', '说明/提供交易真实性材料'], orders: [{ channel: 'ali', tradeNo: 'MR3320260710128236056', mchNo: '4500877312', time: '2026/07/10 15:23:05', amount: '1.00', status: '退款成功' }, { channel: 'ali', tradeNo: 'MR3320260710128236055', mchNo: '4500877312', time: '2026/07/10 15:22:41', amount: '1.00', status: '退款成功' }, { channel: 'ali', tradeNo: 'MR3320260710128236054', mchNo: '4500877312', time: '2026/07/10 15:21:18', amount: '1.00', status: '退款成功' }] } } },
    { id: 'contract', name: 'P1·合同未签约（可自助）', desc: '电子合同未签导致止出，跳转签约页；阻断后续',
      findings: { contract: { summary: '您的商户合同尚未完成签约，导致账户止出，请完成合同签约后恢复结算。', detail: '签约系统检出商户电子合同尚未完成签署（合同编号 CT20260731026）。未签约状态下相关结算资金暂缓出款。', brief: '合同未签约（CT20260731026）', selfService: true, solutionKey: 'contract', contractNo: 'CT20260731026' } } },
    { id: 'qualification', name: 'P1·资质过期（可自助）', desc: '营业执照过期限制出款，跳转资质更新；阻断后续',
      findings: { qualification: { summary: '您的商户资质证书（营业执照）已于 2026年7月15日 过期，导致结算出款被限制。', detail: '营业执照（证件号 9133****2178Q）已于 2026-07-15 到期。资质失效期间结算出款会被自动挂起，补齐后系统将重新校验。', brief: '过期（营业执照 2026-07-15 到期）', selfService: true, solutionKey: 'qualification' } } },
    { id: 'beneficiary', name: 'P1·受益人未补充（可自助）', desc: '受益人信息不完整，跳转补充页；阻断后续',
      findings: { qualification: { summary: '您的受益人信息不完整，请补充后重试。', detail: '资质系统检出受益人姓名/证件号缺失或不完整，需补充后方可恢复正常结算出款。', brief: '受益人信息未完善', selfService: true, solutionKey: 'beneficiary' } } },

    { id: 'high_risk_contract', name: 'P0+P1·止出+合同未签', desc: '风控止出与合同未签同时命中，后续 P2/P3 不执行',
      findings: { risk: { summary: '您的账户存在风控止出，冻结金额 8,200.00 元，暂无法结算。', detail: '风控工单 RC20260731001，冻结金额 8,200.00 元。', brief: '止出冻结（RC20260731001）', selfService: false, solutionKey: 'risk' }, contract: { summary: '您的商户合同尚未完成签约，导致账户止出，请完成合同签约后恢复结算。', detail: '合同编号 CT20260731026 未签署。', brief: '合同未签约（CT20260731026）', selfService: true, solutionKey: 'contract' } } },
    { id: 'high_order_qual', name: 'P0+P1·调单+资质过期', desc: '调单与资质过期同时命中，均可自助，阻断后续',
      findings: { risk: { summary: '您的账户因风控调单未完成导致止出，请完成调单后恢复结算。', detail: '待处理调单 RG2026071200004。', brief: '待处理调单 RG2026071200004', selfService: true, solutionKey: 'risk_order', eventNo: 'RG2026071200004', status: '待回复', createdAt: '2026/07/12', deadline: '2026/07/17', overdue: true, auditor: '调单审核员', feedbackAt: '2026-07-12 12:10:05', requirements: ['说明实际经营地址与经营内容', '提供经营场所照片4张', '说明/提供交易真实性材料'], orders: [{ channel: 'ali', tradeNo: 'MR3320260710128236056', mchNo: '4500877312', time: '2026/07/10 15:23:05', amount: '1.00', status: '退款成功' }] }, qualification: { summary: '您的商户资质证书（营业执照）已于 2026年7月15日 过期，导致结算出款被限制。', detail: '营业执照已过期，需更新后重新校验。', brief: '过期（营业执照 2026-07-15 到期）', selfService: true, solutionKey: 'qualification' } } },
    { id: 'high_contract_qual', name: 'P1+P1·合同+受益人', desc: '合同未签与受益人缺失同时命中，阻断后续',
      findings: { contract: { summary: '您的商户合同尚未完成签约，导致账户止出，请完成合同签约后恢复结算。', detail: '合同编号 CT20260731026 未签署。', brief: '合同未签约（CT20260731026）', selfService: true, solutionKey: 'contract' }, qualification: { summary: '您的受益人信息不完整，请补充后重试。', detail: '受益人姓名/证件号缺失。', brief: '受益人信息未完善', selfService: true, solutionKey: 'beneficiary' } } },
    { id: 'high_all', name: 'P0+P1·三项全命中', desc: '风控止出 + 合同未签 + 资质过期，后续全部阻断',
      findings: { risk: { summary: '您的账户存在风控止出，冻结金额 3,600.00 元，暂无法结算。', detail: '风控工单 RC20260801008。', brief: '止出冻结（RC20260801008）', selfService: false, solutionKey: 'risk' }, contract: { summary: '您的商户合同尚未完成签约，导致账户止出，请完成合同签约后恢复结算。', detail: '合同编号 CT20260801011 未签署。', brief: '合同未签约（CT20260801011）', selfService: true, solutionKey: 'contract' }, qualification: { summary: '您的商户资质证书（营业执照）已于 2026年6月30日 过期，导致结算出款被限制。', detail: '营业执照已过期。', brief: '过期（营业执照 2026-06-30 到期）', selfService: true, solutionKey: 'qualification' } } },

    { id: 'settlement', name: 'P2·未开自动提现（可自助）', desc: 'P0/P1 正常后诊断结算配置，引导结算设置',
      findings: { settlement: { summary: '当前结算方式为手动提现，需前往结算设置开启自动提现或手动操作提现。', detail: '自动提现开关处于关闭状态，当前可提现余额 3,860.42 元。开启后资金将在结算日按当前结算周期自动出款。', brief: '手动提现（自动提现开关关闭）', selfService: true, solutionKey: 'settlement' } } },
    { id: 'payout_card', name: 'P2·出款失败·卡异常（可自助）', desc: '收款卡信息异常，跳转结算卡变更',
      findings: { payout: { summary: '2026年7月30日 结算批次（批次号：PO20260730821）出款失败，原因：收款银行卡信息错误或已失效。', detail: '出款系统校验结算卡失败：收款账户名称与开户信息不一致（错误码 CARD_INFO_INVALID），金额 5,280.00 元。请更新结算卡，提交后系统将于次日自动重新出款。', brief: '结算卡异常（账户名称不一致）', selfService: true, solutionKey: 'payout_card' } } },
    { id: 'payout_fail', name: 'P2·出款失败·银行通道（不可自助）', desc: '银行通道异常，引导转人工',
      findings: { payout: { summary: '2026年7月30日 结算批次（批次号：PO20260730866）出款失败，原因：银行通道处理异常，请稍后重试。', detail: '批次金额 8,650.00 元。渠道返回「收款银行系统维护中，暂无法入账」（错误码 BANK_MAINTAIN）。', brief: '批次失败（银行系统维护 BANK_MAINTAIN）', selfService: false, solutionKey: 'payout', batchNo: 'PO20260730866', failCode: 'BANK_MAINTAIN', failReason: '收款银行系统维护中，暂无法入账' } } },
    { id: 'split', name: 'P3·分账失败（不可自助）', desc: '分账失败导致资金未释放，转人工',
      findings: { split: { summary: '存在 3 笔分账失败明细，导致部分结算资金未释放。失败原因：分账接收方未完成签约。', detail: '未释放金额 1,240.00 元，涉及订单 20260730-0087 等。需运营协助重推分账。', brief: '3 笔分账失败，未释放 1,240.00 元', selfService: false, solutionKey: 'split' } } },
    { id: 'refund_pending', name: 'P3·退款处理中（安抚）', desc: '退款银行处理中，展示进度说明',
      findings: { refund: { summary: '退款单号 RF20260731088 已受理，目前银行处理中，预计 2 小时内到账。', detail: '退款金额 128.00 元，原路退回至支付银行卡。可在交易查询中查看退款进度。', brief: '退款处理中（RF20260731088）', selfService: true, solutionKey: 'refund_pending' } } },
    { id: 'refund_fail', name: 'P3·退款失败（不可自助）', desc: '退款处理失败，引导转人工',
      findings: { refund: { summary: '退款单号 RF20260730055 处理失败，原因：原路退回账户异常，请联系客服处理。', detail: '退款金额 560.00 元，渠道返回 ACCOUNT_INVALID。需人工核查退款链路。', brief: '退款失败（RF20260730055）', selfService: false, solutionKey: 'refund_fail' } } },

    { id: 'low_settle_card', name: 'P2+P2·手动提现+卡异常', desc: '高优先级正常，同时命中结算配置与卡异常',
      findings: { settlement: { summary: '当前结算方式为手动提现，需前往结算设置开启自动提现或手动操作提现。', detail: '自动提现开关关闭。', brief: '手动提现（自动提现开关关闭）', selfService: true, solutionKey: 'settlement' }, payout: { summary: '2026年7月30日 结算批次（批次号：PO20260730821）出款失败，原因：收款银行卡信息错误或已失效。', detail: '账户名称不一致，金额 5,280.00 元。', brief: '结算卡异常（账户名称不一致）', selfService: true, solutionKey: 'payout_card' } } },
    { id: 'low_card_split', name: 'P2+P3·卡异常+分账失败', desc: '高优先级正常，出款卡异常与分账失败并存',
      findings: { payout: { summary: '2026年7月30日 结算批次（批次号：PO20260730821）出款失败，原因：收款银行卡信息错误或已失效。', detail: '卡信息异常。', brief: '结算卡异常', selfService: true, solutionKey: 'payout_card' }, split: { summary: '存在 1 笔分账失败明细，导致部分结算资金未释放。失败原因：接收方未签约。', detail: '未释放金额 320.00 元。', brief: '1 笔分账失败，未释放 320.00 元', selfService: false, solutionKey: 'split' } } },
    { id: 'low_settle_refund', name: 'P2+P3·手动提现+退款失败', desc: '结算配置与退款失败并存',
      findings: { settlement: { summary: '当前结算方式为手动提现，需前往结算设置开启自动提现或手动操作提现。', detail: '自动提现关闭。', brief: '手动提现', selfService: true, solutionKey: 'settlement' }, refund: { summary: '退款单号 RF20260730055 处理失败，原因：原路退回账户异常，请联系客服处理。', detail: '退款失败需人工核查。', brief: '退款失败', selfService: false, solutionKey: 'refund_fail' } } },
    { id: 'low_all', name: 'P2+P3·低优先级全命中', desc: '结算/出款/分账/退款均异常（P0/P1 正常才可出现）',
      findings: { settlement: { summary: '当前结算方式为手动提现，需前往结算设置开启自动提现或手动操作提现。', detail: '自动提现关闭。', brief: '手动提现', selfService: true, solutionKey: 'settlement' }, payout: { summary: '2026年7月30日 结算批次出款失败，原因：收款银行卡信息错误或已失效。', detail: '卡异常。', brief: '结算卡异常', selfService: true, solutionKey: 'payout_card' }, split: { summary: '存在 2 笔分账失败明细，导致部分结算资金未释放。', detail: '未释放 640.00 元。', brief: '2 笔分账失败', selfService: false, solutionKey: 'split' }, refund: { summary: '退款单号 RF20260731001 处理失败，请联系客服处理。', detail: '退款失败。', brief: '退款失败', selfService: false, solutionKey: 'refund_fail' } } },

    { id: 'block_demo', name: '阻断演示·P0命中忽略后续项', desc: '场景含出款异常数据，但因风控止出，出款项标记未执行',
      findings: { risk: { summary: '您的账户存在风控止出，冻结金额 1,000.00 元，暂无法结算。', detail: 'P0 命中后不继续诊断 P2/P3。', brief: '止出冻结', selfService: false, solutionKey: 'risk' }, payout: { summary: '（演示用）即便配置了出款异常，也应被阻断不执行', detail: '不应出现在结果异常列表中', brief: '应被跳过', selfService: true, solutionKey: 'payout_card' } } },

    { id: 'normal', name: '兜底·未发现异常', desc: '全部诊断项正常，安抚文案 + 联系客服入口', findings: {} },
    { id: 'timeout', name: '诊断超时（>5 秒）', desc: '触发「网络繁忙，是否转人工？」', findings: {}, timeout: true },

    { id: 'risk', name: '（兼容）风控冻结', desc: '同 P0·风控止出', findings: { risk: { summary: '您的账户存在风控止出，冻结金额 12,860.00 元，暂无法结算。', detail: '风控工单 RC20260730017。', brief: '止出冻结', selfService: false, solutionKey: 'risk' } } },
    { id: 'risk_contract', name: '（兼容）合同未签约', desc: '同 P1·合同未签约', findings: { contract: { summary: '您的商户合同尚未完成签约，导致账户止出，请完成合同签约后恢复结算。', detail: '合同编号 CT20260731026。', brief: '合同未签约', selfService: true, solutionKey: 'contract', contractNo: 'CT20260731026' } } },
    { id: 'card', name: '（兼容）卡异常', desc: '同 P2·出款失败·卡异常', findings: { payout: { summary: '结算批次出款失败，原因：收款银行卡信息错误或已失效。', detail: '卡信息异常。', brief: '结算卡异常', selfService: true, solutionKey: 'payout_card' } } },
    { id: 'multi', name: '（兼容）多异常·低优先级', desc: '同手动提现+卡异常+分账', findings: { settlement: { summary: '当前结算方式为手动提现，需前往结算设置开启自动提现或手动操作提现。', detail: '自动提现关闭。', brief: '手动提现', selfService: true, solutionKey: 'settlement' }, payout: { summary: '结算批次出款失败，原因：收款银行卡信息错误或已失效。', detail: '卡异常。', brief: '结算卡异常', selfService: true, solutionKey: 'payout_card' }, split: { summary: '存在 1 笔分账失败明细，导致部分结算资金未释放。', detail: '未释放 320.00 元。', brief: '1 笔分账失败', selfService: false, solutionKey: 'split' } } }
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
   * 诊断逻辑：
   * 1）P0+P1（tier=high）同时诊断，多项异常均可展示；
   * 2）若 P0/P1 任一异常（未自助恢复），则阻断后续 P2/P3，标记未执行；
   * 3）P0/P1 全部正常（或已自助恢复）后，再诊断全部 P2/P3。
   */
  function diagnose(scenarioId, currentMerchant, opts) {
    opts = opts || {};
    var resolvedKeys = opts.resolvedKeys || [];
    var sc = getScenario(scenarioId);
    var steps = [], primary = null, others = [];
    var st = currentMerchant && currentMerchant.settlement;
    var okSettlement = st
      ? '正常，' + (st.autoWithdraw ? '自动提现已开启' : '手动提现') + '（' + st.cycle + '，日切 ' + st.cutoff + '）'
      : OK.settlement;

    function isResolved(key) {
      return resolvedKeys.indexOf(key) >= 0;
    }

    function attachHit(step, hit, def) {
      step.status = 'abnormal';
      step.summary = hit.summary;
      step.detail = hit.detail;
      step.brief = hit.brief;
      step.selfService = !!hit.selfService;
      step.solution = SOLUTIONS[hit.solutionKey || def.key];
      step.meta = hit;
      step.priority = def.priority;
    }

    function pushAbnormal(step) {
      if (!primary) primary = step;
      else others.push(step);
    }

    /* 先完整跑完 P0/P1，再决定是否阻断 P2/P3 */
    var highBlocked = false;
    var highSteps = STEPS.filter(function (d) { return d.tier === 'high'; });
    var lowSteps = STEPS.filter(function (d) { return d.tier === 'low'; });

    highSteps.forEach(function (def) {
      var hit = sc.findings[def.key];
      var step = { key: def.key, name: def.name, source: def.source, priority: def.priority, tier: def.tier };
      if (hit && isResolved(def.key)) {
        step.status = 'resolved';
        step.brief = '已自助处理，状态已恢复';
        step.selfService = !!hit.selfService;
      } else if (hit) {
        attachHit(step, hit, def);
        pushAbnormal(step);
        highBlocked = true;
      } else {
        step.status = 'normal';
        step.brief = OK[def.key] || '正常';
      }
      steps.push(step);
    });

    lowSteps.forEach(function (def) {
      var hit = sc.findings[def.key];
      var step = { key: def.key, name: def.name, source: def.source, priority: def.priority, tier: def.tier };
      if (highBlocked) {
        step.status = 'skipped';
        step.brief = '已终止查询（P0/P1 命中阻断异常）';
        steps.push(step);
        return;
      }
      if (hit && isResolved(def.key)) {
        step.status = 'resolved';
        step.brief = '已自助处理，状态已恢复';
        step.selfService = !!hit.selfService;
      } else if (hit) {
        attachHit(step, hit, def);
        pushAbnormal(step);
      } else {
        step.status = 'normal';
        step.brief = def.key === 'settlement' ? okSettlement : (OK[def.key] || '正常');
      }
      steps.push(step);
    });

    if (sc.timeout) {
      steps.forEach(function (s) {
        if (s.tier === 'low') {
          s.status = 'skipped';
          s.brief = '查询超时，未返回结果';
        }
      });
      primary = null;
      others = [];
    }

    return {
      scenarioId: sc.id,
      timeout: !!sc.timeout,
      steps: steps,
      primary: primary,
      others: others,
      highBlocked: highBlocked,
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

  /* -------- 诊断报告短链（GitHub Pages · 流水号） -------- */

  /** 演示环境统一使用 GitHub Pages，保证客服/他人打开的是公网链接 */
  var PUBLIC_BASE = 'https://zanghuaqian.github.io/merchant-self-service/';
  var REPORT_KEY = 'mss_reports';
  var REPORT_BY_T_KEY = 'mss_reports_by_t';
  var REPORT_TTL = 2 * 60 * 60 * 1000;

  function extractTraceId(payload, fallbackId) {
    if (!payload) return fallbackId || '';
    if (payload.diagnosis && payload.diagnosis.traceId) return payload.diagnosis.traceId;
    if (payload.multi && payload.multi.reports && payload.multi.reports[0] &&
        payload.multi.reports[0].diagnosis && payload.multi.reports[0].diagnosis.traceId) {
      return payload.multi.reports[0].diagnosis.traceId;
    }
    return fallbackId || ('diag_' + Math.random().toString(36).slice(2, 10));
  }

  function readByTraceMap() {
    try { return JSON.parse(window.localStorage.getItem(REPORT_BY_T_KEY) || '{}'); } catch (e) { return {}; }
  }

  function writeByTraceMap(map) {
    try { window.localStorage.setItem(REPORT_BY_T_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  /** 同步上传到 jsonblob，便于他人用短链跨设备打开；失败则仅本机可读 */
  function uploadRemoteSync(rec) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://jsonblob.com/api/jsonBlob', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(JSON.stringify(rec));
      if (xhr.status >= 200 && xhr.status < 300) {
        var loc = xhr.getResponseHeader('Location') || '';
        var m = loc.match(/jsonBlob\/([^/?#]+)/i);
        if (m) return m[1];
        try {
          var body = JSON.parse(xhr.responseText || '{}');
          return body.id || body._id || '';
        } catch (e2) { /* ignore */ }
      }
    } catch (e) { /* ignore CORS/network */ }
    return '';
  }

  function fetchRemoteSync(remoteId) {
    if (!remoteId) return null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://jsonblob.com/api/jsonBlob/' + encodeURIComponent(remoteId), false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        return JSON.parse(xhr.responseText);
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  var reportStore = {
    all: function () {
      try { return JSON.parse(window.localStorage.getItem(REPORT_KEY) || '{}'); } catch (e) { return {}; }
    },

    /**
     * 落库诊断报告。
     * 短链仅含诊断流水号：report.html?t=diag_xxxx
     * 同时尝试上传远程备份，短链附加 &r= 供他人跨设备打开。
     */
    save: function (payload) {
      var id = 'rpt_' + Math.random().toString(36).slice(2, 10);
      var token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      var now = Date.now();
      var traceId = extractTraceId(payload, id);
      var rec = {
        id: id,
        token: token,
        traceId: traceId,
        createdAt: formatTime(new Date(now)),
        expireAt: now + REPORT_TTL,
        expireText: formatTime(new Date(now + REPORT_TTL)),
        data: payload
      };
      var remoteId = uploadRemoteSync(rec);
      if (remoteId) rec.remoteId = remoteId;

      var db = this.all();
      db[id] = rec;
      try { window.localStorage.setItem(REPORT_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }

      var byT = readByTraceMap();
      byT[traceId] = { id: id, remoteId: remoteId || '', expireAt: rec.expireAt };
      writeByTraceMap(byT);

      return rec;
    },

    load: function (id, token) {
      var rec = this.all()[id];
      if (!rec) return { ok: false, msg: '报告不存在或已被清理' };
      if (token && rec.token !== token) return { ok: false, msg: '访问令牌无效，请让商户重新发起' };
      if (Date.now() > rec.expireAt) return { ok: false, msg: '报告链接已过期（有效期 2 小时）' };
      return { ok: true, record: rec };
    },

    /** 按诊断流水号加载（本地索引 → 远程备份） */
    loadByTrace: function (traceId, remoteId) {
      if (!traceId && !remoteId) {
        return { ok: false, msg: '缺少诊断流水号' };
      }
      var byT = readByTraceMap();
      var meta = (traceId && byT[traceId]) || null;
      var db = this.all();
      var rec = null;

      if (meta && meta.id && db[meta.id]) rec = db[meta.id];
      if (!rec && traceId) {
        Object.keys(db).forEach(function (k) {
          if (!rec && db[k] && db[k].traceId === traceId) rec = db[k];
        });
      }
      if (!rec) {
        var rid = remoteId || (meta && meta.remoteId) || '';
        rec = fetchRemoteSync(rid);
      }
      if (!rec || !rec.data) {
        return {
          ok: false,
          msg: '未找到流水号对应的诊断报告（可能已过期，或不在本机且远程备份不可用）'
        };
      }
      if (rec.expireAt && Date.now() > rec.expireAt) {
        return { ok: false, msg: '报告链接已过期（有效期 2 小时）' };
      }
      return { ok: true, record: rec };
    },

    /** @deprecated 兼容旧版 #d= 超长链接 */
    loadShared: function (hash) {
      var raw = String(hash || '');
      var m = raw.match(/(?:^[#&?]|[#&])d=([^&]+)/);
      if (!m) return null;
      try {
        var s = String(m[1] || '').replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        var rec = JSON.parse(decodeURIComponent(escape(atob(s))));
        if (!rec || !rec.data) return { ok: false, msg: '报告载荷无效' };
        if (rec.expireAt && Date.now() > rec.expireAt) {
          return { ok: false, msg: '报告链接已过期（有效期 2 小时）' };
        }
        return { ok: true, record: rec };
      } catch (e) {
        return { ok: false, msg: '报告载荷解析失败，请让商户重新发起' };
      }
    },

    /** 短链：仅流水号；有远程备份时附加 &r= */
    url: function (rec) {
      var t = (rec && rec.traceId) || extractTraceId(rec && rec.data, rec && rec.id);
      var u = PUBLIC_BASE + 'report.html?t=' + encodeURIComponent(t);
      if (rec && rec.remoteId) u += '&r=' + encodeURIComponent(rec.remoteId);
      return u;
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
    PUBLIC_BASE: PUBLIC_BASE,
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
