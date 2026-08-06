/**
 * 客服工作台 · 资金未到账自动诊断
 * 按商户号 / 手机号查询，多选后生成诊断报告；可自助项展示处理链接供复制或短信下发
 */
(function () {
  var mode = 'mch'; // mch | phone
  var candidates = [];
  var selected = {};
  var scenarioId = 'qualification';
  var lastBundles = [];
  var lastReport = null;
  var lastPhone = '';

  var $ = function (id) { return document.getElementById(id); };

  function toast(msg) {
    var el = $('csToast');
    el.innerHTML = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function copyText(text, okMsg) {
    if (!text) { toast('暂无可复制内容'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMsg || '已复制到剪贴板');
      }, function () { fallbackCopy(text, okMsg); });
    } else {
      fallbackCopy(text, okMsg);
    }
  }

  function fallbackCopy(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(okMsg || '已复制到剪贴板');
    } catch (e) {
      toast('复制失败，请手动选择文本');
    }
    document.body.removeChild(ta);
  }

  /** 复制二维码图片到剪贴板；失败则下载 png 便于分享 */
  function copyQrImage(img, qrUrl) {
    function downloadBlob(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'settle-settings-qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('已下载二维码图片，可转发分享');
    }

    function fromBlob(blob) {
      if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]).then(function () {
          toast('二维码图片已复制，可直接粘贴分享');
        }, function () {
          downloadBlob(blob);
        });
      } else {
        downloadBlob(blob);
      }
    }

    function drawAndCopy(sourceImg) {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 240;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sourceImg, 20, 10, 160, 160);
        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('盛意旺 · 小程序结算设置', 100, 195);
        ctx.fillStyle = '#888';
        ctx.fillText('微信扫码打开', 100, 215);
        canvas.toBlob(function (blob) {
          if (blob) fromBlob(blob);
          else toast('生成二维码图片失败');
        }, 'image/png');
      } catch (e) {
        toast('复制图片失败，请右键保存二维码');
      }
    }

    if (img && img.complete && img.naturalWidth) {
      drawAndCopy(img);
      return;
    }

    var loader = new Image();
    loader.crossOrigin = 'anonymous';
    loader.onload = function () { drawAndCopy(loader); };
    loader.onerror = function () {
      copyText(qrUrl, '图片复制失败，已复制二维码图片地址');
    };
    loader.src = qrUrl + (qrUrl.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll('.cs-tab').forEach(function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-mode') === mode);
    });
    $('panelMch').style.display = mode === 'mch' ? '' : 'none';
    $('panelPhone').style.display = mode === 'phone' ? '' : 'none';
    $('searchErr').textContent = '';
  }

  document.querySelectorAll('.cs-tab').forEach(function (t) {
    t.onclick = function () { setMode(t.getAttribute('data-mode')); };
  });

  function renderPickList(list, opts) {
    opts = opts || {};
    candidates = list.slice();
    selected = {};
    if (opts.autoSelectAll !== false) {
      list.forEach(function (m) { selected[m.mchId] = true; });
    }

    var box = $('pickList');
    if (!list.length) {
      box.innerHTML = '<div class="cs-empty">暂无关联商户，请更换查询条件</div>';
      $('diagToolbar').style.display = 'none';
      return;
    }

    box.innerHTML = list.map(function (m) {
      var on = !!selected[m.mchId];
      return '<label class="cs-pick' + (on ? ' is-on' : '') + '" data-mch="' + m.mchId + '">' +
        '<input type="checkbox" ' + (on ? 'checked' : '') + '>' +
        '<span><div class="name">' + m.name + '</div>' +
        '<div class="meta">商户号 ' + m.mchId + ' · 预留手机 ' + (m.phone || '—') +
          (m.selfServiceEnabled ? '' : ' · 线下收单（公众号侧不可自助）') + '</div></span>' +
        '<span class="line ' + (m.lineCode === 'SYW' ? 'syw' : 'off') + '">' + m.line + '</span></label>';
    }).join('');

    box.querySelectorAll('.cs-pick').forEach(function (row) {
      var input = row.querySelector('input');
      var id = row.getAttribute('data-mch');
      input.onchange = function () {
        selected[id] = input.checked;
        row.classList.toggle('is-on', input.checked);
      };
    });

    $('diagToolbar').style.display = '';
    $('pickHint').textContent = opts.hint || ('共 ' + list.length + ' 个商户，勾选后可生成诊断报告');
    if (typeof updateScenarioCurrent === 'function') updateScenarioCurrent();
  }

  function selectedMerchants() {
    return candidates.filter(function (m) { return selected[m.mchId]; });
  }

  $('btnSearchMch').onclick = function () {
    var check = MSS.validateMchId($('mchInput').value);
    $('searchErr').textContent = '';
    if (!check.ok) {
      $('searchErr').textContent = check.msg;
      renderPickList([]);
      return;
    }
    MSS.track('客服查询商户号', check.merchant.mchId);
    renderPickList([check.merchant], { hint: '已按商户号命中 1 户，可直接生成诊断报告' });
    toast('已查询到「' + check.merchant.name + '」');
  };

  $('btnSearchPhone').onclick = function () {
    var check = MSS.validatePhone($('phoneInput').value);
    $('searchErr').textContent = '';
    if (!check.ok) {
      $('searchErr').textContent = check.msg;
      renderPickList([]);
      return;
    }
    lastPhone = check.phone;
    MSS.track('客服查询手机号', check.masked + ' · ' + check.merchants.length + ' 户');
    renderPickList(check.merchants, {
      hint: '手机号 ' + check.masked + ' 关联 ' + check.merchants.length +
        ' 个商户，可多选后批量诊断'
    });
    toast('该手机号关联 ' + check.merchants.length + ' 个商户');
  };

  $('mchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('btnSearchMch').click();
  });
  $('phoneInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('btnSearchPhone').click();
  });

  /* 演示场景：可点击卡片切换，查看不同异常展示效果 */
  function scenarioKind(s) {
    if (s.timeout) return { tag: 'timeout', text: '超时' };
    var keys = Object.keys(s.findings || {});
    if (!keys.length) return { tag: 'ok', text: '正常' };
    if (keys.length > 1) return { tag: 'multi', text: '多异常' };
    var hit = s.findings[keys[0]];
    if (hit && hit.selfService) return { tag: 'self', text: '可转发处理' };
    return { tag: 'agent', text: '需客服跟进' };
  }

  function updateScenarioCurrent() {
    var sc = MSS.getScenario(scenarioId);
    var kind = scenarioKind(sc);
    $('scenarioCurrent').innerHTML =
      '当前场景：<b>' + sc.name + '</b>（' + kind.text + '）· ' + sc.desc +
      (selectedMerchants().length
        ? ' · 切换后可直接重新生成下方报告'
        : ' · 请先查询并勾选商户，再生成诊断报告');
  }

  function renderScenarioGrid() {
    var grid = $('scenarioGrid');
    grid.innerHTML = MSS.SCENARIOS.map(function (s) {
      var kind = scenarioKind(s);
      return '<button type="button" class="cs-sc-item' + (s.id === scenarioId ? ' is-on' : '') +
        '" data-sc="' + s.id + '">' +
        '<span class="sc-tag ' + kind.tag + '">' + kind.text + '</span>' +
        '<span class="sc-name">' + s.name + '</span>' +
        '<span class="sc-desc">' + s.desc + '</span></button>';
    }).join('');

    grid.querySelectorAll('[data-sc]').forEach(function (btn) {
      btn.onclick = function () {
        scenarioId = btn.getAttribute('data-sc');
        grid.querySelectorAll('[data-sc]').forEach(function (x) {
          x.classList.toggle('is-on', x.getAttribute('data-sc') === scenarioId);
        });
        updateScenarioCurrent();
        MSS.track('客服切换诊断场景', scenarioId);
        var name = MSS.getScenario(scenarioId).name;
        if (selectedMerchants().length) {
          toast('已切换：' + name + '<br>正在按新场景重新诊断…');
          runDiagnose();
        } else {
          toast('已切换：' + name + '<br>请查询商户后生成报告');
        }
      };
    });
    updateScenarioCurrent();
  }

  renderScenarioGrid();

  $('btnSelectAll').onclick = function () {
    candidates.forEach(function (m) { selected[m.mchId] = true; });
    renderPickList(candidates, { hint: $('pickHint').textContent });
  };
  $('btnSelectNone').onclick = function () {
    candidates.forEach(function (m) { selected[m.mchId] = false; });
    var box = $('pickList');
    box.querySelectorAll('.cs-pick').forEach(function (row) {
      row.classList.remove('is-on');
      row.querySelector('input').checked = false;
    });
    Object.keys(selected).forEach(function (k) { selected[k] = false; });
  };

  function allAbnormals(result) {
    var list = [];
    if (result.primary) list.push(result.primary);
    (result.others || []).forEach(function (o) { list.push(o); });
    return list;
  }

  function renderResult(bundles) {
    lastBundles = bundles;
    var box = $('resultBox');
    if (!bundles.length) {
      box.innerHTML = '<div class="cs-empty">尚未生成诊断结果</div>';
      $('reportBar').style.display = 'none';
      return;
    }

    var totalAbn = 0;
    bundles.forEach(function (b) { totalAbn += allAbnormals(b.result).length; });

    box.innerHTML =
      '<div class="cs-ok" style="margin-bottom:12px">已完成 ' + bundles.length +
        ' 个商户诊断，共发现异常 ' + totalAbn + ' 项。可自助项已转换为处理链接，可复制或短信发给商户。</div>' +
      bundles.map(function (b) {
        var m = b.merchant;
        var r = b.result;
        var abns = allAbnormals(r);
        var abnHtml = abns.length
          ? abns.map(function (s) {
              var link = MSS.buildActionLink(s, m);
              var sms = link ? MSS.buildSmsText(m, s, link) : '';
              var isSettle = MSS.isSettleSettingsStep(s);
              var qrUrl = isSettle ? MSS.buildSettleQrImageUrl(link, 200) : '';
              var badge = s.selfService
                ? '<span class="badge self">可转发处理</span>'
                : '<span class="badge agent">需客服跟进</span>';
              var linkBox;
              if (s.selfService && link && isSettle) {
                linkBox =
                  '<div class="cs-link-box cs-qr-box">' +
                    '<div class="lb-label">小程序结算设置页二维码（可分享给商户扫码）</div>' +
                    '<div class="cs-qr-wrap">' +
                      '<img class="cs-qr-img" src="' + qrUrl + '" alt="结算设置二维码" width="160" height="160" data-qr-src="' +
                        encodeURIComponent(qrUrl) + '">' +
                      '<div class="cs-qr-meta">' +
                        '<div class="cs-qr-path">小程序路径：pages/settle/settings</div>' +
                        '<div class="lb-url">' + link + '</div>' +
                      '</div>' +
                    '</div>' +
                    '<div class="lb-actions">' +
                      '<button class="cs-btn cs-btn-primary cs-btn-sm" data-act="copy-qr" data-qr="' +
                        encodeURIComponent(qrUrl) + '">复制二维码图片</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="copy-link" data-link="' +
                        encodeURIComponent(link) + '">复制页面链接</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="copy-sms" data-sms="' +
                        encodeURIComponent(sms) + '">复制短信文案</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="send-sms" data-sms="' +
                        encodeURIComponent(sms) + '" data-phone="' + (m.phoneRaw || '') +
                        '" data-name="' + encodeURIComponent(m.name) + '">模拟发送短信</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="open-link" data-link="' +
                        encodeURIComponent(link) + '">预览小程序页</button>' +
                    '</div>' +
                    '<div class="cs-sms-preview" data-sms-preview></div>' +
                  '</div>';
              } else if (s.selfService && link) {
                linkBox = '<div class="cs-link-box">' +
                    '<div class="lb-label">商户处理链接（原自助入口）</div>' +
                    '<div class="lb-url">' + link + '</div>' +
                    '<div class="lb-actions">' +
                      '<button class="cs-btn cs-btn-primary cs-btn-sm" data-act="copy-link" data-link="' +
                        encodeURIComponent(link) + '">复制链接</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="copy-sms" data-sms="' +
                        encodeURIComponent(sms) + '">复制短信文案</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="send-sms" data-sms="' +
                        encodeURIComponent(sms) + '" data-phone="' + (m.phoneRaw || '') +
                        '" data-name="' + encodeURIComponent(m.name) + '">模拟发送短信</button>' +
                      '<button class="cs-btn cs-btn-ghost cs-btn-sm" data-act="open-link" data-link="' +
                        encodeURIComponent(link) + '">预览链接</button>' +
                    '</div>' +
                    '<div class="cs-sms-preview" data-sms-preview></div>' +
                  '</div>';
              } else {
                linkBox = '<div class="cs-link-box"><div class="lb-label">处理说明</div>' +
                    '<div class="detail">' + ((s.solution && s.solution.note) || '需客服在工单中继续核实处理，无需下发商户链接。') +
                    '</div></div>';
              }

              return '<div class="cs-abn">' +
                '<div class="row1">' + badge +
                  '<span class="title">' + s.name + '</span></div>' +
                '<div class="sum">' + s.summary + '</div>' +
                '<div class="detail">' + s.detail + '</div>' +
                linkBox +
              '</div>';
            }).join('')
          : '<div class="cs-abn okish"><div class="row1"><span class="badge ok">正常</span>' +
              '<span class="title">暂未发现异常</span></div>' +
              '<div class="detail">' + MSS.STEPS.length + ' 项排查均正常，资金可能仍在银行处理中，建议告知商户 2 小时后再次查看余额。</div></div>';

        var stepsHtml = '<div class="cs-steps">' + r.steps.map(function (st) {
          var cls = st.status === 'abnormal' ? 'bad'
            : st.status === 'skipped' ? 'skip' : 'ok';
          var label = st.status === 'abnormal' ? '异常'
            : st.status === 'skipped' ? '未执行'
            : st.status === 'resolved' ? '已恢复' : '正常';
          return '<div class="st"><b>' + st.name + '</b><span class="' + cls + '">' +
            label + ' · ' + (st.brief || '') + '</span></div>';
        }).join('') + '</div>';

        return '<div class="cs-mch-block">' +
          '<div class="mh"><b>' + m.name + '</b>' +
            '<span>商户号 ' + m.mchId + '</span>' +
            '<span>' + m.line + '</span>' +
            '<span>流水号 ' + r.traceId + '</span>' +
            '<span>' + r.time + '</span></div>' +
          '<div class="mb">' + abnHtml + stepsHtml + '</div></div>';
      }).join('');

    box.querySelectorAll('[data-act="copy-link"]').forEach(function (btn) {
      btn.onclick = function () {
        var link = decodeURIComponent(btn.getAttribute('data-link') || '');
        MSS.track('客服复制处理链接', link.slice(0, 80));
        copyText(link, '处理链接已复制，可粘贴发给商户');
      };
    });
    box.querySelectorAll('[data-act="copy-qr"]').forEach(function (btn) {
      btn.onclick = function () {
        var qr = decodeURIComponent(btn.getAttribute('data-qr') || '');
        var img = btn.closest('.cs-link-box').querySelector('.cs-qr-img');
        MSS.track('客服复制结算设置二维码', qr.slice(0, 60));
        copyQrImage(img, qr);
      };
    });
    box.querySelectorAll('[data-act="copy-sms"]').forEach(function (btn) {
      btn.onclick = function () {
        var sms = decodeURIComponent(btn.getAttribute('data-sms') || '');
        MSS.track('客服复制短信文案', '长度 ' + sms.length);
        copyText(sms, '短信文案已复制');
        var prev = btn.closest('.cs-link-box').querySelector('[data-sms-preview]');
        if (prev) { prev.textContent = sms; prev.classList.add('show'); }
      };
    });
    box.querySelectorAll('[data-act="send-sms"]').forEach(function (btn) {
      btn.onclick = function () {
        var sms = decodeURIComponent(btn.getAttribute('data-sms') || '');
        var phone = btn.getAttribute('data-phone') || '';
        var name = decodeURIComponent(btn.getAttribute('data-name') || '');
        MSS.track('客服模拟发送短信', (phone || lastPhone || '未知') + ' · ' + name);
        var prev = btn.closest('.cs-link-box').querySelector('[data-sms-preview]');
        if (prev) { prev.textContent = '已模拟发送至 ' + (phone ? MSS.maskPhone(phone) : '商户预留手机') + '：' + sms; prev.classList.add('show'); }
        toast('已模拟发送短信至商户<br>（演示环境不真实下发）');
        copyText(sms, '短信已模拟发送，文案同时已复制');
      };
    });
    box.querySelectorAll('[data-act="open-link"]').forEach(function (btn) {
      btn.onclick = function () {
        var link = decodeURIComponent(btn.getAttribute('data-link') || '');
        MSS.track('客服预览处理链接', link.slice(0, 80));
        window.open(link, '_blank', 'noopener');
      };
    });

    saveMergedReport(bundles);
  }

  function saveMergedReport(bundles) {
    var reports = bundles.map(function (b) {
      var snap = MSS.buildSnapshot(b.merchant, b.result, '客服工作台代查');
      var abns = allAbnormals(b.result);
      return {
        merchant: { mchId: b.merchant.mchId, name: b.merchant.name, line: b.merchant.line },
        settlement: MSS.getSettlement(b.merchant, scenarioId),
        diagnosis: {
          traceId: snap.result.traceId,
          time: snap.result.time,
          primary: snap.result.primary
            ? { summary: snap.result.primary.summary, detail: snap.result.primary.detail, name: snap.result.primary.name }
            : null,
          abnormals: abns.map(function (s) {
            return {
              key: s.key,
              name: s.name,
              summary: s.summary,
              detail: s.detail,
              selfService: !!s.selfService,
              resolved: false,
              actionLink: MSS.buildActionLink(s, b.merchant) || ''
            };
          }),
          nodes: snap.nodes,
          userAction: '客服工作台代查并发处理链接'
        }
      };
    });

    var primary = bundles[0] && bundles[0].merchant;
    lastReport = MSS.reportStore.save({
      source: 'cs',
      reason: '客服工作台·资金未到账代查',
      merchant: primary
        ? { mchId: primary.mchId, name: primary.name, line: primary.line }
        : { mchId: '', name: '', line: '' },
      merchants: reports.map(function (r) { return r.merchant; }),
      settlement: primary ? MSS.getSettlement(primary, scenarioId) : null,
      diagnosis: reports[0] ? reports[0].diagnosis : null,
      multi: { reports: reports, processLog: [], unfinished: [] },
      processLog: [],
      unfinished: [],
      actionLinks: reports.reduce(function (acc, r) {
        (r.diagnosis.abnormals || []).forEach(function (a) {
          if (a.actionLink) {
            acc.push({
              mchId: r.merchant.mchId,
              mchName: r.merchant.name,
              name: a.name,
              link: a.actionLink
            });
          }
        });
        return acc;
      }, [])
    });

    var url = MSS.reportStore.url(lastReport);
    var bar = $('reportBar');
    bar.style.display = '';
    $('reportInfo').innerHTML =
      '已生成完整诊断报告（' + bundles.length + ' 户合并）' +
      '<small>编号 ' + lastReport.id + ' · 有效期至 ' + lastReport.expireText + '</small>';
    $('btnCopyReport').onclick = function () {
      MSS.track('客服复制诊断报告链接', lastReport.id);
      copyText(url, '诊断报告链接已复制');
    };
    $('btnOpenReport').onclick = function () {
      MSS.track('客服打开诊断报告', lastReport.id);
      window.open(url, '_blank', 'noopener');
    };
    $('btnCopyAllLinks').onclick = function () {
      var lines = [];
      bundles.forEach(function (b) {
        allAbnormals(b.result).forEach(function (s) {
          var link = MSS.buildActionLink(s, b.merchant);
          if (link) {
            lines.push(b.merchant.name + '（' + b.merchant.mchId + '）· ' + s.name + '：' + link);
          }
        });
      });
      if (!lines.length) { toast('当前无处理链接可复制'); return; }
      MSS.track('客服批量复制处理链接', lines.length + ' 条');
      copyText(lines.join('\n'), '已复制 ' + lines.length + ' 条处理链接');
    };
  }

  function runDiagnose() {
    var list = selectedMerchants();
    if (!list.length) {
      $('searchErr').textContent = '请至少选择一个商户号';
      return;
    }
    $('searchErr').textContent = '';
    updateScenarioCurrent();
    MSS.track('客服发起诊断', list.map(function (m) { return m.mchId; }).join(',') + ' · ' + scenarioId);

    var box = $('resultBox');
    box.innerHTML = '<div class="cs-empty">正在按「' + MSS.getScenario(scenarioId).name +
      '」诊断 ' + list.length + ' 个商户，请稍候…</div>';
    $('reportBar').style.display = 'none';

    setTimeout(function () {
      var bundles = list.map(function (m) {
        return { merchant: m, result: MSS.diagnose(scenarioId, m) };
      });
      renderResult(bundles);
      toast('诊断完成：' + MSS.getScenario(scenarioId).name);
    }, 600);
  }

  $('btnDiagnose').onclick = runDiagnose;

  /* 演示快捷填充 */
  $('btnDemoMch').onclick = function () {
    setMode('mch');
    $('mchInput').value = '88800213';
    $('btnSearchMch').click();
  };
  $('btnDemoPhone').onclick = function () {
    setMode('phone');
    $('phoneInput').value = '13812346621';
    $('btnSearchPhone').click();
  };

  setMode('mch');
  renderPickList([]);
  $('resultBox').innerHTML =
    '<div class="cs-empty">请先按商户号或手机号查询商户，勾选后点击「生成诊断报告」。<br>' +
    '演示商户号 88800213 / 7712009；手机号 13812346621（关联 2 户）。</div>';
})();
