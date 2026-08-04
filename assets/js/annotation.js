/**
 * 产品标注位置维护（规范见 项目规范文档.md）
 * 演示页存在手机壳内部滚动容器与动态渲染视图，因此除 scroll/resize 外
 * 还监听捕获阶段滚动与 DOM 变化。
 */
(function () {
  function updateTooltipPosition() {
    document.querySelectorAll('.tooltip-icon').forEach(function (icon) {
      var tip = icon.nextElementSibling;
      if (!tip || !tip.classList.contains('product-tip')) return;
      var top = icon.getBoundingClientRect().top;
      var max = window.innerHeight - 160;
      tip.style.setProperty('--tooltip-top', Math.max(12, Math.min(top, max)) + 'px');
    });
  }

  window.updateTooltipPosition = updateTooltipPosition;

  document.addEventListener('DOMContentLoaded', function () {
    updateTooltipPosition();
    new MutationObserver(function () {
      requestAnimationFrame(updateTooltipPosition);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  window.addEventListener('scroll', updateTooltipPosition, true);
  window.addEventListener('resize', updateTooltipPosition);
})();
